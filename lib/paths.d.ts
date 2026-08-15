/** 策略使用的根路径。 */
export interface PolicyRoots {
    workspace: string;
    home: string;
    dshHome: string;
    tempRoots: string[];
}
/** 可选的根路径覆盖。 */
export interface RootOptions {
    workspaceRoot?: string;
    dshHome?: string;
    tempRoots?: string[];
    home?: string;
}
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
export declare function hardDestructiveTargetReason(target: string, roots: PolicyRoots): string | undefined;
/** 解析运行时根路径。 */
export declare function resolveRoots(activeWorkspace: string | undefined, options?: RootOptions): PolicyRoots;
