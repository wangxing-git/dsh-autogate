import { jsx, jsxs } from 'react/jsx-runtime'
import { useEffect, useRef, useState } from 'react'
import { CardForm, RpcSettingsSource, SETTINGS_NS, TrailController, boolField, en, formatDuration, formatTime, numberField, selectField, textField, zh } from './client-logic.js'

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
.sa_trailToggle{appearance:none;font:inherit;cursor:pointer;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);border-radius:999px;padding:6px 14px;font-size:12px;line-height:1.5;box-shadow:0 2px 8px #0000002e}
.sa_trailList{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px;max-height:360px;overflow:auto}
.sa_trailItem{display:flex;flex-direction:column;gap:2px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:8px;padding:6px 10px;font-size:12px;line-height:1.5}
.sa_trailItem--deny{border-left:3px solid var(--dsw-alias-label-error)}
.sa_trailItem--allow{border-left:3px solid #2f9e44}
.sa_trailItem--ask{border-left:3px solid #f08c00}
.sa_trailMeta{color:var(--dsw-alias-label-secondary);font-weight:600}
.sa_trailSummary{color:var(--dsw-alias-label-primary);word-break:break-all}
.sa_trailReason{color:var(--dsw-alias-label-tertiary);word-break:break-all}
.sa_trailItemHead{display:flex;align-items:center;gap:6px}
.sa_trailItemToggle{appearance:none;font:inherit;cursor:pointer;background:0 0;border:0;padding:0;flex:1;min-width:0;display:flex;align-items:center;gap:6px;color:inherit;text-align:left}
.sa_trailChevron{color:var(--dsw-alias-label-tertiary);flex:none;transition:transform .16s}
.sa_trailChevronOpen{transform:rotate(180deg)}
.sa_trailLocate{appearance:none;font:inherit;cursor:pointer;border:1px solid var(--dsw-alias-border-l2);background:0 0;color:var(--dsw-alias-label-secondary);border-radius:6px;padding:1px 8px;font-size:11px;line-height:1.5;flex:none}
.sa_trailLocate:hover{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}
.sa_trailItemBody{display:flex;flex-direction:column;gap:4px;margin-top:4px;padding-top:4px;border-top:1px dashed var(--dsw-alias-border-l2)}
.sa_trailRow{display:flex;gap:8px;min-width:0}
.sa_trailRowLabel{color:var(--dsw-alias-label-tertiary);flex:none;font-size:11px;line-height:1.5}
.sa_trailDetail{color:var(--dsw-alias-label-secondary);word-break:break-all;font-size:12px;line-height:1.5}
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

  constructor(settingsSource: RpcSettingsSource, llmApi: any) {
    this.llmApi = llmApi
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
      proposalContextMaxMessageLen: this.form.field('proposalContextMaxMessageLen'),
      proposalContextMaxChars: this.form.field('proposalContextMaxChars'),
      proposalContextMaxTotalChars: this.form.field('proposalContextMaxTotalChars'),
      preflight: this.form.field('preflight'),
      showTrail: this.form.field('showTrail'),
    }
  }

  inject() {
    return {
      hooks: { safeAutoCard: this.store },
      ...this.form.actions(),
      setOptions: (field: string, options: readonly string[]) => this.form.setOptions(field, options),
      fetchModelCatalog: () => this.fetchModelCatalog(),
    }
  }

  /** 复用 DSH 宿主现成的 llm.models 端点拉取全局模型目录（groups：provider 分组 → models）。 */
  async fetchModelCatalog(): Promise<{ groups: any[] }> {
    if (this.llmApi === undefined || typeof this.llmApi.models !== 'function') return { groups: [] }
    try {
      const { result } = await this.llmApi.models({})
      if (result?.ok !== true) return { groups: [] }
      return { groups: Array.isArray(result.value?.groups) ? result.value.groups : [] }
    } catch {
      return { groups: [] }
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
  const [groups, setGroups] = useState<any[]>([])
  const currentProvider = state.classifierProvider?.text ?? ''
  injectCss()
  // 展开设置卡时经 DSH 宿主现成的 llm.models 端点拉取一次全局模型目录（provider 分组 → models），
  // 候选仅用于快速选择，仍可自定义输入。
  useEffect(() => {
    if (!open) return
    void props.fetchModelCatalog().then((catalog: { groups: any[] }) => {
      setGroups(catalog.groups)
      props.setOptions('classifierProvider', catalog.groups.map((g) => g.id))
    })
  }, [open])
  // provider 变化时从已拉取的分组本地联动 model 候选；未知/空则清空 model 候选。
  useEffect(() => {
    if (!open) return
    const group = groups.find((g) => g.id === currentProvider)
    props.setOptions('classifierModel', group !== undefined ? group.models.map((m: any) => m.id) : [])
  }, [open, currentProvider, groups])
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
                  state.failed ? jsx('p', { className: 'sa_failed', children: t('saveFailed') }) : null,
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

/** 单条审批记录：可折叠展开，展开后显示完整 summary / reason / callId / time，并支持定位到会话中的操作。 */
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
              jsx('span', { className: 'sa_trailMeta', children: record.layer + ' · ' + decisionText + ' · ' + record.toolName }),
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
          jsxs('div', { className: 'sa_trailRow', children: [jsx('span', { className: 'sa_trailRowLabel', children: 'callId' }), jsx('span', { className: 'sa_trailDetail', children: record.callId })] }),
          jsxs('div', { className: 'sa_trailRow', children: [jsx('span', { className: 'sa_trailRowLabel', children: t('timeLabel') }), jsx('span', { className: 'sa_trailDetail', children: formatTime(record.time) })] }),
          jsxs('div', { className: 'sa_trailRow', children: [jsx('span', { className: 'sa_trailRowLabel', children: t('durationLabel') }), jsx('span', { className: 'sa_trailDetail', children: formatDuration(record.durationMs) })] }),
        ],
      }) : null,
    ],
  })
}

function TrailPanel(props: any) {
  const [open, setOpen] = useState(false)
  const { t, useTrail } = props
  const snapshot = useTrail((s: any) => s) ?? {}
  // showTrail 关闭时不再渲染浮窗（TrailController 亦已停止轮询）。
  if (snapshot.enabled === false) return null
  const records = Array.isArray(snapshot.records) ? snapshot.records : []
  if (records.length === 0) return null
  const locate = (callId: string) => {
    const el = Array.from(document.querySelectorAll('[data-chat-call-id]')).find((node) => node.getAttribute('data-chat-call-id') === callId)
    if (el !== undefined) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }
  return jsxs('div', {
    className: 'sa_trail',
    children: [
      jsx('button', {
        type: 'button',
        className: 'sa_trailToggle',
        onClick: () => setOpen(!open),
        children: (open ? t('trailCollapse') : t('trailTitle')) + ' ' + records.length,
      }),
      open ? jsx('ul', {
        className: 'sa_trailList',
        children: records.slice(-50).reverse().map((record: any) => jsx(TrailItem, {
          key: String(record.seq),
          record,
          onLocate: locate,
          t,
        })),
      }) : null,
    ],
  })
}

// ==== apply ====
const inject = ['slots', 'locale', 'connection']

function apply(ctx: any) {
  injectCss()
  ctx.effect(() => ctx.locale.register(SETTINGS_NS, { zh, en }), 'autogate: card dictionaries')
  const t = ctx.locale.bind(SETTINGS_NS)
  const rpc = ctx.connection?.rpc
  // 复用 DSH 宿主现成的模型目录 API（llm.models），与对话框模型选择器同源。
  const llmApi = ctx.connection?.api?.llm
  // 设置卡与轨迹浮窗共享同一个 settings 数据源：设置卡保存 showTrail 后，
  // TrailController 经订阅即时启停轮询，无需重新拉取。
  const settingsSource = new RpcSettingsSource(rpc)
  const controller = new SafeAutoCardController(settingsSource, llmApi)
  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item',
    id: 'autogate',
    order: 50,
    locale: SETTINGS_NS,
    inject: () => controller.inject(),
  }, SafeAutoCard))

  const trailController = new TrailController(rpc, settingsSource)
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
