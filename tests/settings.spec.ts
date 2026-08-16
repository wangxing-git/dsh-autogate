import { describe, expect, it } from 'vitest'
import type { ApprovalOutcome } from '@deepseek-ai/dsh-user-approval'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import { apply, Config } from '../src/index.js'

type ApprovalListener = (req: any, next: () => Promise<ApprovalOutcome>) => Promise<ApprovalOutcome>

const allowChunks = [
  { type: 'text-delta', index: 0, text: '{"decision":"allow","reason":"ok"}' },
  { type: 'finish', reason: { kind: 'stop' } },
]

function autoAgent() {
  return {
    session: { events: [{ type: 'permission/preset', data: { preset: 'auto-ask' } }], header: { cwd: '/ws' } },
    options: { provider: 'deepseek', model: 'deepseek-chat' },
  }
}

function escalationReq(agent = autoAgent()) {
  return { agent, toolName: 'bash', reason: 'escalate sandbox to danger-full-access: 用户要求清理', signal: undefined }
}

const nextRejected = async (): Promise<ApprovalOutcome> => 'rejected'

/**
 * 构造 mock Context：settingsResolved 提供时模拟 settings 服务已挂载（inject 捕获回调，
 * triggerSettingsMount 手动触发，模拟 ctx.inject(["settings"]) 的注入时机）；undefined 表示未挂载。
 */
function createContext(settingsResolved?: () => Record<string, unknown>) {
  const listeners = new Map<string, ApprovalListener[]>()
  const streamCalls: any[] = []
  const stream = async function* (options: any) {
    streamCalls.push(options)
    for (const chunk of allowChunks) yield chunk
  }
  const settingsCallbacks: ((sctx: any) => void)[] = []
  const registered: { ns: unknown; opts: any }[] = []
  const watchers: (() => void)[] = []

  const ctx: any = {
    fiber: { state: 0 },
    on(event: string, listener: ApprovalListener) {
      if (!listeners.has(event)) listeners.set(event, [])
      listeners.get(event)!.push(listener)
    },
    tools: {
      guard() { return () => {} },
      register() { return () => {} },
    },
    llm: { stream },
    get() { return undefined },
    logger: { warn() {} },
    inject(deps: string[], cb: (sctx: any) => void) {
      if (deps.includes('settings')) {
        if (settingsResolved === undefined) return undefined
        settingsCallbacks.push(cb)
        return undefined
      }
      if (deps.includes('connection')) {
        // RPC 注册非本测试关注点：提供最小 ctx，让回调静默完成（get 返回 undefined → 不注册端点）。
        cb({ get: () => undefined, effect: () => () => {} })
        return undefined
      }
      return undefined
    },
  }

  const triggerSettingsMount = () => {
    const scope = {
      get: () => settingsResolved!(),
      watch(cb: () => void) { watchers.push(cb); return () => {} },
      update: async () => {},
      replace: async () => {},
    }
    const sctx = {
      settings: {
        register(ns: unknown, _schema: unknown, opts: any) {
          registered.push({ ns, opts })
          opts.validate?.(scope.get())
          return scope
        },
        get(ns: unknown) {
          // 模拟 locale 命名空间：未显式设置语言 → undefined 偏好（回退英文）。
          if (String(ns) === 'locale') return { preference: undefined }
          return undefined
        },
      },
      on() { return () => {} },
      effect() { return () => {} },
    }
    for (const cb of settingsCallbacks) cb(sctx)
  }

  return { ctx, listeners, streamCalls, registered, watchers, triggerSettingsMount }
}

describe('apply 接入 DSH settings（installSettingsSection）', () => {
  it('settings 挂载 → register 以 autogate 命名空间 + entry 作 base，分类走 settings 的 provider/model', async () => {
    let resolved: any = { presetName: 'auto-ask', classifierProvider: 'prov-a', classifierModel: 'model-a' }
    const { ctx, listeners, streamCalls, registered, triggerSettingsMount } = createContext(() => resolved)
    apply(ctx)
    triggerSettingsMount()

    expect(registered).toHaveLength(1)
    expect(registered[0].ns).toBe(settingsNamespace('autogate'))
    expect(registered[0].opts.base).toEqual({})

    const answerer = listeners.get('approval/request')![0]
    expect(await answerer(escalationReq(), nextRejected)).toBe('allowed-once')
    expect(streamCalls[0].provider).toBe('prov-a')
    expect(streamCalls[0].model).toBe('model-a')
  })

  it('scope.watch 热重载 → 配置变化后分类改用新 provider/model', async () => {
    let resolved: any = { presetName: 'auto-ask', classifierProvider: 'prov-a', classifierModel: 'model-a' }
    const { ctx, listeners, streamCalls, watchers, triggerSettingsMount } = createContext(() => resolved)
    apply(ctx)
    triggerSettingsMount()

    resolved = { presetName: 'auto-ask', classifierProvider: 'prov-b', classifierModel: 'model-b' }
    watchers[0]() // 模拟 settings/updated → onChange → rebuild

    const answerer = listeners.get('approval/request')![0]
    expect(await answerer(escalationReq(), nextRejected)).toBe('allowed-once')
    expect(streamCalls[0].provider).toBe('prov-b')
    expect(streamCalls[0].model).toBe('model-b')
  })

  it('validateConfig 拒绝单边 provider 配置 → register 抛错（settings 段被拒）', () => {
    let resolved: any = { presetName: 'auto-ask', classifierProvider: 'prov-a' }
    const { ctx, triggerSettingsMount } = createContext(() => resolved)
    apply(ctx)
    expect(() => triggerSettingsMount()).toThrow('成对')
  })

  it('validateConfig 拒绝 presetName 与 fullAutoPresetName 相同', () => {
    let resolved: any = { presetName: 'auto-ask', fullAutoPresetName: 'auto-ask' }
    const { ctx, triggerSettingsMount } = createContext(() => resolved)
    apply(ctx)
    expect(() => triggerSettingsMount()).toThrow('不能相同')
  })

  it('settings 未挂载 → 插件回退 entry config 正常工作', async () => {
    const { ctx, listeners } = createContext(undefined)
    apply(ctx)
    const answerer = listeners.get('approval/request')![0]
    expect(await answerer(escalationReq(), nextRejected)).toBe('allowed-once')
  })
})

describe('Config schema 默认值', () => {
  it('classifierRetry 默认开启（true）', () => {
    expect(Config({}).classifierRetry).toBe(true)
  })

  it('showTrail 默认显示（true）', () => {
    expect(Config({}).showTrail).toBe(true)
  })

  it('preflight 默认关闭（false）', () => {
    expect(Config({}).preflight).toBe(false)
  })

  it('proposalContextMaxMessageLen 默认 10', () => {
    expect(Config({}).proposalContextMaxMessageLen).toBe(10)
  })

  it('proposalContextMaxChars 默认 400', () => {
    expect(Config({}).proposalContextMaxChars).toBe(400)
  })

  it('proposalContextMaxTotalChars 默认 2000', () => {
    expect(Config({}).proposalContextMaxTotalChars).toBe(2000)
  })
})
