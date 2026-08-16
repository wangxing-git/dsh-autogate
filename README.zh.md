**语言：** [English](README.md) · 简体中文（本页）

# dsh-autogate

DeepSeek Harness 自动审批插件：在 **workspace-write 沙箱之上** 增加「半自动（auto-ask）+ 全自动（auto）」两档权限，采用「确定性规则 + LLM 安全审批 +（半自动下）被拒绝方主动人工审批」分层决策。保留工作区沙箱边界，不放宽为 full-access。

## 分层设计

| 层 | 决策 | 说明 |
| --- | --- | --- |
| L0 确定性规则 | allow / deny | 零成本、零 LLM：只读、会话状态、工作区内编辑与删除、build/test、run_code 容器直接放行；工作区外普通路径读直接放行；工作区外的写/删除（敏感 shell/凭据配置文件写除外）放行交由 workspace-write 沙箱拦截 + escalation 弹窗；工作区外敏感配置文件写交 LLM 审查；空命令、动态命令名、参数缺失等兜底放行交由沙箱；提权、自毁、凭据外传、关键路径删除硬拒绝 |
| L1 LLM 安全审批 | allow / deny | 沙箱不拦截但语义危险的操作（未识别工具、模糊 shell、敏感路径读、动态目标、块设备、持久终端、git 状态变更、网络/数据库操作、工作区内受保护路径写）交 LLM 两态裁决：用户明确授权的操作放行，减少人工批准 |
| L2 人工审批 | ask | 两条通道：① AI 用 ask_user_question 问用户确认操作合法，确认后重新执行再过 LLM；② AI 用 sandbox_permissions + justification 重试走 DSH 沙箱提权（escalation），本插件先过 LLM 判断——合理越界直接批准不弹窗，危险/不确定才人工弹窗 |

## 两种模式

| 预设键 | 模式 | escalation 提权审批兜底 |
| --- | --- | --- |
| `auto-ask` | 半自动（默认） | LLM 拒绝/异常 → 委派人工弹窗（L2 兜底） |
| `auto` | 全自动 | LLM 拒绝/异常 → 直接拒绝，不人工弹窗（LLM 裁决为最终决定） |

两种模式共享同一套 L0 确定性规则与 L1 LLM 分类器，唯一区别是 **L2 人工兜底**：半自动保留人工弹窗，全自动把 LLM 裁决作为最终决定。硬 deny（L0 guard）与 `preflight` 开关在两种模式下行为一致。

## 与同类插件的关键区别

- **普通调用保持 workspace-write**：L0/L1 决策从不放宽沙箱，即使 L1 LLM 误判，普通文件写入仍被限制在工作区（不同于让每次调用都跑 danger-full-access 的同类插件）。**L2 escalation 通道是例外**：批准的提权会让那一次调用以请求的更宽沙箱运行——见安全免责声明。
- **未识别工具默认走 LLM 分类而非放行**：但 `run_code` 作为代码执行容器直接放行——它内部的每次工具调用仍各自经过本策略与沙箱评估。
- **fail-closed**：分类器异常 / 超时 / 无路由 / 格式错误一律拒绝，由被拒绝方（AI）视情况主动向用户发起人工审批。

## ⚠️ 安全免责声明

本插件是「减少人工审批的决策层，**不是安全边界**」。真正的执行边界仍是 DSH 的 workspace-write 沙箱及其提权审批。

- L1 LLM 分类器是启发式的，可能误判（放行危险操作或拒绝安全操作）。fail-closed 减少误放行，但无法消除。
- 静态路径检查（含 symlink realpath 加固）仍存在 TOCTOU 窗口：符号链接可能在检查通过后、写入前被重新指向。
- **全自动（`auto`）模式**下 LLM 裁决为最终决定、不再人工弹窗——仅在可信环境使用。
- 你对每一次被批准操作的最终效果负责。请查看审批轨迹，存疑时优先使用半自动（`auto-ask`）。
- **L2 escalation 路径是一次性放宽**：LLM 批准沙箱提权后，那一次调用以请求的更宽沙箱（通常 full-access）运行，而非 workspace-write。它不影响其他调用，但确实是一次真实的临时扩权——不要把「沙箱保持 workspace-write」理解为覆盖提权。

## 安装

    # 从 GitHub 安装（编译产物 lib/ 已随仓库提交）
    dsh plugin --profile web add github:wangxing-git/dsh-autogate

    # 重启 dsh

## 配置

配置经 DSH settings 服务（`ctx.settings`）接入：在 `$DSH_HOME/settings.yaml` 写 `autogate:` 段即时热重载；未挂载 settings 服务时回退 `cordis.patch.yml` 的 entry config（`config: {}`）。

> **关于设置 UI**：DSH 0.1.0-rc.6 的 Web 设置页对第三方插件 namespace 有硬编码 allowlist（`dsh-host-apiproxy` 的 `WEB_SETTINGS_NAMESPACES`），`autogate` 默认不在其中，设置卡片可能不会显示。要让卡片显示，可在该数组中追加 `"autogate"` 后重启 dsh（改官方包，DSH 升级后需重做）；否则直接用下方 `settings.yaml` 手动配置，功能等同。

    autogate:
      preflight: false                 # 沙盒前拦截判断开关：true 执行确定性规则+LLM 分类，false（默认）完全依赖沙盒
      presetName: auto-ask             # 半自动模式预设键（默认 auto-ask）：LLM 拒绝后转人工兜底弹窗
      fullAutoPresetName: auto         # 全自动模式预设键（默认 auto）：LLM 裁决为最终决定，不再人工弹窗
      classifierTimeoutMs: 8000        # 分类器超时（100–60000ms），超时 fail-closed
      classifierMaxOutputTokens: 1024  # 分类器输出上限（64–4096）
      classifierRetry: false           # 分类器输出解析失败时静默重试一次（默认关闭）
      # classifierPrompt: |              # 审查（分类）系统提示词，留空用内置默认
      #   （自定义审查提示词，按目标/类型/可逆性/影响判断）
      # 固定分类模型（默认复用当前会话的 provider/model；两字段须成对）
      # classifierProvider: deepseek
      # classifierModel: deepseek-chat
      # 独立 OpenAI 兼容分类端点（可选；必须 HTTPS，loopback 可用 http）
      # classifierEndpoint: https://api.example.com/v1/chat/completions
      # classifierApiKeyEnv: DEEPSEEK_API_KEY   # HTTP 端点 API Key 的环境变量名
      # workspaceRoot: /path/to/ws              # 覆盖工作区根目录（默认会话 cwd）
      # dshHome: /path/to/.dsh                  # 覆盖 DSH_HOME（默认 ~/.dsh 或 $DSH_HOME）
      # tempRoots: [/tmp]                       # 信任的临时目录（默认系统临时目录）

## 决策流程

> **`preflight` 开关（默认 `false`）**：控制是否在沙盒前执行「普通确定性规则 + LLM 分类」两步拦截。设为 `false` 时跳过下述第 3、4 步，工具调用直接进入 workspace-write 沙盒（完全依赖沙盒策略）；第 2 步硬 deny 与第 5 步提权审批始终生效，不受开关影响。设为 `true` 恢复完整的沙盒前拦截判断。

1. 非 Auto 会话：原样放行，不改变官方行为。
2. Auto 会话：同步硬 deny（提权、自毁、凭据外传、根/家/DSH_HOME/系统关键路径删除）→ 无法被后续监听器或 LLM 覆盖。
3. 确定性 allow（只读、会话状态、工作区内编辑与删除、只读 shell、build/test、版本探测、run_code 容器；工作区外普通路径读直接放行；工作区外写/删除（敏感 shell/凭据配置文件写除外）放行交由 workspace-write 沙箱拦截 + escalation，工作区外敏感配置文件写交 LLM 审查；空命令、动态命令名、参数缺失等兜底放行交由沙箱）。
4. 沙箱不拦截但语义危险的操作（模糊 shell、敏感路径读、动态目标、块设备、持久终端、git 状态变更、网络/数据库、工作区内受保护路径写）→ LLM 两态裁决（allow / deny）。
5. LLM 拒绝或分类器异常后，AI 有两条人工审批通道（**仅半自动 `auto-ask` 模式**）：
   a. 用 ask_user_question 问用户确认操作合法，用户确认后重新执行，再过 LLM 审批放行；
   b. 用 bash/pwsh 的 sandbox_permissions + justification 重试，走 DSH 内建沙箱提权（escalation）——本插件先过 LLM 判断：合理越界（用户明确授权）直接批准不弹窗，且那一次调用随后以请求的更宽沙箱（通常 full-access）运行；危险/不确定才人工弹窗。

   **全自动 `auto` 模式**：escalation 提权审批由 LLM 裁决为最终决定——allow 直接批准，deny / 分类器异常直接拒绝，不再人工弹窗。

## 审批轨迹 UI

插件生效时，DSH Web 界面右下角会出现一个悬浮的「审批轨迹」开关（注入 `shell.overlay` 槽位），仅当存在审批记录时显示。

- 开关显示当前记录数，可展开/收起面板。
- 面板列出**最近 50 条**记录（轨迹本身是进程级环形缓冲，上限 200 条，面板只显示最新一段）。
- 每条记录显示决策层级（`L0` 确定性 / `L1` LLM / `L2` 人工）、决策结果（`allow` / `deny` / `ask`）与工具名，并带颜色条：绿色 = 放行、红色 = 拒绝、橙色 = 转人工。
- 展开单条记录可查看操作摘要、拒绝/放行理由、工具 `callId`、本地时间与决策耗时。
- 「定位」按钮把会话视图滚动到对应的那次工具调用。
- 数据每 2 秒从插件 `trail` RPC 轮询一次（拉取失败保留上一份快照）。
- 轨迹为进程级、仅内存保存：dsh 重启即清空，从不持久化。
- 拒绝/放行理由跟随 DSH 设置语言（zh/en）：显式设置 `en` 时理由为英文，否则（含未显式设置）回退中文，与界面语言保持一致。

## 目录结构

    src/
      index.ts         入口：guard + tools/pre-execute 两态判定 + 提权重试放行 + 审批轨迹 RPC
      policy.ts        工具级确定性规则（L0）与危险识别
      shell.ts         bash/pwsh 静态分析（L0 硬 deny + 危险 shell 识别）
      classifier.ts    LLM 分类器（DSH 内部 LLM / 可选 HTTP 端点）+ 脱敏 + 系统提示词
      paths.ts         路径规范化、危险路径判定、工作区根解析
      trail.ts         审批轨迹（进程级环形缓冲，只增不持久化）
      types.ts         共享类型
      client.tsx       设置 UI 卡片 + 审批轨迹面板（客户端 bundle）
      client-logic.ts  客户端 UI 逻辑（表单控制器 / 审批轨迹控制器 / i18n 文案）
    tests/             测试（paths / shell / policy / classifier / trail / settings / client-logic / index）
    scripts/
      build-client.mjs     客户端 bundle 构建脚本
      fix-session-zstd.py  会话 zstd 修复脚本
    cordis.patch.yml   权限预设表（插入 auto-ask 半自动 + auto 全自动档，sandbox=workspace-write）
    lib/                编译产物（由 build 生成并纳入版本控制，勿手改）

## 已知限制

- 路径包含判定基于真实身份（最深存在祖先经 realpath 解析），工作区内 symlink 不再绕过 L0/L1 分类；残余的 TOCTOU 窗口是「检查通过后、写入前」被重新指向的 symlink，仍由 workspace-write 沙箱兜底。
- 删除工作区内文件直接放行，依赖 workspace-write 沙箱兜底；不做会话产物 artifact 追踪，工作区外的删除同样放行交由沙箱拦截 + escalation。
- 分类器默认复用当前会话模型；若会话使用第三方 provider，分类请求会发往该 provider（已脱敏、限界）。
- `preflight` 开关默认 `false`：普通工具调用完全依赖 workspace-write 沙箱，默认只跑硬 deny guard 与 escalation 预审；设 `preflight: true` 才会对每次调用加确定性规则 + LLM 分类。
- 凭据外传检测是浅层文本模式（无法识别 base64 编码或分段的凭据）；把它当作绊线，而非保证。

## License

MIT