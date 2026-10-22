/**
 * Plugin config. Claim identity (x-api-key) and MCP writeback bearer stay separate
 * slots (AE handbook 0.2) even when they point at the same env/credential ref.
 *
 * Secrets are never stored in cordis.patch.yml: *Env fields are ref/env NAMES.
 * Plaintext claimKey / mcpBearer may exist only in memory after resolve (never logged).
 */
export const defaultConfig = {
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
    sessionIdPrefix: 'dhs-aplan-',
    reuseSessionPerIssue: true,
    disposeAfterRun: false,
    mountPlanMcp: true,
    setSessionTitle: true,
    renameExistingSession: true,
    archiveDoneThreads: false,
    archiveDryRun: true,
    archiveSweepMinutes: 240,
    archiveGraceMinutes: 30,
};
function pick(value, fallback) {
    if (value === undefined || value === null)
        return fallback;
    if (typeof value === 'string' && value.trim() === '' && typeof fallback === 'string')
        return fallback;
    return value;
}
/** Like pick, but empty string is kept (provider/model/effort). Role cwd uses pick() so empty inherits top. */
function pickKeepEmpty(value, fallback) {
    if (value === undefined || value === null)
        return fallback;
    return String(value);
}
function pickBool(value, fallback) {
    if (value === undefined || value === null)
        return fallback;
    return Boolean(value);
}
/** Copy only known keys so volatile references / extra keys never leak into runners. */
function base(raw) {
    const out = { ...defaultConfig };
    for (const key of Object.keys(defaultConfig)) {
        if (key === 'roleKey' || key === 'claimKey' || key === 'mcpBearer')
            continue;
        const v = raw[key];
        if (v === undefined || v === null)
            continue;
        out[key] = v;
    }
    // Plan MCP tools required for every role session (harness or dry-run).
    out.mountPlanMcp = true;
    // Never dispose AgentHandle after a turn — that removes the session from the
    // live Host registry (session/disposed → api-session/removed). Keep sessions
    // visible for audit; plugin dispose / runner.stop only abort the claim lock.
    out.disposeAfterRun = false;
    return out;
}
/**
 * Expand raw config into one resolved Config per enabled role.
 * No `roles` (or empty) = single top-level runner (back-compat with 0.2.x).
 * Prefer GUI writing roles[0] so multi-role and single-role share one model.
 */
export function resolveRoles(raw) {
    const top = base(raw);
    if (!top.enabled)
        return [];
    const roles = Array.isArray(raw.roles) ? raw.roles.filter((r) => r && typeof r === 'object') : [];
    if (roles.length === 0)
        return [top];
    const seen = new Set();
    const out = [];
    roles.forEach((r, i) => {
        if (r.enabled === false)
            return;
        let key = String(r.key ?? '').trim() || `role${i + 1}`;
        while (seen.has(key))
            key = `${key}-${i + 1}`;
        seen.add(key);
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
        });
    });
    return out;
}
/** Sync env-only helper (tests / legacy). Prefer resolveSecretValue in runners. */
export function resolveSecret(envName) {
    const name = envName.trim();
    if (!name)
        return '';
    return (process.env[name] ?? '').trim();
}
/** Config signature for reconcile — excludes in-memory plaintext secrets. */
export function configSignature(cfg) {
    const { claimKey: _c, mcpBearer: _m, ...rest } = cfg;
    return JSON.stringify(rest);
}
