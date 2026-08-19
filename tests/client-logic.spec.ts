import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// client-logic 依赖 DSH Web 宿主注入的 createSnapshotStore，测试中 mock 为内存 store。
vi.mock('@deepseek-ai/dsh-client-runtime/client', () => {
  function fakeStore(initial: unknown) {
    let value = initial
    const listeners = new Set<() => void>()
    return {
      getSnapshot: () => value,
      set: (next: unknown) => { value = next; for (const l of listeners) l() },
      subscribe: (l: () => void) => { listeners.add(l); return () => listeners.delete(l) },
    }
  }
  return { createSnapshotStore: fakeStore }
})

import Schema from '@deepseek-ai/schemastery'
import { ApiSettingsSource, CardForm, TrailController, boolField, en, formatDuration, formatTime, numberField, pairedReset, pairedResetField, selectField, textField, zh } from '../src/client-logic.js'

describe('formatTime', () => {
  it('格式化为本地 HH:MM:SS', () => {
    const ms = new Date(2024, 0, 1, 12, 30, 45).getTime()
    expect(formatTime(ms)).toBe('12:30:45')
  })
})

describe('formatDuration', () => {
  it('小于 1s 显示毫秒', () => {
    expect(formatDuration(0)).toBe('0ms')
    expect(formatDuration(500)).toBe('500ms')
  })
  it('大于等于 1s 显示秒', () => {
    expect(formatDuration(1000)).toBe('1.0s')
    expect(formatDuration(1500)).toBe('1.5s')
  })
  it('非法值显示占位符', () => {
    expect(formatDuration(-1)).toBe('—')
    expect(formatDuration(Number.NaN)).toBe('—')
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe('—')
  })
})

describe('pairedResetField 成对字段联动', () => {
  it('classifierProvider ↔ classifierModel 成对', () => {
    expect(pairedResetField('classifierProvider')).toBe('classifierModel')
    expect(pairedResetField('classifierModel')).toBe('classifierProvider')
  })
  it('无成对关系的字段返回 undefined', () => {
    expect(pairedResetField('preflight')).toBeUndefined()
    expect(pairedResetField('classifierEndpoint')).toBeUndefined()
  })
})

describe('pairedReset 联动重置', () => {
  it('重置成对字段 → 联动重置另一字段', () => {
    const calls: string[] = []
    pairedReset({ resetField: (field: string) => calls.push(field) }, 'classifierProvider')
    expect(calls).toEqual(['classifierProvider', 'classifierModel'])
  })
  it('重置非成对字段 → 只重置自身', () => {
    const calls: string[] = []
    pairedReset({ resetField: (field: string) => calls.push(field) }, 'preflight')
    expect(calls).toEqual(['preflight'])
  })
})

describe('字段转换 spec', () => {
  it('textField format/parse', () => {
    const f = textField('presetName')
    expect(f.format('auto')).toBe('auto')
    expect(f.format(123)).toBe('')
    expect(f.parse('custom')).toEqual({ kind: 'set', value: 'custom' })
    expect(f.parse('')).toEqual({ kind: 'clear' })
    expect(f.multiline).toBe(false)
    expect(textField('p', true).multiline).toBe(true)
  })
  it('numberField format/parse', () => {
    const f = numberField('timeout')
    expect(f.format(8000)).toBe('8000')
    expect(f.format('8000')).toBe('')
    expect(f.parse('8000')).toEqual({ kind: 'set', value: 8000 })
    expect(f.parse(' 42 ')).toEqual({ kind: 'set', value: 42 })
    expect(f.parse('')).toEqual({ kind: 'clear' })
    expect(f.parse('abc')).toBeUndefined()
  })
  it('boolField format/parse', () => {
    const f = boolField('preflight')
    expect(f.format(true)).toBe('true')
    expect(f.format(false)).toBe('false')
    expect(f.parse('true')).toEqual({ kind: 'set', value: true })
    expect(f.parse('false')).toEqual({ kind: 'set', value: false })
    expect(f.parse('')).toBeUndefined()
  })
  it('selectField format/parse 与候选选项（允许自定义值）', () => {
    const f = selectField('classifierProvider', ['deepseek', 'openai'])
    expect(f.format('openai')).toBe('openai')
    expect(f.format(123)).toBe('')
    expect(f.parse('custom-provider')).toEqual({ kind: 'set', value: 'custom-provider' })
    expect(f.parse('')).toEqual({ kind: 'clear' })
    expect(f.options).toEqual(['deepseek', 'openai'])
  })
})

describe('CardForm staged 编辑与保存', () => {
  function mockScope(snapshot: Record<string, unknown>) {
    const writes: { set: Record<string, unknown>; unset: string[] }[] = []
    let subscriber: (() => void) | undefined
    return {
      getSnapshot: () => snapshot,
      subscribe: (cb: () => void) => { subscriber = cb },
      write: async (set: Record<string, unknown>, unset: string[]) => { writes.push({ set, unset }); return { ok: true, message: '' } },
      _writes: writes,
      _notify: () => subscriber?.(),
    }
  }

  it('field 初始值来自 scope 快照', () => {
    const scope = mockScope({ status: 'ready', writable: true, value: { presetName: 'auto' }, user: {} })
    const form = new CardForm(scope, [textField('presetName')])
    expect(form.field('presetName')).toEqual({ text: 'auto', overridden: false, invalid: false, dirty: false, options: [] })
    expect(form.shell().dirty).toBe(false)
  })

  it('edit 后进入 staged 状态并可 save', async () => {
    const scope = mockScope({ status: 'ready', writable: true, value: { presetName: 'auto' }, user: {} })
    const form = new CardForm(scope, [textField('presetName')])
    form.actions().edit('presetName', 'custom')
    expect(form.field('presetName')).toEqual({ text: 'custom', overridden: false, invalid: false, dirty: true, options: [] })
    expect(form.shell().dirty).toBe(true)
    expect(form.shell().invalid).toBe(false)
    await form.save()
    expect(scope._writes).toEqual([{ set: { presetName: 'custom' }, unset: [] }])
    expect(form.shell().dirty).toBe(false)
    expect(form.shell().failed).toBe(false)
  })

  it('改回原值不算未保存（不显示圆点/徽章）', () => {
    const scope = mockScope({ status: 'ready', writable: true, value: { presetName: 'auto' }, user: {} })
    const form = new CardForm(scope, [textField('presetName')])
    form.actions().edit('presetName', 'custom')
    expect(form.field('presetName').dirty).toBe(true)
    form.actions().edit('presetName', 'auto')
    expect(form.field('presetName').dirty).toBe(false)
    expect(form.shell().dirty).toBe(false)
  })

  it('值未变化时保存不写入 user 层（不锁定字段）', async () => {
    const scope = mockScope({ status: 'ready', writable: true, value: { presetName: 'auto' }, user: {} })
    const form = new CardForm(scope, [textField('presetName')])
    form.actions().edit('presetName', 'auto')
    await form.save()
    expect(scope._writes).toEqual([])
  })

  it('非法数字输入 → invalid，save 失败标记 failed', async () => {
    const scope = mockScope({ status: 'ready', writable: true, value: {}, user: {} })
    const form = new CardForm(scope, [numberField('classifierTimeoutMs')])
    form.actions().edit('classifierTimeoutMs', 'abc')
    expect(form.field('classifierTimeoutMs').invalid).toBe(true)
    expect(form.shell().invalid).toBe(true)
    await form.save()
    expect(scope._writes).toHaveLength(0)
    expect(form.shell().failed).toBe(true)
  })

  it('resetField 标记 clear → save 走 unset', async () => {
    const scope = mockScope({ status: 'ready', writable: true, value: { presetName: 'auto' }, user: { presetName: 'auto' } })
    const form = new CardForm(scope, [textField('presetName')])
    form.actions().resetField('presetName')
    expect(form.field('presetName').overridden).toBe(false)
    await form.save()
    expect(scope._writes).toEqual([{ set: {}, unset: ['presetName'] }])
  })

  it('输入非法值再重置 → 显示继承值而非空白', () => {
    const scope = mockScope({
      status: 'ready', writable: true,
      value: { classifierTimeoutMs: 5000 },
      user: { classifierTimeoutMs: 5000 },
      inherited: { classifierTimeoutMs: 8000 },
    })
    const form = new CardForm(scope, [numberField('classifierTimeoutMs')])
    form.actions().edit('classifierTimeoutMs', 'abc')
    expect(form.field('classifierTimeoutMs').invalid).toBe(true)
    form.actions().resetField('classifierTimeoutMs')
    const f = form.field('classifierTimeoutMs')
    expect(f.text).toBe('8000')
    expect(f.invalid).toBe(false)
    expect(f.overridden).toBe(false)
    expect(f.dirty).toBe(true)
  })

  it('未覆盖字段编辑不显示 overridden（不出现重置按钮）', () => {
    const scope = mockScope({ status: 'ready', writable: true, value: { classifierTimeoutMs: 8000 }, user: {} })
    const form = new CardForm(scope, [numberField('classifierTimeoutMs')])
    form.actions().edit('classifierTimeoutMs', 'abc')
    expect(form.field('classifierTimeoutMs').overridden).toBe(false)
  })

  it('discard 清空 staged', () => {
    const scope = mockScope({ status: 'ready', writable: true, value: { presetName: 'auto' }, user: {} })
    const form = new CardForm(scope, [textField('presetName')])
    form.actions().edit('presetName', 'x')
    expect(form.shell().dirty).toBe(true)
    form.actions().discard()
    expect(form.shell().dirty).toBe(false)
    expect(form.shell().failed).toBe(false)
  })

  it('shell 反映 writable / available', () => {
    const scope = mockScope({ status: 'loading', writable: false, value: {}, user: {} })
    const form = new CardForm(scope, [textField('presetName')])
    expect(form.shell().available).toBe(false)
    expect(form.shell().writable).toBe(false)
  })

  it('setOptions 动态注入下拉候选并覆盖静态选项', () => {
    const scope = mockScope({ status: 'ready', writable: true, value: { classifierProvider: 'deepseek' }, user: {} })
    const form = new CardForm(scope, [selectField('classifierProvider', ['static'])])
    expect(form.field('classifierProvider').options).toEqual(['static'])
    form.setOptions('classifierProvider', ['deepseek', 'openai'])
    expect(form.field('classifierProvider').options).toEqual(['deepseek', 'openai'])
  })

  it('save 失败 → failedMessage 透传服务端拒绝原因', async () => {
    const scope = {
      getSnapshot: () => ({ status: 'ready', writable: true, value: { preflight: true }, user: { preflight: true } }),
      subscribe: () => {},
      write: async () => ({ ok: false, message: 'classifierProvider 与 classifierModel 必须成对配置' }),
    }
    const form = new CardForm(scope, [boolField('preflight')])
    form.actions().edit('preflight', 'false')
    await form.save()
    expect(form.shell().failed).toBe(true)
    expect(form.shell().failedMessage).toBe('classifierProvider 与 classifierModel 必须成对配置')
  })

  it('save 成功或重新编辑 → failedMessage 清空', async () => {
    const scope = mockScope({ status: 'ready', writable: true, value: { preflight: true }, user: { preflight: true } })
    const form = new CardForm(scope, [boolField('preflight')])
    form.actions().edit('preflight', 'false')
    await form.save()
    expect(form.shell().failed).toBe(false)
    expect(form.shell().failedMessage).toBe('')
  })

  it('重新编辑 / 重置 / 放弃 → failedMessage 清空', async () => {
    let reject = true
    const scope = {
      getSnapshot: () => ({ status: 'ready', writable: true, value: { preflight: true }, user: { preflight: true } }),
      subscribe: () => {},
      write: async () => reject ? { ok: false, message: 'classifierProvider 与 classifierModel 必须成对配置' } : { ok: true, message: '' },
    }
    const form = new CardForm(scope, [boolField('preflight')])
    form.actions().edit('preflight', 'false')
    await form.save()
    expect(form.shell().failedMessage).toBe('classifierProvider 与 classifierModel 必须成对配置')
    reject = false
    form.actions().edit('preflight', 'true')
    expect(form.shell().failedMessage).toBe('')
    await form.save()
    form.actions().resetField('preflight')
    expect(form.shell().failedMessage).toBe('')
    form.actions().discard()
    expect(form.shell().failedMessage).toBe('')
  })
})

describe('ApiSettingsSource 官方 settings 通道数据源', () => {
  /** 构造最小 settings API mock：describe 返回 namespace 视图，mutate 记录批量 ops。 */
  function mockApi(overrides: Record<string, unknown> = {}) {
    let view: any = {
      ns: 'autogate',
      value: { preflight: true },
      base: {},
      user: { preflight: true },
      revision: 1,
      schema: Schema.object({ preflight: Schema.boolean().default(false) }).toJSON(),
    }
    const mutations: any[] = []
    const api: any = {
      describe: async () => ({ result: { ok: true, value: { namespaces: [view], writable: true } } }),
      mutate: async (payload: any) => { mutations.push(payload); return { result: { ok: true, value: view } } },
      _setView: (next: any) => { view = next },
      _mutations: mutations,
    }
    for (const [k, v] of Object.entries(overrides)) api[k] = v
    return api
  }

  it('拉取成功 → status ready 且透传 value/user/revision，inherited 合成 schema 默认值', async () => {
    const api = mockApi()
    const source = new ApiSettingsSource(api, 'autogate')
    await source.refresh()
    expect(source.getSnapshot().status).toBe('ready')
    expect(source.getSnapshot().value).toEqual({ preflight: true })
    expect(source.getSnapshot().user).toEqual({ preflight: true })
    expect(source.getSnapshot().revision).toBe(1)
    expect(source.getSnapshot().inherited).toEqual({ preflight: false })
  })

  it('inherited = schema 默认值合并 base（base 覆盖默认值）', async () => {
    const api = mockApi()
    api._setView({
      ns: 'autogate', value: { preflight: true }, base: { preflight: true }, user: { preflight: true }, revision: 1,
      schema: Schema.object({ preflight: Schema.boolean().default(false) }).toJSON(),
    })
    const source = new ApiSettingsSource(api, 'autogate')
    await source.refresh()
    expect(source.getSnapshot().inherited).toEqual({ preflight: true })
  })

  it('无 default 的标量字段在 inherited 中补空值键（重置预览不回退当前值）', async () => {
    const api = mockApi()
    api._setView({
      ns: 'autogate', value: { classifierProvider: 'deepseek' }, base: {}, user: { classifierProvider: 'deepseek' }, revision: 1,
      schema: Schema.object({
        classifierProvider: Schema.string(),
        classifierModel: Schema.string(),
        preflight: Schema.boolean().default(false),
      }).toJSON(),
    })
    const source = new ApiSettingsSource(api, 'autogate')
    await source.refresh()
    // 无 default 的 string 字段补空字符串键，有 default 的字段保留默认值
    expect(source.getSnapshot().inherited).toEqual({ classifierProvider: '', classifierModel: '', preflight: false })
  })

  it('schema envelope 损坏 → inherited 降级为 base', async () => {
    const api = mockApi()
    api._setView({ ns: 'autogate', value: {}, base: { presetName: 'auto-ask' }, user: {}, revision: 1, schema: { broken: true } })
    const source = new ApiSettingsSource(api, 'autogate')
    await source.refresh()
    expect(source.getSnapshot().inherited).toEqual({ presetName: 'auto-ask' })
  })

  it('describe 返回非 ok → status unavailable', async () => {
    const api = mockApi({ describe: async () => ({ result: { ok: false } }) })
    const source = new ApiSettingsSource(api, 'autogate')
    await source.refresh()
    expect(source.getSnapshot().status).toBe('unavailable')
  })

  it('namespace 未暴露 → status unavailable', async () => {
    const api = mockApi({ describe: async () => ({ result: { ok: true, value: { namespaces: [], writable: true } } }) })
    const source = new ApiSettingsSource(api, 'autogate')
    await source.refresh()
    expect(source.getSnapshot().status).toBe('unavailable')
  })

  it('describe 抛错 → 保持上一份快照（初始 loading）', async () => {
    const api = mockApi({ describe: async () => { throw new Error('down') } })
    const source = new ApiSettingsSource(api, 'autogate')
    await source.refresh()
    expect(source.getSnapshot().status).toBe('loading')
  })

  it('write 成功 → 批量 ops 落到 mutate（含 expectedRevision）并刷新', async () => {
    const api = mockApi()
    const source = new ApiSettingsSource(api, 'autogate')
    await source.refresh()
    expect(await source.write({ preflight: false }, ['classifierPrompt'])).toEqual({ ok: true, message: '' })
    expect(api._mutations).toHaveLength(1)
    expect(api._mutations[0]).toEqual({
      ns: 'autogate',
      ops: [
        { op: 'set', path: ['preflight'], value: false },
        { op: 'unset', path: ['classifierPrompt'] },
      ],
      expectedRevision: 1,
    })
  })

  it('revision 缺失 → mutate 不携带 expectedRevision', async () => {
    const api = mockApi()
    api._setView({ ns: 'autogate', value: { preflight: true }, base: {}, user: {}, revision: undefined, schema: {} })
    const source = new ApiSettingsSource(api, 'autogate')
    await source.refresh()
    expect(await source.write({ preflight: false }, [])).toEqual({ ok: true, message: '' })
    expect(api._mutations[0].expectedRevision).toBeUndefined()
  })

  it('write 失败 → 返回 ok:false 且透传服务端拒绝原因', async () => {
    const api = mockApi({ mutate: async () => ({ result: { ok: false, error: { code: 'settings-rejected', message: 'classifierProvider 与 classifierModel 必须成对配置', details: { ns: 'autogate' } } } }) })
    const source = new ApiSettingsSource(api, 'autogate')
    expect(await source.write({ preflight: true }, [])).toEqual({ ok: false, message: 'classifierProvider 与 classifierModel 必须成对配置' })
  })

  it('write 失败（revision 冲突）→ 刷新快照恢复最新 revision', async () => {
    let view: any = {
      ns: 'autogate', value: { preflight: true }, base: {}, user: { preflight: true }, revision: 1,
      schema: Schema.object({ preflight: Schema.boolean().default(false) }).toJSON(),
    }
    const api: any = {
      describe: async () => ({ result: { ok: true, value: { namespaces: [view], writable: true } } }),
      mutate: async () => {
        view = { ...view, revision: 2 }
        return { result: { ok: false, error: { code: 'settings-conflict', message: '配置已被其他客户端修改', details: { ns: 'autogate', expected: 1, actual: 2 } } } }
      },
    }
    const source = new ApiSettingsSource(api, 'autogate')
    await source.refresh()
    expect(source.getSnapshot().revision).toBe(1)
    expect(await source.write({ preflight: false }, [])).toEqual({ ok: false, message: '配置已被其他客户端修改' })
    expect(source.getSnapshot().revision).toBe(2)
  })

  it('api 缺失 → unavailable 且 write 返回 ok:false', async () => {
    const source = new ApiSettingsSource(undefined, 'autogate')
    await source.refresh()
    expect(source.getSnapshot().status).toBe('unavailable')
    expect(await source.write({}, [])).toEqual({ ok: false, message: '设置服务不可用' })
  })
})

describe('TrailController RPC 拉取（受 showTrail 控制）', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  /** 最小 settings 数据源 mock：只暴露 TrailController 依赖的 getSnapshot/subscribe。 */
  function fakeSettings(showTrail: boolean) {
    let value: Record<string, unknown> = { showTrail }
    const listeners = new Set<() => void>()
    return {
      getSnapshot: () => ({ value }),
      subscribe: (cb: () => void) => { listeners.add(cb); return () => listeners.delete(cb) },
      setShowTrail: (v: boolean) => { value = { showTrail: v }; for (const l of [...listeners]) l() },
    }
  }

  /** 最小 sessions 数据源 mock：暴露 list.getSnapshot/subscribe 与当前会话选择。 */
  function fakeSessions(current: string | undefined) {
    let value: { current: string | undefined } = { current }
    const listeners = new Set<() => void>()
    return {
      list: {
        getSnapshot: () => value,
        subscribe: (cb: () => void) => { listeners.add(cb); return () => listeners.delete(cb) },
      },
      setCurrent: (v: string | undefined) => { value = { current: v }; for (const l of [...listeners]) l() },
    }
  }

  it('默认显示 → 启用轮询并拉取更新 records', async () => {
    const records = [{ seq: 0, decision: 'allow' }]
    const settings = fakeSettings(true)
    const controller = new TrailController({ call: async () => ({ ok: true, value: records }) }, settings as any)
    await controller.refresh()
    expect(controller.store.getSnapshot()).toEqual({ enabled: true, records, showAll: false })
    controller.dispose()
  })

  it('showTrail=false → 不轮询（不调用 RPC）且 enabled=false', () => {
    const settings = fakeSettings(false)
    const call = vi.fn(async () => ({ ok: true, value: [] }))
    const controller = new TrailController({ call }, settings as any)
    expect(controller.store.getSnapshot()).toEqual({ enabled: false, records: [], showAll: false })
    expect(call).not.toHaveBeenCalled()
    controller.dispose()
  })

  it('showTrail true → false → 清空记录并停止轮询', async () => {
    const records = [{ seq: 0, decision: 'allow' }]
    const settings = fakeSettings(true)
    const controller = new TrailController({ call: async () => ({ ok: true, value: records }) }, settings as any)
    await controller.refresh()
    expect(controller.store.getSnapshot()).toEqual({ enabled: true, records, showAll: false })
    settings.setShowTrail(false)
    expect(controller.store.getSnapshot()).toEqual({ enabled: false, records: [], showAll: false })
    controller.dispose()
  })

  it('showTrail false → true → 恢复轮询', async () => {
    const records = [{ seq: 0, decision: 'allow' }]
    const settings = fakeSettings(false)
    const call = vi.fn(async () => ({ ok: true, value: records }))
    const controller = new TrailController({ call }, settings as any)
    expect(call).not.toHaveBeenCalled()
    settings.setShowTrail(true)
    await controller.refresh()
    expect(controller.store.getSnapshot().enabled).toBe(true)
    expect(controller.store.getSnapshot().records).toEqual(records)
    controller.dispose()
  })

  it('拉取失败保持上一份快照', async () => {
    const settings = fakeSettings(true)
    const controller = new TrailController({ call: async () => { throw new Error('rpc down') } }, settings as any)
    await controller.refresh()
    expect(controller.store.getSnapshot()).toEqual({ enabled: true, records: [], showAll: false })
    controller.dispose()
  })

  it('非 ok / 非数组结果不更新', async () => {
    const settings = fakeSettings(true)
    const controller = new TrailController({ call: async () => ({ ok: false, error: {} }) }, settings as any)
    await controller.refresh()
    expect(controller.store.getSnapshot()).toEqual({ enabled: true, records: [], showAll: false })
    controller.dispose()
  })

  it('携带当前会话 id 查询（按会话隔离）', async () => {
    const sessions = fakeSessions('sess-x')
    const call = vi.fn(async () => ({ ok: true, value: [{ seq: 0 }] }))
    const settings = fakeSettings(true)
    const controller = new TrailController({ call }, settings as any, sessions as any)
    await controller.refresh()
    expect(call).toHaveBeenCalledWith('/autogate', 'trail', { sessionId: 'sess-x' })
    controller.dispose()
  })

  it('会话切换后按新会话 id 查询', async () => {
    const sessions = fakeSessions('sess-x')
    const call = vi.fn(async () => ({ ok: true, value: [{ seq: 0 }] }))
    const settings = fakeSettings(true)
    const controller = new TrailController({ call }, settings as any, sessions as any)
    await controller.refresh()
    expect(call).toHaveBeenLastCalledWith('/autogate', 'trail', { sessionId: 'sess-x' })
    sessions.setCurrent('sess-y')
    await controller.refresh()
    expect(call).toHaveBeenLastCalledWith('/autogate', 'trail', { sessionId: 'sess-y' })
    controller.dispose()
  })

  it('toggleShowAll 切「查看全部」不再传 sessionId，再切回恢复按会话隔离', async () => {
    const sessions = fakeSessions('sess-x')
    const call = vi.fn(async () => ({ ok: true, value: [{ seq: 0 }] }))
    const settings = fakeSettings(true)
    const controller = new TrailController({ call }, settings as any, sessions as any)
    await controller.refresh()
    expect(call).toHaveBeenLastCalledWith('/autogate', 'trail', { sessionId: 'sess-x' })

    controller.toggleShowAll()
    await controller.refresh()
    expect(controller.store.getSnapshot().showAll).toBe(true)
    expect(call).toHaveBeenLastCalledWith('/autogate', 'trail', {})

    controller.toggleShowAll()
    await controller.refresh()
    expect(controller.store.getSnapshot().showAll).toBe(false)
    expect(call).toHaveBeenLastCalledWith('/autogate', 'trail', { sessionId: 'sess-x' })
    controller.dispose()
  })

  it('setShowAll 状态未变时不重复刷新（tab 点击已选中项无副作用）', async () => {
    const sessions = fakeSessions('sess-x')
    const call = vi.fn(async () => ({ ok: true, value: [{ seq: 0 }] }))
    const settings = fakeSettings(true)
    const controller = new TrailController({ call }, settings as any, sessions as any)
    await controller.refresh()
    const callsAfterInit = call.mock.calls.length

    controller.setShowAll(false)
    expect(call.mock.calls.length).toBe(callsAfterInit)
    expect(controller.store.getSnapshot().showAll).toBe(false)

    controller.setShowAll(true)
    expect(call.mock.calls.length).toBe(callsAfterInit + 1)
    expect(controller.store.getSnapshot().showAll).toBe(true)
    controller.dispose()
  })
})

describe('locale 字典', () => {
  it('zh / en 键集合一致', () => {
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort())
  })
  it('所有值均为非空字符串', () => {
    for (const value of Object.values(zh)) {
      expect(typeof value).toBe('string')
      expect((value as string).length).toBeGreaterThan(0)
    }
    for (const value of Object.values(en)) {
      expect((value as string).length).toBeGreaterThan(0)
    }
  })
})
