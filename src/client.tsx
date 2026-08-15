import { jsx, jsxs } from 'react/jsx-runtime'
import { useState } from 'react'
import { CardForm, SETTINGS_NS, TrailController, boolField, en, formatDuration, formatTime, numberField, textField, zh } from './client-logic.js'

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
.sa_btn{appearance:none;font:inherit;cursor:pointer;border-radius:8px;padding:5px 14px;font-size:13px;line-height:1.5}
.sa_btnDiscard{border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);background:0 0}
.sa_btnSave{border:1px solid #0000;color:#fff;background:var(--dsw-alias-brand-primary)}
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
.sa_trailDetail{color:var(--dsw-alias-label-secondary);word-break:break-all;font-size:12px;line-height:1.5}`

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

  constructor(scope: any) {
    this.form = new CardForm(scope, [
      textField('presetName'),
      textField('fullAutoPresetName'),
      textField('classifierProvider'),
      textField('classifierModel'),
      textField('classifierEndpoint'),
      textField('classifierPrompt', true),
      numberField('classifierTimeoutMs'),
      numberField('classifierMaxOutputTokens'),
      boolField('preflight'),
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
      preflight: this.form.field('preflight'),
    }
  }

  inject() {
    return {
      hooks: { safeAutoCard: this.store },
      ...this.form.actions(),
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
          jsx('label', { className: 'sa_label', htmlFor: props.id, children: props.label }),
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

function SafeAutoCard(props: any) {
  const { t } = props
  const state = props.useSafeAutoCard((snapshot: any) => snapshot)
  const [open, setOpen] = useState(false)
  injectCss()
  if (!state.available) return null
  const disabled = !state.writable
  const blocked = !state.dirty || state.invalid || state.saving
  const fields = [
    { key: 'preflight', label: t('preflight'), hint: t('preflightHint'), bool: true },
    { key: 'presetName', label: t('presetName'), hint: t('presetNameHint') },
    { key: 'fullAutoPresetName', label: t('fullAutoPresetName'), hint: t('fullAutoPresetNameHint') },
    { key: 'classifierProvider', label: t('classifierProvider'), hint: t('classifierProviderHint') },
    { key: 'classifierModel', label: t('classifierModel'), hint: t('classifierModelHint') },
    { key: 'classifierEndpoint', label: t('classifierEndpoint'), hint: t('classifierEndpointHint') },
    { key: 'classifierPrompt', label: t('classifierPrompt'), hint: t('classifierPromptHint'), multiline: true },
    { key: 'classifierTimeoutMs', label: t('classifierTimeoutMs'), hint: t('classifierTimeoutMsHint') },
    { key: 'classifierMaxOutputTokens', label: t('classifierMaxOutputTokens'), hint: t('classifierMaxOutputTokensHint') },
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
                overriddenLabel: t('overridden'),
                resetLabel: t('reset'),
                invalidLabel: t('invalid'),
                disabled,
                ...state[f.key],
                onEdit: (text: string) => props.edit(f.key, text),
                onReset: () => props.resetField(f.key),
              })),
              jsxs('div', {
                className: 'sa_footer',
                children: [
                  state.failed ? jsx('p', { className: 'sa_failed', children: t('saveFailed') }) : null,
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
  const { record, onLocate } = props
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
              jsx('span', { className: 'sa_trailMeta', children: record.layer + ' · ' + record.decision + ' · ' + record.toolName }),
              jsx('span', { className: open ? 'sa_trailChevron sa_trailChevronOpen' : 'sa_trailChevron', children: '▾' }),
            ],
          }),
          jsx('button', {
            type: 'button',
            className: 'sa_trailLocate',
            onClick: () => onLocate(record.callId),
            children: '定位',
          }),
        ],
      }),
      open ? jsxs('div', {
        className: 'sa_trailItemBody',
        children: [
          record.summary ? jsxs('div', { className: 'sa_trailRow', children: [jsx('span', { className: 'sa_trailRowLabel', children: '操作' }), jsx('span', { className: 'sa_trailSummary', children: record.summary })] }) : null,
          record.reason ? jsxs('div', { className: 'sa_trailRow', children: [jsx('span', { className: 'sa_trailRowLabel', children: '理由' }), jsx('span', { className: 'sa_trailReason', children: record.reason })] }) : null,
          jsxs('div', { className: 'sa_trailRow', children: [jsx('span', { className: 'sa_trailRowLabel', children: 'callId' }), jsx('span', { className: 'sa_trailDetail', children: record.callId })] }),
          jsxs('div', { className: 'sa_trailRow', children: [jsx('span', { className: 'sa_trailRowLabel', children: '时间' }), jsx('span', { className: 'sa_trailDetail', children: formatTime(record.time) })] }),
          jsxs('div', { className: 'sa_trailRow', children: [jsx('span', { className: 'sa_trailRowLabel', children: '耗时' }), jsx('span', { className: 'sa_trailDetail', children: formatDuration(record.durationMs) })] }),
        ],
      }) : null,
    ],
  })
}

function TrailPanel(props: any) {
  const [open, setOpen] = useState(false)
  const trail = props.useTrail((snapshot: any) => snapshot) ?? []
  const records = Array.isArray(trail) ? trail : []
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
        children: (open ? '收起' : '审批轨迹') + ' ' + records.length,
      }),
      open ? jsx('ul', {
        className: 'sa_trailList',
        children: records.slice(-50).reverse().map((record: any) => jsx(TrailItem, {
          key: String(record.seq),
          record,
          onLocate: locate,
        })),
      }) : null,
    ],
  })
}

// ==== apply ====
const inject = ['slots', 'locale', 'connection', 'remote', 'settingsScope']

function apply(ctx: any) {
  injectCss()
  ctx.effect(() => ctx.locale.register(SETTINGS_NS, { zh, en }), 'autogate: card dictionaries')
  const t = ctx.locale.bind(SETTINGS_NS)
  const controller = new SafeAutoCardController(ctx.settingsScope.bind({ namespace: SETTINGS_NS }))
  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item',
    id: 'autogate',
    order: 50,
    locale: SETTINGS_NS,
    inject: () => controller.inject(),
  }, SafeAutoCard))

  const trailController = new TrailController(ctx.connection?.rpc)
  ctx.effect(() => trailController.dispose, 'autogate: trail polling')
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'autogate-trail',
    order: 100,
    inject: () => trailController.inject(),
  }, TrailPanel))
}

export { apply, inject }
