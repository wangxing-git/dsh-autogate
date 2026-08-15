import type { ToolExecution } from '@deepseek-ai/dsh-tools'

/** 一次工具调用的确定性判定结果。 */
export type Assessment = {
  decision: 'allow' | 'ask' | 'deny'
  reason: string
}

/** 交给 LLM 分类器的输入（已脱敏、已限界）。 */
export interface ClassifierInput {
  toolName: string
  arguments: unknown
  workspaceRoot: string
  policyReason: string
  /** 最近的直接人类消息（唯一授权依据，已脱敏）。 */
  trustedUserMessages: string[]
  /** 当前会话的 provider/model 路由（供 DSH 内部分类器复用）。 */
  route?: { provider: string; model: string }
}

/** LLM 分类器输出（严格两态：放行或拒绝；拒绝后由被拒绝方主动向用户发起人工审批）。 */
export interface ClassifierDecision {
  decision: 'allow' | 'deny'
  reason: string
}

/** 安全分类器接口：默认走 DSH 内部 LLM，可替换为独立 HTTP 端点。 */
export interface SafetyClassifier {
  classify(input: ClassifierInput, signal: AbortSignal): Promise<ClassifierDecision>
}

/** 供策略函数复用的最小执行字段。 */
export type PendingExecution = Pick<ToolExecution, 'name' | 'arguments' | 'agent' | 'signal'>
