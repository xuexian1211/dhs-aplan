import { hostCtx } from './host-ctx.js';
function resolveAgentPresets(ctx) {
    const host = hostCtx(ctx);
    if (host.agentPresets && typeof host.agentPresets === 'object')
        return host.agentPresets;
    try {
        const viaGet = host.get?.('agentPresets');
        if (viaGet && typeof viaGet === 'object')
            return viaGet;
    }
    catch {
        /* ignore */
    }
    const local = ctx;
    if (local.agentPresets && typeof local.agentPresets === 'object')
        return local.agentPresets;
    try {
        const viaGet = local.get?.('agentPresets');
        if (viaGet && typeof viaGet === 'object')
            return viaGet;
    }
    catch {
        /* ignore */
    }
    return undefined;
}
export async function ensureAgentPreset(ctx, agent, log, tag) {
    const agentPresets = resolveAgentPresets(ctx);
    if (!agentPresets) {
        log(`${tag} CRITICAL: agentPresets service missing — coding tools (read/write/edit/shell) will not mount; only Plan MCP / host leftovers remain`);
        return undefined;
    }
    const already = agentPresets.composedPreset?.(agent.ctx);
    if (already) {
        log(`${tag} agent preset already bound id=${already}`);
        return already;
    }
    const defaultId = (agentPresets.defaultId || 'standard').trim() || 'standard';
    if (typeof agentPresets.select === 'function') {
        try {
            const id = await agentPresets.select(agent, defaultId);
            log(`${tag} agent preset selected id=${id}`);
            return id;
        }
        catch (err) {
            const reason = err instanceof Error ? err.message : String(err);
            log(`${tag} agent preset select skipped (${reason}); falling back to recompose/mount`);
        }
    }
    if (typeof agentPresets.recompose === 'function') {
        const preset = await agentPresets.recompose(agent.ctx, defaultId);
        const id = preset?.id ?? defaultId;
        log(`${tag} agent preset recomposed id=${id}`);
        return id;
    }
    if (typeof agentPresets.mount === 'function') {
        const preset = await agentPresets.mount(agent.ctx, defaultId);
        const id = preset?.id ?? defaultId;
        log(`${tag} agent preset mounted id=${id}`);
        return id;
    }
    log(`${tag} CRITICAL: agentPresets has no select/recompose/mount — cannot bind coding-tool preset ${defaultId}`);
    return undefined;
}
