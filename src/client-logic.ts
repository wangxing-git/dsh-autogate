import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'

/** autogate 的 settings 命名空间（与服务端 settingsNamespace('autogate') 一致）。 */
export const SETTINGS_NS = 'autogate'

// ==== 字段转换 spec ====

export function textField(field: string, multiline = false) {
  return {
    field,
    multiline,
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
  saving = false
  failed = false

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
      dirty: this.staged.size > 0,
      invalid: false,
      saving: this.saving,
      failed: this.failed,
    }
  }

  field(field: string) {
    const spec = this.specs.get(field)
    const staged = this.staged.get(field)
    const snapshot = this.scope.getSnapshot()
    const value = snapshot.value?.[field]
    const user = snapshot.user
    const stored = user !== undefined && Object.hasOwn(user, field)
    if (staged === undefined) {
      return { text: spec.format(value), overridden: stored, invalid: false }
    }
    if (staged.clear) return { text: staged.text, overridden: false, invalid: false }
    const parsed = spec.parse(staged.text)
    return { text: staged.text, overridden: true, invalid: parsed === undefined }
  }

  actions() {
    return {
      edit: (field: string, text: string) => { this.staged.set(field, { text, clear: false }); this.publish() },
      resetField: (field: string) => { this.staged.set(field, { text: '', clear: true }); this.publish() },
      save: () => this.save(),
      discard: () => { this.staged.clear(); this.failed = false; this.publish() },
    }
  }

  async save() {
    if (this.staged.size === 0 || this.saving) return
    this.saving = true
    this.failed = false
    this.publish()
    let landed = true
    for (const [field, staged] of this.staged) {
      const spec = this.specs.get(field)
      if (staged.clear) {
        await this.scope.unset(field)
        continue
      }
      const parsed = spec.parse(staged.text)
      if (parsed === undefined || parsed.kind !== 'set') { landed = false; continue }
      await this.scope.set(field, parsed.value)
    }
    if (landed) this.staged.clear()
    this.saving = false
    this.failed = !landed
    this.publish()
  }

  publish() { for (const l of this.listeners) l() }
}

// ==== 审批轨迹：RPC 拉取 + 轮询 ====
export class TrailController {
  store: any
  timer: any
  rpc: any

  constructor(rpc: any) {
    this.rpc = rpc
    this.store = createSnapshotStore([])
    this.timer = setInterval(() => { void this.refresh() }, 2000)
    void this.refresh()
  }

  async refresh() {
    try {
      const result = await this.rpc.call('/autogate', 'trail', {})
      if (result !== null && typeof result === 'object' && result.ok === true && Array.isArray(result.value)) {
        this.store.set(result.value)
      }
    } catch {
      // 拉取失败保持上一份快照
    }
  }

  inject() {
    return { hooks: { trail: this.store } }
  }

  dispose = () => {
    clearInterval(this.timer)
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
  overridden: '已覆盖',
  reset: '重置',
  invalid: '无效输入',
  preflight: '沙盒前拦截判断',
  preflightHint: '开启则在做沙盒前执行确定性规则与 LLM 分类；关闭（默认）则完全依赖沙盒策略，硬 deny 与提权审批不受影响',
  presetName: '半自动权限预设键',
  presetNameHint: '半自动模式预设键（默认 auto-ask）：LLM 拒绝后转人工兜底弹窗',
  fullAutoPresetName: '全自动权限预设键',
  fullAutoPresetNameHint: '全自动模式预设键（默认 auto）：LLM 裁决为最终决定，不再人工弹窗兜底',
  classifierProvider: '分类 provider',
  classifierProviderHint: '固定分类 provider，须与分类模型成对配置',
  classifierModel: '分类模型',
  classifierModelHint: '固定分类模型，须与分类 provider 成对配置',
  classifierEndpoint: '分类端点',
  classifierEndpointHint: '独立 OpenAI 兼容分类端点（HTTPS；loopback 可用 http），留空复用会话模型',
  classifierPrompt: '审查提示词',
  classifierPromptHint: 'LLM 审查（分类）系统提示词，留空使用内置默认',
  classifierTimeoutMs: '分类超时（毫秒）',
  classifierTimeoutMsHint: '100–60000，超时 fail-closed',
  classifierMaxOutputTokens: '输出 token 上限',
  classifierMaxOutputTokensHint: '64–4096',
  classifierRetry: '解析失败重试',
  classifierRetryHint: '分类器输出解析失败时静默重试一次（默认关闭）',
  // 审批轨迹面板
  trailTitle: '审批轨迹',
  trailCollapse: '收起',
  locate: '定位',
  summaryLabel: '操作',
  reasonLabel: '理由',
  timeLabel: '时间',
  durationLabel: '耗时',
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
  overridden: 'Overridden',
  reset: 'Reset',
  invalid: 'Invalid',
  preflight: 'Pre-sandbox interception',
  preflightHint: 'When enabled, run deterministic rules and LLM classification before the sandbox; disabled (default) relies entirely on the sandbox — hard deny and escalation approval are unaffected',
  presetName: 'Semi-auto permission preset',
  presetNameHint: 'Semi-auto preset key (default auto-ask): LLM denials fall back to a human prompt',
  fullAutoPresetName: 'Full-auto permission preset',
  fullAutoPresetNameHint: 'Full-auto preset key (default auto): the LLM decision is final, no human fallback prompt',
  classifierProvider: 'Classifier provider',
  classifierProviderHint: 'Fixed classifier provider; must be paired with the model',
  classifierModel: 'Classifier model',
  classifierModelHint: 'Fixed classifier model; must be paired with the provider',
  classifierEndpoint: 'Classifier endpoint',
  classifierEndpointHint: 'Standalone OpenAI-compatible endpoint (HTTPS; loopback HTTP ok); empty reuses the session model',
  classifierPrompt: 'Review prompt',
  classifierPromptHint: 'LLM review (classification) system prompt; empty uses the built-in default',
  classifierTimeoutMs: 'Classifier timeout (ms)',
  classifierTimeoutMsHint: '100–60000, fail-closed on timeout',
  classifierMaxOutputTokens: 'Max output tokens',
  classifierMaxOutputTokensHint: '64–4096',
  classifierRetry: 'Retry on parse failure',
  classifierRetryHint: 'Retry once when classifier output fails to parse (default off)',
  // 审批轨迹面板
  trailTitle: 'Approval trail',
  trailCollapse: 'Collapse',
  locate: 'Locate',
  summaryLabel: 'Action',
  reasonLabel: 'Reason',
  timeLabel: 'Time',
  durationLabel: 'Duration',
  decisionAllow: 'Allow',
  decisionDeny: 'Deny',
  decisionAsk: 'Ask',
}
