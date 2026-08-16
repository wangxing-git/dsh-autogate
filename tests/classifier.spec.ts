import { afterEach, describe, expect, it, vi } from 'vitest'
import { CLASSIFIER_SYSTEM_PROMPT, createDshClassifier, createHttpClassifier, extractEscalationJustification, isEscalationApprovalReason, parseClassifierDecision, sanitizeClassifierArguments, sanitizeClassifierText } from '../src/classifier.js'

describe('parseClassifierDecision', () => {
  it('接受 allow', () => {
    expect(parseClassifierDecision({ decision: 'allow', reason: 'ok' })).toEqual({ decision: 'allow', reason: 'ok' })
  })
  it('接受 deny', () => {
    expect(parseClassifierDecision({ decision: 'deny', reason: 'no' })).toEqual({ decision: 'deny', reason: 'no' })
  })
  it('两态下拒绝 ask', () => {
    expect(() => parseClassifierDecision({ decision: 'ask', reason: '?' })).toThrow('classifier decision is invalid')
  })
  it('拒绝多余键', () => {
    expect(() => parseClassifierDecision({ decision: 'allow', reason: 'ok', extra: 1 })).toThrow('only decision and reason')
  })
})

describe('isEscalationApprovalReason', () => {
  it('识别 escalation 前缀', () => {
    expect(isEscalationApprovalReason('escalate sandbox to danger-full-access: 需要')).toBe(true)
  })
  it('普通 reason 不是 escalation', () => {
    expect(isEscalationApprovalReason('other reason')).toBe(false)
    expect(isEscalationApprovalReason(undefined)).toBe(false)
  })
})

describe('extractEscalationJustification', () => {
  it('提取冒号后的 justification', () => {
    expect(extractEscalationJustification('escalate sandbox to danger-full-access: 用户要求清理')).toBe('用户要求清理')
  })
  it('无冒号时返回原文', () => {
    expect(extractEscalationJustification('escalate sandbox to danger-full-access')).toBe('escalate sandbox to danger-full-access')
  })
})

describe('CLASSIFIER_SYSTEM_PROMPT 场景覆盖', () => {
  it('覆盖符号链接删除与安装目录残留清理', () => {
    expect(CLASSIFIER_SYSTEM_PROMPT).toContain('symbolic link')
    expect(CLASSIFIER_SYSTEM_PROMPT).toContain('routine maintenance')
    expect(CLASSIFIER_SYSTEM_PROMPT).toContain('no trailing slash')
  })
  it('覆盖用户授权操作的直接延伸', () => {
    expect(CLASSIFIER_SYSTEM_PROMPT).toContain('follow-up')
    expect(CLASSIFIER_SYSTEM_PROMPT).toContain('inherits that authorization')
  })
  it('覆盖 ask_user_question 问答对作为授权依据（回答是授权、问题不可信）', () => {
    expect(CLASSIFIER_SYSTEM_PROMPT).toContain('ask_user_question')
    expect(CLASSIFIER_SYSTEM_PROMPT).toContain('回答')
    expect(CLASSIFIER_SYSTEM_PROMPT).toContain('UNTRUSTED')
    expect(CLASSIFIER_SYSTEM_PROMPT).toContain('never as authority')
  })
  it('关键路径删除的硬边界不退化', () => {
    expect(CLASSIFIER_SYSTEM_PROMPT).toContain('user home ROOT')
    expect(CLASSIFIER_SYSTEM_PROMPT).toContain('filesystem root')
  })
})

describe('createDshClassifier 审查提示词', () => {
  const input = {
    toolName: 'read',
    arguments: { file_path: '/ws/x' },
    workspaceRoot: '/ws',
    policyReason: 'test',
    trustedUserMessages: [],
    route: { provider: 'p', model: 'm' },
  }
  function runtime(captured: { system?: string }) {
    return {
      stream: async function* (options: any) {
        captured.system = options.system
        yield { type: 'text-delta', index: 0, text: '{"decision":"allow","reason":"ok"}' }
        yield { type: 'finish', reason: { kind: 'stop' } }
      },
    }
  }
  it('缺省使用内置 CLASSIFIER_SYSTEM_PROMPT', async () => {
    const captured: { system?: string } = {}
    const classifier = createDshClassifier(runtime(captured) as any, { timeoutMs: 1000 })
    await classifier.classify(input as any, new AbortController().signal)
    expect(captured.system).toBe(CLASSIFIER_SYSTEM_PROMPT)
  })
  it('使用配置的自定义审查提示词', async () => {
    const captured: { system?: string } = {}
    const classifier = createDshClassifier(runtime(captured) as any, { timeoutMs: 1000, systemPrompt: 'custom review prompt' })
    await classifier.classify(input as any, new AbortController().signal)
    expect(captured.system).toBe('custom review prompt')
  })
  it('多 part 按 index 乱序到达仍正确拼接', async () => {
    const runtime = {
      stream: async function* () {
        yield { type: 'text-delta', index: 1, text: ',"reason":"ok"}' }
        yield { type: 'text-delta', index: 0, text: '{"decision":"allow"' }
        yield { type: 'finish', reason: { kind: 'stop' } }
      },
    }
    const classifier = createDshClassifier(runtime as any, { timeoutMs: 1000 })
    const decision = await classifier.classify(input as any, new AbortController().signal)
    expect(decision).toEqual({ decision: 'allow', reason: 'ok' })
  })
})

describe('createDshClassifier 异常路径', () => {
  const routedInput = { toolName: 'x', arguments: {}, workspaceRoot: '/ws', policyReason: 't', trustedUserMessages: [], route: { provider: 'p', model: 'm' } }

  it('provider/model 不成对抛错', () => {
    expect(() => createDshClassifier({} as any, { timeoutMs: 1000, provider: 'p' })).toThrow('together')
  })
  it('无路由抛错（fail-closed）', async () => {
    const classifier = createDshClassifier({ stream: async function* () {} } as any, { timeoutMs: 1000 })
    const input = { toolName: 'x', arguments: {}, workspaceRoot: '/ws', policyReason: 't', trustedUserMessages: [] }
    await expect(classifier.classify(input as any, new AbortController().signal)).rejects.toThrow('route')
  })
  it('分类器请求工具调用抛错', async () => {
    const runtime = { stream: async function* () { yield { type: 'tool-call-delta' } } } as any
    const classifier = createDshClassifier(runtime, { timeoutMs: 1000 })
    await expect(classifier.classify(routedInput as any, new AbortController().signal)).rejects.toThrow('tool')
  })
  it('max-tokens 终止抛错', async () => {
    const runtime = { stream: async function* () { yield { type: 'finish', reason: { kind: 'max-tokens' } } } } as any
    const classifier = createDshClassifier(runtime, { timeoutMs: 1000 })
    await expect(classifier.classify(routedInput as any, new AbortController().signal)).rejects.toThrow('output limit')
  })
  it('无 finish 抛错', async () => {
    const runtime = { stream: async function* () { yield { type: 'text-delta', index: 0, text: '{"decision":"allow","reason":"ok"}' } } } as any
    const classifier = createDshClassifier(runtime, { timeoutMs: 1000 })
    await expect(classifier.classify(routedInput as any, new AbortController().signal)).rejects.toThrow('finish')
  })
})

describe('parseClassifierDecision 边界', () => {
  it('拒绝空 / 空白 reason', () => {
    expect(() => parseClassifierDecision({ decision: 'allow', reason: '' })).toThrow('reason is invalid')
    expect(() => parseClassifierDecision({ decision: 'allow', reason: '   ' })).toThrow('reason is invalid')
  })
  it('拒绝超长 reason', () => {
    expect(() => parseClassifierDecision({ decision: 'allow', reason: 'x'.repeat(1001) })).toThrow('reason is invalid')
  })
  it('拒绝非字符串 reason', () => {
    expect(() => parseClassifierDecision({ decision: 'allow', reason: 123 })).toThrow('reason is invalid')
  })
  it('拒绝 null / 数组 / 非对象输入', () => {
    expect(() => parseClassifierDecision(null)).toThrow('must be an object')
    expect(() => parseClassifierDecision([1, 2])).toThrow('must be an object')
    expect(() => parseClassifierDecision('x')).toThrow('must be an object')
  })
})

describe('sanitizeClassifierText 密钥脱敏', () => {
  it('脱敏 GitHub / Slack token', () => {
    expect(sanitizeClassifierText('token: ghp_abcdefghijklmnopqrst')).toContain('[redacted-secret]')
    expect(sanitizeClassifierText('xoxb-1234567890abcdefgh')).toContain('[redacted-secret]')
  })
  it('脱敏 Bearer 凭据', () => {
    expect(sanitizeClassifierText('Authorization: Bearer abcdefghijklmnop')).toContain('Bearer [redacted-secret]')
  })
  it('脱敏 key=value 形式', () => {
    expect(sanitizeClassifierText('api_key=supersecretvalue')).toContain('api_key=[redacted-secret]')
  })
  it('截断到 1000 字符', () => {
    expect(sanitizeClassifierText('a'.repeat(2000))).toHaveLength(1000)
  })
})

describe('sanitizeClassifierArguments 结构脱敏与限界', () => {
  it('密钥键名整体脱敏', () => {
    expect(sanitizeClassifierArguments({ apiKey: 'xxx', token: 'yyy' })).toEqual({ apiKey: '[redacted-secret-field]', token: '[redacted-secret-field]' })
  })
  it('内容键脱敏为长度占位', () => {
    expect(sanitizeClassifierArguments({ content: 'hello' })).toEqual({ content: '[redacted-content:5-chars]' })
  })
  it('嵌套字符串递归脱敏', () => {
    expect(sanitizeClassifierArguments({ nested: { msg: 'Bearer abcdefghijklmnop' } })).toEqual({ nested: { msg: 'Bearer [redacted-secret]' } })
  })
  it('深度超过 3 层截断', () => {
    const deep = { a: { b: { c: { d: { e: 'x' } } } } }
    expect(JSON.stringify(sanitizeClassifierArguments(deep))).toContain('[truncated-depth]')
  })
  it('数组超过 25 项截断', () => {
    const arr = Array.from({ length: 30 }, (_, i) => i)
    expect(sanitizeClassifierArguments(arr)).toHaveLength(25)
  })
  it('对象超过 50 键截断', () => {
    const obj: Record<string, number> = {}
    for (let i = 0; i < 60; i += 1) obj['k' + i] = i
    expect(Object.keys(sanitizeClassifierArguments(obj) as object)).toHaveLength(50)
  })
  it('原始类型原样返回', () => {
    expect(sanitizeClassifierArguments(42)).toBe(42)
    expect(sanitizeClassifierArguments(true)).toBe(true)
    expect(sanitizeClassifierArguments(null)).toBe(null)
  })
})

describe('createHttpClassifier HTTP 端点', () => {
  const okResponse = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })
  const input = { toolName: 'x', arguments: {}, workspaceRoot: '/ws', policyReason: 't', trustedUserMessages: [] }

  afterEach(() => vi.unstubAllGlobals())

  it('解析 OpenAI 兼容响应', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okResponse({ choices: [{ message: { content: '{"decision":"allow","reason":"ok"}' } }] })))
    const classifier = createHttpClassifier({ endpoint: 'https://api.example.com/v1/chat/completions', model: 'm', timeoutMs: 1000 })
    const decision = await classifier.classify(input as any, new AbortController().signal)
    expect(decision).toEqual({ decision: 'allow', reason: 'ok' })
  })
  it('携带 Bearer API Key', async () => {
    const fetchMock = vi.fn(async () => okResponse({ choices: [{ message: { content: '{"decision":"allow","reason":"ok"}' } }] }))
    vi.stubGlobal('fetch', fetchMock)
    const classifier = createHttpClassifier({ endpoint: 'https://api.example.com/v1/chat/completions', model: 'm', apiKey: 'k', timeoutMs: 1000 })
    await classifier.classify(input as any, new AbortController().signal)
    const headers = (fetchMock.mock.calls[0][1] as any).headers
    expect(headers.authorization).toBe('Bearer k')
  })
  it('非 200 响应抛错', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('err', { status: 500 })))
    const classifier = createHttpClassifier({ endpoint: 'https://api.example.com/v1/chat/completions', model: 'm', timeoutMs: 1000 })
    await expect(classifier.classify(input as any, new AbortController().signal)).rejects.toThrow('HTTP 500')
  })
  it('choices 为空抛错', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okResponse({ choices: [] })))
    const classifier = createHttpClassifier({ endpoint: 'https://api.example.com/v1/chat/completions', model: 'm', timeoutMs: 1000 })
    await expect(classifier.classify(input as any, new AbortController().signal)).rejects.toThrow('one choice')
  })
  it('deny 决策透传', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okResponse({ choices: [{ message: { content: '{"decision":"deny","reason":"danger"}' } }] })))
    const classifier = createHttpClassifier({ endpoint: 'https://api.example.com/v1/chat/completions', model: 'm', timeoutMs: 1000 })
    const decision = await classifier.classify(input as any, new AbortController().signal)
    expect(decision).toEqual({ decision: 'deny', reason: 'danger' })
  })
})
