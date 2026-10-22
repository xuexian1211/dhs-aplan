/**
 * Plugin config. Claim identity (x-api-key) and MCP writeback bearer stay separate
 * slots (AE handbook 0.2) even when they point at the same env/credential ref.
 *
 * Secrets are never stored in cordis.patch.yml: *Env fields are ref/env NAMES.
 * Plaintext claimKey / mcpBearer may exist only in memory after resolve (never logged).
 */

/** Per-role overrides inside `roles[]`. Empty / missing fields inherit the top level. */
export interface RoleConfig {
  /** Stable key (used in logs + session id), e.g. dev / req / swa / review / test. */
  key?: string
  /** Display role, shown in session titles and Plan comments, e.g. 开发. */
  role?: string
  /** false = keep the row but do not run it (paused). */
  enabled?: boolean
  claimKeyEnv?: string
  mcpBearerEnv?: string
  /** MCP endpoint path override; empty / missing → top-level mcpPath. */
  mcpPath?: string
  /** MCP comment tool override; empty / missing → top-level mcpCommentTool. */
  mcpCommentTool?: string
  postClaimComment?: boolean
  cwd?: string
  provider?: string
  model?: string
  /** Adapter-owned reasoning effort id (off/minimal/low/medium/high/xhigh). Default high; empty = model default. */
  reasoningEffort?: string
  mode?: 'dry-run' | 'harness'
  sessionIdPrefix?: string
  reuseSessionPerIssue?: boolean
  disposeAfterRun?: boolean
  mountPlanMcp?: boolean
  setSessionTitle?: boolean
  renameExistingSession?: boolean
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
  /** Credential ref / env var name holding the claim key (x-api-key). */
  claimKeyEnv: string
  /** Credential ref / env var name holding MCP Bearer for writeback. Empty = reuse claim key. */
  mcpBearerEnv: string
  /**
   * In-memory plaintext claim key (from credentials store / env). Never persist / log.
   * Filled by the supervisor before starting a runner.
   */
  claimKey: string
  /**
   * In-memory plaintext MCP bearer. Empty = reuse claimKey. Never persist / log.
   */
  mcpBearer: string
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
  /** Absolute working directory for the harness session (`meta.cwd`). Empty = no cwd / ungrouped. */
  cwd: string
  /** Optional provider / model override. Empty = profile default. */
  provider: string
  model: string
  /** Adapter-owned reasoning effort; default high. Empty string = provider/model default. */
  reasoningEffort: string
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
  /**
   * Auto-archive completed/canceled Plan-issue sessions (CodexHub parity).
   * DSH has no Plan-column→session archive API yet; when true, sweeps only log
   * (and respect archiveDryRun). Kept so GUI/config stay forward-compatible.
   */
  archiveDoneThreads: boolean
  archiveDryRun: boolean
  /** Sweep interval in minutes (min 5). */
  archiveSweepMinutes: number
  /** Wait after issue enters completed/canceled before archive (minutes, min 5). */
  archiveGraceMinutes: number
}

/** Raw plugin config as written in cordis.patch.yml / GUI. */
export interface RawConfig extends Partial<Omit<Config, 'roleKey' | 'claimKey' | 'mcpBearer'>> {
  roles?: RoleConfig[]
  /** Host-published JSON status blob for the settings page (read-only in GUI). */
  runtimeStatus?: string
}

export const defaultConfig: Config = {
  enabled: true,
  baseUrl: 'http://192.168.10.146:8001',
  role: '开发',
  roleKey: '',
  claimKeyEnv: 'APLAN_KEY_DEV',
  mcpBearerEnv: '',
  claimKey: '',
  mcpBearer: '',
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
  reasoningEffort: 'high',
  sessionIdPrefix: 'dsh-aplan-',
  reuseSessionPerIssue: true,
  disposeAfterRun: false,
  mountPlanMcp: true,
  setSessionTitle: true,
  renameExistingSession: true,
  archiveDoneThreads: false,
  archiveDryRun: true,
  archiveSweepMinutes: 240,
  archiveGraceMinutes: 30,
}

function pick<T>(value: T | undefined | null, fallback: T): T {
  if (value === undefined || value === null) return fallback
  if (typeof value === 'string' && value.trim() === '' && typeof fallback === 'string') return fallback
  return value
}

/** Like pick, but empty string is kept (provider/model/effort). Role cwd uses pick() so empty inherits top. */
function pickKeepEmpty(value: string | undefined | null, fallback: string): string {
  if (value === undefined || value === null) return fallback
  return String(value)
}

function pickBool(value: boolean | undefined | null, fallback: boolean): boolean {
  if (value === undefined || value === null) return fallback
  return Boolean(value)
}

/** Copy only known keys so volatile references / extra keys never leak into runners. */
function base(raw: RawConfig): Config {
  const out = { ...defaultConfig }
  for (const key of Object.keys(defaultConfig) as (keyof Config)[]) {
    if (key === 'roleKey' || key === 'claimKey' || key === 'mcpBearer') continue
    const v = (raw as Record<string, unknown>)[key]
    if (v === undefined || v === null) continue
    ;(out as Record<string, unknown>)[key] = v
  }
  // Plan MCP tools required for every role session (harness or dry-run).
  out.mountPlanMcp = true
  // Never dispose AgentHandle after a turn — that removes the session from the
  // live Host registry (session/disposed → api-session/removed). Keep sessions
  // visible for audit; plugin dispose / runner.stop only abort the claim lock.
  out.disposeAfterRun = false
  return out
}

/**
 * Expand raw config into one resolved Config per enabled role.
 * No `roles` (or empty) = single top-level runner (back-compat with 0.2.x).
 * Prefer GUI writing roles[0] so multi-role and single-role share one model.
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
      claimKey: '',
      mcpBearer: '',
      mcpPath: pick(r.mcpPath, top.mcpPath),
      mcpCommentTool: pick(r.mcpCommentTool, top.mcpCommentTool),
      postClaimComment: pickBool(r.postClaimComment, top.postClaimComment),
      cwd: pick(r.cwd, top.cwd), // empty role cwd inherits top (do not clear profile cwd)
      provider: pickKeepEmpty(r.provider, top.provider),
      model: pickKeepEmpty(r.model, top.model),
      reasoningEffort: pickKeepEmpty(r.reasoningEffort, top.reasoningEffort),
      mode: pick(r.mode, top.mode),
      sessionIdPrefix: pick(r.sessionIdPrefix, `${top.sessionIdPrefix}${key}-`),
      reuseSessionPerIssue: pickBool(r.reuseSessionPerIssue, top.reuseSessionPerIssue),
      disposeAfterRun: false, // never dispose session after a turn (audit)
      mountPlanMcp: true, // always on; per-role false broke AE-133 req
      setSessionTitle: pickBool(r.setSessionTitle, top.setSessionTitle),
      renameExistingSession: pickBool(r.renameExistingSession, top.renameExistingSession),
    })
  })
  return out
}

/** Sync env-only helper (tests / legacy). Prefer resolveSecretValue in runners. */
export function resolveSecret(envName: string): string {
  const name = envName.trim()
  if (!name) return ''
  return (process.env[name] ?? '').trim()
}

/** Config signature for reconcile — excludes in-memory plaintext secrets. */
export function configSignature(cfg: Config): string {
  const { claimKey: _c, mcpBearer: _m, ...rest } = cfg
  return JSON.stringify(rest)
}
