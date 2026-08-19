import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import Schema from '@deepseek-ai/schemastery'

/** autogate 的 settings 命名空间（与服务端 settingsNamespace('autogate') 一致）。 */
export const SETTINGS_NS = 'autogate'

/**
 * 成对字段组：重置其一须联动重置另一，否则保存时服务端 validateConfig 的成对约束拒绝。
 * 键为被重置字段，值为须联动重置的成对字段。
 */
export const PAIRED_RESET_FIELDS: Readonly<Record<string, string>> = {
  classifierProvider: 'classifierModel',
  classifierModel: 'classifierProvider',
}

/** 返回重置某字段时应联动重置的成对字段；无成对关系时返回 undefined。 */
export function pairedResetField(field: string): string | undefined {
  return PAIRED_RESET_FIELDS[field]
}

/** 执行重置并联动重置成对字段（classifierProvider ↔ classifierModel）；服务端成对约束要求清空其一须同步清空另一。 */
export function pairedReset(actions: { resetField(field: string): void }, field: string): void {
  actions.resetField(field)
  const paired = pairedResetField(field)
  if (paired !== undefined) actions.resetField(paired)
}

// ==== 字段转换 spec ====

export function textField(field: string, multiline = false) {
  return {
    field,
    multiline,
    format: (value: unknown) => typeof value === 'string' ? value : '',
    parse: (text: string) => text === '' ? { kind: 'clear' as const } : { kind: 'set' as const, value: text },
  }
}

/** 带候选下拉的文本字段：选项仅供快速选择，仍允许输入任意自定义值（datalist 组合框）；候选通常由服务端模型目录动态注入。 */
export function selectField(field: string, options: readonly string[] = []) {
  return {
    field,
    multiline: false,
    options,
    format: (value: unknown) => typeof value === 'string' ? value : '',
    parse: (text: string) => text === '' ? { kind: 'clear' as const } : { kind: 'set' as const, value: text },
  }
}

export function numberField(field: string) {
  return {
    field,
    multiline: false,
    format: (value: unknown) => typeof value === 'number' ? String(value) : '',
    parse: (text: string) => {
      const trimmed = text.trim()
      if (trimmed === '') return { kind: 'clear' as const }
      const parsed = Number(trimmed)
      return Number.isFinite(parsed) ? { kind: 'set' as const, value: parsed } : undefined
    },
  }
}

export function boolField(field: string) {
  return {
    field,
    multiline: false,
    bool: true,
    format: (value: unknown) => value === true ? 'true' : 'false',
    parse: (text: string) => {
      if (text === 'true') return { kind: 'set' as const, value: true }
      if (text === 'false') return { kind: 'set' as const, value: false }
      return undefined
    },
  }
}

// ==== CardForm：staged 编辑 + save/discard（参考 dsh-client-ui-settings-plugins） ====
export class CardForm {
  scope: any
  specs: Map<string, any>
  staged = new Map<string, { text: string, clear: boolean }>()
  listeners = new Set<() => void>()
  dynamicOptions = new Map<string, readonly string[]>()
  saving = false
  failed = false
  saved = false
  /** 最近一次保存失败的具体原因（服务端拒绝文本，如成对约束）；成功或重新编辑后清空。 */
  failedMessage = ''

  constructor(scope: any, specs: any[]) {
    this.scope = scope
    this.specs = new Map(specs.map(s => [s.field, s]))
    scope.subscribe(() => this.publish())
  }

  bind(project: () => any) {
    const store = createSnapshotStore(project())
    this.listeners.add(() => store.set(project()))
    return store
  }

  shell() {
    const snapshot = this.scope.getSnapshot()
    return {
      available: snapshot.status === 'ready',
      writable: snapshot.writable,
      dirty: [...this.staged.entries()].some(([field, staged]) => this.fieldChanged(field, staged)),
      invalid: [...this.staged.entries()].some(([field, staged]) => this.fieldInvalid(field, staged)),
      saving: this.saving,
      failed: this.failed,
      failedMessage: this.failedMessage,
      saved: this.saved,
    }
  }

  field(field: string) {
    const spec = this.specs.get(field)
    const staged = this.staged.get(field)
    const snapshot = this.scope.getSnapshot()
    const value = snapshot.value?.[field]
    const user = snapshot.user
    const stored = user !== undefined && Object.hasOwn(user, field)
    const options = this.dynamicOptions.get(field) ?? spec.options ?? []
    if (staged === undefined) {
      return { text: spec.format(value), overridden: stored, invalid: false, dirty: false, options }
    }
    if (staged.clear) {
      // 重置后即时预览「移除 user 层后的生效值」（schema 默认 + base），而非留空。
      const inherited = snapshot.inherited?.[field] ?? value
      return { text: spec.format(inherited), overridden: false, invalid: false, dirty: this.fieldChanged(field, staged), options }
    }
    const parsed = spec.parse(staged.text)
    return { text: staged.text, overridden: stored, invalid: parsed === undefined, dirty: this.fieldChanged(field, staged), options }
  }

  /** 判断某字段的 staged 草稿相对已保存值是否真正变化：输入与原值相同不算变化，重置仅在 user 层有值时算变化。 */
  private fieldChanged(field: string, staged: { text: string; clear: boolean }): boolean {
    const snapshot = this.scope.getSnapshot()
    if (staged.clear) {
      return snapshot.user !== undefined && Object.hasOwn(snapshot.user, field)
    }
    const parsed = this.specs.get(field)?.parse(staged.text)
    if (parsed === undefined || parsed.kind !== 'set') return true
    return !Object.is(parsed.value, snapshot.value?.[field])
  }

  /** 判断某字段的 staged 草稿是否非法（解析失败）：非法输入应禁用保存按钮，而非等写入被拒才提示失败。 */
  private fieldInvalid(field: string, staged: { text: string; clear: boolean }): boolean {
    if (staged.clear) return false
    return this.specs.get(field)?.parse(staged.text) === undefined
  }

  actions() {
    return {
      edit: (field: string, text: string) => { this.staged.set(field, { text, clear: false }); this.saved = false; this.failedMessage = ''; this.publish() },
      resetField: (field: string) => { this.staged.set(field, { text: '', clear: true }); this.saved = false; this.failedMessage = ''; this.publish() },
      save: () => this.save(),
      discard: () => { this.staged.clear(); this.failed = false; this.failedMessage = ''; this.saved = false; this.publish() },
    }
  }

  /** 动态注入某字段的下拉候选（如从服务端模型目录拉取）；重新发布快照触发重渲染。 */
  setOptions(field: string, options: readonly string[]) {
    this.dynamicOptions.set(field, options)
    this.publish()
  }

  async save() {
    if (this.staged.size === 0 || this.saving) return
    this.saving = true
    this.failed = false
    this.failedMessage = ''
    this.publish()
    // 一次性收集全部 staged 变更并批量提交：跨字段约束（如 provider/model 成对）须在最终态校验，
    // 逐字段写会让中间态被 settings 服务拒绝。
    const set: Record<string, unknown> = {}
    const unset: string[] = []
    let landed = true
    for (const [field, staged] of this.staged) {
      if (!this.fieldChanged(field, staged)) continue
      const spec = this.specs.get(field)
      if (staged.clear) {
        unset.push(field)
        continue
      }
      const parsed = spec.parse(staged.text)
      if (parsed === undefined || parsed.kind !== 'set') { landed = false; continue }
      set[field] = parsed.value
    }
    if (landed && (Object.keys(set).length > 0 || unset.length > 0)) {
      const outcome = await this.scope.write(set, unset)
      landed = outcome !== null && typeof outcome === 'object' && outcome.ok === true
      if (!landed) {
        // 透传服务端拒绝原因（如「classifierProvider 与 classifierModel 必须成对配置」）到设置卡。
        this.failedMessage = outcome !== null && typeof outcome === 'object' && typeof outcome.message === 'string'
          ? outcome.message
          : ''
      }
    }
    if (landed) {
      this.staged.clear()
      this.saved = true
    }
    this.saving = false
    this.failed = !landed
    this.publish()
  }

  publish() { for (const l of this.listeners) l() }
}

/** 设置卡写结果：ok 表示写入成功；失败时 message 携带服务端拒绝原因（如成对约束）。 */
export interface WriteResult {
  ok: boolean
  message: string
}

// ==== 设置卡数据源：走 DSH 官方客户端 settings API（describe/mutate），替代自有 RPC ====
// 批量 mutate 保留跨字段约束（如 provider/model 成对）的原子性；schemastery rehydrate 求
// schema 默认值并合并 composition base，合成 inherited 供「重置」即时预览（与服务端原
// settingsGet 的 Config({}) + base 语义一致）。
export class ApiSettingsSource {
  store: any
  api: any
  namespace: string

  constructor(api: any, namespace: string) {
    this.api = api
    this.namespace = namespace
    this.store = createSnapshotStore({ status: 'loading', writable: false, value: {}, user: {}, inherited: {}, revision: undefined })
    void this.refresh()
  }

  async refresh() {
    if (this.api === undefined || typeof this.api.describe !== 'function') {
      this.store.set({ status: 'unavailable', writable: false, value: {}, user: {}, inherited: {}, revision: undefined })
      return
    }
    try {
      const response = await this.api.describe({})
      const result = response?.result
      if (result?.ok !== true || !Array.isArray(result.value?.namespaces)) {
        this.store.set({ status: 'unavailable', writable: false, value: {}, user: {}, inherited: {}, revision: undefined })
        return
      }
      const writable = result.value.writable === true
      const view = result.value.namespaces.find((candidate: any) => String(candidate.ns) === this.namespace)
      if (view === undefined) {
        // 该 namespace 未对客户端暴露：标记 unavailable（保留 writable，与官方 settingsScope 一致）。
        this.store.set({ status: 'unavailable', writable, value: {}, user: {}, inherited: {}, revision: undefined })
        return
      }
      this.store.set({
        status: 'ready',
        writable,
        value: view.value ?? {},
        user: view.user ?? {},
        inherited: this.resolveInherited(view),
        revision: view.revision,
      })
    } catch {
      // 拉取失败保持上一份快照
    }
  }

  /** 合成 inherited = schema 默认值 合并 composition base；schema envelope 损坏时降级为 base。 */
  private resolveInherited(view: any): Record<string, unknown> {
    const base = view.base !== null && typeof view.base === 'object' ? view.base as Record<string, unknown> : {}
    try {
      const schema = new Schema(view.schema)
      const parsed = schema({})
      const resolved = typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : {}
      // 补全 schema 声明的所有字段键：无 default 的标量字段（如 z.string()）在 schema 解析时被省略，
      // 但「重置」预览需要它们有键（值为空）以区别于「schema 未声明的字段」——后者才回退当前值。
      // 注：.dict 为 schemastery Object schema 的内部结构（非公开 API），此处依赖其键清单；envelope 异常时由外层 catch 降级为 base。
      const dict = (schema as any).dict as Record<string, unknown> | undefined
      if (dict !== undefined) {
        for (const field of Object.keys(dict)) {
          if (!Object.hasOwn(resolved, field)) resolved[field] = ''
        }
      }
      return { ...resolved, ...base }
    } catch {
      return base
    }
  }

  getSnapshot() { return this.store.getSnapshot() }

  subscribe(listener: () => void) { return this.store.subscribe(listener) }

  async write(set: Record<string, unknown>, unset: string[]): Promise<WriteResult> {
    if (this.api === undefined || typeof this.api.mutate !== 'function') {
      return { ok: false, message: '设置服务不可用' }
    }
    const ops = [
      ...Object.entries(set).map(([field, value]) => ({ op: 'set' as const, path: [field], value })),
      ...unset.map((field) => ({ op: 'unset' as const, path: [field] })),
    ]
    if (ops.length === 0) return { ok: true, message: '' }
    try {
      const revision = this.getSnapshot().revision
      const response = await this.api.mutate({
        ns: this.namespace,
        ops,
        ...(revision === undefined ? {} : { expectedRevision: revision }),
      })
      if (response?.result?.ok === true) {
        await this.refresh()
        return { ok: true, message: '' }
      }
      // 提取服务端拒绝原因（settings-rejected / settings-conflict 的 message 即 validateConfig 的约束文本）。
      const error = (response?.result as any)?.error
      // 写失败（如 revision 冲突）后刷新快照恢复最新 revision，避免本地停留在过期版本导致后续保存持续被拒。
      await this.refresh()
      return { ok: false, message: error?.message ?? '保存被拒绝' }
    } catch {
      return { ok: false, message: '保存失败（网络或服务异常）' }
    }
  }
}

// ==== 审批轨迹：RPC 拉取 + 轮询（受 showTrail 配置控制，关闭时不轮询） ====
export class TrailController {
  store: any
  timer: any
  rpc: any
  settings: ApiSettingsSource
  sessions: any
  records: any[] = []
  enabled = true
  currentSessionId: string | undefined
  /** 是否「查看全部」：临时开关，默认 false（按当前会话隔离），刷新页面后复位。 */
  showAll = false
  private unsubscribeSettings: (() => void) | undefined
  private unsubscribeSessions: (() => void) | undefined

  constructor(rpc: any, settings: ApiSettingsSource, sessions?: any) {
    this.rpc = rpc
    this.settings = settings
    this.sessions = sessions
    this.store = createSnapshotStore({ enabled: true, records: [], showAll: false })
    // 订阅 settings 快照：showTrail 变化时动态启停轮询（设置卡保存后即时生效）。
    this.unsubscribeSettings = settings.subscribe(() => this.sync())
    // 订阅会话列表：当前会话切换时立即按新会话隔离并刷新轨迹。
    if (sessions !== undefined && typeof sessions.list?.subscribe === 'function') {
      this.unsubscribeSessions = sessions.list.subscribe(() => this.sync())
    }
    this.sync()
  }

  /** 读取当前选中会话 id（无会话选中时返回 undefined）。 */
  private resolveSessionId(): string | undefined {
    const list = this.sessions?.list
    if (list === undefined || typeof list.getSnapshot !== 'function') return undefined
    const current = list.getSnapshot().current
    return current === undefined || current === null ? undefined : String(current)
  }

  /** 依据 showTrail 配置启停轮询；当前会话切换时清空旧记录并立即刷新，保证浮窗只显示当前会话的轨迹。 */
  sync() {
    this.enabled = this.settings.getSnapshot().value?.showTrail !== false
    const nextSessionId = this.resolveSessionId()
    const sessionChanged = nextSessionId !== this.currentSessionId
    this.currentSessionId = nextSessionId
    if (this.enabled && this.timer === undefined) {
      this.timer = setInterval(() => { void this.refresh() }, 2000)
      void this.refresh()
    } else if (!this.enabled && this.timer !== undefined) {
      clearInterval(this.timer)
      this.timer = undefined
      this.records = []
    } else if (this.enabled && sessionChanged && !this.showAll) {
      // 会话切换：非「查看全部」时立即清空上一会话的轨迹并重拉，避免短暂串显。
      this.records = []
      void this.refresh()
    }
    this.publish()
  }

  async refresh() {
    // 「查看全部」或未选中会话 → 不传 sessionId（服务端返回全部）；否则按当前会话隔离。
    const payload = this.showAll || this.currentSessionId === undefined ? {} : { sessionId: this.currentSessionId }
    try {
      const result = await this.rpc.call('/autogate', 'trail', payload)
      if (result !== null && typeof result === 'object' && result.ok === true && Array.isArray(result.value)) {
        this.records = result.value
        this.publish()
      }
    } catch {
      // 拉取失败保持上一份快照
    }
  }

  private publish() {
    this.store.set({ enabled: this.enabled, records: this.records, showAll: this.showAll })
  }

  inject() {
    return { hooks: { trail: this.store }, toggleShowAll: this.toggleShowAll, setShowAll: this.setShowAll }
  }

  /** 切换「当前会话 / 查看全部」显示范围（临时状态，刷新页面后回到默认「当前会话」隔离）。 */
  toggleShowAll = () => {
    this.setShowAll(!this.showAll)
  }

  /** 显式设置显示范围；状态未变化时不重复刷新（tab 点击已选中项无副作用）。 */
  setShowAll = (value: boolean) => {
    if (this.showAll === value) return
    this.showAll = value
    this.publish()
    if (this.enabled) void this.refresh()
  }

  dispose = () => {
    if (this.timer !== undefined) clearInterval(this.timer)
    this.unsubscribeSettings?.()
    this.unsubscribeSessions?.()
  }
}

/** 将 epoch 毫秒格式化为本地 HH:MM:SS。 */
export function formatTime(ms: number) {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds())
}

/** 将毫秒格式化为易读耗时：<1s 显示 Xms，≥1s 显示 X.Xs。 */
export function formatDuration(ms: number) {
  if (!Number.isFinite(ms) || ms < 0) return '—'
  if (ms < 1000) return Math.round(ms) + 'ms'
  return (ms / 1000).toFixed(1) + 's'
}

// ==== locale ====
export const zh = {
  title: '自动审批（autogate）',
  description: '确定性规则 + LLM 审查的自动审批策略，保留 workspace-write 沙箱',
  unsaved: '未保存',
  readOnly: '当前配置只读',
  save: '保存',
  saving: '保存中…',
  discard: '放弃',
  saveFailed: '保存失败',
  saved: '已保存',
  dirtyLabel: '未保存的修改',
  overridden: '已覆盖',
  reset: '重置',
  invalid: '无效输入',
  preflight: '沙盒前拦截判断',
  preflightHint: '开启则在做沙盒前执行确定性规则与 LLM 分类；关闭（默认）则完全依赖沙盒策略，硬 deny 与提权审批不受影响',
  showTrail: '审批轨迹浮窗',
  showTrailHint: '右下角悬浮审批轨迹面板（默认显示）；关闭则不显示浮窗且停止轮询轨迹接口',
  presetName: '半自动权限预设键',
  presetNameHint: '半自动模式预设键（默认 auto-ask）：LLM 拒绝后转人工兜底弹窗',
  fullAutoPresetName: '全自动权限预设键',
  fullAutoPresetNameHint: '全自动模式预设键（默认 auto）：LLM 裁决为最终决定，不再人工弹窗兜底',
  classifierProvider: '分类 provider',
  classifierProviderHint: '固定分类 provider，须与分类模型成对配置；重置其中一项会联动清空另一项',
  classifierModel: '分类模型',
  classifierModelHint: '固定分类模型，须与分类 provider 成对配置；重置其中一项会联动清空另一项',
  classifierEndpoint: '分类端点',
  classifierEndpointHint: '独立 OpenAI 兼容分类端点（HTTPS；loopback 可用 http），留空复用会话模型',
  classifierPrompt: '审查提示词',
  classifierPromptHint: 'LLM 审查（分类）系统提示词，留空使用内置默认',
  classifierTimeoutMs: '分类超时（毫秒）',
  classifierTimeoutMsHint: '100–60000，超时 fail-closed',
  classifierMaxOutputTokens: '输出 token 上限',
  classifierMaxOutputTokensHint: '64–4096',
  classifierRetry: '解析失败重试',
  classifierRetryHint: '分类器输出解析失败时静默重试一次（默认开启）',
  proposalContextMaxMessageLen: '指代消息长度阈值',
  proposalContextMaxMessageLenHint: '长度不超过该值（字符）的用户消息才携带 AI 提议上下文用于消解指代；默认 10',
  proposalContextMaxChars: '单条上下文上限',
  proposalContextMaxCharsHint: '单条 AI 提议上下文的最大字符数（64–4000）；默认 400',
  proposalContextMaxTotalChars: '上下文总预算',
  proposalContextMaxTotalCharsHint: '多条消息的 AI 提议上下文合计字符上限（64–8000）；默认 2000',
  // 审批轨迹面板
  trailTitle: '审批轨迹',
  trailCollapse: '收起',
  trailScopeSession: '当前会话',
  trailScopeAll: '查看全部',
  locate: '定位',
  summaryLabel: '操作',
  reasonLabel: '理由',
  timeLabel: '时间',
  durationLabel: '耗时',
  classifierInputLabel: 'LLM 输入',
  tokenUsageLabel: 'Token',
  tokenCachedInput: '缓存输入',
  tokenUncachedInput: '未缓存输入',
  tokenOutput: '输出',
  decisionAllow: '放行',
  decisionDeny: '拒绝',
  decisionAsk: '转人工',
}

export const en = {
  title: 'Auto Approval (autogate)',
  description: 'Deterministic rules + LLM review, keeping the workspace-write sandbox',
  unsaved: 'Unsaved',
  readOnly: 'This configuration is read-only',
  save: 'Save',
  saving: 'Saving…',
  discard: 'Discard',
  saveFailed: 'Save failed',
  saved: 'Saved',
  dirtyLabel: 'Unsaved changes',
  overridden: 'Overridden',
  reset: 'Reset',
  invalid: 'Invalid',
  preflight: 'Pre-sandbox interception',
  preflightHint: 'When enabled, run deterministic rules and LLM classification before the sandbox; disabled (default) relies entirely on the sandbox — hard deny and escalation approval are unaffected',
  showTrail: 'Approval trail overlay',
  showTrailHint: 'Floating approval trail panel in the bottom-right (default on); off hides it and stops polling the trail RPC',
  presetName: 'Semi-auto permission preset',
  presetNameHint: 'Semi-auto preset key (default auto-ask): LLM denials fall back to a human prompt',
  fullAutoPresetName: 'Full-auto permission preset',
  fullAutoPresetNameHint: 'Full-auto preset key (default auto): the LLM decision is final, no human fallback prompt',
  classifierProvider: 'Classifier provider',
  classifierProviderHint: 'Fixed classifier provider; must be paired with the model — resetting either one clears both',
  classifierModel: 'Classifier model',
  classifierModelHint: 'Fixed classifier model; must be paired with the provider — resetting either one clears both',
  classifierEndpoint: 'Classifier endpoint',
  classifierEndpointHint: 'Standalone OpenAI-compatible endpoint (HTTPS; loopback HTTP ok); empty reuses the session model',
  classifierPrompt: 'Review prompt',
  classifierPromptHint: 'LLM review (classification) system prompt; empty uses the built-in default',
  classifierTimeoutMs: 'Classifier timeout (ms)',
  classifierTimeoutMsHint: '100–60000, fail-closed on timeout',
  classifierMaxOutputTokens: 'Max output tokens',
  classifierMaxOutputTokensHint: '64–4096',
  classifierRetry: 'Retry on parse failure',
  classifierRetryHint: 'Retry once when classifier output fails to parse (default on)',
  proposalContextMaxMessageLen: 'Reference message max length',
  proposalContextMaxMessageLenHint: 'Only user messages up to this length (chars) carry the AI proposal context for reference resolution; default 10',
  proposalContextMaxChars: 'Per-context max chars',
  proposalContextMaxCharsHint: 'Max chars for a single AI proposal context (64–4000); default 400',
  proposalContextMaxTotalChars: 'Context total budget',
  proposalContextMaxTotalCharsHint: 'Total chars across all AI proposal contexts (64–8000); default 2000',
  // 审批轨迹面板
  trailTitle: 'Approval trail',
  trailCollapse: 'Collapse',
  trailScopeSession: 'Current session',
  trailScopeAll: 'All sessions',
  locate: 'Locate',
  summaryLabel: 'Action',
  reasonLabel: 'Reason',
  timeLabel: 'Time',
  durationLabel: 'Duration',
  classifierInputLabel: 'LLM input',
  tokenUsageLabel: 'Tokens',
  tokenCachedInput: 'cached input',
  tokenUncachedInput: 'uncached input',
  tokenOutput: 'output',
  decisionAllow: 'Allow',
  decisionDeny: 'Deny',
  decisionAsk: 'Ask',
}
