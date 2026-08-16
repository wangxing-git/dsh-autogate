import { describe, expect, it } from 'vitest'
import type { ApprovalOutcome } from '@deepseek-ai/dsh-user-approval'
import { apply, autoPermissionAuthority, isAutoPermissionExecution, managedPermissionAuthority } from '../src/index.js'

/** approval/request 监听器签名（集成测试里以宽松类型捕获）。 */
type ApprovalListener = (req: any, next: () => Promise<ApprovalOutcome>) => Promise<ApprovalOutcome>

/** 构造最小可用的 mock Context，捕获各类事件监听器。 */
function createMockContext(chunks: any[] | null) {
  const listeners = new Map<string, ApprovalListener[]>()
  const capturedCalls: any[] = []
  const guards: ((exec: any) => string | undefined)[] = []
  const stream = chunks === null
    ? async function* (options: any) { capturedCalls.push(options); throw new Error('llm down') }
    : async function* (options: any) { capturedCalls.push(options); for (const chunk of chunks) yield chunk }
  const rpcHandlers = new Map<string, (endpoint: string, payload: unknown, signal: AbortSignal) => Promise<any>>()
  const connection = {
    rpc: {
      handle(channel: string, handler: (endpoint: string, payload: unknown, signal: AbortSignal) => Promise<any>) {
        rpcHandlers.set(channel, handler)
        return async () => {}
      },
    },
  }
  const ctx = {
    on(event: string, listener: ApprovalListener) {
      if (!listeners.has(event)) listeners.set(event, [])
      listeners.get(event)!.push(listener)
    },
    tools: {
      guard(cb: (exec: any) => string | undefined) { guards.push(cb); return () => {} },
      register() { return () => {} },
    },
    llm: { stream },
    // 模拟 cordis ctx.inject：仅对已 mock 提供的 connection 服务就绪时调用 callback；
    // settings 等未 mock 服务视为永不就绪，保持 no-op（installSettingsSection 回退 entry config）。
    inject(names: string[], callback: (injectedCtx: any, config?: any) => any) {
      if (names.includes('connection')) callback({ ...ctx, connection })
      return undefined
    },
    // connection 由 inject 注入的子 ctx 经 get('connection') 读取；其余服务（agents 等）返回 undefined。
    get(name: string) {
      if (name === 'connection') return connection
      return undefined
    },
    effect() { return () => {} },
  }
  return { ctx, listeners, rpcHandlers, capturedCalls, guards }
}

/** Auto 会话的 mock agent（含 provider/model 路由与工作区 cwd）。 */
function autoAgent() {
  return {
    session: {
      events: [{ type: 'permission/preset', data: { preset: 'auto-ask' } }],
      header: { cwd: '/ws' },
    },
    options: { provider: 'deepseek', model: 'deepseek-chat' },
  }
}

/** 指定权限预设的 mock agent。 */
function agentWithPreset(preset: string) {
  return {
    session: {
      events: [{ type: 'permission/preset', data: { preset } }],
      header: { cwd: '/ws' },
    },
    options: { provider: 'deepseek', model: 'deepseek-chat' },
  }
}

/** 构造 escalation 审批请求。 */
function escalationReq(agent = autoAgent(), reason = 'escalate sandbox to danger-full-access: 用户要求清理') {
  return { agent, toolName: 'bash', reason, signal: undefined }
}

/** mock LLM 返回 allow 决策。 */
const allowChunks = [
  { type: 'text-delta', index: 0, text: '{"decision":"allow","reason":"ok"}' },
  { type: 'finish', reason: { kind: 'stop' } },
]
/** mock LLM 返回 deny 决策。 */
const denyChunks = [
  { type: 'text-delta', index: 0, text: '{"decision":"deny","reason":"dangerous"}' },
  { type: 'finish', reason: { kind: 'stop' } },
]

describe('apply 注册的 escalation answerer（approval/request）', () => {
  it('LLM 判 allow → allowed-once（直接批准，不人工弹窗）', async () => {
    const { ctx, listeners } = createMockContext(allowChunks)
    apply(ctx as any)
    const answerer = listeners.get('approval/request')![0]
    const next = async (): Promise<ApprovalOutcome> => 'rejected'
    expect(await answerer(escalationReq(), next)).toBe('allowed-once')
  })

  it('LLM 判 deny → 委派人工（走 next）', async () => {
    const { ctx, listeners } = createMockContext(denyChunks)
    apply(ctx as any)
    const answerer = listeners.get('approval/request')![0]
    const next = async (): Promise<ApprovalOutcome> => 'allowed-once'
    expect(await answerer(escalationReq(), next)).toBe('allowed-once')
  })

  it('非 escalation reason → 委派人工', async () => {
    const { ctx, listeners } = createMockContext(allowChunks)
    apply(ctx as any)
    const answerer = listeners.get('approval/request')![0]
    const next = async (): Promise<ApprovalOutcome> => 'rejected'
    expect(await answerer(escalationReq(autoAgent(), 'other approval reason'), next)).toBe('rejected')
  })

  it('非 Auto 会话 → 委派人工', async () => {
    const { ctx, listeners } = createMockContext(allowChunks)
    apply(ctx as any)
    const answerer = listeners.get('approval/request')![0]
    const next = async (): Promise<ApprovalOutcome> => 'rejected'
    expect(await answerer(escalationReq(agentWithPreset('read-only')), next)).toBe('rejected')
  })

  it('LLM 异常 → 委派人工（fail-closed）', async () => {
    const { ctx, listeners } = createMockContext(null)
    apply(ctx as any)
    const answerer = listeners.get('approval/request')![0]
    const next = async (): Promise<ApprovalOutcome> => 'allowed-once'
    expect(await answerer(escalationReq(), next)).toBe('allowed-once')
  })

  it('无模型路由导致分类失败 → 委派人工（fail-closed）', async () => {
    const { ctx, listeners } = createMockContext(allowChunks)
    apply(ctx as any)
    const answerer = listeners.get('approval/request')![0]
    const noRouteAgent = {
      session: {
        events: [{ type: 'permission/preset', data: { preset: 'auto' } }],
        header: { cwd: '/ws' },
      },
    }
    const next = async (): Promise<ApprovalOutcome> => 'rejected'
    expect(await answerer(escalationReq(noRouteAgent), next)).toBe('rejected')
  })

  it('write 提权 → 分类器收到原始 file_path（而非仅 justification）', async () => {
    const { ctx, listeners, capturedCalls } = createMockContext(allowChunks)
    apply(ctx as any)
    // 先触发带 sandbox_permissions 的 pre-execute，缓存原始参数
    const preExecute = listeners.get('tools/pre-execute')![0] as unknown as (exec: any, next: () => Promise<any>) => Promise<any>
    const exec = {
      name: 'write',
      arguments: {
        file_path: '/Users/wangxing/autogate-l2-probe.txt',
        content: 'probe',
        sandbox_permissions: 'danger-full-access',
        justification: '无害探针',
      },
      callId: 'call-esc-write',
      agent: autoAgent(),
      signal: undefined,
    }
    await preExecute(exec, async () => ({ kind: 'allow' }))
    const answerer = listeners.get('approval/request')![0]
    const req = { agent: autoAgent(), toolName: 'write', callId: 'call-esc-write', reason: 'escalate sandbox to danger-full-access: 无害探针', signal: undefined }
    const next = async (): Promise<ApprovalOutcome> => 'rejected'
    expect(await answerer(req, next)).toBe('allowed-once')
    // 分类器收到原始 file_path（content 按规则脱敏）
    const lastInput = JSON.parse(capturedCalls[capturedCalls.length - 1].messages[0].content[0].text)
    expect(lastInput.arguments.file_path).toBe('/Users/wangxing/autogate-l2-probe.txt')
    expect(lastInput.arguments.content).toBe('[redacted-content:5-chars]')
  })

  it('escalation 分类器收到原始工具参数（bash command），而非仅 justification', async () => {
    const { ctx, listeners, capturedCalls } = createMockContext(allowChunks)
    apply(ctx as any)
    const preExecute = listeners.get('tools/pre-execute')![0] as unknown as (exec: any, next: () => Promise<any>) => Promise<any>
    const exec = {
      name: 'bash',
      arguments: { command: 'echo hello > /tmp/x', sandbox_permissions: 'danger-full-access', justification: '无害命令' },
      callId: 'call-esc-bash',
      agent: autoAgent(),
      signal: undefined,
    }
    await preExecute(exec, async () => ({ kind: 'allow' }))
    const answerer = listeners.get('approval/request')![0]
    const req = { agent: autoAgent(), toolName: 'bash', callId: 'call-esc-bash', reason: 'escalate sandbox to danger-full-access: 无害命令', signal: undefined }
    const next = async (): Promise<ApprovalOutcome> => 'rejected'
    await answerer(req, next)
    const lastInput = JSON.parse(capturedCalls[capturedCalls.length - 1].messages[0].content[0].text)
    expect(lastInput.arguments.command).toBe('echo hello > /tmp/x')
  })

  it('escalation 审批时 ask_user_question 问答对进入分类器上下文（识别用户授权）', async () => {
    const { ctx, listeners, capturedCalls } = createMockContext(allowChunks)
    apply(ctx as any)
    // 构造含 ask_user_question 问答对事件的 agent（用户在问答中授权写入全局 .gitconfig）。
    const agent = {
      session: {
        events: [
          { type: 'permission/preset', data: { preset: 'auto-ask' } },
          { type: 'tool/call', data: { callId: 'ask-esc', name: 'ask_user_question', arguments: JSON.stringify({ questions: [{ id: 'q1', question: '是否允许写入全局 .gitconfig 配置假邮箱' }] }) } },
          { type: 'tool/result', data: { message: { source: { kind: 'tool', callId: 'ask-esc' }, content: [{ type: 'tool-result', toolCallId: 'ask-esc', content: [{ type: 'text', text: JSON.stringify({ answers: [{ id: 'q1', selected: ['允许'] }] }) }] }] } } },
        ],
        header: { cwd: '/ws' },
      },
      options: { provider: 'deepseek', model: 'deepseek-chat' },
    }
    const answerer = listeners.get('approval/request')![0]
    const req = { agent, toolName: 'bash', reason: 'escalate sandbox to danger-full-access: 写入全局 gitconfig 假邮箱', signal: undefined }
    const next = async (): Promise<ApprovalOutcome> => 'rejected'
    await answerer(req, next)
    const lastInput = JSON.parse(capturedCalls[capturedCalls.length - 1].messages[0].content[0].text)
    expect(lastInput.trustedUserMessages).toHaveLength(1)
    expect(lastInput.trustedUserMessages[0]).toContain('是否允许写入全局 .gitconfig 配置假邮箱')
    expect(lastInput.trustedUserMessages[0]).toContain('允许')
    expect(lastInput.trustedUserMessages[0]).toContain('[ask_user_question]')
  })
})

describe('apply 注册的审批轨迹与 RPC 查询端点', () => {
  it('L0 硬 deny 记录到轨迹，RPC trail 端点返回记录（preflight 开启）', async () => {
    const { ctx, listeners, rpcHandlers } = createMockContext(allowChunks)
    apply(ctx as any, { preflight: true })
    const preExecute = listeners.get('tools/pre-execute')![0] as unknown as (exec: any, next: () => Promise<any>) => Promise<any>
    const exec = {
      name: 'bash',
      arguments: { command: 'sudo rm -rf /' },
      callId: 'call-1',
      agent: autoAgent(),
      signal: undefined,
    }
    const decision = await preExecute(exec, async () => ({ kind: 'allow' }))
    expect(decision).toEqual({ kind: 'deny', reason: expect.stringContaining('[autogate hard deny]') })

    const handler = rpcHandlers.get('/autogate')!
    const result = await handler('trail', undefined, undefined as any)
    expect(result.ok).toBe(true)
    const records = (result as any).value
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({ callId: 'call-1', toolName: 'bash', decision: 'deny', layer: 'L0' })
    expect(records[0].summary).toBe('sudo rm -rf /')
  })

  it('L0 allow 也记录到轨迹（decision=allow, layer=L0，preflight 开启）', async () => {
    const { ctx, listeners, rpcHandlers } = createMockContext(allowChunks)
    apply(ctx as any, { preflight: true })
    const preExecute = listeners.get('tools/pre-execute')![0] as unknown as (exec: any, next: () => Promise<any>) => Promise<any>
    const exec = {
      name: 'read',
      arguments: { file_path: '/ws/src/index.ts' },
      callId: 'call-2',
      agent: autoAgent(),
      signal: undefined,
    }
    const decision = await preExecute(exec, async () => ({ kind: 'allow' }))
    expect(decision).toEqual({ kind: 'allow' })

    const handler = rpcHandlers.get('/autogate')!
    const result = await handler('trail', undefined, undefined as any)
    const records = (result as any).value
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({ callId: 'call-2', toolName: 'read', decision: 'allow', layer: 'L0' })
  })

  it('RPC 未知端点返回 internal 错误', async () => {
    const { ctx, rpcHandlers } = createMockContext(allowChunks)
    apply(ctx as any)
    const handler = rpcHandlers.get('/autogate')!
    const result = await handler('unknown', undefined, undefined as any)
    expect(result.ok).toBe(false)
    expect((result as any).error.code).toBe('internal')
  })
})

describe('preflight 开关（沙盒前拦截判断）', () => {
  const preExecuteOf = (listeners: Map<string, ApprovalListener[]>) =>
    listeners.get('tools/pre-execute')![0] as unknown as (exec: any, next: () => Promise<any>) => Promise<any>

  /** 会落入 L1 LLM 分类的未识别工具调用。 */
  const unknownTool = (callId: string) => ({
    name: 'unrecognized_tool',
    arguments: { probe: true },
    callId,
    agent: autoAgent(),
    signal: new AbortController().signal,
  })

  it('默认关闭 → 模糊操作跳过 LLM 分类直接放行', async () => {
    const { ctx, listeners, capturedCalls } = createMockContext(denyChunks)
    apply(ctx as any)
    const decision = await preExecuteOf(listeners)(unknownTool('call-preflight-off'), async () => ({ kind: 'allow' }))
    expect(decision).toEqual({ kind: 'allow' })
    expect(capturedCalls).toHaveLength(0)
  })

  it('开启 → 模糊操作走 LLM 分类，allow 放行', async () => {
    const { ctx, listeners, capturedCalls } = createMockContext(allowChunks)
    apply(ctx as any, { preflight: true })
    const decision = await preExecuteOf(listeners)(unknownTool('call-preflight-on-allow'), async () => ({ kind: 'allow' }))
    expect(decision).toEqual({ kind: 'allow' })
    expect(capturedCalls).toHaveLength(1)
  })

  it('开启 → 模糊操作走 LLM 分类，deny 拒绝', async () => {
    const { ctx, listeners } = createMockContext(denyChunks)
    apply(ctx as any, { preflight: true })
    const decision = await preExecuteOf(listeners)(unknownTool('call-preflight-on-deny'), async () => ({ kind: 'allow' }))
    expect(decision).toEqual({ kind: 'deny', reason: expect.stringContaining('[autogate classifier deny]') })
  })

  it('默认关闭时硬 deny 仍在 guard 生效（不随开关关闭）', async () => {
    const { ctx, guards } = createMockContext(allowChunks)
    apply(ctx as any)
    const exec = { name: 'bash', arguments: { command: 'sudo rm -rf /' }, callId: 'call-preflight-hd', agent: autoAgent(), signal: undefined }
    expect(guards[0](exec as any)).toBe('半自动模式不允许提权')
  })

  it('提权硬 deny 理由随托管模式区分（半自动/全自动）', () => {
    const { ctx, guards } = createMockContext(allowChunks)
    apply(ctx as any)
    const semi = { name: 'bash', arguments: { command: 'sudo rm -rf /' }, callId: 'call-mode-semi', agent: agentWithPreset('auto-ask'), signal: undefined }
    const full = { name: 'bash', arguments: { command: 'sudo rm -rf /' }, callId: 'call-mode-full', agent: agentWithPreset('auto'), signal: undefined }
    expect(guards[0](semi as any)).toBe('半自动模式不允许提权')
    expect(guards[0](full as any)).toBe('全自动模式不允许提权')
  })
})

describe('autoPermissionAuthority 与 isAutoPermissionExecution', () => {
  const autoEvents = () => [{ type: 'permission/preset', data: { preset: 'auto' } }]
  const neverEvents = () => [{ type: 'permission/preset', data: { preset: 'never' } }]

  it('isAutoPermissionExecution 识别 Auto 预设', () => {
    const exec = { agent: { session: { events: autoEvents() } } }
    expect(isAutoPermissionExecution(exec as any)).toBe(true)
  })
  it('isAutoPermissionExecution 拒绝非 Auto / 空 events / 无 agent', () => {
    expect(isAutoPermissionExecution({ agent: { session: { events: neverEvents() } } } as any)).toBe(false)
    expect(isAutoPermissionExecution({ agent: { session: { events: [] } } } as any)).toBe(false)
    expect(isAutoPermissionExecution({} as any)).toBe(false)
  })
  it('顶层 Auto 会话直接返回自身 agent', () => {
    const agent = { session: { events: autoEvents(), header: { origin: 'primary', cwd: '/ws' } } }
    const exec = { name: 'bash', arguments: {}, agent }
    expect(autoPermissionAuthority(exec as any, () => undefined)).toBe(agent)
  })
  it('subagent 沿 parentSession 链继承 Auto', () => {
    const parent = { session: { events: autoEvents(), header: { origin: 'primary', cwd: '/ws' } } }
    const child = { session: { events: neverEvents(), header: { origin: 'subagent', parentSession: 'p1', cwd: '/ws' } } }
    const lookup = (id: unknown) => (id === 'p1' ? parent : undefined)
    const exec = { name: 'bash', arguments: {}, agent: child }
    expect(autoPermissionAuthority(exec as any, lookup)).toBe(parent)
  })
  it('parent 缺失返回 undefined', () => {
    const child = { session: { events: neverEvents(), header: { origin: 'subagent', parentSession: 'p1', cwd: '/ws' } } }
    const exec = { name: 'bash', arguments: {}, agent: child }
    expect(autoPermissionAuthority(exec as any, () => undefined)).toBeUndefined()
  })
  it('循环 parentSession 返回 undefined', () => {
    const a = { session: { events: neverEvents(), header: { origin: 'subagent', parentSession: 'b' } } }
    const b = { session: { events: neverEvents(), header: { origin: 'subagent', parentSession: 'a' } } }
    const lookup = (id: unknown) => (id === 'a' ? a : id === 'b' ? b : undefined)
    const exec = { name: 'bash', arguments: {}, agent: a }
    expect(autoPermissionAuthority(exec as any, lookup)).toBeUndefined()
  })
})

describe('trustedUserMessages 提取与脱敏（经 LLM 分类输入）', () => {
  const presetAuto = { type: 'permission/preset', data: { preset: 'auto-ask' } }
  const userMessage = (text: string) => ({ type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text }] } })
  function agentWithEvents(events: unknown[]) {
    return {
      session: { events, header: { cwd: '/ws' } },
      options: { provider: 'deepseek', model: 'deepseek-chat' },
    }
  }
  function askTool(agent: unknown, callId: string) {
    return { name: 'unrecognized_tool', arguments: { probe: true }, callId, agent, signal: new AbortController().signal }
  }
  function classifierInput(capturedCalls: any[]) {
    return JSON.parse(capturedCalls[0].messages[0].content[0].text)
  }

  it('提取直接人类消息并脱敏凭据', async () => {
    const { ctx, listeners, capturedCalls } = createMockContext(allowChunks)
    apply(ctx as any, { preflight: true })
    const agent = agentWithEvents([presetAuto, userMessage('请用 ghp_abcdefghijklmnopqrst 清理 /tmp')])
    await (listeners.get('tools/pre-execute')![0] as any)(askTool(agent, 'call-trust'), async () => ({ kind: 'allow' }))
    const input = classifierInput(capturedCalls)
    expect(input.trustedUserMessages).toHaveLength(1)
    expect(input.trustedUserMessages[0]).toContain('[redacted-secret]')
    expect(input.trustedUserMessages[0]).not.toContain('ghp_abcdefghijklmnopqrst')
  })

  it('忽略非直接人类消息（source.kind 非 user）', async () => {
    const { ctx, listeners, capturedCalls } = createMockContext(allowChunks)
    apply(ctx as any, { preflight: true })
    const agent = agentWithEvents([
      presetAuto,
      { type: 'user/message', data: { source: { kind: 'assistant' }, content: [{ type: 'text', text: '我是助手输出' }] } },
      userMessage('允许清理'),
    ])
    await (listeners.get('tools/pre-execute')![0] as any)(askTool(agent, 'call-trust2'), async () => ({ kind: 'allow' }))
    expect(classifierInput(capturedCalls).trustedUserMessages).toEqual(['允许清理'])
  })

  it('最多取最近 8 条直接人类消息', async () => {
    const { ctx, listeners, capturedCalls } = createMockContext(allowChunks)
    apply(ctx as any, { preflight: true })
    const agent = agentWithEvents([
      presetAuto,
      ...Array.from({ length: 10 }, (_, i) => userMessage('允许操作 ' + (i + 1))),
    ])
    await (listeners.get('tools/pre-execute')![0] as any)(askTool(agent, 'call-trust3'), async () => ({ kind: 'allow' }))
    const messages = classifierInput(capturedCalls).trustedUserMessages
    expect(messages).toHaveLength(8)
    expect(messages).toEqual(['允许操作 3', '允许操作 4', '允许操作 5', '允许操作 6', '允许操作 7', '允许操作 8', '允许操作 9', '允许操作 10'])
  })

  // ask_user_question 的 tool/call 事件（问题随未解析的 JSON 参数落盘）。
  const askQuestion = (callId: string, question: string, options?: string[]) => ({
    type: 'tool/call',
    data: {
      callId,
      name: 'ask_user_question',
      arguments: JSON.stringify({
        questions: [{ id: 'q1', question, ...(options === undefined ? {} : { options: options.map(label => ({ label })) }) }],
      }),
    },
  })
  // ask_user_question 的 tool/result 事件（答案以 compact JSON 文本呈现）。
  const askAnswer = (callId: string, answer: { selected?: string[], custom?: string }) => ({
    type: 'tool/result',
    data: {
      message: {
        source: { kind: 'tool', callId },
        content: [{ type: 'tool-result', toolCallId: callId, content: [{ type: 'text', text: JSON.stringify({ answers: [{ id: 'q1', ...answer }] }) }] }],
      },
    },
  })

  it('ask_user_question 问答对进入审批上下文（问题+回答）', async () => {
    const { ctx, listeners, capturedCalls } = createMockContext(allowChunks)
    apply(ctx as any, { preflight: true })
    const agent = agentWithEvents([
      presetAuto,
      askQuestion('ask-1', '是否清理 /tmp', ['是', '否']),
      askAnswer('ask-1', { selected: ['是'] }),
    ])
    await (listeners.get('tools/pre-execute')![0] as any)(askTool(agent, 'call-ask1'), async () => ({ kind: 'allow' }))
    const messages = classifierInput(capturedCalls).trustedUserMessages
    expect(messages).toHaveLength(1)
    expect(messages[0]).toContain('[ask_user_question]')
    expect(messages[0]).toContain('是否清理 /tmp')
    expect(messages[0]).toContain('(选项: 是/否)')
    expect(messages[0]).toContain('回答: q1: 是')
  })

  it('ask_user_question 回答中的凭据被脱敏', async () => {
    const { ctx, listeners, capturedCalls } = createMockContext(allowChunks)
    apply(ctx as any, { preflight: true })
    const agent = agentWithEvents([
      presetAuto,
      askQuestion('ask-2', '请输入访问令牌'),
      askAnswer('ask-2', { custom: 'ghp_abcdefghijklmnopqrst' }),
    ])
    await (listeners.get('tools/pre-execute')![0] as any)(askTool(agent, 'call-ask2'), async () => ({ kind: 'allow' }))
    const messages = classifierInput(capturedCalls).trustedUserMessages
    expect(messages[0]).toContain('[redacted-secret]')
    expect(messages[0]).not.toContain('ghp_abcdefghijklmnopqrst')
  })

  it('忽略非 ask_user_question 的 tool/result', async () => {
    const { ctx, listeners, capturedCalls } = createMockContext(allowChunks)
    apply(ctx as any, { preflight: true })
    const agent = agentWithEvents([
      presetAuto,
      { type: 'tool/result', data: { message: { source: { kind: 'tool', callId: 'other' }, content: [{ type: 'tool-result', toolCallId: 'other', content: [{ type: 'text', text: '{"foo":1}' }] }] } } },
    ])
    await (listeners.get('tools/pre-execute')![0] as any)(askTool(agent, 'call-ask3'), async () => ({ kind: 'allow' }))
    expect(classifierInput(capturedCalls).trustedUserMessages).toEqual([])
  })
})

describe('preflight 开启时 LLM 异常 fail-closed', () => {
  it('LLM 抛错 → deny（[autogate classifier unavailable]）', async () => {
    const { ctx, listeners } = createMockContext(null)
    apply(ctx as any, { preflight: true })
    const preExecute = listeners.get('tools/pre-execute')![0] as any
    const exec = { name: 'unrecognized_tool', arguments: { probe: true }, callId: 'call-llm-down', agent: autoAgent(), signal: new AbortController().signal }
    const decision = await preExecute(exec, async () => ({ kind: 'allow' }))
    expect(decision).toEqual({ kind: 'deny', reason: expect.stringContaining('[autogate classifier unavailable]') })
  })
})

describe('全自动模式（auto）：escalation 审批不人工兜底', () => {
  const fullAutoAgent = () => agentWithPreset('auto')
  const fullEscReq = () => escalationReq(fullAutoAgent())

  it('LLM 判 allow → allowed-once（直接批准）', async () => {
    const { ctx, listeners } = createMockContext(allowChunks)
    apply(ctx as any)
    const answerer = listeners.get('approval/request')![0]
    const next = async (): Promise<ApprovalOutcome> => 'allowed-once'
    expect(await answerer(fullEscReq(), next)).toBe('allowed-once')
  })

  it('LLM 判 deny → rejected（不再委派人工弹窗）', async () => {
    const { ctx, listeners } = createMockContext(denyChunks)
    apply(ctx as any)
    const answerer = listeners.get('approval/request')![0]
    let nextCalled = false
    const next = async (): Promise<ApprovalOutcome> => { nextCalled = true; return 'allowed-once' }
    expect(await answerer(fullEscReq(), next)).toBe('rejected')
    expect(nextCalled).toBe(false)
  })

  it('LLM 异常 → rejected（fail-closed，不人工兜底）', async () => {
    const { ctx, listeners } = createMockContext(null)
    apply(ctx as any)
    const answerer = listeners.get('approval/request')![0]
    const next = async (): Promise<ApprovalOutcome> => 'allowed-once'
    expect(await answerer(fullEscReq(), next)).toBe('rejected')
  })

  it('全自动模式拒绝记录到轨迹（decision=deny, layer=L2）', async () => {
    const { ctx, listeners, rpcHandlers } = createMockContext(denyChunks)
    apply(ctx as any)
    const answerer = listeners.get('approval/request')![0]
    const next = async (): Promise<ApprovalOutcome> => 'allowed-once'
    await answerer(fullEscReq(), next)
    const handler = rpcHandlers.get('/autogate')!
    const result = await handler('trail', undefined, undefined as any)
    const records = (result as any).value
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({ toolName: 'bash', decision: 'deny', layer: 'L2' })
  })
})

describe('managedPermissionAuthority', () => {
  it('识别半自动（auto-ask）预设', () => {
    const agent = { session: { events: [{ type: 'permission/preset', data: { preset: 'auto-ask' } }] } }
    expect(managedPermissionAuthority(agent as any, () => undefined)).toEqual({ agent, mode: 'semi-auto' })
  })
  it('识别全自动（auto）预设', () => {
    const agent = { session: { events: [{ type: 'permission/preset', data: { preset: 'auto' } }] } }
    expect(managedPermissionAuthority(agent as any, () => undefined)).toEqual({ agent, mode: 'full-auto' })
  })
  it('未命中（read-only）返回 undefined', () => {
    const agent = { session: { events: [{ type: 'permission/preset', data: { preset: 'read-only' } }] } }
    expect(managedPermissionAuthority(agent as any, () => undefined)).toBeUndefined()
  })
  it('subagent 沿 parentSession 链继承全自动模式', () => {
    const parent = { session: { events: [{ type: 'permission/preset', data: { preset: 'auto' } }], header: { origin: 'primary' } } }
    const child = { session: { events: [], header: { origin: 'subagent', parentSession: 'p1' } } }
    const lookup = (id: unknown) => (id === 'p1' ? parent : undefined)
    expect(managedPermissionAuthority(child as any, lookup as any)).toEqual({ agent: parent, mode: 'full-auto' })
  })
  it('无 agent 返回 undefined', () => {
    expect(managedPermissionAuthority(undefined as any, () => undefined)).toBeUndefined()
  })
})

/** 构造 settings 就绪的 mock Context，用于验证服务端跟随 locale.preference 生成理由。 */
function createLocaleContext() {
  const listeners = new Map<string, any[]>()
  const guards: ((exec: any) => string | undefined)[] = []
  const streamCalls: any[] = []
  const settingsCallbacks: ((sctx: any) => void)[] = []
  const localeListeners: ((ns: unknown) => void)[] = []
  let localeValue: { preference?: string } = { preference: 'zh' }
  const stream = async function* (options: any) {
    streamCalls.push(options)
    yield { type: 'text-delta', index: 0, text: '{"decision":"allow","reason":"ok"}' }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
  const ctx: any = {
    fiber: { state: 0 },
    on(event: string, listener: any) {
      if (!listeners.has(event)) listeners.set(event, [])
      listeners.get(event)!.push(listener)
    },
    tools: {
      guard(cb: any) { guards.push(cb); return () => {} },
      register() { return () => {} },
    },
    llm: { stream },
    get() { return undefined },
    logger: { warn() {} },
    inject(deps: string[], cb: (sctx: any) => void) {
      if (deps.includes('settings')) { settingsCallbacks.push(cb); return undefined }
      if (deps.includes('connection')) { cb({ get: () => undefined, effect: () => () => {} }); return undefined }
      return undefined
    },
    effect() { return () => {} },
  }
  const mountSettings = () => {
    const sctx = {
      settings: {
        register(_ns: unknown, _schema: unknown, opts: any) {
          opts.validate?.({})
          const resolved = { ...(opts.base ?? {}) }
          return { get: () => resolved, watch() { return () => {} }, update: async () => {}, replace: async () => {} }
        },
        get(ns: unknown) {
          if (String(ns) === 'locale') return localeValue
          return undefined
        },
      },
      on(event: string, listener: any) {
        if (event === 'settings/updated') localeListeners.push(listener)
        return () => {}
      },
      effect() { return () => {} },
    }
    for (const cb of settingsCallbacks) cb(sctx)
  }
  return { ctx, guards, listeners, streamCalls, mountSettings, setLocale: (v: { preference?: string }) => { localeValue = v }, localeListeners }
}

describe('locale 语言跟随（服务端读 settings + L0/L1 理由本地化）', () => {
  it('locale=zh → L0 硬 deny 理由为中文；切 en 后为英文', () => {
    const { ctx, guards, mountSettings, setLocale, localeListeners } = createLocaleContext()
    apply(ctx)
    mountSettings()
    const exec = { name: 'bash', arguments: { command: 'sudo rm -rf /' }, agent: autoAgent(), signal: new AbortController().signal }
    expect(guards[0](exec)).toContain('不允许提权')
    setLocale({ preference: 'en' })
    localeListeners.forEach((fn) => fn('locale'))
    expect(guards[0](exec)).toContain('privilege escalation')
  })

  it('preflight + locale=zh → 分类 system 提示词注入中文指令', async () => {
    const { ctx, listeners, streamCalls, mountSettings } = createLocaleContext()
    apply(ctx, { preflight: true })
    mountSettings()
    const preExecute = listeners.get('tools/pre-execute')![0]
    const exec = { name: 'unrecognized_tool', arguments: { probe: true }, callId: 'c-locale', agent: autoAgent(), signal: new AbortController().signal }
    const decision = await preExecute(exec, async () => ({ kind: 'allow' }))
    expect(decision.kind).toBe('allow')
    expect(streamCalls[0].system).toContain('Simplified Chinese')
  })

  it('未显式设置语言 → 服务端回退中文', () => {
    const { ctx, guards, mountSettings, setLocale, localeListeners } = createLocaleContext()
    setLocale({ preference: 'en' })
    apply(ctx)
    mountSettings()
    const exec = { name: 'bash', arguments: { command: 'sudo rm -rf /' }, agent: autoAgent(), signal: new AbortController().signal }
    expect(guards[0](exec)).toContain('privilege escalation')
    // 清空语言偏好（未显式设置）→ 归一化回退中文
    setLocale({})
    localeListeners.forEach((fn) => fn('locale'))
    expect(guards[0](exec)).toContain('不允许提权')
  })
})
