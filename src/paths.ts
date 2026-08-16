import { homedir, tmpdir } from 'node:os'
import { realpathSync } from 'node:fs'
import { posix, win32 } from 'node:path'
import { reasonText, type UiLocale } from './i18n.js'

/** 真实路径解析器：把路径解析为真实落点（跟随符号链接）；测试可注入。 */
export type RealPathResolver = (path: string) => string

/** 策略使用的根路径。 */
export interface PolicyRoots {
  workspace: string
  home: string
  tempRoots: string[]
  /** 真实路径解析器（跟随符号链接）；默认 Node 原生 realpath，测试可注入。 */
  resolveReal: RealPathResolver
}

/** 可选的根路径覆盖。 */
export interface RootOptions {
  workspaceRoot?: string
  tempRoots?: string[]
  home?: string
}

type PathStyle = 'posix' | 'win32'

function styleOf(value: string): PathStyle {
  if (/^[A-Za-z]:[\\/]/.test(value) || value.startsWith('\\\\')) return 'win32'
  return 'posix'
}

function apiOf(style: PathStyle): typeof posix | typeof win32 {
  return style === 'win32' ? win32 : posix
}

/** 默认真实路径解析器：Node 原生 realpath（跟随符号链接）。 */
function nativeRealPath(path: string): string {
  return realpathSync.native(path)
}

/** 折叠 realpath 结果：去除 Windows 扩展长度前缀 `\\?\`，并按风格规范化（win32 小写折叠）。 */
function foldRealPath(real: string): string {
  const stripped = real.startsWith('\\\\?\\') ? real.slice(4) : real
  const style = styleOf(stripped)
  const normalized = apiOf(style).normalize(stripped)
  return style === 'win32' ? normalized.toLowerCase() : normalized
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
export function resolveRealPath(path: string, resolveReal: RealPathResolver = nativeRealPath): string {
  const api = apiOf(styleOf(path))
  let cursor = path
  const suffix: string[] = []
  for (;;) {
    try {
      const real = foldRealPath(resolveReal(cursor))
      return suffix.length === 0 ? real : api.join(real, ...suffix.reverse())
    } catch {
      const parent = api.dirname(cursor)
      if (parent === cursor) return path
      suffix.push(api.basename(cursor))
      cursor = parent
    }
  }
}

/** 提取 glob 目标的最长静态前缀（第一个 glob 元字符 `*`/`?`/`[` 之前的路径部分）。 */
export function globStaticPrefix(target: string): string {
  const index = target.search(/[*?\[]/)
  return index === -1 ? target : target.slice(0, index)
}

/** 将绝对或相对路径规范化为绝对路径（不跟随符号链接）。 */
export function normalizePath(input: string, cwd: string, userHome = homedir()): string {
  const expanded = input === '~'
    ? userHome
    : input.startsWith('~/') || input.startsWith('~\\')
      ? posix.join(userHome, input.slice(2))
      : input
  const style = styleOf(expanded)
  const api = apiOf(style)
  const absolute = api.isAbsolute(expanded) ? expanded : api.resolve(cwd, expanded)
  const normalized = api.normalize(absolute)
  return style === 'win32' ? normalized.toLowerCase() : normalized
}

/** 判断 target 是否等于 root 或位于其下（两者需先 normalize）。 */
export function isWithin(root: string, target: string): boolean {
  const rootStyle = styleOf(root)
  const targetStyle = styleOf(target)
  if (rootStyle !== targetStyle) return false
  const api = apiOf(rootStyle)
  const relative = api.relative(root, target)
  return relative === '' || (!relative.startsWith('..') && !api.isAbsolute(relative))
}

/** 是否为文件系统根（如 / 或 C:\）。 */
export function isFilesystemRoot(target: string): boolean {
  const style = styleOf(target)
  const api = apiOf(style)
  const normalized = normalizePath(target, target)
  return api.parse(normalized).root === normalized
}

const CREDENTIAL_DIRS = ['.ssh', '.gnupg', '.aws', '.azure', '.kube', '.config/gcloud']
const SYSTEM_DIRS = ['/etc', '/bin', '/sbin', '/usr', '/boot', '/system', '/library', '/private/etc']

/** 是否为操作系统或凭据关键目录。 */
export function isCriticalPath(target: string, roots: PolicyRoots): boolean {
  const normalized = normalizePath(target, roots.workspace, roots.home)
  // 以真实落点判定，与 realpath 后的根保持一致（symlink 逃逸不绕过）。
  const real = roots.resolveReal(normalized)
  const windowsCritical = /^[a-z]:\\(?:windows|program files|program files \(x86\)|programdata)(?:\\|$)/i.test(real)
  const credentialRoots = CREDENTIAL_DIRS.map(dir => normalizePath(dir, roots.home, roots.home))
  const critical = windowsCritical
    || SYSTEM_DIRS.some(root => isWithin(normalizePath(root, '/', '/'), real))
    || credentialRoots.some(root => isWithin(root, real))
  return critical
}

/** 敏感 shell / 凭据配置文件 basename（工作区内外一律视为敏感，写入需语义审查）。 */
const SENSITIVE_CONFIG_FILES = ['.gitconfig', '.gitmodules', '.bashrc', '.bash_profile', '.zshrc', '.zprofile', '.profile', '.mcp.json', '.env']

/** 目标是否为敏感 shell / 凭据配置文件（不区分工作区内外）。 */
export function isSensitiveConfigFile(target: string, roots: PolicyRoots): boolean {
  const normalized = normalizePath(target, roots.workspace, roots.home)
  const real = roots.resolveReal(normalized)
  const base = apiOf(styleOf(real)).basename(real).toLowerCase()
  return SENSITIVE_CONFIG_FILES.includes(base)
}

/** 是否为工作区内受保护的元数据路径（如 .git）或敏感配置文件。 */
export function isProtectedProjectPath(target: string, roots: PolicyRoots): boolean {
  const normalized = normalizePath(target, roots.workspace, roots.home)
  const real = roots.resolveReal(normalized)
  if (!isWithin(roots.workspace, real)) return false
  const api = apiOf(styleOf(real))
  const relative = api.relative(roots.workspace, real).replaceAll('\\', '/')
  const first = relative.split('/')[0]?.toLowerCase()
  if (first !== undefined && ['.git', '.vscode', '.idea', '.husky', '.dsh'].includes(first)) return true
  return isSensitiveConfigFile(real, roots)
}

/** 危险目标熔断模式：mutation 变更（write/edit）放宽家目录根（可逆写走提权）；destruction 删除（rm/破坏性工具）仍硬 deny 家目录根。 */
export type DestructiveTargetMode = 'mutation' | 'destruction'

/** 确定性危险目标熔断：根/家目录根/系统关键路径返回拒绝原因。
 *  - 文件系统根与系统/凭据关键路径：变更与删除一律硬 deny（最危险、不可授权）。
 *  - 家目录根：变更（写/编辑目录本身，可逆）走提权，删除（rm ~，不可逆）仍硬 deny。
 *  - DSH_HOME：变更与删除均不再硬 deny（agent 自身的指令/配置目录，属常规可逆写），
 *    走「工作区外路径 → 沙箱拦截 + escalation 审批」的通用处理。 */
export function hardDestructiveTargetReason(target: string, roots: PolicyRoots, locale?: UiLocale, mode: DestructiveTargetMode = 'destruction'): string | undefined {
  const normalized = normalizePath(target, roots.workspace, roots.home)
  // symlink 加固：解析真实落点，防止工作区内 symlink 逃逸到关键路径时被词法判定漏过。
  const real = roots.resolveReal(normalized)
  if (isFilesystemRoot(real)) return reasonText(locale, `文件系统根 ${real}`, `filesystem root ${real}`)
  if (real === roots.home && mode !== 'mutation') return reasonText(locale, `用户家目录 ${real}`, `user home root ${real}`)
  if (isCriticalPath(real, roots)) return reasonText(locale, `系统或凭据关键路径 ${real}`, `system or credential-critical path ${real}`)
  return undefined
}

/** 解析运行时根路径。 */
export function resolveRoots(activeWorkspace: string | undefined, options: RootOptions = {}, resolveReal: RealPathResolver = resolveRealPath): PolicyRoots {
  const home = resolveReal(normalizePath(options.home ?? homedir(), options.home ?? homedir()))
  const workspace = resolveReal(normalizePath(activeWorkspace ?? options.workspaceRoot ?? process.cwd(), process.cwd(), home))
  // 根与临时目录同样解析真实路径，确保候选路径与根比较双方一致（根本身是 symlink 时亦正确）。
  const tempRoots = (options.tempRoots ?? [tmpdir()]).map(root => resolveReal(normalizePath(root, workspace, home)))
  return { workspace, home, tempRoots, resolveReal }
}
