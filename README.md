# dhs-aplan

DeepSeek Harness × It's a Plan 插件（包名 `dhs-aplan`）。当前 MVP：**只接开发角色**。

## 闭环

1. 用 `x-api-key`（`claimKeyEnv`）轮询 `POST /agent-runs/claim`
2. 领取后定时 `POST /agent-runs/:id/heartbeat`（harness 回合期间也会继续）
3. 可选：用 MCP Bearer 向 `/mcp` 发评论（默认复用 claim key；`mcpBearerEnv` 非空才另读）
4. `mode: dry-run`：不跑 Harness 回合，直接 `result` success（便于联调 Plan）
5. `mode: harness`：`ctx.agents.create`（或按 issue 复用/resume）→ 注入 Plan `systemPrompt` → `followup(prompt)` → `whenIdle` → `POST /agent-runs/:id/result`

领取身份 ≠ 写回身份（手册 0.2）：配置槽位/用途分离；通常仍是同一把 agent key。

## 环境变量（开发）

```powershell
$env:ITSAPLAN_KEY_DEV = '<开发 external agent key>'
# 一般不必再设 MCP：空 mcpBearerEnv 时复用上面这把 key
```

官方：claim 用 `x-api-key`，MCP 用 `Authorization: Bearer`，通常是同一把 agent key。

## 安装 / 更新已装的 web profile

```powershell
cd E:\WorkSpaces\dsh-aplan
pnpm install
pnpm run build

# 首次安装
dsh plugin --profile web add E:\WorkSpaces\dsh-aplan

# 已安装过：再 add 一次路径，或从本地 tarball / git 更新后重启 profile
dsh plugin --profile web add E:\WorkSpaces\dsh-aplan
dsh --profile web
```

日志应出现：`[dhs-aplan] 开发 MVP loaded` 与 `开发 runner started`。

## 切到 mode=harness

1. 编辑 profile 里对该插件的 config 覆盖，或改本仓库 `cordis.patch.yml` 后重新 `dsh plugin … add`：
   - 把 `mode: dry-run` 改成 `mode: harness`
   - 建议设置绝对路径 `cwd`（会话工作目录），例如 `E:\\WorkSpaces\\your-project`
   - 可选：`provider` / `model`（空则用 profile 默认）
   - 默认 `reuseSessionPerIssue: true`（同一 Plan issue 复用稳定 session id）
   - 默认 `disposeAfterRun: false`（结束后保留会话，方便在 DSH 工作台查看）
2. 确保环境变量 `ITSAPLAN_KEY_DEV`（或你配置的 `claimKeyEnv`）在启动 dsh 的进程里可见
3. 重启 web profile：`dsh --profile web`

### UI 上应看到什么

| 模式 | 期望 |
| --- | --- |
| `dry-run` | 日志 `claimed` →（可选）Plan 评论 → 立刻 `dry-run success`；**工作台不会出现新会话** |
| `harness` | 日志 `harness created/resumed/reuse` → `followup queued` → 工作台出现/更新会话并跑 agent-loop → `harness idle` → `harness success`；Plan run 变为 success，不再「一领取就 complete」 |

失败时会 `reportRun failed` 并打清晰错误，不会永久占住 claim 锁（lease 到期也会释放）。

## 配置

见 `cordis.patch.yml` 的 `config`。profile 可用同 id 覆盖：

| 字段 | 含义 |
| --- | --- |
| `baseUrl` | Plan API，如 `http://192.168.10.146:8001` |
| `claimKeyEnv` | 开发 claim key 的环境变量名 |
| `mcpBearerEnv` | MCP Bearer 环境变量名；空则复用 claim key |
| `mode` | `dry-run` \| `harness` |
| `mcpCommentTool` | MCP 评论工具名（默认 `create_issue_comment`） |
| `cwd` | harness 会话绝对工作目录；空则不设 `meta.cwd` |
| `provider` / `model` | 可选路由覆盖；空则用 profile 默认 |
| `sessionIdPrefix` | session id 前缀（默认 `dhs-aplan-`） |
| `reuseSessionPerIssue` | 按 Plan issue 复用会话（默认 true） |
| `disposeAfterRun` | 回合结束后 dispose（会从 live store 移除会话；默认 false） |

## 验证清单

1. CodexHub / 其他 runner **先停掉开发角色**，避免抢 claim  
2. 设好环境变量，装插件并启动 dsh  
3. 先用 `mode: dry-run` 确认 claim / 评论 / result  
4. 再改 `mode: harness`，给开发角色派一单  
5. 日志看到 `harness created` / `followup queued` / `harness success`  
6. DSH 工作台出现对应会话（`disposeAfterRun: false` 时会留下）

## 风险 / 已知限制

- Plan `systemPrompt` 通过 agent-scoped `systemPrompt.section`（`interpolate: false`）注入；若 profile 未加载 `dsh-system-prompt`，harness 会失败并 report failed。
- `reuseSessionPerIssue` 下多次 run 会叠加多个 section 名（按 run id）；一般可接受。
- harness 回合可能很长；请保证 `heartbeatIntervalMs` 小于 Plan lease（官方 runner 约 60s，本插件默认 15s）。
- 不打印 secrets；密钥只从环境变量读取。

## 下一步

- 五角色配置表
- 评论续跑 / 卡死自愈
- 更细的 assistant 输出裁剪与 usage 回传
