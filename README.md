# dsh-autogate

DeepSeek Harness 自动审批插件：在 **workspace-write 沙箱之上** 增加「半自动（auto-ask）+ 全自动（auto）」两档权限，采用「确定性规则 + LLM 安全审批 +（半自动下）被拒绝方主动人工审批」分层决策。保留工作区沙箱边界，不放宽为 full-access。

## 分层设计

| 层 | 决策 | 说明 |
|---|---|---|
| L0 确定性规则 | allow / deny | 零成本、零 LLM：只读、会话状态、工作区内编辑与删除、build/test、run_code 容器直接放行；工作区外普通路径读直接放行；工作区外的写/删除（敏感 shell/凭据配置文件写除外）放行交由 workspace-write 沙箱拦截 + escalation 弹窗；工作区外敏感配置文件写交 LLM 审查；空命令、动态命令名、参数缺失等兜底放行交由沙箱；提权、自毁、凭据外传、关键路径删除硬拒绝 |
| L1 LLM 安全审批 | allow / deny | 沙箱不拦截但语义危险的操作（未识别工具、模糊 shell、敏感路径读、动态目标、块设备、持久终端、git 状态变更、网络/数据库操作、工作区内受保护路径写）交 LLM 两态裁决：用户明确授权的操作放行，减少人工批准 |
| L2 人工审批 | ask | 两条通道：① AI 用 ask_user_question 问用户确认操作合法，确认后重新执行再过 LLM；② AI 用 sandbox_permissions + justification 重试走 DSH 沙箱提权（escalation），本插件先过 LLM 判断——合理越界直接批准不弹窗，危险/不确定才人工弹窗 |

## 两种模式

| 预设键 | 模式 | escalation 提权审批兜底 |
|---|---|---|
| `auto-ask` | 半自动（默认） | LLM 拒绝/异常 → 委派人工弹窗（L2 兜底） |
| `auto` | 全自动 | LLM 拒绝/异常 → 直接拒绝，不人工弹窗（LLM 裁决为最终决定） |

两种模式共享同一套 L0 确定性规则与 L1 LLM 分类器，唯一区别是 **L2 人工兜底**：半自动保留人工弹窗，全自动把 LLM 裁决作为最终决定。硬 deny（L0 guard）与 `preflight` 开关在两种模式下行为一致。

## 与同类插件的关键区别

- **沙箱保持 workspace-write**：即使 LLM 误判放行，文件写入仍被沙箱限制在工作区（对比 `@nanmicoder/dsh-auto-mode` 使用 danger-full-access）。
- **未识别工具默认走 LLM 分类而非放行**：但 `run_code` 作为代码执行容器直接放行——它内部的每次工具调用仍各自经过本策略与沙箱评估。
- **fail-closed**：分类器异常 / 超时 / 无路由 / 格式错误一律拒绝，由被拒绝方（AI）视情况主动向用户发起人工审批。

## 安装

    # 从 GitHub 安装（编译产物 lib/ 已随仓库提交）
    dsh plugin --profile web add github:wangxing-git/dsh-autogate

    # 重启 dsh

## 配置

配置经 DSH settings 服务（`ctx.settings`）接入：在 `$DSH_HOME/settings.yaml` 写 `autogate:` 段即时热重载；未挂载 settings 服务时回退 `cordis.patch.yml` 的 entry config（`config: {}`）。

> **关于设置 UI**：DSH 0.1.0-rc.6 的 Web 设置页对第三方插件 namespace 有硬编码 allowlist（`dsh-host-apiproxy` 的 `WEB_SETTINGS_NAMESPACES`），`autogate` 默认不在其中，设置卡片不会显示（源码注释标注为 deferred work）。要让卡片显示，可在该数组中追加 `"autogate"` 后重启 dsh（改官方包，DSH 升级后需重做）；否则直接用下方 `settings.yaml` 手动配置，功能等同。

    autogate:
      preflight: false                 # 沙盒前拦截判断开关：true 执行确定性规则+LLM 分类，false（默认）完全依赖沙盒
      presetName: auto-ask             # 半自动模式预设键（默认 auto-ask）：LLM 拒绝后转人工兜底弹窗
      fullAutoPresetName: auto         # 全自动模式预设键（默认 auto）：LLM 裁决为最终决定，不再人工弹窗
      classifierTimeoutMs: 8000        # 分类器超时（100–60000ms），超时 fail-closed
      classifierMaxOutputTokens: 1024  # 分类器输出上限（64–4096）
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
   b. 用 bash/pwsh 的 sandbox_permissions + justification 重试，走 DSH 内建沙箱提权（escalation）——本插件先过 LLM 判断：合理越界（用户明确授权）直接批准不弹窗，危险/不确定才人工弹窗。

   **全自动 `auto` 模式**：escalation 提权审批由 LLM 裁决为最终决定——allow 直接批准，deny / 分类器异常直接拒绝，不再人工弹窗。

## 目录结构

    src/
      index.ts        入口：guard + tools/pre-execute 两态判定 + 提权重试放行
      policy.ts       工具级确定性规则（L0）
      shell.ts        bash/pwsh 静态分析（L0 + 危险识别）
      classifier.ts   LLM 分类器（DSH 内部 LLM / 可选 HTTP 端点）
      paths.ts        路径规范化与危险路径判定
      types.ts        共享类型
    tests/            测试（paths / shell / policy / classifier 单元测试 + index 集成测试）
    cordis.patch.yml  权限预设表（插入 auto-ask 半自动 + auto 全自动档，sandbox=workspace-write）

## 已知限制

- 静态路径检查不跟随符号链接，工作区内 symlink 指向外部敏感路径时存在 TOCTOU 局限（第一步 `ln -s` 本身需经分类器）。
- 删除工作区内文件直接放行，依赖 workspace-write 沙箱兜底；不做会话产物 artifact 追踪，工作区外的删除同样放行交由沙箱拦截 + escalation。
- 分类器默认复用当前会话模型；若会话使用第三方 provider，分类请求会发往该 provider（已脱敏、限界）。

## License

MIT
