/**
 * 会话投影注册表的测试替身（供各 spec 复用）。
 *
 * 生产代码通过 `ctx.sessionProjections.stateOf(session, key)` 读取投影状态（DSH 0.1.6 起
 * `Session.snapshotEvents/eventAt/ownEvents` 等同步事件读取弃用，授权判定改走投影）。
 * 本替身保留注册表的对外契约——`register` 记录单元定义，`stateOf` 按注册表的 fold 语义
 * （`init(header)` 起手、逐事件 `apply`）在 mock 会话的事件序列上求值——使集成测试仍能
 * 走真实的「inject → register → stateOf」路径，并在事件序列层面验证判定结果。
 *
 * mock 会话需提供 `snapshotEvents()` 与 `header`（与既有测试的 mock agent 形态一致）。
 */

/** 投影单元定义中本替身用到的字段。 */
interface ProjectionUnitLike {
  key: string
  init: (header: unknown, inheritedEventCount: unknown) => unknown
  apply: (state: any, event: any) => unknown
}

/** 注册表替身：`register` 返回 disposer（测试中为 no-op，单元留存至用例结束）。 */
export function createSessionProjections() {
  const units = new Map<string, ProjectionUnitLike>()
  return {
    register(definition: ProjectionUnitLike): () => void {
      units.set(definition.key, definition)
      return () => {}
    },
    /** key 未注册时返回 undefined（与真实注册表一致，调用方据此 fail-closed）。 */
    stateOf(session: any, key: string): unknown {
      const unit = units.get(key)
      if (unit === undefined) return undefined
      let state = unit.init(session?.header, 0)
      for (const event of session?.snapshotEvents?.() ?? []) state = unit.apply(state, event)
      return state
    },
  }
}
