import { describe, expect, it } from 'vitest'
import { createApprovalTrail } from '../src/trail.js'

describe('createApprovalTrail', () => {
  it('record 追加记录并按顺序 snapshot', () => {
    const trail = createApprovalTrail()
    trail.record({ callId: 'a', toolName: 'bash', summary: 'ls', decision: 'allow', layer: 'L0', reason: '只读', durationMs: 1 })
    trail.record({ callId: 'b', toolName: 'read', summary: '/ws/x.ts', decision: 'deny', layer: 'L1', reason: '危险', durationMs: 250 })
    const snapshot = trail.snapshot()
    expect(snapshot).toHaveLength(2)
    expect(snapshot.map(r => r.seq)).toEqual([0, 1])
    expect(snapshot[0].decision).toBe('allow')
    expect(snapshot[0].durationMs).toBe(1)
    expect(snapshot[1].layer).toBe('L1')
    expect(snapshot[1].durationMs).toBe(250)
  })

  it('seq 自增且 time 为数字', () => {
    const trail = createApprovalTrail()
    trail.record({ callId: '', toolName: 'grep', summary: '', decision: 'ask', layer: 'L2', reason: '', durationMs: 0 })
    trail.record({ callId: '', toolName: 'grep', summary: '', decision: 'ask', layer: 'L2', reason: '', durationMs: 0 })
    const snapshot = trail.snapshot()
    expect(snapshot[0].seq).toBe(0)
    expect(snapshot[1].seq).toBe(1)
    expect(typeof snapshot[0].time).toBe('number')
  })

  it('超过 limit 淘汰最旧记录', () => {
    const trail = createApprovalTrail(3)
    for (let index = 0; index < 5; index += 1) {
      trail.record({ callId: String(index), toolName: 'bash', summary: '', decision: 'allow', layer: 'L0', reason: '', durationMs: 0 })
    }
    const snapshot = trail.snapshot()
    expect(snapshot).toHaveLength(3)
    expect(snapshot.map(r => r.callId)).toEqual(['2', '3', '4'])
  })

  it('snapshot 返回副本，修改不影响内部状态', () => {
    const trail = createApprovalTrail()
    trail.record({ callId: 'a', toolName: 'bash', summary: 'ls', decision: 'allow', layer: 'L0', reason: '只读', durationMs: 0 })
    const snapshot = trail.snapshot()
    snapshot.pop()
    expect(trail.snapshot()).toHaveLength(1)
  })

  it('记录 sessionId 供按会话隔离；缺省时为空字符串', () => {
    const trail = createApprovalTrail()
    trail.record({ callId: 'a', toolName: 'bash', summary: 'ls', decision: 'allow', layer: 'L0', reason: '只读', durationMs: 1, sessionId: 'sess-1' })
    trail.record({ callId: 'b', toolName: 'read', summary: '/ws/x.ts', decision: 'deny', layer: 'L1', reason: '危险', durationMs: 250 })
    const snapshot = trail.snapshot()
    expect(snapshot[0].sessionId).toBe('sess-1')
    expect(snapshot[1].sessionId).toBe('')
  })
})
