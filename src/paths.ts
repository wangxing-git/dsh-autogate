import { homedir, tmpdir } from 'node:os'
import { posix, win32 } from 'node:path'

/** 策略使用的根路径。 */
export interface PolicyRoots {
  workspace: string
  home: string
  dshHome: string
  tempRoots: string[]
}

/** 可选的根路径覆盖。 */
export interface RootOptions {
  workspaceRoot?: string
  dshHome?: string
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
  const windowsCritical = /^[a-z]:\\(?:windows|program files|program files \(x86\)|programdata)(?:\\|$)/i.test(normalized)
  const credentialRoots = CREDENTIAL_DIRS.map(dir => normalizePath(dir, roots.home, roots.home))
  const critical = windowsCritical
    || SYSTEM_DIRS.some(root => isWithin(normalizePath(root, '/', '/'), normalized))
    || credentialRoots.some(root => isWithin(root, normalized))
  return critical
}

/** 敏感 shell / 凭据配置文件 basename（工作区内外一律视为敏感，写入需语义审查）。 */
const SENSITIVE_CONFIG_FILES = ['.gitconfig', '.gitmodules', '.bashrc', '.bash_profile', '.zshrc', '.zprofile', '.profile', '.mcp.json', '.env']

/** 目标是否为敏感 shell / 凭据配置文件（不区分工作区内外）。 */
export function isSensitiveConfigFile(target: string, roots: PolicyRoots): boolean {
  const normalized = normalizePath(target, roots.workspace, roots.home)
  const base = apiOf(styleOf(normalized)).basename(normalized).toLowerCase()
  return SENSITIVE_CONFIG_FILES.includes(base)
}

/** 是否为工作区内受保护的元数据路径（如 .git）或敏感配置文件。 */
export function isProtectedProjectPath(target: string, roots: PolicyRoots): boolean {
  const normalized = normalizePath(target, roots.workspace, roots.home)
  if (!isWithin(roots.workspace, normalized)) return false
  const api = apiOf(styleOf(normalized))
  const relative = api.relative(roots.workspace, normalized).replaceAll('\\', '/')
  const first = relative.split('/')[0]?.toLowerCase()
  if (first !== undefined && ['.git', '.vscode', '.idea', '.husky', '.dsh'].includes(first)) return true
  return isSensitiveConfigFile(normalized, roots)
}

/** 确定性危险目标熔断：根/家目录/DSH_HOME/系统关键路径返回拒绝原因。 */
export function hardDestructiveTargetReason(target: string, roots: PolicyRoots): string | undefined {
  const normalized = normalizePath(target, roots.workspace, roots.home)
  if (isFilesystemRoot(normalized)) return `filesystem root ${normalized}`
  if (normalized === roots.home) return `user home root ${normalized}`
  if (isWithin(roots.dshHome, normalized)) return `DSH_HOME path ${normalized}`
  if (isCriticalPath(normalized, roots)) return `system or credential-critical path ${normalized}`
  return undefined
}

/** 解析运行时根路径。 */
export function resolveRoots(activeWorkspace: string | undefined, options: RootOptions = {}): PolicyRoots {
  const home = normalizePath(options.home ?? homedir(), options.home ?? homedir())
  const workspace = normalizePath(activeWorkspace ?? options.workspaceRoot ?? process.cwd(), process.cwd(), home)
  const envDshHome = process.env.DSH_HOME?.trim()
  const dshHome = normalizePath(options.dshHome ?? (envDshHome === '' || envDshHome === undefined ? posix.join(home, '.dsh') : envDshHome), workspace, home)
  const tempRoots = (options.tempRoots ?? [tmpdir()]).map(root => normalizePath(root, workspace, home))
  return { workspace, home, dshHome, tempRoots }
}
