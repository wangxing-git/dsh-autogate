import { describe, expect, it } from 'vitest'
import type { ToolExecution } from '@deepseek-ai/dsh-tools'
import { resolveRoots } from '../src/paths.js'
import { assessTool, hardDenyReason, hasSandboxEscalation, isSandboxEscalationRetry, summarizeToolArguments } from '../src/policy.js'

const roots = resolveRoots('/ws', { home: '/home/u', dshHome: '/home/u/.dsh' })

function execution(name: string, args: unknown): ToolExecution {
  return { name, arguments: args, agent: undefined, signal: new AbortController().signal } as unknown as ToolExecution
}

describe('assessTool 持久终端', () => {
  it('terminal_open 过 LLM 分类', () => {
    const assessment = assessTool(execution('terminal_open', {}), roots)
    expect(assessment.decision).toBe('ask')
  })
  it('terminal_send 过 LLM 分类', () => {
    const assessment = assessTool(execution('terminal_send', { command: 'ls' }), roots)
    expect(assessment.decision).toBe('ask')
  })
})

describe('assessTool 兜底放行', () => {
  it('bash 缺少 command 交给沙箱兜底放行', () => {
    const assessment = assessTool(execution('bash', {}), roots)
    expect(assessment.decision).toBe('allow')
    expect(assessment.reason).toContain('workspace-write sandbox applies')
  })
  it('write 缺少路径交给沙箱兜底放行', () => {
    const assessment = assessTool(execution('write', { content: 'x' }), roots)
    expect(assessment.decision).toBe('allow')
    expect(assessment.reason).toContain('workspace-write sandbox applies')
  })
  it('write 工作区外交给沙箱放行', () => {
    const assessment = assessTool(execution('write', { file_path: '/external/x', content: 'y' }), roots)
    expect(assessment.decision).toBe('allow')
    expect(assessment.reason).toContain('workspace-write sandbox will block it and offer escalation')
  })
  it('write 工作区外敏感配置文件交 LLM', () => {
    const assessment = assessTool(execution('write', { file_path: '/home/u/.zshrc', content: 'y' }), roots)
    expect(assessment.decision).toBe('ask')
    expect(assessment.reason).toContain('sensitive config file')
  })
  it('write 工作区内受保护路径交 LLM', () => {
    const assessment = assessTool(execution('write', { file_path: '/ws/.git/config', content: 'y' }), roots)
    expect(assessment.decision).toBe('ask')
  })
})

describe('assessTool 只读工具', () => {
  it('read 工作区内直接放行', () => {
    expect(assessTool(execution('read', { file_path: '/ws/a.ts' }), roots).decision).toBe('allow')
  })
  it('read 工作区外普通路径直接放行', () => {
    expect(assessTool(execution('read', { file_path: '/external/x.ts' }), roots).decision).toBe('allow')
  })
  it('read 工作区外敏感路径交 LLM 审查', () => {
    expect(assessTool(execution('read', { file_path: '/home/u/.ssh/id_rsa' }), roots).decision).toBe('ask')
  })
})

describe('assessTool 代码执行容器', () => {
  it('run_code 直接放行（内部工具调用各自受评估）', () => {
    expect(assessTool(execution('run_code', { code: 'x', description: 'y' }), roots).decision).toBe('allow')
  })
})

describe('summarizeToolArguments', () => {
  it('bash 提取 command', () => {
    expect(summarizeToolArguments('bash', { command: 'pwd && ls' })).toBe('pwd && ls')
  })
  it('read 提取 file_path', () => {
    expect(summarizeToolArguments('read', { file_path: '/ws/src/index.ts' })).toBe('/ws/src/index.ts')
  })
  it('run_code 提取 description', () => {
    expect(summarizeToolArguments('run_code', { code: 'x', description: '测试' })).toBe('测试')
  })
  it('多行 command 压成单行并截断到 80 字符', () => {
    const long = 'a'.repeat(100)
    const summary = summarizeToolArguments('bash', { command: 'echo ' + long + '\nls' })
    expect(summary).toHaveLength(81)
    expect(summary.endsWith('…')).toBe(true)
    expect(summary.includes('\n')).toBe(false)
  })
  it('空参数返回空串', () => {
    expect(summarizeToolArguments('bash', {})).toBe('')
    expect(summarizeToolArguments('bash', null)).toBe('')
    expect(summarizeToolArguments('unknown', {})).toBe('')
  })
  it('未知工具走兜底字段', () => {
    expect(summarizeToolArguments('mystery', { pattern: '*.ts' })).toBe('*.ts')
  })
})

describe('isSandboxEscalationRetry', () => {
  it('识别带 sandbox_permissions 的 bash 调用', () => {
    expect(isSandboxEscalationRetry('bash', { command: 'rm /x', sandbox_permissions: 'danger-full-access', justification: '需要' })).toBe(true)
  })
  it('普通 bash 调用不是提权重试', () => {
    expect(isSandboxEscalationRetry('bash', { command: 'rm /x' })).toBe(false)
  })
  it('非 bash/pwsh 工具不是提权重试', () => {
    expect(isSandboxEscalationRetry('write', { file_path: '/x', sandbox_permissions: 'danger-full-access' })).toBe(false)
  })
})

describe('assessTool 会话 / 编排 / 查询工具白名单', () => {
  it('会话状态工具放行', () => {
    expect(assessTool(execution('todo_write', { todos: [] }), roots).decision).toBe('allow')
    expect(assessTool(execution('ask_user_question', { questions: [] }), roots).decision).toBe('allow')
    expect(assessTool(execution('create_goal', { objective: 'x' }), roots).decision).toBe('allow')
  })
  it('Harness 只读查询放行', () => {
    expect(assessTool(execution('job_output', { job_id: 'j' }), roots).decision).toBe('allow')
    expect(assessTool(execution('job_list', {}), roots).decision).toBe('allow')
  })
  it('编排工具放行（子调用独立评估）', () => {
    expect(assessTool(execution('subagent', { prompt: 'x' }), roots).decision).toBe('allow')
    expect(assessTool(execution('list_agents', {}), roots).decision).toBe('allow')
    expect(assessTool(execution('workflow', { script: 'x', meta: {} }), roots).decision).toBe('allow')
  })
})

describe('assessTool 外部写工具与破坏性工具名', () => {
  it('外部写工具过 LLM 分类', () => {
    expect(assessTool(execution('git_push', {}), roots).decision).toBe('ask')
    expect(assessTool(execution('deploy', {}), roots).decision).toBe('ask')
    expect(assessTool(execution('publish', {}), roots).decision).toBe('ask')
  })
  it('破坏性工具名过 LLM 分类', () => {
    expect(assessTool(execution('delete_file', { file_path: '/ws/a' }), roots).decision).toBe('ask')
    expect(assessTool(execution('db_reset', {}), roots).decision).toBe('ask')
  })
})

describe('hardDenyReason 凭据外传与关键路径写', () => {
  it('外发调用携带 Bearer 凭据硬拒绝', () => {
    const reason = hardDenyReason(execution('web_search', { query: 'x', headers: { Authorization: 'Bearer abcdefghijklmnop' } }), roots)
    expect(reason).toContain('credential')
  })
  it('外部写工具携带 token 硬拒绝', () => {
    expect(hardDenyReason(execution('git_push', { token: 'ghp_abcdefghijklmnopqrst' }), roots)).toContain('credential')
  })
  it('破坏性工具名命中关键路径硬拒绝', () => {
    expect(hardDenyReason(execution('delete_file', { file_path: '/etc/passwd' }), roots)).toContain('destructive tool targets')
  })
  it('写工具命中关键路径硬拒绝', () => {
    expect(hardDenyReason(execution('write', { file_path: '~/.ssh/id_rsa', content: 'x' }), roots)).toContain('mutation targets')
  })
  it('无凭据外发不拒绝', () => {
    expect(hardDenyReason(execution('web_search', { query: 'hello' }), roots)).toBeUndefined()
  })
  it('不可序列化参数（BigInt）不抛错且不误判为凭据', () => {
    const exec = execution('web_search', { n: 1n })
    expect(() => hardDenyReason(exec, roots)).not.toThrow()
    expect(hardDenyReason(exec, roots)).toBeUndefined()
  })
})

describe('locale 中文理由', () => {
  it('hardDenyReason zh：关键路径写返回中文', () => {
    expect(hardDenyReason(execution('delete_file', { file_path: '/etc/passwd' }), roots, 'zh')).toContain('破坏性工具目标为')
    expect(hardDenyReason(execution('write', { file_path: '~/.ssh/id_rsa', content: 'x' }), roots, 'zh')).toContain('变更目标为')
  })
  it('assessTool zh：读工作区外关键路径', () => {
    const a = assessTool(execution('read', { file_path: '/etc/passwd' }), roots, 'zh')
    expect(a.decision).toBe('ask')
    expect(a.reason).toContain('读取工作区外关键路径')
  })
  it('assessTool zh：bash 缺参数返回中文兜底', () => {
    expect(assessTool(execution('bash', {}), roots, 'zh').reason).toContain('命令参数缺失或无效')
  })
})

describe('hasSandboxEscalation', () => {
  it('识别非空 sandbox_permissions', () => {
    expect(hasSandboxEscalation({ sandbox_permissions: 'danger-full-access' })).toBe(true)
  })
  it('空 / 缺失 / 非对象不算提权', () => {
    expect(hasSandboxEscalation({ sandbox_permissions: '' })).toBe(false)
    expect(hasSandboxEscalation({})).toBe(false)
    expect(hasSandboxEscalation(null)).toBe(false)
  })
})

describe('assessTool symlink 逃逸加固', () => {
  const base = { home: '/home/u', dshHome: '/home/u/.dsh' }
  const linkTo = (link: string, target: string) => (p: string) =>
    p === link ? target : p.startsWith(link + '/') ? target + p.slice(link.length) : p
  it('write 工作区内 symlink 逃逸到区外普通路径 → 交给沙箱放行', () => {
    const roots = resolveRoots('/ws', base, linkTo('/ws/link', '/external'))
    const assessment = assessTool(execution('write', { file_path: '/ws/link/x', content: 'y' }), roots)
    expect(assessment.decision).toBe('allow')
    expect(assessment.reason).toContain('workspace-write sandbox will block it and offer escalation')
  })
  it('write 工作区内 symlink 逃逸到区外敏感配置 → 交 LLM', () => {
    const roots = resolveRoots('/ws', base, linkTo('/ws/link', '/home/u'))
    const assessment = assessTool(execution('write', { file_path: '/ws/link/.zshrc', content: 'y' }), roots)
    expect(assessment.decision).toBe('ask')
    expect(assessment.reason).toContain('sensitive config file')
  })
  it('read 工作区内 symlink 逃逸到区外敏感路径 → 交 LLM', () => {
    const roots = resolveRoots('/ws', base, linkTo('/ws/link', '/home/u'))
    const assessment = assessTool(execution('read', { file_path: '/ws/link/.ssh/id_rsa' }), roots)
    expect(assessment.decision).toBe('ask')
    expect(assessment.reason).toContain('critical path')
  })
})
