import z from '@deepseek-ai/schemastery';
import { CLASSIFIER_SYSTEM_PROMPT, createDshClassifier, createHttpClassifier, extractEscalationJustification, isEscalationApprovalReason, sanitizeClassifierArguments, sanitizeClassifierText, sanitizeClassifierTextTail } from './classifier.js';
import { resolveRoots } from './paths.js';
import { assessTool, hardDenyReason, isSandboxEscalationRetry, summarizeToolArguments } from './policy.js';
import { setApprovalPolicy } from '@deepseek-ai/dsh-user-approval';
import { createApprovalTrail } from './trail.js';
export * from './paths.js';
export * from './policy.js';
export * from './shell.js';
export * from './classifier.js';
export * from './trail.js';
export const name = 'autogate';
export const inject = ['tools', 'llm'];
/** 从 trail 查询载荷提取 sessionId（非空字符串）；缺失或非法时返回 undefined，表示不过滤。 */
function trailSessionId(payload) {
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload))
        return undefined;
    const value = payload.sessionId;
    return typeof value === 'string' && value !== '' ? value : undefined;
}
/** 半自动权限预设键（自动但危险时转人工兜底弹窗；默认档）。 */
export const SEMI_AUTO_PERMISSION_PRESET = 'auto-ask';
/** 全自动权限预设键（LLM 全权裁决，不再人工兜底弹窗）。 */
export const AUTO_PERMISSION_PRESET = 'auto';
export const Config = z.object({
    presetName: z.string().default(SEMI_AUTO_PERMISSION_PRESET).description('半自动权限预设键（默认 auto-ask）：危险操作转人工兜底弹窗'),
    workspaceRoot: z.string().description('覆盖工作区根目录（默认取会话 cwd）'),
    tempRoots: z.array(z.string()).description('信任的临时目录列表（默认系统临时目录）'),
    classifierEndpoint: z.string().description('独立 OpenAI 兼容分类端点（HTTPS；loopback 可用 http）'),
    classifierProvider: z.string().description('固定分类 provider（须与 classifierModel 成对配置）'),
    classifierModel: z.string().description('固定分类模型（须与 classifierProvider 成对配置）'),
    classifierPrompt: z.string().default(CLASSIFIER_SYSTEM_PROMPT).description('审查（分类）系统提示词'),
    classifierApiKeyEnv: z.string().default('DEEPSEEK_API_KEY').pattern(/^[A-Za-z_][A-Za-z0-9_]*$/).description('HTTP 分类端点 API Key 的环境变量名'),
    classifierTimeoutMs: z.number().default(8_000).min(100).max(60_000).description('分类器超时毫秒数，超时 fail-closed'),
    classifierMaxOutputTokens: z.number().default(1_024).min(64).max(4_096).description('分类器输出 token 上限'),
    classifierRetry: z.boolean().default(true).description('分类器输出解析失败时静默重试一次；默认开启'),
    classifierHttpDisableReasoning: z.boolean().default(true).description('HTTP 分类端点请求显式关闭思考模式（reasoning_effort=none）；端点不支持该参数时关闭'),
    proposalContextMaxMessageLen: z.natural().default(10).min(1).max(200).description('短指代消息长度阈值（字符）：长度不超过该值才携带 AI 提议上下文；默认 10'),
    proposalContextMaxChars: z.natural().default(400).min(64).max(4_000).description('单条 AI 提议上下文上限（字符）；默认 400'),
    proposalContextMaxTotalChars: z.natural().default(2_000).min(64).max(8_000).description('AI 提议上下文总预算（字符）；默认 2000'),
    preflight: z.boolean().default(false).description('沙盒前拦截判断开关：开启执行确定性规则与 LLM 分类，关闭则完全依赖沙盒策略（硬 deny 与提权审批不受影响）'),
    showTrail: z.boolean().default(true).description('审批轨迹浮窗开关：默认显示；关闭则不显示浮窗且客户端停止轮询轨迹接口'),
    fullAutoPresetName: z.string().default(AUTO_PERMISSION_PRESET).description('全自动权限预设键（默认 auto）：该预设下审批不再人工弹窗，LLM 裁决为最终决定'),
});
/** 从会话事件倒序解析最近一次 permission/preset 选择（对齐 dsh-permission-presets 的投影语义）。 */
function effectivePermissionPreset(events) {
    for (let index = events.length - 1; index >= 0; index -= 1) {
        const event = events[index];
        if (event.type === 'permission/preset' && typeof event.data?.preset === 'string')
            return event.data.preset;
    }
    return undefined;
}
/** 当前会话是否使用 Auto 权限预设。 */
export function isAutoPermissionExecution(exec, presetName = AUTO_PERMISSION_PRESET) {
    const events = exec.agent?.session.snapshotEvents();
    return events !== undefined && effectivePermissionPreset(events) === presetName;
}
/**
 * 解析授权本次执行的 Auto 会话。
 * DSH 把子代理 approval pin 到 never，因此沿 durable parentSession 链继承 Auto，
 * 否则子代理的工具调用会在 Auto 会话中被一刀切拒绝。
 */
export function autoPermissionAuthority(exec, parentAgent, presetName = AUTO_PERMISSION_PRESET) {
    if (isAutoPermissionExecution(exec, presetName))
        return exec.agent;
    let session = exec.agent?.session;
    const visited = new Set();
    while (session?.header?.origin === 'subagent' && session.header.parentSession !== undefined) {
        const parentSessionId = session.header.parentSession;
        const parentKey = String(parentSessionId);
        if (visited.has(parentKey))
            return undefined;
        visited.add(parentKey);
        const parent = parentAgent(parentSessionId);
        if (parent === undefined)
            return undefined;
        const parentExec = { ...exec, agent: parent };
        if (isAutoPermissionExecution(parentExec, presetName))
            return parent;
        session = parent.session;
    }
    return undefined;
}
/** 沿 durable parentSession 链解析执行所属的托管权限：返回授权 agent 与模式，未命中返回 undefined。 */
export function managedPermissionAuthority(agent, parentAgent, semiPreset = SEMI_AUTO_PERMISSION_PRESET, fullPreset = AUTO_PERMISSION_PRESET) {
    const modeOf = (target) => {
        const events = target?.session.snapshotEvents();
        if (events === undefined)
            return undefined;
        const preset = effectivePermissionPreset(events);
        if (preset === semiPreset)
            return 'semi-auto';
        if (preset === fullPreset)
            return 'full-auto';
        return undefined;
    };
    const direct = modeOf(agent);
    if (direct !== undefined && agent !== undefined)
        return { agent, mode: direct };
    let session = agent?.session;
    const visited = new Set();
    while (session?.header?.origin === 'subagent' && session.header.parentSession !== undefined) {
        const parentSessionId = session.header.parentSession;
        const parentKey = String(parentSessionId);
        if (visited.has(parentKey))
            return undefined;
        visited.add(parentKey);
        const parent = parentAgent(parentSessionId);
        if (parent === undefined)
            return undefined;
        const mode = modeOf(parent);
        if (mode !== undefined)
            return { agent: parent, mode };
        session = parent.session;
    }
    return undefined;
}
/** 从配置构造根路径选项：空 tempRoots 归一化为默认（系统临时目录）。 */
function rootOptionsFrom(config) {
    const tempRoots = config.tempRoots === undefined || config.tempRoots.length === 0 ? undefined : config.tempRoots;
    return {
        ...(config.workspaceRoot === undefined ? {} : { workspaceRoot: config.workspaceRoot }),
        ...(tempRoots === undefined ? {} : { tempRoots }),
    };
}
/** schema 无法表达的跨字段/协议约束；settings 写入时拒绝非法配置。 */
function validateConfig(config) {
    const hasProvider = config.classifierProvider !== undefined && config.classifierProvider !== '';
    const hasModel = config.classifierModel !== undefined && config.classifierModel !== '';
    if (hasProvider !== hasModel)
        throw new Error('classifierProvider 与 classifierModel 必须成对配置');
    if (config.presetName !== undefined && config.presetName === config.fullAutoPresetName) {
        throw new Error('presetName 与 fullAutoPresetName 不能相同');
    }
    if (config.classifierEndpoint !== undefined && config.classifierEndpoint.trim() !== '') {
        const endpoint = new URL(config.classifierEndpoint);
        const loopback = ['localhost', '127.0.0.1', '::1'].includes(endpoint.hostname);
        if (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && loopback)) {
            throw new Error('classifierEndpoint 必须使用 HTTPS（loopback 可用 HTTP）');
        }
    }
}
function classifierFrom(ctx, config, locale) {
    const timeoutMs = config.classifierTimeoutMs ?? 8_000;
    const systemPrompt = config.classifierPrompt === undefined || config.classifierPrompt.trim() === '' ? undefined : config.classifierPrompt;
    if (!Number.isFinite(timeoutMs) || timeoutMs < 100 || timeoutMs > 60_000) {
        throw new Error('classifierTimeoutMs must be between 100 and 60000');
    }
    const maxOutputTokens = config.classifierMaxOutputTokens ?? 1_024;
    if (!Number.isInteger(maxOutputTokens) || maxOutputTokens < 64 || maxOutputTokens > 4_096) {
        throw new Error('classifierMaxOutputTokens must be an integer between 64 and 4096');
    }
    if (config.classifierEndpoint === undefined || config.classifierEndpoint.trim() === '') {
        return createDshClassifier(ctx.llm, {
            timeoutMs,
            maxOutputTokens,
            systemPrompt,
            locale,
            ...(config.classifierProvider === undefined ? {} : { provider: config.classifierProvider }),
            ...(config.classifierModel === undefined ? {} : { model: config.classifierModel }),
            retryOnFailure: config.classifierRetry ?? true,
        });
    }
    const endpoint = new URL(config.classifierEndpoint);
    const loopback = ['localhost', '127.0.0.1', '::1'].includes(endpoint.hostname);
    if (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && loopback)) {
        throw new Error('classifierEndpoint must use HTTPS (HTTP is accepted only for a loopback test service)');
    }
    const envName = config.classifierApiKeyEnv ?? 'DEEPSEEK_API_KEY';
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(envName))
        throw new Error('classifierApiKeyEnv must be an environment-variable name');
    const apiKey = process.env[envName];
    return createHttpClassifier({
        endpoint: endpoint.href,
        model: config.classifierModel ?? 'deepseek-chat',
        systemPrompt,
        locale,
        ...(apiKey === undefined || apiKey === '' ? {} : { apiKey }),
        timeoutMs,
        retryOnFailure: config.classifierRetry ?? true,
        disableReasoning: config.classifierHttpDisableReasoning ?? true,
    });
}
function modelRoute(agent) {
    const session = agent?.session;
    const request = session?.requestHeader?.()?.config;
    if (request !== undefined)
        return { provider: request.provider, model: request.model };
    const provider = agent?.options?.provider;
    const model = agent?.options?.model;
    return provider === undefined || model === undefined ? undefined : { provider, model };
}
function trustedUserMessages(authority, limits) {
    if (authority === undefined)
        return { messages: [], contexts: [] };
    let remaining = 4_000;
    // 第一阶段（从前往后）：建立 ask_user_question 的问答对映射。DSH 中 ask_user_question 经 run_code 间接调用，
    // 问题与回答一并落在 tool/code-dispatch 事件（arguments 为已解析对象、content 为标准 answers JSON）；
    // 直接调用场景则问题随 tool/call 落盘、回答随 tool/result 落盘，二者按 callId 配对。
    // 同时记录每条直接人类消息紧邻前的 assistant 文本，作为指代消解上下文。
    const askQuestions = new Map();
    const dispatchQa = new Map();
    const proposalContexts = new Map();
    let lastAssistant = '';
    const events = authority.session.snapshotEvents();
    for (let index = 0; index < events.length; index += 1) {
        const event = events[index];
        if (event?.type === 'tool/call' && event.data.name === 'ask_user_question') {
            const text = askUserQuestionsText(event.data.arguments);
            if (text !== '')
                askQuestions.set(String(event.data.callId), text);
            continue;
        }
        if (event?.type === 'tool/code-dispatch' && event.data.name === 'ask_user_question') {
            const question = askUserQuestionsText(event.data.arguments);
            const answer = askUserAnswerTextFromDispatch(event.data.content);
            if (question !== '' || answer !== '') {
                const combined = question === ''
                    ? '[ask_user_question] 回答: ' + answer
                    : '[ask_user_question] 问题: ' + question + '；回答: ' + answer;
                dispatchQa.set(index, combined);
            }
            continue;
        }
        if (event?.type === 'assistant/message') {
            const text = assistantMessageText(event.data.message);
            if (text !== '')
                lastAssistant = text;
            continue;
        }
        if (event?.type === 'user/message' && event.data.source.kind === 'user') {
            proposalContexts.set(index, lastAssistant);
        }
    }
    const collected = [];
    for (let index = events.length - 1; index >= 0 && collected.length < 8 && remaining > 0; index -= 1) {
        const event = events[index];
        if (event?.type === 'user/message' && event.data.source.kind === 'user') {
            const text = event.data.content
                .filter((block) => block.type === 'text')
                .map(block => block.text)
                .join('\n')
                .trim();
            if (text === '')
                continue;
            const sanitized = sanitizeClassifierText(text).slice(0, remaining);
            collected.push({ sanitized, short: text.length <= limits.maxMessageLen, proposal: proposalContexts.get(index) ?? '' });
            remaining -= sanitized.length;
            continue;
        }
        if (dispatchQa.has(index)) {
            const sanitized = sanitizeClassifierText(dispatchQa.get(index) ?? '').slice(0, remaining);
            collected.push({ sanitized, short: false, proposal: '' });
            remaining -= sanitized.length;
            continue;
        }
        if (event?.type === 'tool/result') {
            const question = askQuestions.get(String(event.data.message.source.callId));
            // 只有确认该 tool/result 是 ask_user_question 直接调用的结果（tool/call 已落盘配对）才提取回答，
            // 避免从任意工具输出（如 run_code 的 stdout）误提取 answers 伪造用户授权。
            if (question === undefined)
                continue;
            const answer = askUserAnswerText(event.data.message);
            if (answer === '')
                continue;
            const combined = '[ask_user_question] 问题: ' + question + '；回答: ' + answer;
            const sanitized = sanitizeClassifierText(combined).slice(0, remaining);
            collected.push({ sanitized, short: false, proposal: '' });
            remaining -= sanitized.length;
        }
    }
    // 第三阶段（从旧到新）：按「同一 AI 回复后的连续消息」分组决定 proposal 上下文归属。
    // 组内只要有短指代需要消解，就只给组内最早（第一条）消息附上下文——不管第一条本身长短；
    // 其余消息不附，避免同一 proposal 被重复拼接浪费 token。截断保留末尾，保证 AI 最后的问询授权不被丢弃。
    const ordered = collected.reverse();
    const messages = ordered.map(item => item.sanitized);
    const contexts = new Array(ordered.length).fill('');
    let contextBudget = limits.maxTotalChars;
    for (let i = 0; i < ordered.length; i += 1) {
        const proposal = ordered[i].proposal;
        if (proposal === '')
            continue;
        let j = i;
        while (j < ordered.length && ordered[j].proposal === proposal)
            j += 1;
        const needsContext = ordered.slice(i, j).some(item => item.short);
        if (needsContext && contextBudget > 0) {
            contexts[i] = sanitizeClassifierTextTail(proposal, limits.maxChars).slice(-contextBudget);
            contextBudget -= contexts[i].length;
        }
        i = j - 1;
    }
    return { messages, contexts };
}
/** 从 assistant/message 事件提取纯文本（仅 text block，忽略 tool-call 等其他块）。 */
function assistantMessageText(message) {
    if (typeof message !== 'object' || message === null)
        return '';
    const content = message.content;
    if (!Array.isArray(content))
        return '';
    return content
        .filter((block) => typeof block === 'object' && block !== null &&
        block.type === 'text' &&
        typeof block.text === 'string')
        .map(block => block.text)
        .join('\n')
        .trim();
}
/** 从 ask_user_question 的调用参数提取问题文本：tool/call 为未解析 JSON 字符串，tool/code-dispatch 为已解析对象。 */
function askUserQuestionsText(rawArguments) {
    let parsed;
    if (typeof rawArguments === 'string') {
        try {
            parsed = JSON.parse(rawArguments);
        }
        catch {
            return '';
        }
    }
    else {
        parsed = rawArguments;
    }
    if (typeof parsed !== 'object' || parsed === null)
        return '';
    const questions = parsed.questions;
    if (!Array.isArray(questions))
        return '';
    const parts = [];
    for (const question of questions) {
        if (typeof question !== 'object' || question === null)
            continue;
        const item = question;
        const title = typeof item.question === 'string' ? item.question.trim() : '';
        const header = typeof item.header === 'string' ? item.header.trim() : '';
        const options = Array.isArray(item.options)
            ? item.options
                .filter((option) => typeof option === 'object' && option !== null)
                .map(option => {
                const label = typeof option.label === 'string' ? option.label.trim() : '';
                if (label === '')
                    return '';
                const description = typeof option.description === 'string' ? option.description.trim() : '';
                return description === '' ? label : label + '（' + description + '）';
            })
                .filter(text => text !== '')
            : [];
        if (title === '' && header === '' && options.length === 0)
            continue;
        let text = title;
        if (header !== '')
            text = header + (text === '' ? '' : ': ') + text;
        if (options.length > 0)
            text += ' (选项: ' + options.join('/') + ')';
        parts.push(text);
    }
    return parts.join('；');
}
/** 从一组内容块里递归提取 ask_user_question 的回答文本（answers 以 compact JSON 文本嵌在 text block 中）。 */
function askUserAnswerTextFromBlocks(blocks) {
    if (!Array.isArray(blocks))
        return '';
    for (const block of blocks) {
        if (typeof block !== 'object' || block === null)
            continue;
        const entry = block;
        if (entry.type === 'text' && typeof entry.text === 'string') {
            let parsed;
            try {
                parsed = JSON.parse(entry.text);
            }
            catch {
                parsed = undefined;
            }
            if (typeof parsed === 'object' && parsed !== null) {
                const answers = parsed.answers;
                if (Array.isArray(answers)) {
                    const text = formatAskUserAnswers(answers);
                    if (text !== '')
                        return text;
                }
            }
        }
        // 嵌套 content（tool/result 的 tool-result 块内含 content 数组）。
        const nested = entry.content;
        if (nested !== undefined) {
            const text = askUserAnswerTextFromBlocks(nested);
            if (text !== '')
                return text;
        }
    }
    return '';
}
/** 从 ask_user_question 的 tool/result 消息提取回答文本（答案以 compact JSON 文本呈现）。 */
function askUserAnswerText(message) {
    if (typeof message !== 'object' || message === null)
        return '';
    return askUserAnswerTextFromBlocks(message.content);
}
/** 从 ask_user_question 的 tool/code-dispatch 结果 content 提取回答文本。 */
function askUserAnswerTextFromDispatch(content) {
    return askUserAnswerTextFromBlocks(content);
}
/** 把 ask_user_question 的回答列表格式化为可读文本。 */
function formatAskUserAnswers(answers) {
    const parts = [];
    for (const answer of answers) {
        if (typeof answer !== 'object' || answer === null)
            continue;
        const item = answer;
        const id = typeof item.id === 'string' ? item.id : '';
        const selected = Array.isArray(item.selected)
            ? item.selected.filter((value) => typeof value === 'string')
            : [];
        const custom = typeof item.custom === 'string' ? item.custom.trim() : '';
        const pieces = [];
        if (selected.length > 0)
            pieces.push(selected.join(', '));
        if (custom !== '')
            pieces.push('custom: ' + custom);
        if (pieces.length === 0)
            continue;
        parts.push(id === '' ? pieces.join('；') : id + ': ' + pieces.join('；'));
    }
    return parts.join(' | ');
}
/**
 * 从会话事件按 callId 查找工具调用的原始参数（tool/call 事件的 arguments 为模型产出的未解析 JSON 字符串）。
 * 工具自身声明需要审批（pre-execute 返回 ask）时，若 autogate 的 pre-execute 监听器被更早注册的
 * 监听器短路而未执行，pendingApprovalArgs 里没有缓存——此时 tool/call 事件已在派发前落盘，
 * 从会话事件取回参数仍能让分类器评估具体目标，而非只凭 reason 猜测。
 */
function toolCallArgumentsFromEvents(agent, callId) {
    if (agent === undefined || callId === '')
        return undefined;
    for (const event of agent.session.snapshotEvents()) {
        if (event?.type !== 'tool/call')
            continue;
        if (String(event.data.callId) !== callId)
            continue;
        const raw = event.data.arguments;
        if (typeof raw !== 'string')
            continue;
        try {
            return JSON.parse(raw);
        }
        catch {
            return undefined;
        }
    }
    return undefined;
}
/** 安装自动权限策略到官方工具流水线。 */
export function apply(ctx, config = {}) {
    const entry = config;
    // 当前 UI 语言：跟随 DSH 设置语言（locale.preference）；未显式设置时回退中文，
    // 与客户端浏览器语言 fallback（中文优先）保持一致。
    let uiLocale = 'zh';
    let presetName = entry.presetName ?? SEMI_AUTO_PERMISSION_PRESET;
    let fullAutoPresetName = entry.fullAutoPresetName ?? AUTO_PERMISSION_PRESET;
    let classifier = classifierFrom(ctx, entry, () => uiLocale);
    let rootOptions = rootOptionsFrom(entry);
    let preflight = entry.preflight ?? false;
    let proposalContextMaxMessageLen = entry.proposalContextMaxMessageLen ?? 10;
    let proposalContextMaxChars = entry.proposalContextMaxChars ?? 400;
    let proposalContextMaxTotalChars = entry.proposalContextMaxTotalChars ?? 2_000;
    let source = () => entry;
    let built = false;
    const rebuild = () => {
        try {
            const cfg = source();
            presetName = cfg.presetName ?? SEMI_AUTO_PERMISSION_PRESET;
            fullAutoPresetName = cfg.fullAutoPresetName ?? AUTO_PERMISSION_PRESET;
            classifier = classifierFrom(ctx, cfg, () => uiLocale);
            rootOptions = rootOptionsFrom(cfg);
            preflight = cfg.preflight ?? false;
            proposalContextMaxMessageLen = cfg.proposalContextMaxMessageLen ?? 10;
            proposalContextMaxChars = cfg.proposalContextMaxChars ?? 400;
            proposalContextMaxTotalChars = cfg.proposalContextMaxTotalChars ?? 2_000;
            built = true;
        }
        catch (error) {
            if (!built)
                throw error;
            ctx.logger.warn('autogate: 配置重建失败，沿用上一份有效配置', error);
        }
    };
    // 无缝接入 DSH 配置：settings 挂载时用 settings.yaml 的 autogate 段（热重载），未挂载回退 entry config。
    ctx.inject(['settings'], (sctx) => {
        sctx.settings.installSection(ctx, 'autogate', Config, entry, {
            setSource: (current) => { source = current; },
            onChange: () => { rebuild(); },
            validate: validateConfig,
        });
    });
    rebuild();
    // 跟随 DSH 设置语言：locale.preference（'zh'|'en'）由 dsh-client-locale 持久化在同一个
    // settings 文档里，服务端直接读取即可；据此让 L0 理由与 L1 分类 reason 使用对应语言。
    ctx.inject(['settings'], (sctx) => {
        const localeNs = 'locale';
        const readLocale = () => {
            const value = sctx.settings.get(localeNs);
            // 未显式设置（preference 缺失）时回退中文，与客户端浏览器语言 fallback 一致。
            uiLocale = value?.preference ?? 'zh';
        };
        readLocale();
        sctx.on('settings/updated', (ns) => {
            if (ns === localeNs)
                readLocale();
        });
        // settings 服务卸载时回退中文（未显式设置语言时的默认行为）。
        sctx.effect(() => () => { uiLocale = 'zh'; });
    });
    // 审批轨迹：进程级环形缓冲，记录每次 Auto 决策供客户端面板拉取展示。
    const trail = createApprovalTrail();
    // ApprovalRequest 不携带 arguments：pre-execute 阶段缓存原始参数，approval/request 阶段按 callId 取回，
    // 供分类器判断具体目标。缓存同时覆盖沙箱提权重试与工具自身声明需要审批（ask）两类请求。
    const pendingApprovalArgs = new Map();
    const rootsFor = (exec) => resolveRoots(exec.agent?.session.header.cwd, rootOptions);
    const parentAgent = sessionId => ctx.get('agents')?.get(sessionId);
    const authorityFor = (exec) => managedPermissionAuthority(exec.agent, parentAgent, presetName, fullAutoPresetName);
    // 子代理被 DSH 硬编码 approval=never（dsh-subagent 的 appendDelegatedPolicyOverrides），其提权请求会在
    // approval/request 事件触发前被 decide() 短路拒绝，LLM 终审收不到。对「父会话是托管 Auto」的子代理把
    // approval 改回 ask，让提权请求走到 approval/request 由 LLM 终审裁决；非 Auto 子代理保持 DSH 默认
    // never（fail-closed，不放开）。
    // 时序依赖：dsh-subagent 在子代理 session 未发布窗口（unpublished creation window）内追加 delegation 的
    // never，而 session/created 在 announce（发布）时触发、晚于该窗口，故此处追加的 ask 覆盖 never 生效；
    // 若 DSH 未来改为在 announce 之后追加 delegation 覆盖，本放开逻辑会失效需重新评估。
    ctx.on('session/created', (session) => {
        const header = session.header;
        if (header.origin !== 'subagent')
            return;
        const parentId = header.parentSession;
        const parent = parentId === undefined ? undefined : parentAgent(parentId);
        if (parent === undefined) {
            // 父会话 agent 未就绪或已释放；保持 DSH 默认 never。
            ctx.logger.debug('autogate: 子代理父会话 agent 未就绪或已释放，保持默认 never');
            return;
        }
        // 沿 parentSession 链判断是否存在托管 Auto 祖先（含父自身也是子代理的多级链）。
        if (managedPermissionAuthority(parent, parentAgent, presetName, fullAutoPresetName) === undefined) {
            // 父会话非托管 Auto；保持 DSH 默认 never。
            ctx.logger.debug('autogate: 子代理父会话非托管 Auto，保持默认 never');
            return;
        }
        setApprovalPolicy(session, 'ask');
    });
    /** 取 agent 所属会话的 id（字符串）；无 agent 或无 header.id 时返回空字符串。 */
    const sessionIdOf = (agent) => {
        const id = agent?.session.header.id;
        return id === undefined ? '' : String(id);
    };
    /** 底层轨迹写入：L1/L2 统一入口。classifierInput / tokenUsage 缺省时省略字段（「无」不写成 undefined）。 */
    const recordTrailEntry = (entry) => {
        trail.record({
            callId: entry.callId,
            toolName: entry.toolName,
            summary: entry.summary,
            decision: entry.decision,
            layer: entry.layer,
            reason: entry.reason,
            durationMs: entry.durationMs,
            sessionId: entry.sessionId,
            execSessionId: entry.execSessionId,
            ...(entry.classifierInput === undefined ? {} : { classifierInput: entry.classifierInput }),
            ...(entry.tokenUsage === undefined ? {} : { tokenUsage: entry.tokenUsage }),
        });
    };
    /** 审批轨迹记录：authority 由调用方解析后传入（避免每条记录重复沿 parentSession 链查找），sessionId 取授权会话保证按当前会话隔离查询。 */
    const recordTrail = (exec, authority, decision, layer, reason, durationMs, classifierInput, tokenUsage) => {
        recordTrailEntry({
            callId: exec.callId === undefined ? '' : String(exec.callId),
            toolName: exec.name,
            summary: summarizeToolArguments(exec.name, exec.arguments),
            decision,
            layer,
            reason,
            durationMs,
            sessionId: sessionIdOf(authority?.agent ?? exec.agent),
            execSessionId: sessionIdOf(exec.agent),
            classifierInput,
            tokenUsage,
        });
    };
    // 同步硬 deny：单调 guard，后续监听器/分类器无法覆盖。
    ctx.tools.guard(exec => {
        const authority = authorityFor(exec);
        if (authority === undefined)
            return undefined;
        const reason = hardDenyReason(exec, rootsFor(exec), uiLocale, authority.mode);
        // 同步硬 deny 同样落入审批轨迹：guard 阶段直接拒绝，不会进入 pre-execute，
        // 因此需在此处记录，否则轨迹面板看不到这类决策。
        if (reason !== undefined)
            recordTrail(exec, authority, 'deny', 'L0', reason, 0);
        return reason;
    });
    // 异步判定：allow 放行 / deny 拒绝 / 无法静态分类转人工或交 LLM 两态裁决。
    ctx.on('tools/pre-execute', async (exec, next) => {
        const authority = authorityFor(exec);
        if (authority === undefined)
            return next();
        // 审批耗时：从进入审批管道到做出决策的墙钟毫秒数（L0 规则 / L1 LLM 分类）。
        const startedAt = Date.now();
        // 缓存所有带 callId 的调用参数（ApprovalRequest 不携带 arguments，approval/request 阶段按 callId 取回
        // 供分类器评估具体目标：既覆盖沙箱提权重试，也覆盖工具自身声明需要审批的调用）。
        if (exec.callId !== undefined) {
            pendingApprovalArgs.set(String(exec.callId), exec.arguments);
            // 环形上限：审批请求未到达 approval/request（沙箱直接拒绝未生成审批、调用正常完成）时缓存不会被取回，
            // 限制容量并淘汰最旧项，避免进程级内存缓慢增长。
            if (pendingApprovalArgs.size > 100) {
                const oldest = pendingApprovalArgs.keys().next().value;
                if (oldest !== undefined)
                    pendingApprovalArgs.delete(oldest);
            }
        }
        // 沙箱提权重试：bash/pwsh 带 sandbox_permissions 直接放行，escalation 审批在 approval/request 监听里先过 LLM 判断。
        if (isSandboxEscalationRetry(exec.name, exec.arguments)) {
            return next();
        }
        // 前置拦截开关：关闭时跳过普通 L0 规则与 LLM 分类，完全依赖沙盒策略。
        // 硬 deny 已在 guard 同步生效，escalation 提权审批在 approval/request 监听，两者均不受本开关影响。
        if (!preflight)
            return next();
        const roots = rootsFor(exec);
        const assessment = assessTool(exec, roots, uiLocale, authority.mode);
        if (assessment.decision === 'deny') {
            recordTrail(exec, authority, 'deny', 'L0', assessment.reason, Date.now() - startedAt);
            return { kind: 'deny', reason: '[autogate hard deny] ' + assessment.reason };
        }
        if (assessment.decision === 'allow') {
            recordTrail(exec, authority, 'allow', 'L0', assessment.reason, Date.now() - startedAt);
            return next();
        }
        // 剩余均为交 LLM 两态裁决的模糊/危险操作。
        try {
            const route = modelRoute(exec.agent) ?? modelRoute(authority.agent);
            const { messages: trustedMessages, contexts: proposalContexts } = trustedUserMessages(authority.agent, {
                maxMessageLen: proposalContextMaxMessageLen,
                maxChars: proposalContextMaxChars,
                maxTotalChars: proposalContextMaxTotalChars,
            });
            const classifierInput = {
                toolName: exec.name,
                arguments: sanitizeClassifierArguments(exec.arguments),
                workspaceRoot: roots.workspace,
                policyReason: assessment.reason,
                trustedUserMessages: trustedMessages,
                proposalContexts,
                ...(route === undefined ? {} : { route }),
            };
            const decision = await classifier.classify(classifierInput, exec.signal);
            if (decision.decision === 'allow') {
                recordTrail(exec, authority, 'allow', 'L1', decision.reason, Date.now() - startedAt, classifierInput, decision.usage);
                return next();
            }
            recordTrail(exec, authority, 'deny', 'L1', decision.reason, Date.now() - startedAt, classifierInput, decision.usage);
            return { kind: 'deny', reason: '[autogate classifier deny] ' + decision.reason };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            ctx.logger.warn('autogate: L1 分类器异常，拒绝操作（工具: ' + exec.name + '）', error);
            recordTrail(exec, authority, 'deny', 'L1', message, Date.now() - startedAt);
            return { kind: 'deny', reason: '[autogate classifier unavailable] ' + message };
        }
    });
    // 审批请求预审（沙箱提权 + 工具自身声明需要审批）：先过 LLM 判断是否合理，合理则直接批准（不人工弹窗）。
    // 半自动：危险/不确定委派人工兜底弹窗；全自动：LLM 裁决为最终决定，拒绝即拒绝、不再人工弹窗。
    // prepend：本插件 bundle 的 insert 无锚点、落在 api-gateway（dsh-host-apiproxy）之后加载，
    // 而 host-apiproxy 的 approval/request answerer 总是先 claim（弹窗）——不 prepend 则本插件的 LLM 预审
    // 永远排在其后、不被调用。必须抢在所有 UI answerer 之前先过 LLM。
    ctx.on('approval/request', async (req, next) => {
        const authority = managedPermissionAuthority(req.agent, parentAgent, presetName, fullAutoPresetName);
        if (authority === undefined)
            return next();
        const mode = authority.mode;
        // 子代理（origin=subagent）无可靠人工弹窗通道：其一切审批（沙箱提权 + 工具自身 ask）LLM 终审拒绝即拒绝，不转人工兜底。
        const subagentDenyFinal = req.agent?.session?.header?.origin === 'subagent';
        // 审批耗时：审批请求从进入本监听器到 LLM 预审得出结论的墙钟毫秒数。
        const startedAt = Date.now();
        // 审批来源：沙箱提权（reason 以 escalate sandbox to 开头）与工具自身声明需要审批（其余 reason）。
        // 二者都先过 LLM 预审，仅在 reason 提取方式与 policyReason 前缀上不同。
        const escalation = isEscalationApprovalReason(req.reason);
        const reason = escalation ? extractEscalationJustification(req.reason) : (req.reason ?? '');
        // 工具自身 ask 可能不携带 reason（PreToolDecision 的 ask.reason 可选）：以工具名兜底，保证分类器有上下文。
        const reasonText = reason.trim() === '' ? 'tool ' + req.toolName + ' requires approval' : reason;
        const callId = req.callId === undefined ? '' : String(req.callId);
        const summary = reasonText.replace(/\s+/g, ' ').trim().slice(0, 80);
        try {
            const route = modelRoute(authority.agent);
            const roots = resolveRoots(authority.agent.session.header.cwd, rootOptions);
            // 取回原始参数（含 file_path/content/command），让分类器评估具体目标，而非只凭 reason 猜测。
            // 优先用 pre-execute 缓存；未命中（如工具 pre-execute 监听器短路了本插件）时回退到会话事件里的 tool/call 参数；
            // 仍无则用 reason 兜底（分类器信息不足时倾向 fail-closed）。
            const rawArguments = pendingApprovalArgs.get(callId)
                ?? toolCallArgumentsFromEvents(authority.agent, callId)
                ?? { reason };
            pendingApprovalArgs.delete(callId);
            const { messages: trustedMessages, contexts: proposalContexts } = trustedUserMessages(authority.agent, {
                maxMessageLen: proposalContextMaxMessageLen,
                maxChars: proposalContextMaxChars,
                maxTotalChars: proposalContextMaxTotalChars,
            });
            const classifierInput = {
                toolName: req.toolName,
                arguments: sanitizeClassifierArguments(rawArguments),
                workspaceRoot: roots.workspace,
                policyReason: (escalation ? 'sandbox escalation request: ' : 'tool approval request: ') + sanitizeClassifierText(reasonText),
                trustedUserMessages: trustedMessages,
                proposalContexts,
                ...(subagentDenyFinal ? { subagent: true } : {}),
                ...(route === undefined ? {} : { route }),
            };
            const decision = await classifier.classify(classifierInput, req.signal ?? new AbortController().signal);
            if (decision.decision === 'allow') {
                recordTrailEntry({ callId, toolName: req.toolName, summary, decision: 'allow', layer: 'L2', reason: decision.reason, durationMs: Date.now() - startedAt, sessionId: sessionIdOf(authority.agent), execSessionId: sessionIdOf(req.agent), classifierInput, tokenUsage: decision.usage });
                return 'allowed-once';
            }
            recordTrailEntry({ callId, toolName: req.toolName, summary, decision: (mode === 'full-auto' || subagentDenyFinal) ? 'deny' : 'ask', layer: 'L2', reason: decision.reason, durationMs: Date.now() - startedAt, sessionId: sessionIdOf(authority.agent), execSessionId: sessionIdOf(req.agent), classifierInput, tokenUsage: decision.usage });
        }
        catch (error) {
            // 分类器异常：半自动 fail-closed 到人工弹窗；全自动直接拒绝。保留具体错误并写日志，便于上报排查。
            const message = error instanceof Error ? error.message : String(error);
            ctx.logger.warn('autogate: L2 审批预审分类器异常（工具: ' + req.toolName + '）', error);
            recordTrailEntry({ callId, toolName: req.toolName, summary, decision: (mode === 'full-auto' || subagentDenyFinal) ? 'deny' : 'ask', layer: 'L2', reason: 'classifier unavailable: ' + message, durationMs: Date.now() - startedAt, sessionId: sessionIdOf(authority.agent), execSessionId: sessionIdOf(req.agent) });
        }
        // 全自动与子代理：LLM 裁决为最终决定，直接拒绝不再人工弹窗；半自动主代理：委派人工兜底。
        if (mode === 'full-auto' || subagentDenyFinal)
            return 'rejected';
        return next();
    }, { prepend: true });
    // 审批轨迹查询端点：客户端通过 connection.rpc.call('/autogate', 'trail') 拉取。
    // connection 服务由 client-connection 在自身 fiber 中 provide，本插件 apply 时可能尚未激活；
    // 同步 ctx.get 会取到 undefined 导致端点静默缺失，须用 ctx.inject 等待服务就绪后再注册。
    ctx.inject(['connection'], (connCtx) => {
        const connection = connCtx.get('connection');
        const disposeTrailRpc = connection?.rpc?.handle('/autogate', async (endpoint, payload) => {
            if (endpoint === 'trail') {
                const records = trail.snapshot();
                const sessionId = trailSessionId(payload);
                return { ok: true, value: sessionId === undefined ? records : records.filter((record) => record.sessionId === sessionId || record.execSessionId === sessionId) };
            }
            return { ok: false, error: { code: 'internal', message: 'unknown endpoint: ' + endpoint, details: {} } };
        }, { authority: 'loopback' });
        if (disposeTrailRpc !== undefined) {
            connCtx.effect(() => disposeTrailRpc, 'autogate: trail rpc channel');
        }
    });
}
