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
   * harness: reserved; currently fails the run with a clear error until session dispatch lands.
   */
  mode: 'dry-run' | 'harness'
  /** When true, post an MCP comment after claim (needs mcpBearerEnv + working tools). */
  postClaimComment: boolean
  /** MCP tool name used to add an issue comment. Override if your Plan MCP differs. */
  mcpCommentTool: string
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
}

export function resolveSecret(envName: string): string {
  const name = envName.trim()
  if (!name) return ''
  return (process.env[name] ?? '').trim()
}
