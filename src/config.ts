/**
 * Plugin config. Claim identity (x-api-key) and MCP writeback bearer stay separate
 * slots (AE handbook 0.2) even when they point at the same env var.
 *
 * Secrets are never stored here: every *Env field is an env var NAME.
 */

/** Per-role overrides inside `roles[]`. Empty / missing fields inherit the top level. */
export interface RoleConfig {
  /** Stable key (used in logs + session id), e.g. dev / req / swa / review / test. */
  key?: string
  /** Display role, shown in session titles and Plan comments, e.g. 开发. */
  role?: string
  /** false = keep the row but do not run it. */
  enabled?: boolean
  claimKeyEnv?: string
  mcpBearerEnv?: string
  cwd?: string
  provider?: string
  model?: string
  mode?: 'dry-run' | 'harness'
  sessionIdPrefix?: string
}

/** Fully resolved config for one role runner. */
export interface Config {
  /** Master switch. false = load but do not claim. */
  enabled: boolean
  /** Plan API base, e.g. http://192.168.10.146:8001 */
  baseUrl: string
  /** Display role for the single-role (top-level) runner. */
  role: string
  /** Role key used in logs / session ids for multi-role. Top level = "" (back-compat ids). */
  roleKey: string
  /** Env var name holding the claim key (x-api-key). */
  claimKeyEnv: string
  /** Env var name holding MCP Bearer for writeback. Empty = reuse claim key. */
  mcpBearerEnv: string
  /** MCP endpoint path on the same host, default /mcp */
  mcpPath: string
  /** Poll interval when claim returns null (ms). */
  pollIntervalMs: number
  /** Heartbeat interval while a run is active (ms). Keep < Plan lease (60s). */
  heartbeatIntervalMs: number
  /** Max wall time of one harness turn (ms). 0 = no limit. */
  turnTimeoutMs: number
  /** dry-run: claim → comment → success without a turn. harness: real agent turn. */
  mode: 'dry-run' | 'harness'
  /** Post an MCP comment right after claim. */
  postClaimComment: boolean
  /** MCP tool name used to add an issue comment. */
  mcpCommentTool: string
  /** Absolute working directory for the harness session (`meta.cwd`). */
  cwd: string
  /** Optional provider / model override. Empty = profile default. */
  provider: string
  model: string
  /** Prefix for generated session ids. */
  sessionIdPrefix: string
  /** Reuse one session per Plan issue. */
  reuseSessionPerIssue: boolean
  /** Dispose the AgentHandle after reporting. */
  disposeAfterRun: boolean
  /** Mount Plan MCP tools into harness agents. */
  mountPlanMcp: boolean
  /** Set the session title to `<ISSUE> · <role> · <title>` (CodexHub norm). */
  setSessionTitle: boolean
  /** Rename an existing (reused) session when its title differs from the norm. */
  renameExistingSession: boolean
}

/** Raw plugin config as written in cordis.patch.yml / GUI. */
export interface RawConfig extends Partial<Omit<Config, 'roleKey'>> {
  roles?: RoleConfig[]
}

export const defaultConfig: Config = {
  enabled: true,
  baseUrl: 'http://192.168.10.146:8001',
  role: '开发',
  roleKey: '',
  claimKeyEnv: 'ITSAPLAN_KEY_DEV',
  mcpBearerEnv: '',
  mcpPath: '/mcp',
  pollIntervalMs: 5000,
  heartbeatIntervalMs: 15000,
  turnTimeoutMs: 45 * 60_000,
  mode: 'dry-run',
  postClaimComment: true,
  mcpCommentTool: 'add_comment',
  cwd: '',
  provider: '',
  model: '',
  sessionIdPrefix: 'dhs-aplan-',
  reuseSessionPerIssue: true,
  disposeAfterRun: false,
  mountPlanMcp: true,
  setSessionTitle: true,
  renameExistingSession: true,
}

function pick<T>(value: T | undefined | null, fallback: T): T {
  if (value === undefined || value === null) return fallback
  if (typeof value === 'string' && value.trim() === '' && typeof fallback === 'string') return fallback
  return value
}

/** Copy only known keys so volatile references / extra keys never leak into runners. */
function base(raw: RawConfig): Config {
  const out = { ...defaultConfig }
  for (const key of Object.keys(defaultConfig) as (keyof Config)[]) {
    if (key === 'roleKey') continue
    const v = (raw as Record<string, unknown>)[key]
    if (v === undefined || v === null) continue
    ;(out as Record<string, unknown>)[key] = v
  }
  // Empty strings are meaningful for these (= "use profile default / reuse claim key").
  return out
}

/**
 * Expand raw config into one resolved Config per enabled role.
 * No `roles` (or empty) = single top-level runner (back-compat with 0.2.x).
 */
export function resolveRoles(raw: RawConfig): Config[] {
  const top = base(raw)
  if (!top.enabled) return []
  const roles = Array.isArray(raw.roles) ? raw.roles.filter((r) => r && typeof r === 'object') : []
  if (roles.length === 0) return [top]
  const seen = new Set<string>()
  const out: Config[] = []
  roles.forEach((r, i) => {
    if (r.enabled === false) return
    let key = String(r.key ?? '').trim() || `role${i + 1}`
    while (seen.has(key)) key = `${key}-${i + 1}`
    seen.add(key)
    out.push({
      ...top,
      roleKey: key,
      role: pick(r.role, top.role),
      claimKeyEnv: pick(r.claimKeyEnv, top.claimKeyEnv),
      // explicit "" on a role means "reuse this role's claim key"
      mcpBearerEnv: r.mcpBearerEnv !== undefined ? String(r.mcpBearerEnv) : top.mcpBearerEnv,
      cwd: pick(r.cwd, top.cwd),
      provider: pick(r.provider, top.provider),
      model: pick(r.model, top.model),
      mode: pick(r.mode, top.mode),
      sessionIdPrefix: pick(r.sessionIdPrefix, `${top.sessionIdPrefix}${key}-`),
    })
  })
  return out
}

export function resolveSecret(envName: string): string {
  const name = envName.trim()
  if (!name) return ''
  return (process.env[name] ?? '').trim()
}
