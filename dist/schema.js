/**
 * Cordis `Config` schema. Every user-facing field is `.volatile()` so that
 * @deepseek-ai/dsh-settings serves it as the `dhs-aplan` settings namespace and the
 * plugin's GUI page (dist/client.js, Plugins → dhs-aplan) can edit it live.
 *
 * schemastery is carried by DSH Desktop (resolved through the host module fallback);
 * if it cannot load, the plugin still runs without a schema (no GUI form).
 */
import { defaultConfig as d } from './config.js';
function build(z) {
    const s = (def) => z.string().default(def).volatile();
    const n = (def) => z.number().default(def).volatile();
    const b = (def) => z.boolean().default(def).volatile();
    const role = z.object({
        key: z.string(),
        role: z.string(),
        enabled: z.boolean().default(true),
        claimKeyEnv: z.string(),
        mcpBearerEnv: z.string(),
        cwd: z.string(),
        provider: z.string(),
        model: z.string(),
        mode: z.string(),
        sessionIdPrefix: z.string(),
    });
    return z.object({
        enabled: b(d.enabled),
        baseUrl: s(d.baseUrl),
        role: s(d.role),
        claimKeyEnv: s(d.claimKeyEnv),
        mcpBearerEnv: s(d.mcpBearerEnv),
        mcpPath: s(d.mcpPath),
        pollIntervalMs: n(d.pollIntervalMs),
        heartbeatIntervalMs: n(d.heartbeatIntervalMs),
        turnTimeoutMs: n(d.turnTimeoutMs),
        mode: s(d.mode),
        postClaimComment: b(d.postClaimComment),
        mcpCommentTool: s(d.mcpCommentTool),
        cwd: s(d.cwd),
        provider: s(d.provider),
        model: s(d.model),
        sessionIdPrefix: s(d.sessionIdPrefix),
        reuseSessionPerIssue: b(d.reuseSessionPerIssue),
        disposeAfterRun: b(d.disposeAfterRun),
        mountPlanMcp: b(d.mountPlanMcp),
        setSessionTitle: b(d.setSessionTitle),
        renameExistingSession: b(d.renameExistingSession),
        roles: z.array(role).default([]).volatile(),
    });
}
let schema;
try {
    const mod = (await import('@deepseek-ai/schemastery'));
    const z = mod.default ?? mod;
    schema = build(z);
}
catch (err) {
    console.warn(`[dhs-aplan] schemastery unavailable; GUI settings disabled (${err instanceof Error ? err.message : err})`);
    schema = undefined;
}
export const ConfigSchema = schema;
