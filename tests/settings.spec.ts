import { describe, expect, it } from 'vitest'
import type { ApprovalOutcome } from '@deepseek-ai/dsh-user-approval'
import { apply, Config } from '../src/index.js'
import { createSessionProjections } from './session-projection-stub.js'

type ApprovalListener = (req: any, next: () => Promise<ApprovalOutcome>) => Promise<ApprovalOutcome>
type VolatileConfig = Parameters<typeof apply>[1]

const allowChunks = [
  { type: 'text-delta', index: 0, text: '{"decision":"allow","reason":"ok"}' },
  { type: 'finish', reason: { kind: 'stop' } },
]

function autoAgent() {
  return {
    session: { snapshotEvents: () => [{ type: 'permission/preset', data: { preset: 'auto-ask' } }], header: { cwd: '/ws' } },
    options: { provider: 'deepseek', model: 'deepseek-chat' },
  }
}

function escalationReq(agent = autoAgent()) {
  return { agent, toolName: 'bash', reason: 'escalate sandbox to danger-full-access: 用户要求清理', signal: undefined }
}

const nextRejected = async (): Promise<ApprovalOutcome> => 'rejected'

/** Config schema 的全部字段名（与 src/index.ts 的 Config 一一对应），用于构造 volatile 引用集。 */
const CONFIG_FIELDS = [
  'presetName', 'workspaceRoot', 'tempRoots', 'classifierEndpoint', 'classifierProvider', 'classifierModel',
  'classifierPrompt', 'classifierApiKeyEnv', 'classifierTimeoutMs', 'classifierMaxOutputTokens', 'classifierRetry',
  'classifierHttpDisableReasoning', 'proposalContextMaxMessageLen', 'proposalContextMaxChars',
  'proposalContextMaxTotalChars', 'preflight', 'showTrail', 'fullAutoPresetName',
] as const

/**
 * 构造 volatile 配置引用集（DSH 0.1.7 起 Loader 注入的形状）：每个字段是稳定的
 * `{ get() }` 访问器，引用身份不随配置更新改变，改值只需写 `store`——与 Loader
 * 「就地提交新值到已有引用」的语义一致。
 */
function volatileConfig(initial: Record<string, unknown> = {}) {
  const store: Record<string, unknown> = { ...initial }
  const refs: Record<string, { get: () => unknown }> = {}
  for (const field of CONFIG_FIELDS) refs[field] = { get: () => store[field] }
  return { config: refs as unknown as VolatileConfig, store }
}

/**
 * 构造 mock Context。withSettings=false 模拟 settings 服务未挂载（inject 回调不触发）；
 * 挂载时记录 configure 调用与 loader/volatile-update 监听器，供测试断言与手动触发重建。
 */
function createContext({ withSettings = true }: { withSettings?: boolean } = {}) {
  const listeners = new Map<string, ApprovalListener[]>()
  const streamCalls: any[] = []
  const stream = async function* (options: any) {
    streamCalls.push(options)
    for (const chunk of allowChunks) yield chunk
  }
  const settingsCallbacks: ((sctx: any) => void)[] = []
  const configureCalls: { presentation: any; owner: unknown }[] = []
  const volatileHandlers: (() => void)[] = []
  const describeCalls: number[] = []
  const sessionProjections = createSessionProjections()

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
        if (!withSettings) return undefined
        settingsCallbacks.push(cb)
        return undefined
      }
      if (deps.includes('connection')) {
        // RPC 注册非本测试关注点：提供最小 ctx，让回调静默完成（get 返回 undefined → 不注册端点）。
        cb({ get: () => undefined, effect: () => () => {} })
        return undefined
      }
      if (deps.includes('sessionProjections')) {
        // 授权投影注册（非本测试关注点）：提供替身让授权判定按 mock 会话的事件序列正常求值。
        cb({ sessionProjections, effect: () => () => {} })
        return undefined
      }
      return undefined
    },
  }

  const triggerSettingsMount = () => {
    const sctx = {
      settings: {
        configure(presentation: unknown, owner?: unknown) {
          configureCalls.push({ presentation, owner })
          return () => {}
        },
        /** 语言读取走 describe()：默认无显式偏好（回退中文）。 */
        describe() {
          describeCalls.push(Date.now())
          return [{ ns: 'locale', value: { preference: undefined } }]
        },
      },
      on(event: string, listener: () => void) {
        if (event === 'loader/volatile-update') volatileHandlers.push(listener)
        return () => {}
      },
      effect(fn: () => unknown) { fn(); return () => {} },
    }
    for (const cb of settingsCallbacks) cb(sctx)
  }

  return { ctx, listeners, streamCalls, configureCalls, volatileHandlers, describeCalls, triggerSettingsMount }
}

describe('apply 接入 DSH 配置（volatile 引用机制）', () => {
  it('配置注入 → 分类走配置的 provider/model', async () => {
    const { config } = volatileConfig({ presetName: 'auto-ask', classifierProvider: 'prov-a', classifierModel: 'model-a' })
    const { ctx, listeners, streamCalls, triggerSettingsMount } = createContext()
    apply(ctx, config)
    triggerSettingsMount()

    const answerer = listeners.get('approval/request')![0]
    expect(await answerer(escalationReq(), nextRejected)).toBe('allowed-once')
    expect(streamCalls[0].provider).toBe('prov-a')
    expect(streamCalls[0].model).toBe('model-a')
  })

  it('settings 挂载 → configure 以 auto:false 注册本插件策略，owner 为本插件 fiber', () => {
    const { config } = volatileConfig({ presetName: 'auto-ask' })
    const { ctx, configureCalls, triggerSettingsMount } = createContext()
    apply(ctx, config)
    triggerSettingsMount()

    expect(configureCalls).toHaveLength(1)
    expect(configureCalls[0].presentation).toEqual({ auto: false })
    // owner 必须是插件自身的 fiber：默认值是 settings 服务自己的 fiber，会把页面策略挂错实例。
    expect(configureCalls[0].owner).toBe(ctx.fiber)
  })

  it('loader/volatile-update 热重载 → 配置变化后分类改用新 provider/model', async () => {
    const { config, store } = volatileConfig({ presetName: 'auto-ask', classifierProvider: 'prov-a', classifierModel: 'model-a' })
    const { ctx, listeners, streamCalls, volatileHandlers, triggerSettingsMount } = createContext()
    apply(ctx, config)
    triggerSettingsMount()

    // Loader 就地提交新值：引用身份不变，只改值。
    store.classifierProvider = 'prov-b'
    store.classifierModel = 'model-b'
    volatileHandlers[0]()

    const answerer = listeners.get('approval/request')![0]
    expect(await answerer(escalationReq(), nextRejected)).toBe('allowed-once')
    expect(streamCalls[0].provider).toBe('prov-b')
    expect(streamCalls[0].model).toBe('model-b')
  })

  it('单边 provider 配置 → 首次加载即抛错（settings 写入期校验的替代：fail-fast）', () => {
    const { config } = volatileConfig({ presetName: 'auto-ask', classifierProvider: 'prov-a' })
    const { ctx, triggerSettingsMount } = createContext()
    expect(() => apply(ctx, config)).toThrow('成对')
    // settings 挂载不改变结果：配置本身非法。
    expect(() => triggerSettingsMount()).not.toThrow()
  })

  it('presetName 与 fullAutoPresetName 相同 → 抛错', () => {
    const { config } = volatileConfig({ presetName: 'auto-ask', fullAutoPresetName: 'auto-ask' })
    const { ctx } = createContext()
    expect(() => apply(ctx, config)).toThrow('不能相同')
  })

  it('运行中改为非法配置 → 沿用上一份有效配置（不抛错、不影响放行）', async () => {
    const { config, store } = volatileConfig({ presetName: 'auto-ask', classifierProvider: 'prov-a', classifierModel: 'model-a' })
    const { ctx, listeners, streamCalls, volatileHandlers, triggerSettingsMount } = createContext()
    apply(ctx, config)
    triggerSettingsMount()

    // 单边配置：重建失败，沿用上一份有效配置（prov-a/model-a）。
    store.classifierModel = undefined
    expect(() => volatileHandlers[0]()).not.toThrow()

    const answerer = listeners.get('approval/request')![0]
    expect(await answerer(escalationReq(), nextRejected)).toBe('allowed-once')
    expect(streamCalls[0].provider).toBe('prov-a')
    expect(streamCalls[0].model).toBe('model-a')
  })

  it('settings 未挂载 → 配置仍从注入的 volatile 引用读取，插件正常工作', async () => {
    const { config } = volatileConfig({ presetName: 'auto-ask', classifierProvider: 'prov-a', classifierModel: 'model-a' })
    const { ctx, listeners } = createContext({ withSettings: false })
    apply(ctx, config)

    const answerer = listeners.get('approval/request')![0]
    expect(await answerer(escalationReq(), nextRejected)).toBe('allowed-once')
  })

  it('语言读取走 describe()，且不在热路径重复调用', () => {
    const { config } = volatileConfig({ presetName: 'auto-ask' })
    const { ctx, describeCalls, triggerSettingsMount } = createContext()
    apply(ctx, config)
    triggerSettingsMount()

    // 挂载时读一次；重建（volatile-update）不应再触发 describe（语言与配置无关）。
    expect(describeCalls).toHaveLength(1)
  })
})

describe('Config schema 默认值', () => {
  it('classifierRetry 默认开启（true）', () => {
    expect(Config({}).classifierRetry.get()).toBe(true)
  })

  it('classifierHttpDisableReasoning 默认开启（true）', () => {
    expect(Config({}).classifierHttpDisableReasoning.get()).toBe(true)
  })

  it('showTrail 默认显示（true）', () => {
    expect(Config({}).showTrail.get()).toBe(true)
  })

  it('preflight 默认关闭（false）', () => {
    expect(Config({}).preflight.get()).toBe(false)
  })

  it('proposalContextMaxMessageLen 默认 10', () => {
    expect(Config({}).proposalContextMaxMessageLen.get()).toBe(10)
  })

  it('proposalContextMaxChars 默认 400', () => {
    expect(Config({}).proposalContextMaxChars.get()).toBe(400)
  })

  it('proposalContextMaxTotalChars 默认 2000', () => {
    expect(Config({}).proposalContextMaxTotalChars.get()).toBe(2000)
  })

  it('预设名默认值：半自动 auto-ask / 全自动 auto-full', () => {
    expect(Config({}).presetName.get()).toBe('auto-ask')
    expect(Config({}).fullAutoPresetName.get()).toBe('auto-full')
  })

  it('未配置的可选字段返回 undefined（而非默认值）', () => {
    expect(Config({}).classifierEndpoint.get()).toBeUndefined()
    expect(Config({}).workspaceRoot.get()).toBeUndefined()
  })
})
