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

import { CardForm, TrailController, boolField, en, formatDuration, formatTime, numberField, textField, zh } from '../src/client-logic.js'

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
})

describe('CardForm staged 编辑与保存', () => {
  function mockScope(snapshot: Record<string, unknown>) {
    const sets: [string, unknown][] = []
    const unsets: string[] = []
    let subscriber: (() => void) | undefined
    return {
      getSnapshot: () => snapshot,
      subscribe: (cb: () => void) => { subscriber = cb },
      set: async (field: string, value: unknown) => { sets.push([field, value]) },
      unset: async (field: string) => { unsets.push(field) },
      _sets: sets,
      _unsets: unsets,
      _notify: () => subscriber?.(),
    }
  }

  it('field 初始值来自 scope 快照', () => {
    const scope = mockScope({ status: 'ready', writable: true, value: { presetName: 'auto' }, user: {} })
    const form = new CardForm(scope, [textField('presetName')])
    expect(form.field('presetName')).toEqual({ text: 'auto', overridden: false, invalid: false })
    expect(form.shell().dirty).toBe(false)
  })

  it('edit 后进入 staged 状态并可 save', async () => {
    const scope = mockScope({ status: 'ready', writable: true, value: { presetName: 'auto' }, user: {} })
    const form = new CardForm(scope, [textField('presetName')])
    form.actions().edit('presetName', 'custom')
    expect(form.field('presetName')).toEqual({ text: 'custom', overridden: true, invalid: false })
    expect(form.shell().dirty).toBe(true)
    await form.save()
    expect(scope._sets).toEqual([['presetName', 'custom']])
    expect(form.shell().dirty).toBe(false)
    expect(form.shell().failed).toBe(false)
  })

  it('非法数字输入 → invalid，save 失败标记 failed', async () => {
    const scope = mockScope({ status: 'ready', writable: true, value: {}, user: {} })
    const form = new CardForm(scope, [numberField('classifierTimeoutMs')])
    form.actions().edit('classifierTimeoutMs', 'abc')
    expect(form.field('classifierTimeoutMs').invalid).toBe(true)
    await form.save()
    expect(scope._sets).toHaveLength(0)
    expect(form.shell().failed).toBe(true)
  })

  it('resetField 标记 clear → save 走 unset', async () => {
    const scope = mockScope({ status: 'ready', writable: true, value: { presetName: 'auto' }, user: { presetName: 'auto' } })
    const form = new CardForm(scope, [textField('presetName')])
    form.actions().resetField('presetName')
    expect(form.field('presetName').overridden).toBe(false)
    await form.save()
    expect(scope._unsets).toEqual(['presetName'])
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
})

describe('TrailController RPC 拉取', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('拉取成功更新 store', async () => {
    const records = [{ seq: 0, decision: 'allow' }]
    const controller = new TrailController({ call: async () => ({ ok: true, value: records }) })
    await controller.refresh()
    expect(controller.store.getSnapshot()).toEqual(records)
    controller.dispose()
  })

  it('拉取失败保持上一份快照', async () => {
    const controller = new TrailController({ call: async () => { throw new Error('rpc down') } })
    await controller.refresh()
    expect(controller.store.getSnapshot()).toEqual([])
    controller.dispose()
  })

  it('非 ok / 非数组结果不更新', async () => {
    const controller = new TrailController({ call: async () => ({ ok: false, error: {} }) })
    await controller.refresh()
    expect(controller.store.getSnapshot()).toEqual([])
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
