import type { ToolExecution } from '@deepseek-ai/dsh-tools'
import { hardDestructiveTargetReason, isCriticalPath, isProtectedProjectPath, isSensitiveConfigFile, isWithin, normalizePath, type PolicyRoots } from './paths.js'
import { assessShell, hardDenyShellReason } from './shell.js'
import type { Assessment } from './types.js'

function allow(reason: string): Assessment {
  return { decision: 'allow', reason }
}

function deny(reason: string): Assessment {
  return { decision: 'deny', reason }
}

function classify(reason: string): Assessment {
  return { decision: 'ask', reason }
}

/** 只读文件工具。 */
const READ_TOOLS = new Set(['read', 'read_image', 'grep', 'glob', 'lsp'])

/** 会话 / 目标状态工具（无文件副作用）。 */
const SESSION_STATE_TOOLS = new Set([
  'ask_user_question', 'todo_write', 'get_goal', 'create_goal', 'update_goal',
  'exit_plan_mode', 'skill', 'report',
])

/** 只读 Harness 查询工具。 */
const HARNESS_READ_TOOLS = new Set(['job_output', 'job_list', 'session_search', 'session_event_search'])

/** 编排工具：子调用独立走本策略。 */
const ORCHESTRATION_TOOLS = new Set([
  'subagent', 'subagent_fork', 'workflow', 'ralph', 'send_message',
  'list_agents', 'interrupt_agent', 'wait_agents',
])

/** 代码执行容器：内部工具调用各自经过本策略与沙箱评估，容器本身直接放行。 */
const CODE_EXECUTION_TOOLS = new Set(['run_code'])

/** 外部写工具：可能影响工作区之外。 */
const EXTERNAL_WRITE_TOOLS = new Set(['git_push', 'deploy', 'publish', 'send_email', 'create_issue', 'create_pull_request'])

/** 工具名本身表明破坏性的危险标记。 */
const DESTRUCTIVE_TOOL_NAME = /(?:^|[_-])(?:delete|destroy|remove|erase|purge|drop|truncate|wipe|unlink|rmdir|reset|revoke)(?:$|[_-])/i

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function pathArgument(args: Record<string, unknown> | undefined): string | undefined {
  if (args === undefined) return undefined
  for (const key of ['file_path', 'path', 'cwd', 'workdir']) {
    const value = args[key]
    if (typeof value === 'string') return value
  }
  return undefined
}

/** 参数中是否携带凭据 / 私钥材料（用于外发调用检测）。 */
function containsCredentialMaterial(argumentsValue: unknown): boolean {
  let serialized: string
  try {
    serialized = JSON.stringify(argumentsValue ?? '')
  } catch {
    // 参数不可序列化（BigInt / 循环引用）时无法做凭据文本匹配；返回 false 不误杀——
    // 该调用仍会进入 LLM 分类器（sanitize 会把不可序列化值降级为占位符，不会令分类器失败）
    // 与沙箱兜底，避免同步 guard 因序列化崩溃。
    return false
  }
  return /(?:BEGIN (?:RSA |OPENSSH )?PRIVATE KEY|\b(?:sk|ghp|github_pat|xox[baprs])[-_][A-Za-z0-9_-]{8,}\b|Bearer\s+[A-Za-z0-9._~+\/-]{8,}|\.ssh[\\/](?:id_|config)|\.credentials\.yaml)/i.test(serialized)
}

/** 同步硬 deny：供 ctx.tools.guard() 与 pre-execute 共用，后续监听器无法覆盖。 */
export function hardDenyReason(exec: Readonly<ToolExecution>, roots: PolicyRoots): string | undefined {
  const name = exec.name
  const args = record(exec.arguments)
  if ((name === 'bash' || name === 'pwsh') && typeof args?.command === 'string') {
    return hardDenyShellReason(args.command, name, roots)
  }
  if ((/^(?:web_fetch|web_search|curl|wget)/i.test(name) || EXTERNAL_WRITE_TOOLS.has(name)) && containsCredentialMaterial(exec.arguments)) {
    return 'external call contains credential or private-key material'
  }
  if (['write', 'edit', 'apply_patch'].includes(name)) {
    const path = pathArgument(args)
    if (path !== undefined) {
      const reason = hardDestructiveTargetReason(path, roots)
      if (reason !== undefined) return 'mutation targets ' + reason
    }
  }
  if (DESTRUCTIVE_TOOL_NAME.test(name)) {
    const path = pathArgument(args)
    if (path !== undefined) {
      const reason = hardDestructiveTargetReason(path, roots)
      if (reason !== undefined) return 'destructive tool targets ' + reason
    }
  }
  return undefined
}

/**
 * 工具级三级判定：
 * - allow：确定性安全的只读 / 会话状态 / 工作区内编辑；
 * - deny：硬危险（关键路径、凭据外传、提权）；
 * - ask：模糊 / 语义危险操作交 LLM 两态裁决。
 */
export function assessTool(exec: Readonly<ToolExecution>, roots: PolicyRoots): Assessment {
  const hard = hardDenyReason(exec, roots)
  if (hard !== undefined) return deny(hard)

  const name = exec.name
  const args = record(exec.arguments)

  if ((name === 'bash' || name === 'pwsh') && typeof args?.command === 'string') {
    return assessShell(args.command, name, roots)
  }
  if (name === 'bash' || name === 'pwsh') {
    return allow(name + ' command argument is missing or invalid; workspace-write sandbox applies')
  }

  if (READ_TOOLS.has(name)) {
    const path = pathArgument(args)
    if (path === undefined) return allow('read-only project inspection')
    const normalized = normalizePath(path, roots.workspace, roots.home)
    // symlink 加固：以真实落点判定，防止工作区内 symlink 逃逸读取敏感路径时被误放行。
    const real = roots.resolveReal(normalized)
    if (isWithin(roots.workspace, real)) return allow('read-only project inspection inside the workspace')
    // 工作区外读：敏感路径（凭据/系统目录）交 LLM 审查，普通路径直接放行（只读无副作用，workspace-write 沙箱本就不限读）。
    return isCriticalPath(real, roots)
      ? classify('reading a critical path outside the workspace requires semantic review: ' + real)
      : allow('read-only inspection of a non-critical path outside the workspace')
  }

  if (name === 'write' || name === 'edit' || name === 'apply_patch') {
    const path = pathArgument(args)
    if (path === undefined) return allow(name + ' target path is missing; workspace-write sandbox applies')
    const normalized = normalizePath(path, roots.workspace, roots.home)
    // symlink 加固：以真实落点判定，工作区内 symlink 逃逸到区外时不再误判为“区内编辑”。
    const real = roots.resolveReal(normalized)
    // 工作区内受保护路径（.git 等）交 LLM；工作区外敏感 shell/凭据配置文件同样交 LLM，其余直接放行交给沙箱拦截 + escalation。
    if (isWithin(roots.workspace, real)) {
      return isProtectedProjectPath(real, roots)
        ? classify('mutation of protected project path requires semantic review: ' + real)
        : allow('routine project-local file edit')
    }
    // 工作区外的敏感 shell / 凭据配置文件（.zshrc/.bashrc/.gitconfig/.env 等）提前交 LLM 审查，不再完全依赖沙箱拦截 + escalation 兜底。
    if (isSensitiveConfigFile(real, roots)) {
      return classify('mutation of a sensitive config file outside the workspace requires semantic review: ' + real)
    }
    return allow('mutation outside the workspace; workspace-write sandbox will block it and offer escalation')
  }

  if (SESSION_STATE_TOOLS.has(name)) return allow('trusted Harness session-state operation')
  if (HARNESS_READ_TOOLS.has(name)) return allow('trusted read-only Harness operation')
  if (ORCHESTRATION_TOOLS.has(name)) return allow('orchestration call; child tool actions remain independently checked')
  if (CODE_EXECUTION_TOOLS.has(name)) return allow('code execution container; inner tool calls are independently checked by policy and sandbox')

  if (EXTERNAL_WRITE_TOOLS.has(name)) return classify('external write requires specific user authorization: ' + name)

  if (DESTRUCTIVE_TOOL_NAME.test(name)) {
    return classify('registered tool name indicates a destructive operation: ' + name)
  }

  if (name === 'terminal_open' || name === 'terminal_send') {
    return classify('stateful terminal execution requires independent classification')
  }

  // 未识别工具一律交 LLM 分类，不默认放行；即使分类器误判 allow，仍有 workspace-write 沙箱兜底文件写入。
  return classify('unrecognized tool requires independent classification: ' + name)
}

/** 常见工具的轨迹摘要字段（按优先级取第一个非空字符串）。 */
const SUMMARY_FIELDS: Record<string, string[]> = {
  bash: ['command', 'description'],
  pwsh: ['command', 'description'],
  read: ['file_path'],
  read_image: ['file_path'],
  write: ['file_path'],
  edit: ['file_path'],
  apply_patch: ['file_path', 'path'],
  glob: ['pattern', 'path'],
  grep: ['pattern', 'path'],
  run_code: ['description'],
  web_search: ['query'],
  web_fetch: ['url'],
}

/** 未命中工具清单时的兜底字段。 */
const SUMMARY_FALLBACK_FIELDS = ['command', 'file_path', 'path', 'pattern', 'description', 'query', 'url', 'repo', 'workdir', 'cwd']

/** 参数摘要：提取工具参数中能识别“是哪个操作”的关键字段，供轨迹标注展示，与工具节点形成对应关系。 */
export function summarizeToolArguments(name: string, args: unknown): string {
  const parsed = record(args)
  if (parsed === undefined) return ''
  const fields = SUMMARY_FIELDS[name] ?? SUMMARY_FALLBACK_FIELDS
  for (const field of fields) {
    const value = parsed[field]
    if (typeof value !== 'string' || value.trim() === '') continue
    const oneLine = value.replace(/\s+/g, ' ').trim()
    return oneLine.length > 80 ? oneLine.slice(0, 80) + '…' : oneLine
  }
  return ''
}

/** 参数是否携带非空 sandbox_permissions（任意工具）：用于缓存提权重试的原始参数供 approval/request 分类器取回。 */
export function hasSandboxEscalation(args: unknown): boolean {
  const parsed = record(args)
  if (parsed === undefined) return false
  const permissions = parsed.sandbox_permissions
  return typeof permissions === 'string' && permissions.trim() !== ''
}

/** 是否为沙箱提权重试：带 sandbox_permissions 的 bash/pwsh 调用交由 DSH 内建 escalation 审批（人工弹窗，不过本插件的 LLM）。 */
export function isSandboxEscalationRetry(name: string, args: unknown): boolean {
  if (name !== 'bash' && name !== 'pwsh') return false
  return hasSandboxEscalation(args)
}
