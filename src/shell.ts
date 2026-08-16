import { basename } from 'node:path'
import { globStaticPrefix, hardDestructiveTargetReason, isWithin, normalizePath, type PolicyRoots } from './paths.js'
import type { Assessment } from './types.js'

export type ShellKind = 'bash' | 'pwsh'

function allow(reason: string): Assessment {
  return { decision: 'allow', reason }
}

function deny(reason: string): Assessment {
  return { decision: 'deny', reason }
}

/** 模糊操作交给 LLM 分类器裁决。 */
function classify(reason: string): Assessment {
  return { decision: 'ask', reason }
}

// ---- 硬 deny 正则（guard 与 pre-execute 共用，确定性零成本） ----

/** 提权。 */
const PRIVILEGE_ESCALATION = /(?:^|[\s;&|])(?:sudo|doas|su)(?:\s|$)/i

/** 自毁 / 系统级破坏命令。 */
const SELF_DESTRUCTIVE = /(?:^|[\s;&|])(?:killall|pkill|taskkill|Stop-Process|shutdown|reboot|halt|poweroff|mkfs|format-volume|clear-disk)(?:\s|$)/i

/** 提权命令名（tokenize 后识别，覆盖 s'u'do 等引号拼接绕过）。 */
const PRIVILEGE_ESCALATION_COMMANDS = new Set(['sudo', 'doas', 'su'])

/** 自毁 / 系统级破坏命令名（tokenize 后识别，覆盖引号拼接绕过）。 */
const SELF_DESTRUCTIVE_COMMANDS = new Set(['killall', 'pkill', 'taskkill', 'stop-process', 'shutdown', 'reboot', 'halt', 'poweroff', 'mkfs', 'format-volume', 'clear-disk'])

/** 凭据 / 私钥敏感标记（用于外传检测）。 */
const SENSITIVE_MARKER = /(?:\.ssh[\\/]|\.gnupg[\\/]|\.aws[\\/]|\.kube[\\/]|\.credentials\.yaml|id_(?:rsa|ed25519)|(?:API|AUTH|ACCESS|SECRET)[_-]?KEY|TOKEN|PASSWORD)/i

/** 网络下载 / 外发命令。 */
const NETWORK_COMMAND = /(?:curl|wget|Invoke-WebRequest|Invoke-RestMethod)/i

/** 确定性硬 deny：不依赖解析器，直接正则熔断。 */
export function hardDenyShellReason(source: string, _shell: ShellKind, _roots: PolicyRoots): string | undefined {
  const compact = source.trim()
  if (PRIVILEGE_ESCALATION.test(compact)) return 'privilege escalation is not permitted by auto mode'
  if (SELF_DESTRUCTIVE.test(compact)) return 'self-destructive or system-level command is not permitted'
  if (NETWORK_COMMAND.test(compact) && SENSITIVE_MARKER.test(compact)) return 'credential or private-data exfiltration pattern is not permitted'
  if (/rm\s+(?:-[a-z]*[fr][a-z]*\s+)*\/(?:\s|$)/.test(compact)) return 'deleting the filesystem root is not permitted'
  if (/(?:rm|Remove-Item)\s+(?:-[a-z]*[fr][a-z]*\s+)*(?:~|\$HOME|\$env:HOME)(?:\s|$)/i.test(compact)) return 'deleting the user home root is not permitted'
  return undefined
}

// ---- 简单 tokenize（不追求完整 shell 语义，复杂结构一律不进 allow 快路径） ----

function tokenize(line: string): string[] {
  const tokens: string[] = []
  let current = ''
  let quote: string | undefined
  for (const ch of line) {
    if (quote !== undefined) {
      if (ch === quote) quote = undefined
      else current += ch
      continue
    }
    if (ch === '"' || ch === "'") { quote = ch; continue }
    if (/\s/.test(ch)) { if (current !== '') tokens.push(current); current = ''; continue }
    current += ch
  }
  if (current !== '') tokens.push(current)
  return tokens
}

function commandName(token: string): string {
  return basename(token.replaceAll('\\', '/')).toLowerCase()
}

// ---- 只读命令白名单（确定只读，零副作用） ----

const BASH_READ_ONLY = new Set([
  'pwd', 'ls', 'cat', 'head', 'tail', 'grep', 'rg', 'egrep', 'fgrep', 'wc', 'od', 'du', 'df',
  'stat', 'file', 'which', 'type', 'echo', 'printf', 'true', 'false', ':', 'test', '[',
  'basename', 'dirname', 'realpath', 'readlink', 'date', 'whoami', 'id', 'hostname', 'uname',
  'printenv', 'sort', 'uniq', 'cut', 'tr', 'nl', 'diff', 'cmp', 'jq', 'tree', 'column',
  'md5sum', 'shasum', 'sha1sum', 'sha256sum',
])

const PWSH_READ_ONLY = new Set([
  'get-location', 'get-childitem', 'get-content', 'select-string', 'get-item', 'test-path',
  'write-output', 'write-host', 'get-date', 'measure-object', 'select-object', 'sort-object',
])

/** 删除 / 覆盖 / 移动类命令（危险操作）。 */
const DESTRUCTIVE_COMMANDS = new Set(['rm', 'rmdir', 'unlink', 'shred', 'dd', 'mv', 'remove-item', 'del', 'erase'])

/** 目标可静态确定且落在工作区/临时区内的删除/移动命令，跟随 workspace-write 沙箱直接放行（dd 除外：块设备级，参数形如 if=/of=）。 */
const WORKSPACE_CONFINED_DESTRUCTIVE = new Set(['rm', 'rmdir', 'unlink', 'shred', 'mv', 'remove-item', 'del', 'erase'])

/** 嵌套解释器：内联代码执行。 */
const INTERPRETERS = new Set([
  'node', 'deno', 'bun', 'python', 'python3', 'perl', 'ruby', 'php', 'osascript',
  'sh', 'bash', 'zsh', 'fish', 'ksh', 'dash', 'cmd', 'powershell', 'pwsh', 'eval', 'iex', 'invoke-expression',
])

function isNestedInterpreter(name: string, tokens: string[]): boolean {
  if (!INTERPRETERS.has(name)) return false
  return tokens.some((token, index) => index > 0 && /^(?:-c|-e|-E|--eval|--exec|--command|\/c)$/.test(token))
}

function looksLikePath(token: string): boolean {
  return token === '~' || token.startsWith('~/') || token.startsWith('./') || token.startsWith('../')
    || token.startsWith('/') || token.startsWith('\\\\') || /^[A-Za-z]:[\\/]/.test(token)
}

function routinePaths(paths: string[], roots: PolicyRoots): boolean {
  return paths.every((path) => {
    const normalized = normalizePath(path, roots.workspace, roots.home)
    // symlink 加固：以真实落点判定，防止工作区内 symlink 逃逸到区外敏感路径被误判为“区内只读”。
    const real = roots.resolveReal(normalized)
    return isWithin(roots.workspace, real) || roots.tempRoots.some(root => isWithin(root, real))
  })
}

function isBuildOrTest(name: string, tokens: string[]): boolean {
  const first = tokens[1]?.toLowerCase()
  if (['pnpm', 'npm', 'yarn', 'bun'].includes(name)) {
    if (first === 'test') return true
    if (first === 'run') return /^(?:build|test|typecheck|check|verify|lint)(?::[\w-]+)?$/.test(tokens[2] ?? '')
    return false
  }
  if (['tsc', 'vitest', 'eslint', 'pytest', 'jest', 'mocha'].includes(name)) return true
  if (['cargo', 'go'].includes(name)) return ['build', 'test', 'check', 'vet'].includes(first ?? '')
  if (name === 'make') return tokens.length === 1 || tokens.slice(1).every(token => /^(?:build|test|check|verify|lint)$/.test(token))
  return false
}

/**
 * 删除 / 移动类命令：关键路径硬 deny；目标全部落在工作区/临时区内时跟随
 * workspace-write 沙箱直接放行；工作区外的删除直接放行交给沙箱拦截 + escalation。
 */
function assessDestructive(name: string, tokens: string[], roots: PolicyRoots): Assessment {
  const targets = tokens.slice(1).filter(token => !token.startsWith('-'))
  if (targets.some(token => /[\$\x60]/.test(token))) {
    return classify('destructive target is dynamic and requires independent classification')
  }
  if (targets.length === 0) return allow('destructive target could not be determined; workspace-write sandbox applies')
  for (const target of targets) {
    // glob 目标：先对其静态前缀做危险判定，防止 /*、/etc/*、~/*、~/.* 这类绕过精确路径匹配。
    const reason = hardDestructiveTargetReason(globStaticPrefix(target), roots)
    if (reason !== undefined) return deny('destructive operation targets ' + reason)
  }
  // dd 是块设备级操作，参数形如 if=/of=，静态路径判定不可靠，交 LLM 分类。
  if (name === 'dd') return classify('dd block-device operation requires independent classification')
  const confined = WORKSPACE_CONFINED_DESTRUCTIVE.has(name) && targets.every((target) => {
    const normalized = normalizePath(target, roots.workspace, roots.home)
    // symlink 加固：以真实落点判定，工作区内 symlink 逃逸到区外时不再按“区内删除”放行。
    const real = roots.resolveReal(normalized)
    return isWithin(roots.workspace, real) || roots.tempRoots.some(root => isWithin(root, real))
  })
  if (confined) return allow('destructive operation confined to the workspace or temporary area; workspace-write sandbox applies')
  return allow('destructive operation outside the workspace; workspace-write sandbox will block it and offer escalation')
}

/** 主入口：先硬 deny，再按命令分类，复杂/动态结构一律 fail-closed。 */
export function assessShell(source: string, shell: ShellKind, roots: PolicyRoots): Assessment {
  const hard = hardDenyShellReason(source, shell, roots)
  if (hard !== undefined) return deny(hard)

  const compact = source.trim()

  // 复杂 shell 结构：命令替换、here-doc、管道、重定向、复合、分组、进程替换。
  if (/\$\(|[\x60]|<<|&&|\|\||;|\||[<>]|\(|\)|\{|\}|\[\[/.test(compact)) {
    if (/\b(?:rm|rmdir|unlink|shred|dd|mkfs|remove-item)\b/.test(compact)) {
      return classify('destructive compound shell command requires independent classification')
    }
    return classify('compound shell command requires independent classification')
  }

  const tokens = tokenize(compact)
  const rawName = tokens[0] ?? ''
  if (rawName === '') return allow('command line contains no command')
  if (/[\$\x60]/.test(rawName)) return allow('command name is produced by a dynamic expansion; workspace-write sandbox applies')
  const name = commandName(rawName)

  // 提权/自毁命令：即使原始正则被引号拼接（如 s'u'do）绕过，tokenize 后仍能确定性拒绝。
  if (PRIVILEGE_ESCALATION_COMMANDS.has(name)) return deny('privilege escalation is not permitted by auto mode')
  if (SELF_DESTRUCTIVE_COMMANDS.has(name)) return deny('self-destructive or system-level command is not permitted')

  if (isNestedInterpreter(name, tokens)) {
    if (/\b(?:rm|rmdir|unlink|shred|os\.(?:remove|unlink)|shutil\.rmtree|file\.delete)\b/.test(compact)) {
      return classify('destructive nested interpreter code requires independent classification')
    }
    return classify('nested interpreter execution requires independent classification')
  }

  if (DESTRUCTIVE_COMMANDS.has(name)) return assessDestructive(name, tokens, roots)

  if (name === 'find') {
    if (/-(?:delete|exec|execdir|ok|okdir)\b/.test(compact)) return classify('find with a mutating action requires independent classification')
    const paths = tokens.slice(1).filter(token => looksLikePath(token))
    return paths.length === 0 || routinePaths(paths, roots)
      ? allow('read-only find inside the workspace or temporary area')
      : classify('find references an external or protected path')
  }

  const readOnly = shell === 'bash' ? BASH_READ_ONLY : PWSH_READ_ONLY
  if (readOnly.has(name)) {
    const paths = tokens.slice(1).filter(token => looksLikePath(token))
    return paths.length === 0 || routinePaths(paths, roots)
      ? allow('static read-only command inside the workspace or temporary area')
      : classify('read-only command references an external or protected path')
  }

  if (name === 'git') {
    const sub = tokens[1]?.toLowerCase()
    if (['status', 'diff', 'log', 'show', 'rev-parse', 'ls-files', 'blame'].includes(sub)) return allow('read-only git inspection')
    if (['reset', 'clean', 'commit', 'push', 'rebase', 'checkout', 'switch', 'branch', 'tag', 'merge'].includes(sub)) {
      return classify('Git state-changing command requires independent classification')
    }
    return classify('git command requires independent classification')
  }

  if (tokens.length === 2 && ['--version', '-v', 'version'].includes(tokens[1]?.toLowerCase() ?? '')) {
    return allow('development-tool version probe')
  }

  if (isBuildOrTest(name, tokens)) return allow('recognized project build, test, or verification command')

  if (['curl', 'wget', 'ssh', 'scp', 'rsync', 'ftp', 'nc', 'netcat'].includes(name)) {
    return classify('network operation requires independent classification')
  }
  if (['psql', 'mysql', 'mongosh', 'redis-cli', 'kubectl', 'terraform', 'ansible', 'systemctl', 'launchctl', 'createdb', 'dropdb'].includes(name)) {
    return classify('database, service, or infrastructure operation requires independent classification')
  }

  return classify('unrecognized shell command requires independent classification: ' + name)
}
