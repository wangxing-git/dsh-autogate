import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { ToolExecution } from '@deepseek-ai/dsh-tools';
export * from './paths.js';
export * from './policy.js';
export * from './shell.js';
export * from './classifier.js';
export type * from './types.js';
export * from './trail.js';
export declare const name = "autogate";
export declare const inject: string[];
/** 半自动权限预设键（自动但危险时转人工兜底弹窗；默认档）。 */
export declare const SEMI_AUTO_PERMISSION_PRESET = "auto-ask";
/** 全自动权限预设键（LLM 全权裁决，不再人工兜底弹窗）。 */
export declare const AUTO_PERMISSION_PRESET = "auto";
/** 托管权限模式：半自动（保留人工兜底弹窗）/ 全自动（无人工兜底，全部交由 LLM 裁决）。 */
export type ManagedMode = 'semi-auto' | 'full-auto';
/** 宿主策略配置。 */
export interface Config {
    /** 半自动权限预设键（默认 auto-ask）：危险操作转人工兜底弹窗。 */
    readonly presetName?: string;
    readonly workspaceRoot?: string;
    readonly dshHome?: string;
    readonly tempRoots?: string[];
    readonly classifierEndpoint?: string;
    readonly classifierProvider?: string;
    readonly classifierModel?: string;
    readonly classifierPrompt?: string;
    readonly classifierApiKeyEnv?: string;
    readonly classifierTimeoutMs?: number;
    readonly classifierMaxOutputTokens?: number;
    /** 沙盒前拦截判断开关：true 执行普通 L0 规则 + LLM 分类，false 完全依赖沙盒（硬 deny 与提权审批不受影响）。 */
    readonly preflight?: boolean;
    /** 全自动权限预设键（默认 auto）：该预设下审批不再人工弹窗，LLM 裁决为最终决定。 */
    readonly fullAutoPresetName?: string;
}
export declare const Config: z<Config>;
/** 当前会话是否使用 Auto 权限预设。 */
export declare function isAutoPermissionExecution(exec: Readonly<ToolExecution>, presetName?: string): boolean;
type ParentSessionId = NonNullable<NonNullable<ToolExecution['agent']>['session']['header']['parentSession']>;
type ParentAgentLookup = (sessionId: ParentSessionId) => ToolExecution['agent'] | undefined;
/**
 * 解析授权本次执行的 Auto 会话。
 * DSH 把子代理 approval pin 到 never，因此沿 durable parentSession 链继承 Auto，
 * 否则子代理的工具调用会在 Auto 会话中被一刀切拒绝。
 */
export declare function autoPermissionAuthority(exec: Readonly<ToolExecution>, parentAgent: ParentAgentLookup, presetName?: string): ToolExecution['agent'] | undefined;
/** 沿 durable parentSession 链解析执行所属的托管权限：返回授权 agent 与模式，未命中返回 undefined。 */
export declare function managedPermissionAuthority(agent: ToolExecution['agent'], parentAgent: ParentAgentLookup, semiPreset?: string, fullPreset?: string): {
    agent: NonNullable<ToolExecution['agent']>;
    mode: ManagedMode;
} | undefined;
/** 安装自动权限策略到官方工具流水线。 */
export declare function apply(ctx: Context, config?: Config): void;
