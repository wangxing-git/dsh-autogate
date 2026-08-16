import { type UiLocale } from './i18n.js';
/** 真实路径解析器：把路径解析为真实落点（跟随符号链接）；测试可注入。 */
export type RealPathResolver = (path: string) => string;
/** 策略使用的根路径。 */
export interface PolicyRoots {
    workspace: string;
    home: string;
    dshHome: string;
    tempRoots: string[];
    /** 真实路径解析器（跟随符号链接）；默认 Node 原生 realpath，测试可注入。 */
    resolveReal: RealPathResolver;
}
/** 可选的根路径覆盖。 */
export interface RootOptions {
    workspaceRoot?: string;
    dshHome?: string;
    tempRoots?: string[];
    home?: string;
}
/**
 * 解析路径的“真实身份”：跟随符号链接得到真实落点，用于在词法路径判定之前
 * 消除 symlink 逃逸（工作区内 symlink 指向区外/关键路径时，词法判定会误放行）。
 *
 * 算法（借鉴 StyxNether 的“最深存在祖先 realpath”思路，并做保守性强化）：
 * 1. 先对整条路径 realpath——目标已存在的常见情形一次系统调用命中；
 * 2. 失败（目标或其部分后缀尚不存在）时从尾向根逐段剥离，定位“最深存在祖先”，
 *    对其 realpath 后再把尚不存在的后缀原样拼回；
 * 3. 剥到文件系统根仍无法解析（全部祖先都不存在）时，原样返回输入——
 *    宁保守不放宽，绝不因解析失败而降级为“工作区内安全”。
 */
export declare function resolveRealPath(path: string, resolveReal?: RealPathResolver): string;
/** 提取 glob 目标的最长静态前缀（第一个 glob 元字符 `*`/`?`/`[` 之前的路径部分）。 */
export declare function globStaticPrefix(target: string): string;
/** 将绝对或相对路径规范化为绝对路径（不跟随符号链接）。 */
export declare function normalizePath(input: string, cwd: string, userHome?: string): string;
/** 判断 target 是否等于 root 或位于其下（两者需先 normalize）。 */
export declare function isWithin(root: string, target: string): boolean;
/** 是否为文件系统根（如 / 或 C:\）。 */
export declare function isFilesystemRoot(target: string): boolean;
/** 是否为操作系统或凭据关键目录。 */
export declare function isCriticalPath(target: string, roots: PolicyRoots): boolean;
/** 目标是否为敏感 shell / 凭据配置文件（不区分工作区内外）。 */
export declare function isSensitiveConfigFile(target: string, roots: PolicyRoots): boolean;
/** 是否为工作区内受保护的元数据路径（如 .git）或敏感配置文件。 */
export declare function isProtectedProjectPath(target: string, roots: PolicyRoots): boolean;
/** 确定性危险目标熔断：根/家目录/DSH_HOME/系统关键路径返回拒绝原因。 */
export declare function hardDestructiveTargetReason(target: string, roots: PolicyRoots, locale?: UiLocale): string | undefined;
/** 解析运行时根路径。 */
export declare function resolveRoots(activeWorkspace: string | undefined, options?: RootOptions, resolveReal?: RealPathResolver): PolicyRoots;
