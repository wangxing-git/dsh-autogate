/** 审批决策值：allow 放行 / deny 拒绝 / ask 转人工。 */
export type ApprovalDecision = 'allow' | 'deny' | 'ask'

/** 决策层级：L0 确定性规则 / L1 LLM 安全审批 / L2 人工审批。 */
export type ApprovalLayer = 'L0' | 'L1' | 'L2'

/** 一条工具调用的审批轨迹记录。 */
export interface ApprovalRecord {
  /** 轨迹内自增序号。 */
  seq: number
  /** 决策时间（Unix 毫秒）。 */
  time: number
  /** 本次审批决策耗时（毫秒）。 */
  durationMs: number
  /** 工具调用标识；escalation 审批无调用标识时为空字符串。 */
  callId: string
  /** 工具名（wire name）。 */
  toolName: string
  /** 参数摘要（一行，≤80 字符）。 */
  summary: string
  decision: ApprovalDecision
  layer: ApprovalLayer
  /** 拒绝原因或放行依据。 */
  reason: string
  /** 产生该决策的会话 id（顶层授权会话；子代理调用归属其父会话），无会话上下文时为空字符串。 */
  sessionId: string
}

/** 审批轨迹：进程级环形缓冲，只增不持久化（重启即清空）。 */
export interface ApprovalTrail {
  /** 追加一条记录；sessionId 缺省时记为空字符串（兼容无会话上下文的调用）。 */
  record(entry: Omit<ApprovalRecord, 'seq' | 'time' | 'sessionId'> & { sessionId?: string }): void
  /** 返回当前全部记录的副本（按时间顺序）。 */
  snapshot(): ApprovalRecord[]
}

/** 创建审批轨迹环形缓冲。 */
export function createApprovalTrail(limit = 200): ApprovalTrail {
  const records: ApprovalRecord[] = []
  let seq = 0
  return {
    record(entry) {
      records.push({ seq: seq++, time: Date.now(), sessionId: '', ...entry })
      if (records.length > limit) records.splice(0, records.length - limit)
    },
    snapshot() {
      return records.slice()
    },
  }
}
