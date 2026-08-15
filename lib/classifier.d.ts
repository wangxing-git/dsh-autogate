import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm';
import type { ClassifierDecision, SafetyClassifier } from './types.js';
/** 分类器系统提示词：按操作的具体目标/类型/可逆性/实际影响做语义判断，越界本身不是拒绝理由；低风险越界放行，真正危险才拒绝。 */
export declare const CLASSIFIER_SYSTEM_PROMPT: string;
/** 脱敏并限界单段文本（不超过 1000 字符）。 */
export declare function sanitizeClassifierText(value: string): string;
/** 分类器网络边界前的脱敏：剥离大块内容与疑似密钥，限制深度与数量。 */
export declare function sanitizeClassifierArguments(value: unknown, depth?: number): unknown;
/** 严格解析分类器输出：只接受恰好 decision+reason 两键的 JSON。 */
export declare function parseClassifierDecision(value: unknown): ClassifierDecision;
/** 是否为沙箱提权审批请求（reason 以 escalation 前缀开头）。 */
export declare function isEscalationApprovalReason(reason: string | undefined): reason is string;
/** 从 escalation reason 中提取 justification（':' 之后的部分）。 */
export declare function extractEscalationJustification(reason: string): string;
/** DSH 内部分类器：复用当前会话的 provider/model 路由。 */
export interface DshClassifierConfig {
    timeoutMs: number;
    maxOutputTokens?: number;
    provider?: string;
    model?: string;
    /** 审查（分类）系统提示词；缺省用 CLASSIFIER_SYSTEM_PROMPT。 */
    systemPrompt?: string;
}
interface LlmStreamRuntime {
    stream(options: GenerateOptions): AsyncIterable<StreamChunk>;
}
export declare function createDshClassifier(runtime: LlmStreamRuntime, config: DshClassifierConfig): SafetyClassifier;
/** 独立 OpenAI 兼容分类器（可选；必须 HTTPS 或 loopback HTTP）。 */
export interface HttpClassifierConfig {
    endpoint: string;
    model: string;
    apiKey?: string;
    timeoutMs: number;
    /** 审查（分类）系统提示词；缺省用 CLASSIFIER_SYSTEM_PROMPT。 */
    systemPrompt?: string;
}
export declare function createHttpClassifier(config: HttpClassifierConfig): SafetyClassifier;
export {};
