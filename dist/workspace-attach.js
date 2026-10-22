import path from 'node:path';
/** Place a session under the workspace path bucket so it shows in the workbench. */
export async function ensureWorkspaceAttached(ctx, sessionId, cwd, log, tag) {
    const registry = ctx.workspaceRegistry ??
        ctx.get?.('workspaceRegistry');
    if (!registry || typeof registry.resolveByPath !== 'function') {
        log(`${tag} workspaceRegistry unavailable; session stays ungrouped`);
        return;
    }
    try {
        let entity = await registry.resolveByPath(cwd);
        if (!entity) {
            const title = path.basename(cwd) || 'workspace';
            entity = await registry.create(cwd, title);
            log(`${tag} created workspace title=${title} path=${cwd}`);
        }
        const already = entity.record?.sessionIds?.includes(sessionId);
        if (already) {
            log(`${tag} session already on workspace path=${entity.record?.path ?? cwd}`);
            return;
        }
        await entity.attachSession(sessionId);
        log(`${tag} attached session=${sessionId} to workspace=${entity.record?.title ?? path.basename(cwd)}`);
    }
    catch (err) {
        log(`${tag} workspace attach failed session=${sessionId}: ${err instanceof Error ? err.message : String(err)}`);
    }
}
