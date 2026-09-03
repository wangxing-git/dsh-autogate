import { jsx, jsxs } from 'react/jsx-runtime'
import { useEffect, useRef, useState } from 'react'
import { ApiSettingsSource, CardForm, SETTINGS_NS, TrailController, boolField, en, formatDuration, formatTime, modelsFromCatalog, numberField, pairedReset, pairedResetField, selectField, textField, zh } from './client-logic.js'

// ==== 卡片样式（复用 DSH 主题变量，运行时注入） ====
const CSS = `.sa_card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;list-style:none}
.sa_card:hover{border-color:var(--dsw-alias-label-dimmed)}
.sa_header{appearance:none;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px;align-items:center;gap:12px;padding:14px 16px;display:flex}
.sa_headText{flex-direction:column;flex:1;gap:4px;min-width:0;display:flex}
.sa_name{color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600;line-height:1.4}
.sa_desc{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.5}
.sa_pending{white-space:nowrap;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);border-radius:999px;flex:none;padding:1px 8px;font-size:11px;font-weight:500;line-height:17px}
.sa_chevron{color:var(--dsw-alias-label-tertiary);flex:none;transition:transform .16s}
.sa_chevronOpen{transform:rotate(180deg)}
.sa_body{border-top:1px solid var(--dsw-alias-border-l2);margin:0 16px;padding-bottom:8px}
.sa_readOnly{color:var(--dsw-alias-label-tertiary);margin:12px 0 0;font-size:12px;line-height:1.5}
.sa_field{flex-direction:column;gap:6px;padding:12px 0;display:flex}
.sa_field+.sa_field{border-top:1px solid var(--dsw-alias-border-l2)}
.sa_label{min-width:0;color:var(--dsw-alias-label-primary);flex:1;font-size:13px;font-weight:500;line-height:1.5}
.sa_dirtyDot{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-state-warn-primary);margin-right:6px;flex:none}
.sa_head{display:flex;align-items:center;gap:8px}
.sa_badge{white-space:nowrap;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);border-radius:999px;padding:1px 8px;font-size:11px;font-weight:500;line-height:17px}
.sa_reset{font:inherit;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;padding:0;font-size:12px;line-height:1.5}
.sa_input{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);font:inherit;color:var(--dsw-alias-label-primary);border-radius:8px;padding:6px 12px;font-size:13px;line-height:1.5}
.sa_input:focus-visible{border-color:var(--dsw-alias-brand-primary);outline:none}
.sa_textarea{min-height:120px;resize:vertical;font-family:inherit}
.sa_hint{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:1.5}
.sa_bool{width:16px;height:16px;accent-color:var(--dsw-alias-brand-primary);cursor:pointer;margin:0;flex:none}
.sa_invalid{color:var(--dsw-alias-label-error);margin:0;font-size:12px;line-height:1.5}
.sa_footer{border-top:1px solid var(--dsw-alias-border-l2);justify-content:flex-end;align-items:center;gap:8px;padding:12px 0 4px;display:flex}
.sa_failed{min-width:0;color:var(--dsw-alias-label-error);flex:1;margin:0;font-size:12px;line-height:1.5}
.sa_saved{min-width:0;color:var(--dsw-alias-state-success-primary);flex:1;margin:0;font-size:12px;line-height:1.5}
.sa_btn{appearance:none;font:inherit;cursor:pointer;border-radius:8px;padding:5px 14px;font-size:13px;line-height:1.5}
.sa_btnDiscard{border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);background:0 0}
.sa_btnSave{border:1px solid #0000;color:var(--dsw-alias-label-primary-foreground);background:var(--dsw-alias-button-primary-fill)}
.sa_btnSave:hover{background:var(--dsw-alias-button-primary-hover)}
.sa_trail{position:fixed;right:16px;bottom:16px;z-index:1000;display:flex;flex-direction:column;align-items:flex-end;gap:8px;max-width:380px;pointer-events:auto}
.sa_trailToggle{appearance:none;font:inherit;cursor:pointer;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);border-radius:999px;padding:6px 14px;font-size:12px;line-height:1.5;box-shadow:0 2px 8px #0000002e;align-items:center;gap:6px;display:inline-flex}
.sa_trailToggle:hover{border-color:var(--dsw-alias-label-dimmed)}
.sa_trailToggleDot{width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-label-tertiary);flex:none}
.sa_trailToggleDot--allow{background:var(--dsw-alias-state-success-primary)}
.sa_trailToggleDot--deny{background:var(--dsw-alias-state-error-primary)}
.sa_trailToggleDot--ask{background:var(--dsw-alias-state-warn-primary)}
.sa_trailToggleStats{display:inline-flex;align-items:center;gap:6px}
.sa_trailToggleStat{white-space:nowrap;font-size:11px;font-weight:500;line-height:1.5}
.sa_trailToggleStat--allow{color:var(--dsw-alias-state-success-primary)}
.sa_trailToggleStat--deny{color:var(--dsw-alias-state-error-primary)}
.sa_trailToggleStat--ask{color:var(--dsw-alias-state-warn-primary)}
.sa_trailPanel{display:flex;flex-direction:column;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:10px;box-shadow:0 4px 16px #00000026;overflow:hidden}
.sa_trailTabs{display:flex;border-bottom:1px solid var(--dsw-alias-border-l2)}
.sa_trailTab{appearance:none;font:inherit;cursor:pointer;border:0;background:0 0;color:var(--dsw-alias-label-secondary);padding:6px 12px;font-size:12px;line-height:1.5;flex:1;text-align:center}
.sa_trailTab:hover{color:var(--dsw-alias-label-primary)}
.sa_trailTab--active{color:var(--dsw-alias-brand-primary);font-weight:600;box-shadow:inset 0 -2px 0 var(--dsw-alias-brand-primary)}
.sa_trailList{list-style:none;margin:0;padding:8px;display:flex;flex-direction:column;gap:8px;max-height:360px;overflow:auto}
.sa_trailItem{display:flex;flex-direction:column;gap:2px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:10px;padding:8px 10px;font-size:12px;line-height:1.5;transition:background .12s}
.sa_trailItem:hover{background:var(--dsw-alias-interactive-bg-hover)}
.sa_trailItem--deny{border-left:3px solid var(--dsw-alias-state-error-primary)}
.sa_trailItem--allow{border-left:3px solid var(--dsw-alias-state-success-primary)}
.sa_trailItem--ask{border-left:3px solid var(--dsw-alias-state-warn-primary)}
.sa_trailBadge{white-space:nowrap;border-radius:999px;padding:1px 8px;font-size:11px;font-weight:600;line-height:17px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);flex:none}
.sa_trailBadge--allow{color:var(--dsw-alias-state-success-primary);background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 14%,transparent)}
.sa_trailBadge--deny{color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 14%,transparent)}
.sa_trailBadge--ask{color:var(--dsw-alias-state-warn-primary);background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 14%,transparent)}
.sa_trailLayer{white-space:nowrap;border-radius:999px;padding:1px 6px;font-size:10px;font-weight:600;line-height:15px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-tertiary);flex:none}
.sa_trailTool{color:var(--dsw-alias-label-primary);font-family:var(--ds-font-family-code,ui-monospace,SF Mono,Menlo,Consolas,monospace);font-size:12px;line-height:1.5;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sa_trailTime{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:1.5;flex:none;white-space:nowrap}
.sa_trailPreview{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.5;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.sa_trailItemHead{display:flex;align-items:center;gap:6px}
.sa_trailItemToggle{appearance:none;font:inherit;cursor:pointer;background:0 0;border:0;padding:0;flex:1;min-width:0;display:flex;align-items:center;gap:6px;color:inherit;text-align:left}
.sa_trailChevron{color:var(--dsw-alias-label-tertiary);flex:none;transition:transform .16s}
.sa_trailChevronOpen{transform:rotate(180deg)}
.sa_trailLocate{appearance:none;font:inherit;cursor:pointer;border:1px solid var(--dsw-alias-border-l2);background:0 0;color:var(--dsw-alias-label-secondary);border-radius:6px;padding:1px 8px;font-size:11px;line-height:1.5;flex:none}
.sa_trailLocate:hover{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}
.sa_trailItemBody{display:flex;flex-direction:column;gap:4px;margin-top:4px;padding-top:4px;border-top:1px dashed var(--dsw-alias-border-l2);animation:sa-fade-in .16s ease}
.sa_trailRow{display:flex;gap:8px;min-width:0}
.sa_trailRowLabel{color:var(--dsw-alias-label-tertiary);flex:none;font-size:11px;line-height:1.5}
.sa_trailSummary{color:var(--dsw-alias-label-primary);word-break:break-all;font-size:12px;line-height:1.5}
.sa_trailReason{color:var(--dsw-alias-label-secondary);word-break:break-all;font-size:12px;line-height:1.5}
.sa_trailDetail{color:var(--dsw-alias-label-secondary);word-break:break-all;font-size:12px;line-height:1.5}
.sa_trailCallId{font-family:var(--ds-font-family-code,ui-monospace,SF Mono,Menlo,Consolas,monospace)}
.sa_trailLlmInput{font-family:var(--ds-font-family-code,ui-monospace,SF Mono,Menlo,Consolas,monospace);font-size:11px;line-height:1.5;white-space:pre-wrap;word-break:break-all;max-height:240px;overflow:auto;color:var(--dsw-alias-label-secondary)}
@keyframes sa-fade-in{from{opacity:0;transform:translateY(-2px)}to{opacity:1;transform:none}}
@media(prefers-reduced-motion:reduce){.sa_trailItemBody{animation:none}}
.sa_combo{position:relative;min-width:0}
.sa_comboInput{width:100%;box-sizing:border-box;padding-right:26px}
.sa_comboCaret{position:absolute;right:10px;top:50%;transform:translateY(-50%);pointer-events:none;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:1}
.sa_comboList{position:absolute;z-index:40;top:calc(100% + 4px);left:0;right:0;margin:0;padding:4px;list-style:none;max-height:240px;overflow:auto;background:var(--dsw-alias-bg-layer-3);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;box-shadow:0 8px 24px #00000026}
.sa_comboItem button{display:block;width:100%;padding:6px 10px;border:0;background:0 0;text-align:left;font:inherit;font-size:13px;line-height:1.5;color:var(--dsw-alias-label-primary);border-radius:6px;cursor:pointer}
.sa_comboItem button:hover{background:var(--dsw-alias-bg-module-platform)}`

function injectCss() {
  const tagId = 'dsh-autogate/client.css'
  if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css="' + tagId + '"]') === null) {
    const tag = document.createElement('style')
    tag.dataset.plugin = 'dsh-autogate'
    tag.dataset.pluginCss = tagId
    tag.textContent = CSS
    document.head.appendChild(tag)
  }
}

// ==== SafeAutoCardController ====
class SafeAutoCardController {
  form: CardForm
  store: any
  llmApi: any
  sessionApi: any
  /** 可配置 provider → settingsNs 映射（discoverModels 降级路径的第一参数；随 fetchModelCatalog 刷新）。 */
  discoveryNamespaces = new Map<string, string>()
  /** 最近一次经 session/modelCatalog 拉取的全局模型目录（与对话框模型选择器同源；随 fetchModelCatalog 刷新）。 */
  modelCatalog: any = null

  constructor(settingsSource: ApiSettingsSource, llmApi: any, sessionApi: any) {
    this.llmApi = llmApi
    this.sessionApi = sessionApi
    this.form = new CardForm(settingsSource, [
      textField('presetName'),
      textField('fullAutoPresetName'),
      selectField('classifierProvider'),
      selectField('classifierModel'),
      textField('classifierEndpoint'),
      textField('classifierPrompt', true),
      numberField('classifierTimeoutMs'),
      numberField('classifierMaxOutputTokens'),
      boolField('classifierRetry'),
      boolField('classifierHttpDisableReasoning'),
      numberField('proposalContextMaxMessageLen'),
      numberField('proposalContextMaxChars'),
      numberField('proposalContextMaxTotalChars'),
      boolField('preflight'),
      boolField('showTrail'),
    ])
    this.store = this.form.bind(() => this.projection())
  }

  projection() {
    return {
      ...this.form.shell(),
      presetName: this.form.field('presetName'),
      fullAutoPresetName: this.form.field('fullAutoPresetName'),
      classifierProvider: this.form.field('classifierProvider'),
      classifierModel: this.form.field('classifierModel'),
      classifierEndpoint: this.form.field('classifierEndpoint'),
      classifierPrompt: this.form.field('classifierPrompt'),
      classifierTimeoutMs: this.form.field('classifierTimeoutMs'),
      classifierMaxOutputTokens: this.form.field('classifierMaxOutputTokens'),
      classifierRetry: this.form.field('classifierRetry'),
      classifierHttpDisableReasoning: this.form.field('classifierHttpDisableReasoning'),
      proposalContextMaxMessageLen: this.form.field('proposalContextMaxMessageLen'),
      proposalContextMaxChars: this.form.field('proposalContextMaxChars'),
      proposalContextMaxTotalChars: this.form.field('proposalContextMaxTotalChars'),
      preflight: this.form.field('preflight'),
      showTrail: this.form.field('showTrail'),
    }
  }

  inject() {
    const actions = this.form.actions()
    return {
      hooks: { safeAutoCard: this.store },
      ...actions,
      // 成对字段联动重置：classifierProvider/classifierModel 须成对配置，重置其一须同步重置另一，
      // 否则保存时服务端 validateConfig 的成对约束拒绝（fail-closed）。
      resetField: (field: string) => pairedReset(actions, field),
      setOptions: (field: string, options: readonly string[]) => this.form.setOptions(field, options),
      fetchModelCatalog: () => this.fetchModelCatalog(),
      fetchModels: (provider: string) => this.fetchModels(provider),
    }
  }

  /**
   * 拉取 provider 路由候选（llm.listProviders）并同步刷新全局模型目录（session/modelCatalog，
   * 与对话框模型选择器同源）。alpha.5 起旧 llm.models 端点移除，模型候选的权威来源是
   * session/modelCatalog——llm.discoverModels 只为「询问新增端点」设计，且仅注册了发现服务的
   * adapter（如 pi-ai）会应答，deepseek 官方与用户自定义路由一律 NO_DISCOVERY，不能作为候选
   * 主来源；它保留为目录端点不可用时的降级路径。
   */
  async fetchModelCatalog(): Promise<{ providers: string[] }> {
    if (this.llmApi === undefined || typeof this.llmApi.listProviders !== 'function') return { providers: [] }
    try {
      const [response, namespaces, catalog] = await Promise.all([
        this.llmApi.listProviders(),
        this.fetchDiscoveryNamespaces(),
        this.fetchModelCatalogGroups(),
      ])
      if (catalog !== null) this.modelCatalog = catalog
      if (response?.ok !== true || !Array.isArray(response.value)) return { providers: [] }
      this.discoveryNamespaces = namespaces
      return {
        providers: response.value
          .map((entry: any) => String(entry.id))
          .filter((id: string) => id !== ''),
      }
    } catch {
      return { providers: [] }
    }
  }

  /** 经 session/modelCatalog 拉取全局模型目录；端点不可用或失败时返回 null（保持上一次目录，下次展开重试）。 */
  private async fetchModelCatalogGroups(): Promise<any | null> {
    if (typeof this.sessionApi?.modelCatalog !== 'function') return null
    try {
      const response = await this.sessionApi.modelCatalog()
      return response?.ok === true && response.value !== null && typeof response.value === 'object'
        ? response.value
        : null
    } catch {
      return null
    }
  }

  /** 从可配置 provider 目录构建 provider → settingsNs 映射（discoverModels 降级路径的第一参数）；目录不可用时返回空映射。 */
  private async fetchDiscoveryNamespaces(): Promise<Map<string, string>> {
    const namespaces = new Map<string, string>()
    if (typeof this.llmApi?.listConfigurableProviders !== 'function') return namespaces
    try {
      const response = await this.llmApi.listConfigurableProviders()
      if (response?.ok !== true || !Array.isArray(response.value)) return namespaces
      for (const entry of response.value) {
        const provider = entry?.provider
        const ns = entry?.settingsNs
        if (typeof provider === 'string' && provider !== '' && typeof ns === 'string' && ns !== '') {
          namespaces.set(provider, ns)
        }
      }
    } catch {
      // 目录拉取失败 → 空映射：模型候选留空，仍可自由输入
    }
    return namespaces
  }

  /**
   * 按 provider 返回模型候选：主路径从全局模型目录（session/modelCatalog）同步派生，覆盖所有
   * 已注册路由（含 deepseek 官方与用户自定义 provider）；目录不可用（旧版宿主无该端点）时
   * 降级 llm.discoverModels 询问端点。候选仅供快速选择，仍可自由输入。
   */
  fetchModels(provider: string): Promise<string[]> {
    const id = String(provider)
    if (id === '') return Promise.resolve([])
    if (this.modelCatalog !== null) return Promise.resolve(modelsFromCatalog(this.modelCatalog, id))
    return this.fetchModelsByDiscovery(id)
  }

  /** 降级路径：经 llm.discoverModels 询问端点（依赖 settingsNs 映射与 adapter 注册的发现服务）。 */
  private async fetchModelsByDiscovery(provider: string): Promise<string[]> {
    if (typeof this.llmApi?.discoverModels !== 'function') return []
    const ns = this.discoveryNamespaces.get(provider)
    if (ns === undefined) return []
    try {
      const response = await this.llmApi.discoverModels(ns, { provider })
      if (response?.ok !== true || !Array.isArray(response.value)) return []
      return response.value
        .map((entry: any) => String(entry.id))
        .filter((modelId: string) => modelId !== '')
    } catch {
      return []
    }
  }
}

// ==== UI 组件 ====
function ValueField(props: any) {
  const control = props.bool
    ? jsx('input', {
        id: props.id,
        className: 'sa_bool',
        type: 'checkbox',
        checked: props.text === 'true',
        disabled: props.disabled,
        onChange: (event: any) => props.onEdit(event.target.checked ? 'true' : 'false'),
      })
    : props.multiline
      ? jsx('textarea', {
          id: props.id,
          className: 'sa_input sa_textarea',
          value: props.text,
          placeholder: props.placeholder ?? '',
          disabled: props.disabled,
          onChange: (event: any) => props.onEdit(event.target.value),
        })
      : props.combo
        ? jsx(ComboInput, {
            id: props.id,
            text: props.text,
            options: props.options,
            placeholder: props.placeholder ?? '',
            disabled: props.disabled,
            onEdit: props.onEdit,
          })
        : jsx('input', {
            id: props.id,
            className: 'sa_input',
            type: 'text',
            value: props.text,
            placeholder: props.placeholder ?? '',
            disabled: props.disabled,
            onChange: (event: any) => props.onEdit(event.target.value),
          })
  return jsxs('div', {
    className: 'sa_field',
    children: [
      jsxs('div', {
        className: 'sa_head',
        children: [
          jsxs('label', { className: 'sa_label', htmlFor: props.id, children: [
            props.dirty ? jsx('span', { className: 'sa_dirtyDot', title: props.dirtyLabel, 'aria-label': props.dirtyLabel }) : null,
            props.label,
          ] }),
          props.overridden
            ? jsxs('span', {
                children: [
                  jsx('span', { className: 'sa_badge', children: props.overriddenLabel }),
                  jsx('button', { type: 'button', className: 'sa_reset', disabled: props.disabled, onClick: props.onReset, children: props.resetLabel }),
                ],
              })
            : null,
        ],
      }),
      control,
      jsx('p', { className: props.invalid ? 'sa_invalid' : 'sa_hint', children: props.invalid ? props.invalidLabel : props.hint }),
    ],
  })
}

/** 可编辑下拉（combobox）：输入框自由输入 + 自定义候选面板（点击选择、点击外部关闭）。 */
function ComboInput(props: any) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const options = Array.isArray(props.options) ? props.options : []
  const text = props.text ?? ''
  const candidates = options.filter((option: string) => option !== text && (text === '' || option.includes(text)))
  useEffect(() => {
    if (!open) return
    const onDown = (event: any) => {
      const root = rootRef.current
      const target = event.target
      if (root !== null && target instanceof Node && !root.contains(target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])
  // 焦点移出整个 combobox（输入框 + 下拉列表）时收起：点击其他可聚焦元素 relatedTarget 在外部、
  // 点击空白/文本 relatedTarget 为 null，均关闭；点击候选按钮时 relatedTarget 仍在内部，交给按钮 onClick。
  const onBlur = (event: any) => {
    const root = rootRef.current
    if (root === null) return
    const next = event.relatedTarget
    if (!(next instanceof Node) || !root.contains(next)) setOpen(false)
  }
  return jsxs('div', {
    ref: rootRef,
    className: 'sa_combo',
    onBlur,
    children: [
      jsx('input', {
        id: props.id,
        className: 'sa_input sa_comboInput',
        type: 'text',
        value: text,
        placeholder: props.placeholder ?? '',
        disabled: props.disabled,
        autoComplete: 'off',
        onChange: (event: any) => { props.onEdit(event.target.value); setOpen(true) },
        onFocus: () => setOpen(true),
      }),
      jsx('span', { className: 'sa_comboCaret', children: '▾' }),
      open && candidates.length > 0
        ? jsxs('ul', {
            className: 'sa_comboList',
            role: 'listbox',
            children: candidates.map((option: string) => jsx('li', {
              key: option,
              className: 'sa_comboItem',
              children: jsx('button', {
                type: 'button',
                onClick: () => { props.onEdit(option); setOpen(false) },
                children: option,
              }),
            })),
          })
        : null,
    ],
  })
}

function SafeAutoCard(props: any) {
  const { t } = props
  const state = props.useSafeAutoCard((snapshot: any) => snapshot)
  const [open, setOpen] = useState(false)
  // 目录就绪版本号：fetchModelCatalog 每次完成后自增，驱动模型候选 effect 重跑。
  // 否则展开卡片时首个 effect 尚未就绪（模型目录/映射为空），模型候选被清空后不再刷新。
  const [catalogTick, setCatalogTick] = useState(0)
  const currentProvider = state.classifierProvider?.text ?? ''
  injectCss()
  // 展开设置卡时经 DSH 宿主目录端点拉取 provider 路由候选与全局模型目录（session/modelCatalog），
  // 候选仅用于快速选择，仍可自定义输入。
  useEffect(() => {
    if (!open) return
    void props.fetchModelCatalog().then((catalog: { providers: string[] }) => {
      props.setOptions('classifierProvider', catalog.providers)
      setCatalogTick((tick) => tick + 1)
    })
  }, [open])
  // provider 变化或目录刷新时按需更新模型候选（带竞态防护：仅应用最后一次结果）；空/未知则清空候选。
  useEffect(() => {
    if (!open) return
    let stale = false
    if (currentProvider === '') {
      props.setOptions('classifierModel', [])
      return
    }
    void props.fetchModels(currentProvider).then((models: string[]) => {
      if (!stale) props.setOptions('classifierModel', models)
    })
    return () => { stale = true }
  }, [open, currentProvider, catalogTick])
  if (!state.available) return null
  const disabled = !state.writable
  const blocked = !state.dirty || state.invalid || state.saving
  const fields = [
    { key: 'preflight', label: t('preflight'), hint: t('preflightHint'), bool: true },
    { key: 'presetName', label: t('presetName'), hint: t('presetNameHint') },
    { key: 'fullAutoPresetName', label: t('fullAutoPresetName'), hint: t('fullAutoPresetNameHint') },
    { key: 'classifierProvider', label: t('classifierProvider'), hint: t('classifierProviderHint'), combo: true },
    { key: 'classifierModel', label: t('classifierModel'), hint: t('classifierModelHint'), combo: true },
    { key: 'classifierEndpoint', label: t('classifierEndpoint'), hint: t('classifierEndpointHint') },
    { key: 'classifierPrompt', label: t('classifierPrompt'), hint: t('classifierPromptHint'), multiline: true },
    { key: 'classifierTimeoutMs', label: t('classifierTimeoutMs'), hint: t('classifierTimeoutMsHint') },
    { key: 'classifierMaxOutputTokens', label: t('classifierMaxOutputTokens'), hint: t('classifierMaxOutputTokensHint') },
    { key: 'classifierRetry', label: t('classifierRetry'), hint: t('classifierRetryHint'), bool: true },
    { key: 'classifierHttpDisableReasoning', label: t('classifierHttpDisableReasoning'), hint: t('classifierHttpDisableReasoningHint'), bool: true },
    { key: 'proposalContextMaxMessageLen', label: t('proposalContextMaxMessageLen'), hint: t('proposalContextMaxMessageLenHint') },
    { key: 'proposalContextMaxChars', label: t('proposalContextMaxChars'), hint: t('proposalContextMaxCharsHint') },
    { key: 'proposalContextMaxTotalChars', label: t('proposalContextMaxTotalChars'), hint: t('proposalContextMaxTotalCharsHint') },
    { key: 'showTrail', label: t('showTrail'), hint: t('showTrailHint'), bool: true },
  ]
  return jsxs('li', {
    className: 'sa_card',
    children: [
      jsxs('button', {
        type: 'button',
        className: 'sa_header',
        'aria-expanded': open,
        onClick: () => setOpen(!open),
        children: [
          jsxs('span', {
            className: 'sa_headText',
            children: [
              jsx('span', { className: 'sa_name', children: t('title') }),
              jsx('span', { className: 'sa_desc', children: t('description') }),
            ],
          }),
          state.dirty ? jsx('span', { className: 'sa_pending', children: t('unsaved') }) : null,
          jsx('span', { className: open ? 'sa_chevron sa_chevronOpen' : 'sa_chevron', children: '▾' }),
        ],
      }),
      open
        ? jsxs('div', {
            className: 'sa_body',
            children: [
              !state.writable ? jsx('p', { className: 'sa_readOnly', children: t('readOnly') }) : null,
              fields.map((f) => jsx(ValueField, {
                key: f.key,
                id: 'autogate-' + f.key,
                label: f.label,
                hint: f.hint,
                multiline: f.multiline === true,
                bool: f.bool === true,
                combo: f.combo === true,
                overriddenLabel: t('overridden'),
                resetLabel: t('reset'),
                invalidLabel: t('invalid'),
                dirtyLabel: t('dirtyLabel'),
                disabled,
                ...state[f.key],
                onEdit: (text: string) => props.edit(f.key, text),
                onReset: () => props.resetField(f.key),
              })),
              jsxs('div', {
                className: 'sa_footer',
                children: [
                  state.failed ? jsx('p', { className: 'sa_failed', children: state.failedMessage || t('saveFailed') }) : null,
                  state.saved ? jsx('p', { className: 'sa_saved', children: t('saved') }) : null,
                  jsx('button', { type: 'button', className: 'sa_btn sa_btnDiscard', disabled: !state.dirty || state.saving, onClick: props.discard, children: t('discard') }),
                  jsx('button', { type: 'button', className: 'sa_btn sa_btnSave', disabled: blocked, onClick: props.save, children: t(state.saving ? 'saving' : 'save') }),
                ],
              }),
            ],
          })
        : null,
    ],
  })
}

/** 单条审批记录：头部用决策/层级徽章 + 工具名 + 时间分层展示，折叠态显示操作摘要预览，展开后显示完整详情并支持定位到会话中的操作。 */
function TrailItem(props: any) {
  const [open, setOpen] = useState(false)
  const { record, onLocate, t } = props
  const decisionText = ({ allow: t('decisionAllow'), deny: t('decisionDeny'), ask: t('decisionAsk') } as Record<string, string>)[record.decision] ?? record.decision
  return jsxs('li', {
    className: 'sa_trailItem sa_trailItem--' + record.decision,
    children: [
      jsxs('div', {
        className: 'sa_trailItemHead',
        children: [
          jsxs('button', {
            type: 'button',
            className: 'sa_trailItemToggle',
            'aria-expanded': open,
            onClick: () => setOpen(!open),
            children: [
              jsx('span', { className: 'sa_trailBadge sa_trailBadge--' + record.decision, children: decisionText }),
              jsx('span', { className: 'sa_trailLayer', children: record.layer }),
              jsx('span', { className: 'sa_trailTool', title: record.toolName, children: record.toolName }),
              jsx('span', { className: 'sa_trailTime', children: formatTime(record.time) }),
              jsx('span', { className: open ? 'sa_trailChevron sa_trailChevronOpen' : 'sa_trailChevron', children: '▾' }),
            ],
          }),
          jsx('button', {
            type: 'button',
            className: 'sa_trailLocate',
            onClick: () => onLocate(record.callId),
            children: t('locate'),
          }),
        ],
      }),
      open ? jsxs('div', {
        className: 'sa_trailItemBody',
        children: [
          record.summary ? jsxs('div', { className: 'sa_trailRow', children: [jsx('span', { className: 'sa_trailRowLabel', children: t('summaryLabel') }), jsx('span', { className: 'sa_trailSummary', children: record.summary })] }) : null,
          record.reason ? jsxs('div', { className: 'sa_trailRow', children: [jsx('span', { className: 'sa_trailRowLabel', children: t('reasonLabel') }), jsx('span', { className: 'sa_trailReason', children: record.reason })] }) : null,
          jsxs('div', { className: 'sa_trailRow', children: [jsx('span', { className: 'sa_trailRowLabel', children: 'callId' }), jsx('span', { className: 'sa_trailDetail sa_trailCallId', children: record.callId })] }),
          jsxs('div', { className: 'sa_trailRow', children: [jsx('span', { className: 'sa_trailRowLabel', children: t('timeLabel') }), jsx('span', { className: 'sa_trailDetail', children: formatTime(record.time) })] }),
          jsxs('div', { className: 'sa_trailRow', children: [jsx('span', { className: 'sa_trailRowLabel', children: t('durationLabel') }), jsx('span', { className: 'sa_trailDetail', children: formatDuration(record.durationMs) })] }),
          record.tokenUsage ? jsxs('div', { className: 'sa_trailRow', children: [jsx('span', { className: 'sa_trailRowLabel', children: t('tokenUsageLabel') }), jsx('span', { className: 'sa_trailDetail', children: `${t('tokenCachedInput')} ${record.tokenUsage.cachedInputTokens} · ${t('tokenUncachedInput')} ${record.tokenUsage.uncachedInputTokens} · ${t('tokenOutput')} ${record.tokenUsage.outputTokens}` })] }) : null,
          record.classifierInput ? jsxs('div', { className: 'sa_trailRow', children: [jsx('span', { className: 'sa_trailRowLabel', children: t('classifierInputLabel') }), jsx('pre', { className: 'sa_trailDetail sa_trailLlmInput', children: JSON.stringify(record.classifierInput, null, 2) })] }) : null,
        ],
      }) : record.summary ? jsx('div', { className: 'sa_trailPreview', title: record.summary, children: record.summary }) : null,
    ],
  })
}

function TrailPanel(props: any) {
  const [open, setOpen] = useState(false)
  const { t, useTrail, setShowAll } = props
  const snapshot = useTrail((s: any) => s) ?? {}
  // showTrail 关闭时不再渲染浮窗（TrailController 亦已停止轮询）。
  if (snapshot.enabled === false) return null
  const records = Array.isArray(snapshot.records) ? snapshot.records : []
  if (records.length === 0) return null
  // 面板统一基于「最近 50 条」窗口（轨迹环形缓冲上限 200，面板只展示最新一段）：计数、统计与列表口径一致。
  const window = records.slice(-50)
  const stats = window.reduce((acc: Record<string, number>, r: any) => { acc[r.decision] = (acc[r.decision] ?? 0) + 1; return acc }, { allow: 0, deny: 0, ask: 0 })
  const lastDecision = window[window.length - 1]?.decision
  const locate = (callId: string) => {
    const el = Array.from(document.querySelectorAll('[data-chat-call-id]')).find((node) => node.getAttribute('data-chat-call-id') === callId)
    if (el !== undefined) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }
  return jsxs('div', {
    className: 'sa_trail',
    children: [
      jsxs('button', {
        type: 'button',
        className: 'sa_trailToggle',
        onClick: () => setOpen(!open),
        children: [
          jsx('span', { className: 'sa_trailToggleDot sa_trailToggleDot--' + lastDecision, 'aria-hidden': true }),
          (open ? t('trailCollapse') : t('trailTitle')) + ' · ' + window.length,
          jsxs('span', {
            className: 'sa_trailToggleStats',
            children: [
              jsx('span', { className: 'sa_trailToggleStat sa_trailToggleStat--allow', title: t('decisionAllow'), children: '✓' + stats.allow }),
              jsx('span', { className: 'sa_trailToggleStat sa_trailToggleStat--deny', title: t('decisionDeny'), children: '✗' + stats.deny }),
              jsx('span', { className: 'sa_trailToggleStat sa_trailToggleStat--ask', title: t('decisionAsk'), children: '?' + stats.ask }),
            ],
          }),
        ],
      }),
      open ? jsxs('div', {
        className: 'sa_trailPanel',
        children: [
          jsxs('div', {
            className: 'sa_trailTabs',
            children: [
              jsx('button', {
                type: 'button',
                className: 'sa_trailTab' + (snapshot.showAll ? '' : ' sa_trailTab--active'),
                onClick: () => setShowAll(false),
                children: t('trailScopeSession'),
              }),
              jsx('button', {
                type: 'button',
                className: 'sa_trailTab' + (snapshot.showAll ? ' sa_trailTab--active' : ''),
                onClick: () => setShowAll(true),
                children: t('trailScopeAll'),
              }),
            ],
          }),
          jsx('ul', {
            className: 'sa_trailList',
            children: window.slice().reverse().map((record: any) => jsx(TrailItem, {
              key: String(record.seq),
              record,
              onLocate: locate,
              t,
            })),
          }),
        ],
      }) : null,
    ],
  })
}

// ==== apply ====
const inject = ['slots', 'locale', 'connection', 'sessions', 'remote', 'remote.session', 'remote.settings', 'remote.llm']

function apply(ctx: any) {
  injectCss()
  ctx.effect(() => ctx.locale.register(SETTINGS_NS, { zh, en }), 'autogate: card dictionaries')
  const t = ctx.locale.bind(SETTINGS_NS)
  // rpc 仅剩审批轨迹面板使用（/autogate trail 端点）；设置卡读写改走官方 settings API。
  const rpc = ctx.connection?.rpc
  // 复用 DSH 宿主现成的模型目录 API（remote.session.modelCatalog 为候选主来源，与对话框模型选择器
  // 同源；remote.llm：listProviders / discoverModels 提供 provider 路由与降级询问）。
  const llmApi = ctx.remote.llm
  const sessionApi = ctx.remote.session
  // 设置卡与轨迹浮窗共享同一个 settings 数据源：设置卡保存 showTrail 后，
  // TrailController 经订阅即时启停轮询，无需重新拉取。
  const settingsSource = new ApiSettingsSource(ctx.remote.settings, SETTINGS_NS)
  const controller = new SafeAutoCardController(settingsSource, llmApi, sessionApi)
  // 新版 DSH 中 settings.plugin.item 是 keyed slot：key 即卡片所编辑的 settings
  // namespace（autogate），设置页按 namespace 分发渲染；keyed slot 不再接受 id/order。
  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item',
    key: SETTINGS_NS,
    locale: SETTINGS_NS,
    inject: () => controller.inject(),
  }, SafeAutoCard))

  const trailController = new TrailController(rpc, settingsSource, ctx.sessions)
  ctx.effect(() => trailController.dispose, 'autogate: trail polling')
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'autogate-trail',
    order: 100,
    locale: SETTINGS_NS,
    inject: () => trailController.inject(),
  }, TrailPanel))
}

export { apply, inject }
