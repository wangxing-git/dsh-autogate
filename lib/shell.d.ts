import { type PolicyRoots } from './paths.js';
import type { Assessment } from './types.js';
export type ShellKind = 'bash' | 'pwsh';
/** 确定性硬 deny：不依赖解析器，直接正则熔断。 */
export declare function hardDenyShellReason(source: string, _shell: ShellKind, _roots: PolicyRoots): string | undefined;
/** 主入口：先硬 deny，再按命令分类，复杂/动态结构一律 fail-closed。 */
export declare function assessShell(source: string, shell: ShellKind, roots: PolicyRoots): Assessment;
