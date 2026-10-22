/**
 * Plugin config. Claim identity (x-api-key) and MCP writeback bearer stay separate
 * slots (AE handbook 0.2) even when they point at the same env var.
 *
 * Secrets are never stored here: every *Env field is an env var NAME.
 */
export const defaultConfig = {
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
};
function pick(value, fallback) {
    if (value === undefined || value === null)
        return fallback;
    if (typeof value === 'string' && value.trim() === '' && typeof fallback === 'string')
        return fallback;
    return value;
}
/** Like pick, but empty string is kept (optional cwd / optional overrides that mean "unset"). */
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
        if (key === 'roleKey')
            continue;
        const v = raw[key];
        if (v === undefined || v === null)
            continue;
        out[key] = v;
    }
    // Empty strings are meaningful for these (= "use profile default / reuse claim key").
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
            mcpPath: pick(r.mcpPath, top.mcpPath),
            mcpCommentTool: pick(r.mcpCommentTool, top.mcpCommentTool),
            postClaimComment: pickBool(r.postClaimComment, top.postClaimComment),
            // empty cwd is allowed (= no meta.cwd / ungrouped session)
            cwd: pickKeepEmpty(r.cwd, top.cwd),
            provider: pickKeepEmpty(r.provider, top.provider),
            model: pickKeepEmpty(r.model, top.model),
            mode: pick(r.mode, top.mode),
            sessionIdPrefix: pick(r.sessionIdPrefix, `${top.sessionIdPrefix}${key}-`),
            reuseSessionPerIssue: pickBool(r.reuseSessionPerIssue, top.reuseSessionPerIssue),
            disposeAfterRun: pickBool(r.disposeAfterRun, top.disposeAfterRun),
            mountPlanMcp: pickBool(r.mountPlanMcp, top.mountPlanMcp),
            setSessionTitle: pickBool(r.setSessionTitle, top.setSessionTitle),
            renameExistingSession: pickBool(r.renameExistingSession, top.renameExistingSession),
        });
    });
    return out;
}
export function resolveSecret(envName) {
    const name = envName.trim();
    if (!name)
        return '';
    return (process.env[name] ?? '').trim();
}
