# dhs-aplan 二期 / 三期规划与实施记录

> 更新：2026-10-22（UTC+8）。分支 `feat/harness-dispatch`，版本 0.3.0。
> 目标：Harness 插件取代 CodexHub 的 itsaplan 通道；It's a Plan 本身不改。

## 1. 现状（一期已完成，0.2.x）

- 只接 **开发** 角色：`POST /agent-runs/claim`（x-api-key = `ITSAPLAN_KEY_DEV`）→ MCP 领取评论 → `ctx.agents.create/resume` → 注入 Plan systemPrompt → `followup(prompt)` → `whenIdle` → `POST /agent-runs/:id/result`。
- 挂载 Plan MCP 工具（200 个，`add_comment` 等），会话 `attachSession` 到 `aida700-ERP` 工作区。
- AE-69（run 1122–1125）harness success，会话 id `dhs-aplan-AE-69`。
- 一期遗留问题（来自 harness.log 与会话 projcache）：
  - **会话标题未设置**：`agents.create()` 只传 `sessionId/agentOptions/meta/setup`，没有标题。DSH 自动标题取首条用户消息前几个词，AE-69 实际标题为 **`You were mentioned in a`**；LLM 标题还报 `SESSION_TITLE_TIMEOUT after 60000ms`。
  - 所有配置只能改 `cordis.patch.yml` 后重装，无 GUI。
  - 只支持单角色；心跳首拍要等一个周期；回合无超时；dispose 时在跑的 run 只能等 lease 过期。

## 2. 会话标题规范

### 2.1 手册 / CodexHub 原文

- 手册 `aida700-ERP/.aplan/wiki/_manual/README.md` 1.3 入口 B：
  「**一个工作项固定对应一个线程**，线程名形如 `AE-42 标题`。同一工作项的后续 @ 会接着在同一线程里跑。」
- CodexHub `docs/itsaplan-channel.zh-CN.md`：
  「线程名称包含角色：`<Issue> · <角色> · <标题>`（例如 `AE-74 · 需求分析 · 登录跳转修复`），没有 Issue 时为 `itsaplan run <id> · <角色> · <任务首行>` … 角色取账号的 `role`，留空时用账号名。」
- CodexHub 实现 `src/im/itsaplan/runtime.rs::thread_name_for_run`：标题取 prompt 中 `AE-69 "Title"` 引号内文本，否则取首条有意义的行；上限 80（UTF-16），超出截断加 `…`。
- 手册 `AGENTS.md`、`_manual/0~5` 中没有更细的「会话标题」条款（已搜：会话标题 / 标题规范 / Codex 会话 / session title）。

### 2.2 实现（0.3.0 已完成）

- 模板：`<ISSUE> · <role> · <issue title>`；无 issue：`itsaplan run <id> · <role> · <首行>`；80 字符上限 + `…`（`src/title.ts`）。
- 引号解析比 CodexHub 更稳：标题里本身带 `"` 时（AE-69 就是），优先取 `" of your project` 前的那个引号。
- 新配置：`role`（默认 `开发`）、`setSessionTitle`（默认 true）、`renameExistingSession`（默认 true，复用会话时也纠正旧标题）。
- 写入方式：`ctx.get('sessionTitle').rename(agent.session, title)`（`@deepseek-ai/dsh-session-title`，user 来源会钉住标题，同时停掉超时的自动 LLM 标题）。服务不存在时只打日志不失败。
- AE-69 新标题：`AE-69 · 开发 · 【销售/PCM】缺陷：参数值类型"布尔"编码不一致，条件判断可能认不出布尔参数`（`pnpm run test:title` 断言）。

## 3. 应进 GUI 的配置项

| 项 | 现状（0.2.x） | GUI 优先级 | 0.3.0 |
| --- | --- | --- | --- |
| enabled（总开关） | 无 | P0 | ✅ |
| baseUrl | patch | P0 | ✅ |
| mode（harness / dry-run） | patch | P0 | ✅ |
| claimKeyEnv（env 名） | patch | P0 | ✅ |
| mcpBearerEnv（env 名，空=复用） | patch | P0 | ✅ |
| cwd | patch | P0 | ✅ |
| provider / model | patch | P0 | ✅ |
| role（标题显示） | 无 | P0 | ✅ |
| roles[]（多角色） | 无 | P0 | ✅（JSON 字段） |
| pollIntervalMs / heartbeatIntervalMs | patch | P1 | ✅ |
| turnTimeoutMs | 无 | P1 | ✅ |
| mountPlanMcp / postClaimComment / mcpCommentTool | patch | P1 | ✅ |
| setSessionTitle / renameExistingSession | 无 | P1 | ✅ |
| mcpPath / sessionIdPrefix / reuseSessionPerIssue / disposeAfterRun | patch | P2 | ✅ |
| Key 值本身 | Windows 用户环境变量 | 不进 GUI | 仍只填 env 名（不落明文）。后续可接 DSH credentials 域 |

GUI 机制（DSH 原生）：插件导出 schemastery `Config`，字段 `.volatile()` → `dsh-settings` 以条目 id `dhs-aplan` 提供表单命名空间；浏览器半侧 `dist/client.js`（`package.json` `dsh.client` + `exports["./client"]`）向插件页 `plugins.bundle.config` slot 注册配置页；保存经 `config-editor` 写回 profile patch 并实时下发，插件每 3 秒对账并重启变化的角色 runner。

## 4. 二期范围（0.3.0，已实现）

可交付：
1. 标题规范（上节）。
2. GUI 配置页：侧栏 **插件 → dhs-aplan**（组合包详情页的配置区）。
3. 多角色：`roles[]` 每项 `{key, role, claimKeyEnv, mcpBearerEnv, cwd?, provider?, model?, mode?, enabled?, sessionIdPrefix?}`，空字段继承顶层；为空时保持单角色（会话 id 仍为 `dhs-aplan-AE-69`，向后兼容）。多角色会话 id 默认 `dhs-aplan-<key>-AE-xx`，避免不同角色抢同一会话。
4. 稳健性：领取后立刻首拍心跳；`turnTimeoutMs`（默认 45 分钟）超时中断并回 failed；result 上报重试 3 次；claim 网络错误指数退避（≤60s）；dispose / 配置变更时中断在跑回合并立即回 failed，释放 claim 锁。

验收（需重启 DSH 后做）：
- 日志出现 `[dhs-aplan] 0.3 loaded roles=开发:harness ... gui=on`。
- 给开发派一条 @：日志出现 `session title set session=dhs-aplan-AE-xx title=AE-xx · 开发 · …`；工作台会话名即该标题。
- 插件页可见 dhs-aplan 配置表单；改 pollIntervalMs 保存后 3 秒内日志出现 runner 重启。
- 填一个 `roles` 两项（开发 + 评审 env 名），两个 runner 都 `runner started`。

## 5. 三期范围（0.3.0 已落地的部分 + 剩余）

已在 0.3.0：五角色 runner 框架、超时/中断/上报重试、GUI 全量配置。

剩余（需要真实多角色 key 与 DSH 重启验证，按优先级）：
1. 五角色正式切换：申请/配置 `ITSAPLAN_KEY_REQ/SWA/REVIEW/TEST` 与对应 MCP Bearer，按手册 0.2.3 做 `/me` 署名自检；每角色单独停掉 CodexHub 对应账号。验收：5 个 runner 并行，评论署名正确。
2. 退役 CodexHub：全部角色在 Harness 跑满一周无回退后关闭 CodexHub itsaplan 通道；手册 1.3 入口 B 改写为 Harness（手册改动需人确认）。
3. GUI 增强：roles 表格化编辑（替代 JSON 字段）、Key 走 DSH credentials（`role('secret')`）、运行状态面板（每角色最后一次 claim / run / 错误）。
4. 生成安装：解决 `generation-install peer validation`（目前靠 peerDependencies 为空 + host fallback）；发布 npm 包或 tarball，让 `dsh plugin add` 一键装。
5. 评论续跑 / Chat 通道（`thread_name_for_chat` 对应 `itsaplan chat · <角色> · <首行>`）、usage 回传、输出裁剪。

## 6. 实施顺序（实际执行）

1. 先修标题（无 UI 依赖、风险最低、立刻改善工作台可读性）。
2. 再做配置 schema + GUI 骨架（所有字段 volatile，单角色默认值与 0.2 live 配置一致）。
3. 多角色 supervisor（依赖 GUI 的 live 配置对账）。
4. 稳健性（心跳/超时/dispose）。
5. 构建 → 同步 pack 与 live generation（只同步 dist / package.json / cordis.patch.yml）→ 待用户重启 DSH 验收。

## 7. 重启后验证清单

1. 重启 DSH Desktop。
2. `%APPDATA%\dsh-desktop\logs\harness.log` 搜 `0.3 loaded`，确认 `gui=on`（若 `gui=off`，schemastery 未能从宿主解析，插件仍可用，只是没有表单）。
3. 插件页 → dhs-aplan → 看到配置表单。
4. 在 AE 上 @ 开发机器人一次，确认会话标题。
5. 若插件页配置区为空：看浏览器 devtools 里 `/plugins` 是否加载 `dhs-aplan/client.js`，或日志 `client-modules` 报错。
