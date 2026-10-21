/**
 * Plugin config for the 开发 role MVP.
 * Claim identity (x-api-key) and MCP writeback bearer must stay separate (AE handbook 0.2).
 */
export interface Config {
  /** Plan API base, e.g. http://192.168.10.146:8001 */
  baseUrl: string
  /** Env var name holding the 开发 claim key (x-api-key). */
  claimKeyEnv: string
  /** Env var name holding MCP Bearer for writeback. Empty = reuse claim key for MCP Bearer. */
  mcpBearerEnv: string
  /** MCP endpoint path on the same host, default /mcp */
  mcpPath: string
  /** Poll interval when claim returns null (ms). */
  pollIntervalMs: number
  /** Heartbeat interval while a run is active (ms). */
  heartbeatIntervalMs: number
  /**
   * dry-run: claim → optional MCP comment → report success without Harness turn.
   * harness: claim → ctx.agents.create/followup/whenIdle → report result.
   */
  mode: 'dry-run' | 'harness'
  /** When true, post an MCP comment after claim (needs mcpBearerEnv + working tools). */
  postClaimComment: boolean
  /** MCP tool name used to add an issue comment. Override if your Plan MCP differs. */
  mcpCommentTool: string
  /**
   * Absolute working directory for the harness session (`meta.cwd`).
   * Empty = omit (profile / launcher default).
   */
  cwd: string
  /** Optional provider route override for harness agents. Empty = profile default. */
  provider: string
  /** Optional model id override for harness agents. Empty = profile default. */
  model: string
  /** Prefix for generated session ids (stable id = prefix + issue/run key). */
  sessionIdPrefix: string
  /**
   * When true, reuse one harness session per Plan issue (resume/get by stable id).
   * When false, each run gets a fresh session id (`…run-<id>`).
   */
  reuseSessionPerIssue: boolean
  /**
   * When true, dispose the AgentHandle after reporting (removes session from the live store).
   * Default false so the workbench keeps the conversation visible.
   */
  disposeAfterRun: boolean
}

export const defaultConfig: Config = {
  baseUrl: 'http://192.168.10.146:8001',
  claimKeyEnv: 'ITSAPLAN_KEY_DEV',
  mcpBearerEnv: '',
  mcpPath: '/mcp',
  pollIntervalMs: 5000,
  heartbeatIntervalMs: 15000,
  mode: 'dry-run',
  postClaimComment: true,
  mcpCommentTool: 'create_issue_comment',
  cwd: '',
  provider: '',
  model: '',
  sessionIdPrefix: 'dhs-aplan-',
  reuseSessionPerIssue: true,
  disposeAfterRun: false,
}

export function resolveSecret(envName: string): string {
  const name = envName.trim()
  if (!name) return ''
  return (process.env[name] ?? '').trim()
}
