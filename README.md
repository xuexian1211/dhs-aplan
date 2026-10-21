# dhs-aplan

DeepSeek Harness ↔ It's a Plan 插件（包名 `dhs-aplan`）。当前 MVP：**只接开发角色**。

## 闭环（MVP）

1. 用 `x-api-key`（`claimKeyEnv`）轮询 `POST /agent-runs/claim`
2. 领取后定时 `POST /agent-runs/:id/heartbeat`
3. 可选：用 MCP Bearer 调 `/mcp` 发评论（默认复用 claim key；`mcpBearerEnv` 非空才另读）
4. `mode: dry-run`：不跑 Harness 回合，直接 `result` success（便于联调 Plan）
5. `mode: harness`：暂未实现会话派发，会 `result` failed（占位）

领取身份 ≠ 写回身份（手册 0.2）。

## 环境变量（开发）

```powershell
$env:ITSAPLAN_KEY_DEV = '<开发 external agent key>'
# 一般不必再设 MCP：空 mcpBearerEnv 时复用上面这把 key
```

官方：claim 用 `x-api-key`，MCP 用 `Authorization: Bearer`，通常是同一把 agent key。手册里「领取 ≠ 写回」指的是配置槽位/用途分离，不是必须两把不同的 secret。

## 安装

```powershell
cd E:\WorkSpaces\dsh-aplan
pnpm install
pnpm run build

# 在插件父目录安装进 profile
dsh plugin --profile web add E:\WorkSpaces\dsh-aplan
dsh --profile web
```

日志应出现：`[dhs-aplan] 开发 MVP loaded` 与 `开发 runner started`。

## 配置

见 `cordis.patch.yml` 的 `config`。profile 可用同 id 覆盖。

| 字段 | 含义 |
| --- | --- |
| `baseUrl` | Plan API，如 `http://192.168.10.146:8001` |
| `claimKeyEnv` | 开发 claim key 的环境变量名 |
| `mcpBearerEnv` | MCP Bearer 环境变量名；空则跳过评论 |
| `mode` | `dry-run` \| `harness` |
| `mcpCommentTool` | MCP 评论工具名（默认 `create_issue_comment`，不对就改） |

## 验证清单

1. CodexHub / 其他 runner **先停掉开发角色**，避免抢 claim  
2. 设好两个环境变量，装插件并启动 dsh  
3. Plan 上给开发角色派一项  
4. 日志看到 `claimed run=…`，项上出现评论（若 MCP 工具名正确）  
5. run 以 dry-run success 结束  

## 下一步

- 按 issue 复用 Harness session 真正执行 `prompt` / `systemPrompt`
- 五角色配置表
- 评论续跑 / 卡死自愈
