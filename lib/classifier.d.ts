import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm';
import type { ClassifierDecision, SafetyClassifier } from './types.js';
import type { UiLocale } from './i18n.js';
/** 分类器系统提示词：按操作的具体目标/类型/可逆性/实际影响做语义判断，越界本身不是拒绝理由；低风险越界放行，真正危险才拒绝。 */
export declare const CLASSIFIER_SYSTEM_PROMPT: string;
/** 按 UI 语言在系统提示词末尾追加 reason 语言指令；zh 时强制中文，其余保持默认（英文提示词自然输出英文）。 */
export declare function withLocaleDirective(systemPrompt: string, locale: UiLocale | undefined): string;
/** 脱敏并限界单段文本（不超过 1000 字符）。 */
export declare function sanitizeClassifierText(value: string): string;
/** 分类器网络边界前的脱敏：剥离大块内容与疑似密钥，限制深度与数量。 */
export declare function sanitizeClassifierArguments(value: unknown, depth?: number): unknown;
/** 解析分类器输出：必须有合法的 decision + reason；忽略模型偶尔多吐的额外字段，减少 fail-closed 误拒。 */
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
    /** 当前 UI 语言 getter：zh 时让 LLM 用中文写 reason；缺省保持英文。 */
    locale?: () => UiLocale | undefined;
    /** 分类器输出解析失败时静默重试一次（temperature 0 下偶发格式抖动）；默认关闭，流/网络错误不重试。 */
    retryOnFailure?: boolean;
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
    /** 当前 UI 语言 getter：zh 时让 LLM 用中文写 reason；缺省保持英文。 */
    locale?: () => UiLocale | undefined;
    /** 分类器输出解析失败时静默重试一次；默认关闭，fetch / HTTP 状态错误不重试。 */
    retryOnFailure?: boolean;
}
export declare function createHttpClassifier(config: HttpClassifierConfig): SafetyClassifier;
export {};
