import { basename } from 'node:path';
import { globStaticPrefix, hardDestructiveTargetReason, isWithin, normalizePath } from './paths.js';
import { noEscalationHint, reasonText } from './i18n.js';
function allow(reason) {
    return { decision: 'allow', reason };
}
function deny(reason) {
    return { decision: 'deny', reason };
}
/** 模糊操作交给 LLM 分类器裁决。 */
function classify(reason) {
    return { decision: 'ask', reason };
}
/** 提权硬 deny 理由：按托管模式区分半自动/全自动；模式缺省时用中性表述（仅直接调用测试路径）。 */
function privilegeReason(mode, locale) {
    const zh = mode === 'semi-auto' ? '半自动模式不允许提权' : mode === 'full-auto' ? '全自动模式不允许提权' : '不允许提权';
    const en = mode === 'semi-auto' ? 'privilege escalation is not permitted in semi-auto mode' : mode === 'full-auto' ? 'privilege escalation is not permitted in full-auto mode' : 'privilege escalation is not permitted';
    return reasonText(locale, zh, en);
}
// ---- 硬 deny 正则（guard 与 pre-execute 共用，确定性零成本） ----
/** 提权命令名（命令分段 + tokenize 识别首命令，覆盖 s'u'do 等引号拼接绕过，且不把参数/文本里的 sudo 误判为提权）。 */
const PRIVILEGE_ESCALATION_COMMANDS = new Set(['sudo', 'doas', 'su']);
/** 自毁 / 系统级破坏命令名（tokenize 后识别，覆盖引号拼接绕过）。 */
const SELF_DESTRUCTIVE_COMMANDS = new Set(['killall', 'pkill', 'taskkill', 'stop-process', 'shutdown', 'reboot', 'halt', 'poweroff', 'mkfs', 'format-volume', 'clear-disk']);
/** 凭据 / 私钥敏感标记（用于外传检测）。 */
const SENSITIVE_MARKER = /(?:\.ssh[\\/]|\.gnupg[\\/]|\.aws[\\/]|\.kube[\\/]|\.credentials\.yaml|id_(?:rsa|ed25519)|(?:API|AUTH|ACCESS|SECRET)[_-]?KEY|TOKEN|PASSWORD)/i;
/** 网络下载 / 外发命令。 */
const NETWORK_COMMAND = /(?:curl|wget|Invoke-WebRequest|Invoke-RestMethod)/i;
/** 确定性硬 deny：不依赖解析器，直接正则熔断。 */
export function hardDenyShellReason(source, _shell, _roots, locale, mode) {
    const compact = source.trim();
    if (containsCommand(compact, PRIVILEGE_ESCALATION_COMMANDS))
        return privilegeReason(mode, locale);
    if (containsCommand(compact, SELF_DESTRUCTIVE_COMMANDS))
        return reasonText(locale, '不允许自毁或系统级命令', 'self-destructive or system-level command is not permitted') + noEscalationHint(locale);
    if (NETWORK_COMMAND.test(compact) && SENSITIVE_MARKER.test(compact))
        return reasonText(locale, '不允许凭据或私密数据外传', 'credential or private-data exfiltration pattern is not permitted') + noEscalationHint(locale);
    if (/rm\s+(?:-[a-z]*[fr][a-z]*\s+)*\/(?:\s|$)/.test(compact))
        return reasonText(locale, '不允许删除文件系统根', 'deleting the filesystem root is not permitted') + noEscalationHint(locale);
    if (/(?:rm|Remove-Item)\s+(?:-[a-z]*[fr][a-z]*\s+)*(?:~|\$HOME|\$env:HOME)(?:\s|$)/i.test(compact))
        return reasonText(locale, '不允许删除用户家目录', 'deleting the user home root is not permitted') + noEscalationHint(locale);
    return undefined;
}
// ---- 简单 tokenize（不追求完整 shell 语义，复杂结构一律不进 allow 快路径） ----
function tokenize(line) {
    const tokens = [];
    let current = '';
    let quote;
    for (const ch of line) {
        if (quote !== undefined) {
            if (ch === quote)
                quote = undefined;
            else
                current += ch;
            continue;
        }
        if (ch === '"' || ch === "'") {
            quote = ch;
            continue;
        }
        if (/\s/.test(ch)) {
            if (current !== '')
                tokens.push(current);
            current = '';
            continue;
        }
        current += ch;
    }
    if (current !== '')
        tokens.push(current);
    return tokens;
}
function commandName(token) {
    return basename(token.replaceAll('\\', '/')).toLowerCase();
}
// ---- 命令分段（按 shell 控制符在引号外切段，识别「命令位置」的首命令） ----
/**
 * 按 shell 命令分隔符（; | & 换行 子 shell 括号，均在引号外）把复合命令切成段。
 * 每段的首个 token 即该段命令名；据此识别提权/自毁命令，避免把 echo/grep 等
 * 命令参数或提示文本里的 sudo/killall 误判为「命令位置」的提权/自毁。
 */
function commandSegments(source) {
    const segments = [];
    let current = '';
    let quote;
    let escaped = false;
    for (const ch of source) {
        if (escaped) {
            current += ch;
            escaped = false;
            continue;
        }
        if (ch === '\\') {
            escaped = true;
            current += ch;
            continue;
        }
        if (quote !== undefined) {
            current += ch;
            if (ch === quote)
                quote = undefined;
            continue;
        }
        if (ch === '"' || ch === "'") {
            quote = ch;
            current += ch;
            continue;
        }
        if (ch === ';' || ch === '|' || ch === '&' || ch === '\n' || ch === '\r' || ch === '(' || ch === ')') {
            if (current.trim() !== '')
                segments.push(current);
            current = '';
            continue;
        }
        current += ch;
    }
    if (current.trim() !== '')
        segments.push(current);
    return segments;
}
/** 任一命令段的首命令名是否命中给定集合（区分「命令位置」与「参数/文本里的同名串」）。 */
function containsCommand(source, commands) {
    for (const segment of commandSegments(source)) {
        const tokens = tokenize(segment);
        const name = commandName(tokens[0] ?? '');
        if (name !== '' && commands.has(name))
            return true;
    }
    return false;
}
// ---- 只读命令白名单（确定只读，零副作用） ----
const BASH_READ_ONLY = new Set([
    'pwd', 'ls', 'cat', 'head', 'tail', 'grep', 'rg', 'egrep', 'fgrep', 'wc', 'od', 'du', 'df',
    'stat', 'file', 'which', 'type', 'echo', 'printf', 'true', 'false', ':', 'test', '[',
    'basename', 'dirname', 'realpath', 'readlink', 'date', 'whoami', 'id', 'hostname', 'uname',
    'printenv', 'sort', 'uniq', 'cut', 'tr', 'nl', 'diff', 'cmp', 'jq', 'tree', 'column',
    'md5sum', 'shasum', 'sha1sum', 'sha256sum',
]);
const PWSH_READ_ONLY = new Set([
    'get-location', 'get-childitem', 'get-content', 'select-string', 'get-item', 'test-path',
    'write-output', 'write-host', 'get-date', 'measure-object', 'select-object', 'sort-object',
]);
/** 删除 / 覆盖 / 移动类命令（危险操作）。 */
const DESTRUCTIVE_COMMANDS = new Set(['rm', 'rmdir', 'unlink', 'shred', 'dd', 'mv', 'remove-item', 'del', 'erase']);
/** 目标可静态确定且落在工作区/临时区内的删除/移动命令，跟随 workspace-write 沙箱直接放行（dd 除外：块设备级，参数形如 if=/of=）。 */
const WORKSPACE_CONFINED_DESTRUCTIVE = new Set(['rm', 'rmdir', 'unlink', 'shred', 'mv', 'remove-item', 'del', 'erase']);
/** 嵌套解释器：内联代码执行。 */
const INTERPRETERS = new Set([
    'node', 'deno', 'bun', 'python', 'python3', 'perl', 'ruby', 'php', 'osascript',
    'sh', 'bash', 'zsh', 'fish', 'ksh', 'dash', 'cmd', 'powershell', 'pwsh', 'eval', 'iex', 'invoke-expression',
]);
function isNestedInterpreter(name, tokens) {
    if (!INTERPRETERS.has(name))
        return false;
    return tokens.some((token, index) => index > 0 && /^(?:-c|-e|-E|--eval|--exec|--command|\/c)$/.test(token));
}
function looksLikePath(token) {
    return token === '~' || token.startsWith('~/') || token.startsWith('./') || token.startsWith('../')
        || token.startsWith('/') || token.startsWith('\\\\') || /^[A-Za-z]:[\\/]/.test(token);
}
function routinePaths(paths, roots) {
    return paths.every((path) => {
        const normalized = normalizePath(path, roots.workspace, roots.home);
        // symlink 加固：以真实落点判定，防止工作区内 symlink 逃逸到区外敏感路径被误判为“区内只读”。
        const real = roots.resolveReal(normalized);
        return isWithin(roots.workspace, real) || roots.tempRoots.some(root => isWithin(root, real));
    });
}
function isBuildOrTest(name, tokens) {
    const first = tokens[1]?.toLowerCase();
    if (['pnpm', 'npm', 'yarn', 'bun'].includes(name)) {
        if (first === 'test')
            return true;
        if (first === 'run')
            return /^(?:build|test|typecheck|check|verify|lint)(?::[\w-]+)?$/.test(tokens[2] ?? '');
        return false;
    }
    if (['tsc', 'vitest', 'eslint', 'pytest', 'jest', 'mocha'].includes(name))
        return true;
    if (['cargo', 'go'].includes(name))
        return ['build', 'test', 'check', 'vet'].includes(first ?? '');
    if (name === 'make')
        return tokens.length === 1 || tokens.slice(1).every(token => /^(?:build|test|check|verify|lint)$/.test(token));
    return false;
}
/**
 * 删除 / 移动类命令：关键路径硬 deny；目标全部落在工作区/临时区内时跟随
 * workspace-write 沙箱直接放行；工作区外的删除直接放行交给沙箱拦截 + escalation。
 */
function assessDestructive(name, tokens, roots, locale) {
    const targets = tokens.slice(1).filter(token => !token.startsWith('-'));
    if (targets.some(token => /[\$\x60]/.test(token))) {
        return classify(reasonText(locale, '破坏性目标动态，需独立分类', 'destructive target is dynamic and requires independent classification'));
    }
    if (targets.length === 0)
        return allow(reasonText(locale, '无法确定破坏性目标；workspace-write 沙箱适用', 'destructive target could not be determined; workspace-write sandbox applies'));
    for (const target of targets) {
        // glob 目标：先对其静态前缀做危险判定，防止 /*、/etc/*、~/*、~/.* 这类绕过精确路径匹配。
        const reason = hardDestructiveTargetReason(globStaticPrefix(target), roots, locale);
        if (reason !== undefined)
            return deny(reasonText(locale, '破坏性操作目标为 ', 'destructive operation targets ') + reason + noEscalationHint(locale));
    }
    // dd 是块设备级操作，参数形如 if=/of=，静态路径判定不可靠，交 LLM 分类。
    if (name === 'dd')
        return classify(reasonText(locale, 'dd 块设备操作需独立分类', 'dd block-device operation requires independent classification'));
    const confined = WORKSPACE_CONFINED_DESTRUCTIVE.has(name) && targets.every((target) => {
        const normalized = normalizePath(target, roots.workspace, roots.home);
        // symlink 加固：以真实落点判定，工作区内 symlink 逃逸到区外时不再按“区内删除”放行。
        const real = roots.resolveReal(normalized);
        return isWithin(roots.workspace, real) || roots.tempRoots.some(root => isWithin(root, real));
    });
    if (confined)
        return allow(reasonText(locale, '破坏性操作限于工作区或临时区；workspace-write 沙箱适用', 'destructive operation confined to the workspace or temporary area; workspace-write sandbox applies'));
    return allow(reasonText(locale, '工作区外的破坏性操作；workspace-write 沙箱将拦截并提供提权', 'destructive operation outside the workspace; workspace-write sandbox will block it and offer escalation'));
}
/** 主入口：先硬 deny，再按命令分类，复杂/动态结构一律 fail-closed。 */
export function assessShell(source, shell, roots, locale, mode) {
    const hard = hardDenyShellReason(source, shell, roots, locale, mode);
    if (hard !== undefined)
        return deny(hard);
    const compact = source.trim();
    // 复杂 shell 结构：命令替换、here-doc、管道、重定向、复合、分组、进程替换。
    if (/\$\(|[\x60]|<<|&&|\|\||;|\||[<>]|\(|\)|\{|\}|\[\[/.test(compact)) {
        if (/\b(?:rm|rmdir|unlink|shred|dd|mkfs|remove-item)\b/.test(compact)) {
            return classify(reasonText(locale, '破坏性复合 shell 命令需独立分类', 'destructive compound shell command requires independent classification'));
        }
        return classify(reasonText(locale, '复合 shell 命令需独立分类', 'compound shell command requires independent classification'));
    }
    const tokens = tokenize(compact);
    const rawName = tokens[0] ?? '';
    if (rawName === '')
        return allow(reasonText(locale, '命令行不含命令', 'command line contains no command'));
    if (/[\$\x60]/.test(rawName))
        return allow(reasonText(locale, '命令名由动态展开产生；workspace-write 沙箱适用', 'command name is produced by a dynamic expansion; workspace-write sandbox applies'));
    const name = commandName(rawName);
    // 提权/自毁命令：硬 deny 分段识别之外再按首命令兜底（s'u'do 等引号拼接仍确定性拒绝）。
    if (PRIVILEGE_ESCALATION_COMMANDS.has(name))
        return deny(privilegeReason(mode, locale));
    if (SELF_DESTRUCTIVE_COMMANDS.has(name))
        return deny(reasonText(locale, '不允许自毁或系统级命令', 'self-destructive or system-level command is not permitted') + noEscalationHint(locale));
    if (isNestedInterpreter(name, tokens)) {
        if (/\b(?:rm|rmdir|unlink|shred|os\.(?:remove|unlink)|shutil\.rmtree|file\.delete)\b/.test(compact)) {
            return classify(reasonText(locale, '破坏性嵌套解释器代码需独立分类', 'destructive nested interpreter code requires independent classification'));
        }
        return classify(reasonText(locale, '嵌套解释器执行需独立分类', 'nested interpreter execution requires independent classification'));
    }
    if (DESTRUCTIVE_COMMANDS.has(name))
        return assessDestructive(name, tokens, roots, locale);
    if (name === 'find') {
        if (/-(?:delete|exec|execdir|ok|okdir)\b/.test(compact))
            return classify(reasonText(locale, '带变更动作的 find 需独立分类', 'find with a mutating action requires independent classification'));
        const paths = tokens.slice(1).filter(token => looksLikePath(token));
        return paths.length === 0 || routinePaths(paths, roots)
            ? allow(reasonText(locale, '工作区或临时区内的只读 find', 'read-only find inside the workspace or temporary area'))
            : classify(reasonText(locale, 'find 引用了外部或受保护路径', 'find references an external or protected path'));
    }
    const readOnly = shell === 'bash' ? BASH_READ_ONLY : PWSH_READ_ONLY;
    if (readOnly.has(name)) {
        const paths = tokens.slice(1).filter(token => looksLikePath(token));
        return paths.length === 0 || routinePaths(paths, roots)
            ? allow(reasonText(locale, '工作区或临时区内的静态只读命令', 'static read-only command inside the workspace or temporary area'))
            : classify(reasonText(locale, '只读命令引用了外部或受保护路径', 'read-only command references an external or protected path'));
    }
    if (name === 'git') {
        const sub = tokens[1]?.toLowerCase();
        if (['status', 'diff', 'log', 'show', 'rev-parse', 'ls-files', 'blame'].includes(sub))
            return allow(reasonText(locale, '只读 git 检查', 'read-only git inspection'));
        if (['reset', 'clean', 'commit', 'push', 'rebase', 'checkout', 'switch', 'branch', 'tag', 'merge'].includes(sub)) {
            return classify(reasonText(locale, 'git 状态变更命令需独立分类', 'Git state-changing command requires independent classification'));
        }
        return classify(reasonText(locale, 'git 命令需独立分类', 'git command requires independent classification'));
    }
    if (tokens.length === 2 && ['--version', '-v', 'version'].includes(tokens[1]?.toLowerCase() ?? '')) {
        return allow(reasonText(locale, '开发工具版本探测', 'development-tool version probe'));
    }
    if (isBuildOrTest(name, tokens))
        return allow(reasonText(locale, '已识别的项目构建、测试或校验命令', 'recognized project build, test, or verification command'));
    if (['curl', 'wget', 'ssh', 'scp', 'rsync', 'ftp', 'nc', 'netcat'].includes(name)) {
        return classify(reasonText(locale, '网络操作需独立分类', 'network operation requires independent classification'));
    }
    if (['psql', 'mysql', 'mongosh', 'redis-cli', 'kubectl', 'terraform', 'ansible', 'systemctl', 'launchctl', 'createdb', 'dropdb'].includes(name)) {
        return classify(reasonText(locale, '数据库、服务或基础设施操作需独立分类', 'database, service, or infrastructure operation requires independent classification'));
    }
    return classify(reasonText(locale, '未识别的 shell 命令需独立分类：', 'unrecognized shell command requires independent classification: ') + name);
}
