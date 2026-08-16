# AGENTS.md — dsh-autogate

DeepSeek Harness 自动审批插件。在 **workspace-write 沙箱之上** 增加 Auto 权限档，采用「L0 确定性规则 + L1 LLM 安全审批 + L2 被拒绝方主动人工审批」分层决策。保留工作区沙箱边界，不放宽为 full-access。

> 本文件是项目级 agent 指令。DSH 全局规则位于 `~/.dsh/AGENTS.md`，本文件只记录本项目特有约定；本机环境事实（DSH_HOME、settings.yaml 位置等）归 `AGENTS.local.md`，禁止硬编码进本文件或源码。

## 核心安全约束（最高优先级，不可违反）

1. **fail-closed**：分类器异常 / 超时 / 无路由 / 输出格式错误一律拒绝（deny），不得退化为放行。
2. **沙箱保持 workspace-write**：任何改动都不得放宽为 full-access；即使 LLM 误判放行，文件写入仍由沙箱拦截 + escalation 兜底。
3. **分层不可颠倒**：L0 硬 deny（提权、自毁、凭据外传、文件系统根与系统/凭据关键路径的变更/删除、家目录根删除）必须同步返回、后续监听器无法覆盖；家目录根变更与 DSH_HOME 的变更/删除属可授权操作，走工作区外通用路径（沙箱拦截 + escalation 审批）。L1 只在「沙箱不拦截但语义危险」时由 LLM 两态裁决；L2 由被拒绝方（AI）主动向用户发起，插件不主动弹窗。
4. **脱敏与限界**：进入 LLM 分类器的输入必须经 `sanitizeClassifierArguments` / `sanitizeClassifierText` 处理；唯一的授权依据是「最近的直接人类消息」与 `ask_user_question` 的问答对（回答是用户授权、问题仅提供上下文），不得引入其他上下文。
5. **`preflight` 开关（默认 `false`）**：关闭时跳过普通 L0 规则与 L1 LLM 分类，完全依赖沙盒策略；L0 硬 deny（guard）与 escalation 提权审批（approval/request）始终生效，不受开关影响。改动 pre-execute 判定顺序时不得破坏这一边界。

## 常用命令

| 命令 | 说明 |
|------|------|
| `npm run build` | 编译（tsc + 客户端 bundle 构建） |
| `npm run typecheck` | 仅类型检查，不产出 |
| `npm test` | vitest 全量测试 |

环境要求 Node `>=22.19.0`。构建产物 `lib/` 由 `build` 生成，**禁止手改**；改动只写在 `src/`。

## 目录结构

```
src/
  index.ts        入口：guard + tools/pre-execute 两态判定 + 提权重试放行 + 轨迹 RPC
  policy.ts       工具级确定性规则（L0）与危险识别
  shell.ts        bash/pwsh 静态分析（L0 硬 deny + 危险 shell 识别）
  classifier.ts   LLM 分类器（DSH 内部 LLM / 可选 HTTP 端点）+ 脱敏 + 系统提示词
  paths.ts        路径规范化（含 symlink realpath 加固）、危险路径判定、工作区根解析
  trail.ts        审批轨迹（进程级环形缓冲，只增不持久化）
  types.ts        共享类型（Assessment / ClassifierInput / ClassifierDecision / SafetyClassifier）
  client.tsx      设置 UI 卡片 + 审批轨迹面板（客户端 bundle）
tests/            与 src 模块一一对应的 *.spec.ts
scripts/
  build-client.mjs   客户端 bundle 构建脚本
  fix-session-zstd.py 会话 zstd 修复脚本
cordis.patch.yml   权限预设表（插入 auto 档，sandbox=workspace-write）
lib/               编译产物（由 build 生成并纳入版本控制，勿手改）
```

## 编码约定

- **TypeScript 严格模式**：`strict: true`、`module: NodeNext`、`moduleResolution: NodeNext`、`verbatimModuleSyntax: true`。
- **相对导入必须带 `.js` 后缀**（NodeNext 约定）：`import { assessTool } from './policy.js'`。
- **类型导入用 `import type` / `export type`**（verbatimModuleSyntax 要求，运行时类型必须显式标注）。
- **用字符串字面量联合类型，不用 enum**：如 `type ApprovalDecision = 'allow' | 'deny' | 'ask'`。
- **中文注释与 JSDoc**：新代码的注释、类型说明、拒绝原因（`reason`）用简体中文。
- **共享类型集中到 `types.ts`**，模块间引用其类型而非重复定义。

## 测试约定

- 测试框架 vitest，文件放 `tests/<module>.spec.ts`，与 `src/` 模块一一对应。
- **改动任何规则 / 分类逻辑必须同步增补或更新测试**：L0 规则对应 `policy.spec.ts` / `shell.spec.ts` / `paths.spec.ts`；分类器对应 `classifier.spec.ts`；配置对应 `settings.spec.ts`；入口集成对应 `index.spec.ts`。
- 测试中构造 `ToolExecution` 用最小字段 mock（参考 `tests/policy.spec.ts` 的 `execution()` 辅助函数）。
- 路径判定测试使用显式根（`resolveRoots('/ws', { home })`），不依赖本机真实路径。

## 修改指引（按改动位置）

| 改动 | 文件 | 同步动作 |
|------|------|---------|
| L0 确定性规则 | `policy.ts` / `shell.ts` / `paths.ts` | 更新对应 spec |
| LLM 分类逻辑 / 系统提示词 | `classifier.ts`（含 `CLASSIFIER_SYSTEM_PROMPT`） | 更新 `classifier.spec.ts` |
| 配置项 | `index.ts` 的 `Config` schema | 同步 README「配置」段 + 设置卡（client.tsx） |
| 审批轨迹字段 | `trail.ts` | 更新 `trail.spec.ts` |
| 客户端 UI | `client.tsx` | 重新 `npm run build` 验证 bundle |

## 关键不变量（review 时核对）

- 新增「危险操作」类别时，确认其落入 L0 硬 deny 还是 L1 分类，并检查脱敏是否覆盖。
- 新增配置项必须：`z.object` 校验（含 default / min / max / pattern 约束）+ README 文档 + 客户端设置卡。
- 轨迹为进程级环形缓冲（默认 200 条），只增不持久化，重启即清空；不得引入持久化副作用。
- 对 `cordis.patch.yml` 的修改仅限权限预设与插件注册段，保持 auto 档 `sandbox: workspace-write`。
