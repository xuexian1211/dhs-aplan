# dhs-aplan

DeepSeek Harness × It's a Plan 插件（包名 `dhs-aplan`，0.3.6）。目标是取代 CodexHub 的 itsaplan 通道；Plan 本身不改。
规划与进度见 [docs/roadmap-phase2-3.md](docs/roadmap-phase2-3.md)。

## 闭环（每个角色一条）

1. 用 `x-api-key`（`claimKeyEnv` 指向的环境变量）轮询 `POST /agent-runs/claim`
2. 领到后立即心跳，之后每 `heartbeatIntervalMs` 一次 `POST /agent-runs/:id/heartbeat`
3. 可选：用 MCP Bearer 在 `/mcp` 发领取评论（`mcpBearerEnv` 为空时复用 claim key）
4. `mode: dry-run`：不跑回合，直接回 success
5. `mode: harness`：`ctx.agents.create`（或按 issue 复用/resume）→ **设置会话标题** → 注入 Plan `systemPrompt` → `followup(prompt)` → `whenIdle`（受 `turnTimeoutMs` 限制）→ `POST /agent-runs/:id/result`（失败重试 3 次）

## 会话标题

与 CodexHub `thread_name_for_run` 一致：`<ISSUE> · <角色> · <issue 标题>`；无 issue 时 `itsaplan run <id> · <角色> · <首行>`；上限 80 字符加 `…`。
例：`AE-69 · 开发 · 【销售/PCM】缺陷：参数值类型"布尔"编码不一致，条件判断可能认不出布尔参数`。
通过 `@deepseek-ai/dsh-session-title` 的 `rename()` 写入；`renameExistingSession: true` 时复用旧会话也会纠正标题。

## GUI 配置

DSH 侧栏 **插件 → dhs-aplan**，组合包详情页里的配置表单。保存写回当前 profile 的 patch，并实时生效（插件每 3 秒对账，变化的角色 runner 会重启；正在跑的 run 会被中断并回 failed）。
Key 只填**环境变量名**，不存 Key 值。

## 多角色

`roles` 为空：只跑顶层单角色（向后兼容，会话 id `dhs-aplan-AE-69`）。
`roles` 非空：每项一个 runner，空字段继承顶层：

```yaml
roles:
  - { key: dev,    role: 开发,     claimKeyEnv: APLAN_KEY_DEV }
  - { key: req,    role: 需求分析, claimKeyEnv: APLAN_KEY_REQ,    mcpBearerEnv: APLAN_MCP_REQ }
  - { key: swa,    role: 架构,     claimKeyEnv: APLAN_KEY_SWA,    mcpBearerEnv: APLAN_MCP_SWA }
  - { key: review, role: 评审,     claimKeyEnv: APLAN_KEY_REVIEW, mcpBearerEnv: APLAN_MCP_REVIEW }
  - { key: test,   role: 测试,     claimKeyEnv: APLAN_KEY_TEST,   mcpBearerEnv: APLAN_MCP_TEST, enabled: false }
```

多角色会话 id 为 `dhs-aplan-<key>-AE-xx`。同一角色不能同时由 CodexHub 和本插件领取（会抢队列）。

## 配置字段

| 字段 | 默认 | 含义 |
| --- | --- | --- |
| `enabled` | true | 总开关 |
| `baseUrl` | `http://192.168.10.146:8001` | Plan API |
| `role` | `开发` | 单角色显示名（标题/评论） |
| `claimKeyEnv` | `APLAN_KEY_DEV` | 领取 key 的环境变量名 |
| `mcpBearerEnv` | `""` | MCP Bearer 环境变量名；空=复用 claim key |
| `mcpPath` | `/mcp` | MCP 路径 |
| `mode` | `dry-run`（bundle patch 里为 `harness`） | `harness` \| `dry-run` |
| `cwd` | `""` | 会话绝对工作目录 |
| `provider` / `model` | `""` | 空=profile 默认 |
| `pollIntervalMs` / `heartbeatIntervalMs` | 5000 / 15000 | 轮询 / 心跳 |
| `turnTimeoutMs` | 2700000 | 单回合超时，0=不限 |
| `postClaimComment` / `mcpCommentTool` | true / `add_comment` | 领取评论 |
| `mountPlanMcp` | true | 给 Agent 挂 Plan MCP 工具 |
| `setSessionTitle` / `renameExistingSession` | true / true | 会话标题规范 |
| `sessionIdPrefix` / `reuseSessionPerIssue` / `disposeAfterRun` | `dhs-aplan-` / true / false | 会话策略 |
| `roles` | `[]` | 多角色 |

## 构建 / 安装

```powershell
cd E:\WorkSpaces\dsh-aplan
pnpm install
pnpm run build        # tsc + 复制 client/client.js → dist/client.js
pnpm run test:title
dsh plugin --profile web add E:\WorkSpaces\dsh-aplan
```

Desktop generation 已装时，只把 `dist/`、`package.json`、`cordis.patch.yml` 同步到
`%APPDATA%\dsh-desktop\harness\profiles\.generations\live\dhs-aplan+<ver>\node_modules\dhs-aplan`，**不要**拷 node_modules（会卡住 DSH），然后重启 DSH。

## 重启后验证

1. `harness.log` 出现 `[dhs-aplan] 0.3 loaded roles=开发:harness ... gui=on`
2. 插件 → dhs-aplan 出现配置表单
3. @ 开发机器人：日志 `session title set ... title=AE-xx · 开发 · …`，工作台会话名同此
4. `gui=off`：schemastery 没从宿主解析到，插件照常运行，只是没有表单

## 风险 / 已知限制

- GUI 页是手写的客户端 bundle（DSH 模块工厂格式），依赖 `dsh-client-ui-primitives` 的 `SettingsFormModel/SettingsForm/SettingsValueField/Switch`；DSH 升级若改动这些接口，表单可能不显示（插件本身不受影响）。
- `roles` 在 GUI 中以 JSON 编辑。
- Key 仍放 Windows 用户环境变量；DSH 进程需能看到。

## 多角色（GUI）

插件页「配置」→「多角色」为可增删列表（类似 CodexHub 账号列表）。空列表 = 只用上方单角色默认（开发）。点「填入五角色模板」可写入需求分析/架构/开发/评审/测试五行，环境变量名分别为 APLAN_KEY_REQ|SWA|DEV|REVIEW|TEST 与对应 APLAN_MCP_*（开发 MCP 可留空复用领取 Key）。只填变量名，不存密钥。


## 0.3.6 要点

- **直接填 Key**：角色卡密码框 → DSH credentials 存储（APLAN_KEY_<ROLE> / APLAN_MCP_<ROLE>）。
- **连接状态**：设置页顶部与每卡显示 已接入 / 未接入 / 已暂停；关闭「启用」即暂停领取。
- **推理强度**：reasoningEffort → AgentOptions.reasoningEffort（off/minimal/low/medium/high/xhigh）。
- **自动归档**：配置项与 CodexHub 对齐；DSH 尚无按 Plan 看板列归档会话 API，开启后仅日志（建议先开「仅演练」）。
