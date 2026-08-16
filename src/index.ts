import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { LlmCallConfig } from '@deepseek-ai/dsh-llm'
import { effectivePermissionPreset } from '@deepseek-ai/dsh-permission-presets'
import type { PreToolDecision, ToolExecution } from '@deepseek-ai/dsh-tools'
import { CLASSIFIER_SYSTEM_PROMPT, createDshClassifier, createHttpClassifier, extractEscalationJustification, isEscalationApprovalReason, sanitizeClassifierArguments, sanitizeClassifierText } from './classifier.js'
import { resolveRoots, type RootOptions } from './paths.js'
import { assessTool, hardDenyReason, hasSandboxEscalation, isSandboxEscalationRetry, summarizeToolArguments } from './policy.js'
import type { ApprovalOutcome } from '@deepseek-ai/dsh-user-approval'
import type { ManagedMode, SafetyClassifier } from './types.js'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import { createApprovalTrail, type ApprovalDecision, type ApprovalLayer } from './trail.js'
import type { UiLocale } from './i18n.js'

export * from './paths.js'
export * from './policy.js'
export * from './shell.js'
export * from './classifier.js'
export type * from './types.js'
export * from './trail.js'

export const name = 'autogate'
export const inject = ['tools', 'llm']

/**
 * RPC 通道最小契约（运行时由 dsh-client-connection 提供的 connection 服务；
 * 仅声明本插件用到的形状，避免引入 client 端运行时依赖）。服务端连接服务始终存在，
 * 缺失时（极端环境）跳过轨迹查询端点即可——用 ctx.get 可选读取，不声明 inject。
 */
type TrailRpcResult = { ok: true; value: unknown } | { ok: false; error: { code: string; message: string; details: Record<string, unknown> } }
type TrailRpcHandler = (endpoint: string, payload: unknown, signal: AbortSignal) => Promise<TrailRpcResult>
interface TrailRpcHost {
  handle(channel: string, handler: TrailRpcHandler, options: { authority: 'trusted-host' | 'loopback' }): () => Promise<void>
}
/** 半自动权限预设键（自动但危险时转人工兜底弹窗；默认档）。 */
export const SEMI_AUTO_PERMISSION_PRESET = 'auto-ask'

/** 全自动权限预设键（LLM 全权裁决，不再人工兜底弹窗）。 */
export const AUTO_PERMISSION_PRESET = 'auto'

/** 宿主策略配置。 */
export interface Config {
  /** 半自动权限预设键（默认 auto-ask）：危险操作转人工兜底弹窗。 */
  readonly presetName?: string
  readonly workspaceRoot?: string
  readonly dshHome?: string
  readonly tempRoots?: string[]
  readonly classifierEndpoint?: string
  readonly classifierProvider?: string
  readonly classifierModel?: string
  readonly classifierPrompt?: string
  readonly classifierApiKeyEnv?: string
  readonly classifierTimeoutMs?: number
  readonly classifierMaxOutputTokens?: number
  /** 分类器输出解析失败时静默重试一次；默认关闭（temperature 0 下偶发格式抖动）。 */
  readonly classifierRetry?: boolean
  /** 沙盒前拦截判断开关：true 执行普通 L0 规则 + LLM 分类，false 完全依赖沙盒（硬 deny 与提权审批不受影响）。 */
  readonly preflight?: boolean
  /** 全自动权限预设键（默认 auto）：该预设下审批不再人工弹窗，LLM 裁决为最终决定。 */
  readonly fullAutoPresetName?: string
}

export const Config: z<Config> = z.object({
  presetName: z.string().default(SEMI_AUTO_PERMISSION_PRESET).description('半自动权限预设键（默认 auto-ask）：危险操作转人工兜底弹窗'),
  workspaceRoot: z.string().description('覆盖工作区根目录（默认取会话 cwd）'),
  dshHome: z.string().description('覆盖 DSH_HOME 目录（默认 ~/.dsh 或 $DSH_HOME）'),
  tempRoots: z.array(z.string()).description('信任的临时目录列表（默认系统临时目录）'),
  classifierEndpoint: z.string().description('独立 OpenAI 兼容分类端点（HTTPS；loopback 可用 http）'),
  classifierProvider: z.string().description('固定分类 provider（须与 classifierModel 成对配置）'),
  classifierModel: z.string().description('固定分类模型（须与 classifierProvider 成对配置）'),
  classifierPrompt: z.string().default(CLASSIFIER_SYSTEM_PROMPT).description('审查（分类）系统提示词'),
  classifierApiKeyEnv: z.string().default('DEEPSEEK_API_KEY').pattern(/^[A-Za-z_][A-Za-z0-9_]*$/).description('HTTP 分类端点 API Key 的环境变量名'),
  classifierTimeoutMs: z.number().default(8_000).min(100).max(60_000).description('分类器超时毫秒数，超时 fail-closed'),
  classifierMaxOutputTokens: z.number().default(1_024).min(64).max(4_096).description('分类器输出 token 上限'),
  classifierRetry: z.boolean().default(false).description('分类器输出解析失败时静默重试一次；默认关闭'),
  preflight: z.boolean().default(false).description('沙盒前拦截判断开关：开启执行确定性规则与 LLM 分类，关闭则完全依赖沙盒策略（硬 deny 与提权审批不受影响）'),
  fullAutoPresetName: z.string().default(AUTO_PERMISSION_PRESET).description('全自动权限预设键（默认 auto）：该预设下审批不再人工弹窗，LLM 裁决为最终决定'),
})

/** 当前会话是否使用 Auto 权限预设。 */
export function isAutoPermissionExecution(exec: Readonly<ToolExecution>, presetName = AUTO_PERMISSION_PRESET): boolean {
  const events = exec.agent?.session.events
  return events !== undefined && effectivePermissionPreset(events) === presetName
}

type ParentSessionId = NonNullable<NonNullable<ToolExecution['agent']>['session']['header']['parentSession']>
type ParentAgentLookup = (sessionId: ParentSessionId) => ToolExecution['agent'] | undefined

/**
 * 解析授权本次执行的 Auto 会话。
 * DSH 把子代理 approval pin 到 never，因此沿 durable parentSession 链继承 Auto，
 * 否则子代理的工具调用会在 Auto 会话中被一刀切拒绝。
 */
export function autoPermissionAuthority(
  exec: Readonly<ToolExecution>,
  parentAgent: ParentAgentLookup,
  presetName = AUTO_PERMISSION_PRESET,
): ToolExecution['agent'] | undefined {
  if (isAutoPermissionExecution(exec, presetName)) return exec.agent
  let session = exec.agent?.session
  const visited = new Set<string>()
  while (session?.header?.origin === 'subagent' && session.header.parentSession !== undefined) {
    const parentSessionId = session.header.parentSession
    const parentKey = String(parentSessionId)
    if (visited.has(parentKey)) return undefined
    visited.add(parentKey)
    const parent = parentAgent(parentSessionId)
    if (parent === undefined) return undefined
    const parentExec = { ...exec, agent: parent }
    if (isAutoPermissionExecution(parentExec, presetName)) return parent
    session = parent.session
  }
  return undefined
}

/** 沿 durable parentSession 链解析执行所属的托管权限：返回授权 agent 与模式，未命中返回 undefined。 */
export function managedPermissionAuthority(
  agent: ToolExecution['agent'],
  parentAgent: ParentAgentLookup,
  semiPreset = SEMI_AUTO_PERMISSION_PRESET,
  fullPreset = AUTO_PERMISSION_PRESET,
): { agent: NonNullable<ToolExecution['agent']>; mode: ManagedMode } | undefined {
  const modeOf = (target: ToolExecution['agent']): ManagedMode | undefined => {
    const events = target?.session.events
    if (events === undefined) return undefined
    const preset = effectivePermissionPreset(events)
    if (preset === semiPreset) return 'semi-auto'
    if (preset === fullPreset) return 'full-auto'
    return undefined
  }
  const direct = modeOf(agent)
  if (direct !== undefined && agent !== undefined) return { agent, mode: direct }
  let session = agent?.session
  const visited = new Set<string>()
  while (session?.header?.origin === 'subagent' && session.header.parentSession !== undefined) {
    const parentSessionId = session.header.parentSession
    const parentKey = String(parentSessionId)
    if (visited.has(parentKey)) return undefined
    visited.add(parentKey)
    const parent = parentAgent(parentSessionId)
    if (parent === undefined) return undefined
    const mode = modeOf(parent)
    if (mode !== undefined) return { agent: parent, mode }
    session = parent.session
  }
  return undefined
}

/** 从配置构造根路径选项：空 tempRoots 归一化为默认（系统临时目录）。 */
function rootOptionsFrom(config: Config): RootOptions {
  const tempRoots = config.tempRoots === undefined || config.tempRoots.length === 0 ? undefined : config.tempRoots
  return {
    ...(config.workspaceRoot === undefined ? {} : { workspaceRoot: config.workspaceRoot }),
    ...(config.dshHome === undefined ? {} : { dshHome: config.dshHome }),
    ...(tempRoots === undefined ? {} : { tempRoots }),
  }
}

/** schema 无法表达的跨字段/协议约束；settings 写入时拒绝非法配置。 */
function validateConfig(config: Config): void {
  const hasProvider = config.classifierProvider !== undefined && config.classifierProvider !== ''
  const hasModel = config.classifierModel !== undefined && config.classifierModel !== ''
  if (hasProvider !== hasModel) throw new Error('classifierProvider 与 classifierModel 必须成对配置')
  if (config.presetName !== undefined && config.presetName === config.fullAutoPresetName) {
    throw new Error('presetName 与 fullAutoPresetName 不能相同')
  }
  if (config.classifierEndpoint !== undefined && config.classifierEndpoint.trim() !== '') {
    const endpoint = new URL(config.classifierEndpoint)
    const loopback = ['localhost', '127.0.0.1', '::1'].includes(endpoint.hostname)
    if (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && loopback)) {
      throw new Error('classifierEndpoint 必须使用 HTTPS（loopback 可用 HTTP）')
    }
  }
}

function classifierFrom(ctx: Context, config: Config, locale: () => UiLocale | undefined): SafetyClassifier {
  const timeoutMs = config.classifierTimeoutMs ?? 8_000
  const systemPrompt = config.classifierPrompt === undefined || config.classifierPrompt.trim() === '' ? undefined : config.classifierPrompt
  if (!Number.isFinite(timeoutMs) || timeoutMs < 100 || timeoutMs > 60_000) {
    throw new Error('classifierTimeoutMs must be between 100 and 60000')
  }
  const maxOutputTokens = config.classifierMaxOutputTokens ?? 1_024
  if (!Number.isInteger(maxOutputTokens) || maxOutputTokens < 64 || maxOutputTokens > 4_096) {
    throw new Error('classifierMaxOutputTokens must be an integer between 64 and 4096')
  }
  if (config.classifierEndpoint === undefined || config.classifierEndpoint.trim() === '') {
    return createDshClassifier(ctx.llm, {
      timeoutMs,
      maxOutputTokens,
      systemPrompt,
      locale,
      ...(config.classifierProvider === undefined ? {} : { provider: config.classifierProvider }),
      ...(config.classifierModel === undefined ? {} : { model: config.classifierModel }),
      ...(config.classifierRetry === undefined ? {} : { retryOnFailure: config.classifierRetry }),
    })
  }
  const endpoint = new URL(config.classifierEndpoint)
  const loopback = ['localhost', '127.0.0.1', '::1'].includes(endpoint.hostname)
  if (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && loopback)) {
    throw new Error('classifierEndpoint must use HTTPS (HTTP is accepted only for a loopback test service)')
  }
  const envName = config.classifierApiKeyEnv ?? 'DEEPSEEK_API_KEY'
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(envName)) throw new Error('classifierApiKeyEnv must be an environment-variable name')
  const apiKey = process.env[envName]
  return createHttpClassifier({
    endpoint: endpoint.href,
    model: config.classifierModel ?? 'deepseek-chat',
    systemPrompt,
    locale,
    ...(apiKey === undefined || apiKey === '' ? {} : { apiKey }),
    timeoutMs,
    ...(config.classifierRetry === undefined ? {} : { retryOnFailure: config.classifierRetry }),
  })
}

function modelRoute(agent: ToolExecution['agent']): Pick<LlmCallConfig, 'provider' | 'model'> | undefined {
  type AgentSession = NonNullable<ToolExecution['agent']>['session']
  const session = agent?.session as (AgentSession & { requestHeader?: () => { config: LlmCallConfig } | undefined }) | undefined
  const request = session?.requestHeader?.()?.config
  if (request !== undefined) return { provider: request.provider, model: request.model }
  const provider = agent?.options?.provider
  const model = agent?.options?.model
  return provider === undefined || model === undefined ? undefined : { provider, model }
}

/**
 * 审批上下文的「授权依据」：最近的直接人类消息，以及 ask_user_question 的问答对。
 * 问答对中问题是 AI 提问（提供上下文），回答是用户选择（授权本身）；两者一并脱敏、
 * 限界后进入分类器，使分类器能识别「用户已通过问答明确授权」而不再重复人工弹窗。
 */
function trustedUserMessages(authority: ToolExecution['agent']): string[] {
  if (authority === undefined) return []
  const messages: string[] = []
  let remaining = 4_000

  // 第一阶段：建立 ask_user_question 的 callId → 问题文本 映射（问题随 tool/call 落盘）。
  const askQuestions = new Map<string, string>()
  for (const event of authority.session.events) {
    if (event.type !== 'tool/call' || event.data.name !== 'ask_user_question') continue
    const text = askUserQuestionsText(event.data.arguments)
    if (text !== '') askQuestions.set(String(event.data.callId), text)
  }

  // 第二阶段：从后往前收集最近的直接人类消息与问答对（最近优先）。
  for (let index = authority.session.events.length - 1; index >= 0 && messages.length < 8 && remaining > 0; index -= 1) {
    const event = authority.session.events[index]
    if (event?.type === 'user/message' && event.data.source.kind === 'user') {
      const text = event.data.content
        .filter((block): block is Extract<(typeof event.data.content)[number], { type: 'text' }> => block.type === 'text')
        .map(block => block.text)
        .join('\n')
        .trim()
      if (text === '') continue
      const sanitized = sanitizeClassifierText(text).slice(0, remaining)
      messages.push(sanitized)
      remaining -= sanitized.length
      continue
    }
    if (event?.type === 'tool/result') {
      const answer = askUserAnswerText(event.data.message)
      if (answer === '') continue
      const question = askQuestions.get(String(event.data.message.source.callId))
      const combined = question === undefined
        ? '[ask_user_question] 回答: ' + answer
        : '[ask_user_question] 问题: ' + question + '；回答: ' + answer
      const sanitized = sanitizeClassifierText(combined).slice(0, remaining)
      messages.push(sanitized)
      remaining -= sanitized.length
    }
  }
  return messages.reverse()
}

/** 从 ask_user_question 的 tool/call 参数（未解析的 JSON 字符串）提取问题文本。 */
function askUserQuestionsText(rawArguments: string): string {
  let parsed: unknown
  try { parsed = JSON.parse(rawArguments) } catch { return '' }
  if (typeof parsed !== 'object' || parsed === null) return ''
  const questions = (parsed as Record<string, unknown>).questions
  if (!Array.isArray(questions)) return ''
  const parts: string[] = []
  for (const question of questions) {
    if (typeof question !== 'object' || question === null) continue
    const item = question as Record<string, unknown>
    const title = typeof item.question === 'string' ? item.question.trim() : ''
    const header = typeof item.header === 'string' ? item.header.trim() : ''
    const options = Array.isArray(item.options)
      ? item.options
          .filter((option): option is Record<string, unknown> => typeof option === 'object' && option !== null)
          .map(option => (typeof option.label === 'string' ? option.label : ''))
          .filter(label => label !== '')
      : []
    if (title === '' && header === '' && options.length === 0) continue
    let text = title
    if (header !== '') text = header + (text === '' ? '' : ': ') + text
    if (options.length > 0) text += ' (选项: ' + options.join('/') + ')'
    parts.push(text)
  }
  return parts.join('；')
}

/** 从 ask_user_question 的 tool/result 消息提取回答文本（答案以 compact JSON 文本呈现）。 */
function askUserAnswerText(message: unknown): string {
  if (typeof message !== 'object' || message === null) return ''
  const outerBlocks = (message as Record<string, unknown>).content
  if (!Array.isArray(outerBlocks)) return ''
  for (const outer of outerBlocks) {
    if (typeof outer !== 'object' || outer === null) continue
    const blocks = (outer as Record<string, unknown>).content
    if (!Array.isArray(blocks)) continue
    for (const block of blocks) {
      if (typeof block !== 'object' || block === null) continue
      const entry = block as Record<string, unknown>
      if (entry.type !== 'text' || typeof entry.text !== 'string') continue
      let parsed: unknown
      try { parsed = JSON.parse(entry.text) } catch { continue }
      if (typeof parsed !== 'object' || parsed === null) continue
      const answers = (parsed as Record<string, unknown>).answers
      if (!Array.isArray(answers)) continue
      const text = formatAskUserAnswers(answers)
      if (text !== '') return text
    }
  }
  return ''
}

/** 把 ask_user_question 的回答列表格式化为可读文本。 */
function formatAskUserAnswers(answers: unknown[]): string {
  const parts: string[] = []
  for (const answer of answers) {
    if (typeof answer !== 'object' || answer === null) continue
    const item = answer as Record<string, unknown>
    const id = typeof item.id === 'string' ? item.id : ''
    const selected = Array.isArray(item.selected)
      ? item.selected.filter((value): value is string => typeof value === 'string')
      : []
    const custom = typeof item.custom === 'string' ? item.custom.trim() : ''
    const pieces: string[] = []
    if (selected.length > 0) pieces.push(selected.join(', '))
    if (custom !== '') pieces.push('custom: ' + custom)
    if (pieces.length === 0) continue
    parts.push(id === '' ? pieces.join('；') : id + ': ' + pieces.join('；'))
  }
  return parts.join(' | ')
}

/** 安装自动权限策略到官方工具流水线。 */
export function apply(ctx: Context, config: Config = {}): void {
  const entry = config
  // 当前 UI 语言：跟随 DSH 设置语言（locale.preference）；未显式设置时回退中文，
  // 与客户端浏览器语言 fallback（中文优先）保持一致。
  let uiLocale: UiLocale = 'zh'
  let presetName = entry.presetName ?? SEMI_AUTO_PERMISSION_PRESET
  let fullAutoPresetName = entry.fullAutoPresetName ?? AUTO_PERMISSION_PRESET
  let classifier = classifierFrom(ctx, entry, () => uiLocale)
  let rootOptions = rootOptionsFrom(entry)
  let preflight = entry.preflight ?? false

  let source: () => Config = () => entry
  let built = false
  const rebuild = (): void => {
    try {
      const cfg = source()
      presetName = cfg.presetName ?? SEMI_AUTO_PERMISSION_PRESET
      fullAutoPresetName = cfg.fullAutoPresetName ?? AUTO_PERMISSION_PRESET
      classifier = classifierFrom(ctx, cfg, () => uiLocale)
      rootOptions = rootOptionsFrom(cfg)
      preflight = cfg.preflight ?? false
      built = true
    } catch (error) {
      if (!built) throw error
      ctx.logger.warn('autogate: 配置重建失败，沿用上一份有效配置', error)
    }
  }

  // 无缝接入 DSH 配置：settings 挂载时用 settings.yaml 的 autogate 段（热重载），未挂载回退 entry config。
  installSettingsSection(ctx, settingsNamespace('autogate'), Config, entry, {
    setSource(next) { source = next },
    onChange() { rebuild() },
    validate: validateConfig,
  })
  rebuild()

  // 跟随 DSH 设置语言：locale.preference（'zh'|'en'）由 dsh-client-locale 持久化在同一个
  // settings 文档里，服务端直接读取即可；据此让 L0 理由与 L1 分类 reason 使用对应语言。
  ctx.inject(['settings'], (sctx) => {
    const localeNs = settingsNamespace('locale')
    const readLocale = (): void => {
      const value = sctx.settings.get(localeNs) as { preference?: UiLocale } | undefined
      // 未显式设置（preference 缺失）时回退中文，与客户端浏览器语言 fallback 一致。
      uiLocale = value?.preference ?? 'zh'
    }
    readLocale()
    sctx.on('settings/updated', (ns: unknown) => {
      if (ns === localeNs) readLocale()
    })
    // settings 服务卸载时回退中文（未显式设置语言时的默认行为）。
    sctx.effect(() => () => { uiLocale = 'zh' })
  })

  // 审批轨迹：进程级环形缓冲，记录每次 Auto 决策供客户端面板拉取展示。
  const trail = createApprovalTrail()
  const recordTrail = (exec: Readonly<ToolExecution>, decision: ApprovalDecision, layer: ApprovalLayer, reason: string, durationMs: number): void => {
    trail.record({
      callId: exec.callId === undefined ? '' : String(exec.callId),
      toolName: exec.name,
      summary: summarizeToolArguments(exec.name, exec.arguments),
      decision,
      layer,
      reason,
      durationMs,
    })
  }

  // 带 sandbox_permissions 的提权重试：pre-execute 放行时缓存原始参数；
  // ApprovalRequest 不携带 arguments，approval/request 阶段按 callId 取回供分类器判断具体目标。
  const escalationArgs = new Map<string, unknown>()

  const rootsFor = (exec: Readonly<ToolExecution>) => resolveRoots(exec.agent?.session.header.cwd, rootOptions)
  const parentAgent: ParentAgentLookup = sessionId => ctx.get('agents')?.get(sessionId)
  const authorityFor = (exec: Readonly<ToolExecution>) => managedPermissionAuthority(exec.agent, parentAgent, presetName, fullAutoPresetName)
  const isAutoExecution = (exec: Readonly<ToolExecution>) => authorityFor(exec) !== undefined

  // 同步硬 deny：单调 guard，后续监听器/分类器无法覆盖。
  ctx.tools.guard(exec => {
    const authority = authorityFor(exec)
    if (authority === undefined) return undefined
    const reason = hardDenyReason(exec, rootsFor(exec), uiLocale, authority.mode)
    // 同步硬 deny 同样落入审批轨迹：guard 阶段直接拒绝，不会进入 pre-execute，
    // 因此需在此处记录，否则轨迹面板看不到这类决策。
    if (reason !== undefined) recordTrail(exec, 'deny', 'L0', reason, 0)
    return reason
  })

  // 异步判定：allow 放行 / deny 拒绝 / 无法静态分类转人工或交 LLM 两态裁决。
  ctx.on('tools/pre-execute', async (exec, next): Promise<PreToolDecision> => {
    if (!isAutoExecution(exec)) return next()

    // 审批耗时：从进入审批管道到做出决策的墙钟毫秒数（L0 规则 / L1 LLM 分类）。
    const startedAt = Date.now()

    // 缓存所有带 sandbox_permissions 的提权重试参数（ApprovalRequest 不携带 arguments，
    // approval/request 阶段按 callId 取回供分类器评估具体目标）。
    if (hasSandboxEscalation(exec.arguments)) {
      escalationArgs.set(String(exec.callId), exec.arguments)
      // 环形上限：提权请求未到达 approval/request 时（沙箱直接拒绝未生成审批）缓存不会取回，
      // 限制容量并淘汰最旧项，避免进程级内存缓慢增长。
      if (escalationArgs.size > 100) {
        const oldest = escalationArgs.keys().next().value
        if (oldest !== undefined) escalationArgs.delete(oldest)
      }
    }

    // 沙箱提权重试：bash/pwsh 带 sandbox_permissions 直接放行，escalation 审批在 approval/request 监听里先过 LLM 判断。
    if (isSandboxEscalationRetry(exec.name, exec.arguments)) {
      return next()
    }

    // 前置拦截开关：关闭时跳过普通 L0 规则与 LLM 分类，完全依赖沙盒策略。
    // 硬 deny 已在 guard 同步生效，escalation 提权审批在 approval/request 监听，两者均不受本开关影响。
    if (!preflight) return next()

    const roots = rootsFor(exec)
    const assessment = assessTool(exec, roots, uiLocale, authorityFor(exec)?.mode)
    if (assessment.decision === 'deny') {
      recordTrail(exec, 'deny', 'L0', assessment.reason, Date.now() - startedAt)
      return { kind: 'deny', reason: '[autogate hard deny] ' + assessment.reason }
    }
    if (assessment.decision === 'allow') {
      recordTrail(exec, 'allow', 'L0', assessment.reason, Date.now() - startedAt)
      return next()
    }
    // 剩余均为交 LLM 两态裁决的模糊/危险操作。
    try {
      const authority = authorityFor(exec)
      const route = modelRoute(exec.agent) ?? modelRoute(authority?.agent)
      const decision = await classifier.classify({
        toolName: exec.name,
        arguments: sanitizeClassifierArguments(exec.arguments),
        workspaceRoot: roots.workspace,
        policyReason: assessment.reason,
        trustedUserMessages: trustedUserMessages(authority?.agent),
        ...(route === undefined ? {} : { route }),
      }, exec.signal)
      if (decision.decision === 'allow') {
        recordTrail(exec, 'allow', 'L1', decision.reason, Date.now() - startedAt)
        return next()
      }
      recordTrail(exec, 'deny', 'L1', decision.reason, Date.now() - startedAt)
      return { kind: 'deny', reason: '[autogate classifier deny] ' + decision.reason }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      recordTrail(exec, 'deny', 'L1', message, Date.now() - startedAt)
      return { kind: 'deny', reason: '[autogate classifier unavailable] ' + message }
    }
  })

  // 沙箱提权审批：先过 LLM 判断是否合理越界，合理则直接批准（不人工弹窗）。
  // 半自动：危险/不确定委派人工兜底弹窗；全自动：LLM 裁决为最终决定，拒绝即拒绝、不再人工弹窗。
  ctx.on('approval/request', async (req, next): Promise<ApprovalOutcome> => {
    if (!isEscalationApprovalReason(req.reason)) return next()
    const authority = managedPermissionAuthority(req.agent, parentAgent, presetName, fullAutoPresetName)
    if (authority === undefined) return next()
    const mode = authority.mode
    // 审批耗时：提权审批从进入本监听器到 LLM 预审得出结论的墙钟毫秒数。
    const startedAt = Date.now()
    const justification = extractEscalationJustification(req.reason)
    const callId = req.callId === undefined ? '' : String(req.callId)
    const summary = justification.replace(/\s+/g, ' ').trim().slice(0, 80)
    try {
      const route = modelRoute(authority.agent)
      const roots = resolveRoots(authority.agent.session.header.cwd, rootOptions)
      // 取回提权调用的原始参数（含 file_path/content），让分类器评估具体目标，而非只凭 justification 猜测。
      const rawArguments = escalationArgs.get(callId) ?? { justification }
      escalationArgs.delete(callId)
      const decision = await classifier.classify({
        toolName: req.toolName,
        arguments: sanitizeClassifierArguments(rawArguments),
        workspaceRoot: roots.workspace,
        policyReason: 'sandbox escalation request: ' + req.reason,
        trustedUserMessages: trustedUserMessages(authority.agent),
        ...(route === undefined ? {} : { route }),
      }, req.signal ?? new AbortController().signal)
      if (decision.decision === 'allow') {
        trail.record({ callId, toolName: req.toolName, summary, decision: 'allow', layer: 'L2', reason: decision.reason, durationMs: Date.now() - startedAt })
        return 'allowed-once'
      }
      trail.record({ callId, toolName: req.toolName, summary, decision: mode === 'full-auto' ? 'deny' : 'ask', layer: 'L2', reason: decision.reason, durationMs: Date.now() - startedAt })
    } catch {
      // 分类器异常：半自动 fail-closed 到人工弹窗；全自动直接拒绝。
      trail.record({ callId, toolName: req.toolName, summary, decision: mode === 'full-auto' ? 'deny' : 'ask', layer: 'L2', reason: 'classifier unavailable', durationMs: Date.now() - startedAt })
    }
    // 全自动：LLM 裁决为最终决定，直接拒绝不再人工弹窗；半自动：委派人工兜底。
    if (mode === 'full-auto') return 'rejected'
    return next()
  })

  // 审批轨迹查询端点：客户端通过 connection.rpc.call('/autogate', 'trail') 拉取。
  // connection 服务由 client-connection 在自身 fiber 中 provide，本插件 apply 时可能尚未激活；
  // 同步 ctx.get 会取到 undefined 导致端点静默缺失，须用 ctx.inject 等待服务就绪后再注册。
  ctx.inject(['connection'], (connCtx) => {
    const connection = connCtx.get('connection') as { rpc?: TrailRpcHost } | undefined
    const disposeTrailRpc = connection?.rpc?.handle('/autogate', async (endpoint) => {
      if (endpoint === 'trail') return { ok: true, value: trail.snapshot() }
      return { ok: false, error: { code: 'internal', message: 'unknown endpoint: ' + endpoint, details: {} } }
    }, { authority: 'loopback' })
    if (disposeTrailRpc !== undefined) {
      connCtx.effect(() => disposeTrailRpc, 'autogate: trail rpc channel')
    }
  })
}
