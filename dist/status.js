/** In-memory + volatile runtime status for CodexHub-style connection UX. */
const WRITE = Symbol.for('cosmokit.volatile.write');
const byKey = new Map();
export function getStatusSnapshot() {
    return [...byKey.values()].sort((a, b) => a.roleKey.localeCompare(b.roleKey));
}
export function patchStatus(roleKey, patch) {
    const key = roleKey || '_';
    const prev = byKey.get(key);
    const next = {
        roleKey: key === '_' ? '' : key,
        role: patch.role ?? prev?.role ?? '',
        state: patch.state ?? prev?.state ?? 'idle',
        lastClaimAt: patch.lastClaimAt ?? prev?.lastClaimAt,
        lastHeartbeatAt: patch.lastHeartbeatAt ?? prev?.lastHeartbeatAt,
        lastError: patch.lastError === undefined ? prev?.lastError : patch.lastError,
        lastRunId: patch.lastRunId ?? prev?.lastRunId,
        updatedAt: new Date().toISOString(),
    };
    if (patch.state && patch.state !== 'error' && patch.lastError === undefined) {
        next.lastError = undefined;
    }
    byKey.set(key, next);
    return next;
}
export function removeStatus(roleKey) {
    byKey.delete(roleKey || '_');
}
/** Push JSON into volatile runtimeStatus field when present (GUI polls via form scope). */
export function publishRuntimeStatus(rawConfig) {
    if (!rawConfig)
        return;
    const field = rawConfig.runtimeStatus;
    const payload = JSON.stringify(getStatusSnapshot());
    try {
        if (field &&
            typeof field === 'object' &&
            WRITE in field &&
            typeof field[WRITE] === 'function') {
            ;
            field[WRITE](payload);
        }
    }
    catch {
        /* ignore */
    }
}
/** Never include secret values in status JSON. Truncate errors. */
export function safeErrorMessage(err) {
    const s = err instanceof Error ? err.message : String(err);
    return s
        .replace(/Bearer\s+\S+/gi, 'Bearer ***')
        .replace(/x-api-key["']?\s*[:=]\s*["']?[\w-]+/gi, 'x-api-key ***')
        .slice(0, 240);
}
