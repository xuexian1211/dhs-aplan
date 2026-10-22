/**
 * Cordis `Config` schema. Every user-facing field is `.volatile()` so that
 * @deepseek-ai/dsh-settings serves it as the `dsh-aplan` settings namespace and the
 * plugin's GUI page (dist/client.js, Plugins → dsh-aplan) can edit it live.
 *
 * schemastery is carried by DSH Desktop. Resolve via createRequire(process.argv[1])
 * first (Desktop entry), then import.meta.url, then dynamic import; if it cannot
 * load, the plugin still runs without a schema (no GUI form values).
 */
import { createRequire } from 'node:module';
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
        mcpPath: z.string(),
        mcpCommentTool: z.string(),
        postClaimComment: z.boolean(),
        cwd: z.string(),
        provider: z.string(),
        model: z.string(),
        reasoningEffort: z.string(),
        mode: z.string(),
        sessionIdPrefix: z.string(),
        reuseSessionPerIssue: z.boolean(),
        disposeAfterRun: z.boolean(),
        mountPlanMcp: z.boolean(),
        setSessionTitle: z.boolean(),
        renameExistingSession: z.boolean(),
        permissionPreset: z.string(),
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
        reasoningEffort: s(d.reasoningEffort),
        sessionIdPrefix: s(d.sessionIdPrefix),
        reuseSessionPerIssue: b(d.reuseSessionPerIssue),
        disposeAfterRun: b(d.disposeAfterRun),
        mountPlanMcp: b(d.mountPlanMcp),
        setSessionTitle: b(d.setSessionTitle),
        renameExistingSession: b(d.renameExistingSession),
        archiveDoneThreads: b(d.archiveDoneThreads),
        archiveDryRun: b(d.archiveDryRun),
        archiveSweepMinutes: n(d.archiveSweepMinutes),
        archiveGraceMinutes: n(d.archiveGraceMinutes),
        fixRuntimeAcl: b(d.fixRuntimeAcl),
        permissionPreset: s(d.permissionPreset),
        roles: z.array(role).default([]).volatile(),
        /** Host-published JSON; GUI reads only. */
        runtimeStatus: s('[]'),
    });
}
function pickZ(mod) {
    if (mod && typeof mod === 'object' && 'default' in mod && mod.default) {
        return mod.default;
    }
    return mod;
}
async function loadSchemastery() {
    const tried = [];
    try {
        const entry = process.argv[1];
        if (entry) {
            tried.push(`createRequire(process.argv[1]=${entry})`);
            const require = createRequire(entry);
            const mod = require('@deepseek-ai/schemastery');
            return pickZ(mod);
        }
    }
    catch (err) {
        tried.push(`argv1: ${err instanceof Error ? err.message : err}`);
    }
    try {
        tried.push('createRequire(import.meta.url)');
        const require = createRequire(import.meta.url);
        const mod = require('@deepseek-ai/schemastery');
        return pickZ(mod);
    }
    catch (err) {
        tried.push(`import.meta.url: ${err instanceof Error ? err.message : err}`);
    }
    const asarAnchors = [
        'C:/Program Files/DSH Desktop/resources/app.asar/package.json',
        'C:/Program Files/DSH Desktop/resources/app.asar/node_modules/@deepseek-ai/schemastery/package.json',
    ];
    for (const anchor of asarAnchors) {
        try {
            tried.push(`createRequire(${anchor})`);
            const require = createRequire(anchor);
            const mod = require('@deepseek-ai/schemastery');
            return pickZ(mod);
        }
        catch (err) {
            tried.push(`${anchor}: ${err instanceof Error ? err.message : err}`);
        }
    }
    try {
        tried.push('dynamic import');
        const mod = (await import('@deepseek-ai/schemastery'));
        return pickZ(mod);
    }
    catch (err) {
        tried.push(`import: ${err instanceof Error ? err.message : err}`);
    }
    console.warn(`[dsh-aplan] schemastery unavailable; GUI settings disabled (tried: ${tried.join(' | ')})`);
    return undefined;
}
let schema;
try {
    const z = await loadSchemastery();
    schema = z ? build(z) : undefined;
}
catch (err) {
    console.warn(`[dsh-aplan] schemastery unavailable; GUI settings disabled (${err instanceof Error ? err.message : err})`);
    schema = undefined;
}
export const ConfigSchema = schema;
