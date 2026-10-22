import { SessionId } from '@deepseek-ai/dsh-session';
import fs from 'node:fs';
import path from 'node:path';
import { hostCtx } from './host-ctx.js';
import { ensureAgentPreset } from './ensure-agent-preset.js';
import { ensureWorkspaceAttached } from './workspace-attach.js';
import { mountPlanMcpTools } from './plan-mcp-tools.js';
/** Side-effect imports so Context gains `agents` typings. */
import '@deepseek-ai/dsh-agent';
/**
 * Re-register persisted dsh-aplan sessions on the host (root) fiber so they
 * reappear in the workbench after a plugin config reload. Session files are
 * never deleted; Cordis dispose of the plugin fiber only unregisters live
 * agents that were created on that fiber.
 */
export async function rehydrateAplanSessions(ctx, configs, log) {
    const host = hostCtx(ctx);
    if (typeof host.agents?.resume !== 'function') {
        log('[dsh-aplan] rehydrate skipped: agents.resume unavailable');
        return;
    }
    const byPrefix = [...configs]
        .filter((c) => c.reuseSessionPerIssue)
        .sort((a, b) => b.sessionIdPrefix.length - a.sessionIdPrefix.length);
    if (!byPrefix.length) {
        log('[dsh-aplan] rehydrate skipped: no reuseSessionPerIssue roles');
        return;
    }
    const seen = new Set();
    let resumed = 0;
    let skippedLive = 0;
    let failed = 0;
    let skippedNoCwd = 0;
    for (const cfg of byPrefix) {
        const cwd = (cfg.cwd || '').trim();
        if (!cwd) {
            skippedNoCwd += 1;
            continue;
        }
        const ids = await collectSessionIds(host, cwd, cfg.sessionIdPrefix, log);
        for (const rawId of ids) {
            if (seen.has(rawId))
                continue;
            seen.add(rawId);
            const role = matchRole(byPrefix, rawId);
            if (!role)
                continue;
            const sessionId = SessionId(rawId);
            if (host.agents.get(sessionId)) {
                skippedLive += 1;
                continue;
            }
            try {
                const agentOptions = buildAgentOptions(role);
                await host.agents.resume({
                    resumeSessionId: sessionId,
                    ...(agentOptions ? { agentOptions } : {}),
                    setup: async (agentCtx) => {
                        await mountPlanMcpTools(agentCtx, role, log);
                    },
                });
                const live = host.agents.get(sessionId);
                const tag = `[dsh-aplan:${role.roleKey || '_'}]`;
                if (live) {
                    await ensureAgentPreset(host, live, log, tag);
                }
                const roleCwd = (role.cwd || '').trim();
                if (roleCwd) {
                    await ensureWorkspaceAttached(host, String(sessionId), roleCwd, log, tag);
                }
                resumed += 1;
                log(`${tag} rehydrated session=${rawId}`);
            }
            catch (err) {
                failed += 1;
                log(`[dsh-aplan:${role.roleKey || '_'}] rehydrate failed session=${rawId}: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
    }
    log(`[dsh-aplan] rehydrate done resumed=${resumed} alreadyLive=${skippedLive} failed=${failed} scanned=${seen.size} skippedNoCwd=${skippedNoCwd}`);
}
function matchRole(roles, sessionId) {
    for (const r of roles) {
        if (sessionId.startsWith(r.sessionIdPrefix))
            return r;
    }
    return undefined;
}
function buildAgentOptions(config) {
    const provider = config.provider.trim();
    const model = config.model.trim();
    const effort = (config.reasoningEffort || '').trim();
    if (!provider && !model)
        return undefined;
    return {
        ...(provider ? { provider } : {}),
        ...(model ? { model } : {}),
        ...(effort ? { reasoningEffort: effort } : {}),
    };
}
async function collectSessionIds(ctx, cwd, prefix, log) {
    const out = new Set();
    const registry = ctx.workspaceRegistry ??
        ctx.get?.('workspaceRegistry');
    if (registry?.resolveByPath) {
        try {
            const entity = await registry.resolveByPath(cwd);
            for (const id of entity?.record?.sessionIds ?? []) {
                if (typeof id === 'string' && id.startsWith(prefix))
                    out.add(id);
            }
        }
        catch (err) {
            log(`[dsh-aplan] rehydrate workspace list failed cwd=${cwd}: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    const disk = listDiskSessionIds(ctx, cwd, prefix);
    for (const id of disk)
        out.add(id);
    if (!out.size) {
        log(`[dsh-aplan] rehydrate scan empty cwd=${cwd} prefix=${prefix} diskHits=${disk.length} slug=${cwdToSlug(cwd)}`);
    }
    return [...out];
}
/** Best-effort scan of the harness sessions bucket for this cwd. */
function listDiskSessionIds(ctx, cwd, prefix) {
    try {
        const root = resolveSessionsRoot(ctx);
        if (!root)
            return [];
        const slug = cwdToSlug(cwd);
        const dir = path.join(root, slug);
        if (!fs.existsSync(dir))
            return [];
        return fs
            .readdirSync(dir, { withFileTypes: true })
            .filter((d) => d.isDirectory() && d.name.startsWith(prefix) && !d.name.includes('.bak'))
            .map((d) => d.name);
    }
    catch {
        return [];
    }
}
function resolveSessionsRoot(ctx) {
    try {
        const home = ctx.homePaths ??
            ctx.get?.('homePaths');
        if (home?.sessions && typeof home.sessions === 'string')
            return home.sessions;
        const appdata = process.env.APPDATA || process.env.HOME;
        if (!appdata)
            return undefined;
        return path.join(appdata, 'dsh-desktop', 'harness', 'sessions');
    }
    catch {
        return undefined;
    }
}
/** Match DSH bucket naming: E:\\WorkSpaces\\aida700-ERP → --E-WorkSpaces-aida700-ERP-- */
function cwdToSlug(cwd) {
    const normalized = path.resolve(cwd).replace(/[/\\]+/g, '-').replace(/:/g, '');
    return `--${normalized}--`;
}
