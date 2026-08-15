import type { ToolExecution } from '@deepseek-ai/dsh-tools';
import { type PolicyRoots } from './paths.js';
import type { Assessment } from './types.js';
/** 同步硬 deny：供 ctx.tools.guard() 与 pre-execute 共用，后续监听器无法覆盖。 */
export declare function hardDenyReason(exec: Readonly<ToolExecution>, roots: PolicyRoots): string | undefined;
/**
 * 工具级三级判定：
 * - allow：确定性安全的只读 / 会话状态 / 工作区内编辑；
 * - deny：硬危险（关键路径、凭据外传、提权）；
 * - ask：模糊 / 语义危险操作交 LLM 两态裁决。
 */
export declare function assessTool(exec: Readonly<ToolExecution>, roots: PolicyRoots): Assessment;
/** 参数摘要：提取工具参数中能识别“是哪个操作”的关键字段，供轨迹标注展示，与工具节点形成对应关系。 */
export declare function summarizeToolArguments(name: string, args: unknown): string;
/** 参数是否携带非空 sandbox_permissions（任意工具）：用于缓存提权重试的原始参数供 approval/request 分类器取回。 */
export declare function hasSandboxEscalation(args: unknown): boolean;
/** 是否为沙箱提权重试：带 sandbox_permissions 的 bash/pwsh 调用交由 DSH 内建 escalation 审批（人工弹窗，不过本插件的 LLM）。 */
export declare function isSandboxEscalationRetry(name: string, args: unknown): boolean;
