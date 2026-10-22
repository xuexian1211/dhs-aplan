/** Stable credential ref / env name for a role's claim key. */
export function aplanKeyRef(roleKey) {
    const k = String(roleKey || 'DEV').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_') || 'DEV';
    return `APLAN_KEY_${k}`;
}
/** Stable credential ref / env name for a role's MCP bearer (optional). */
export function aplanMcpRef(roleKey) {
    const k = String(roleKey || 'DEV').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_') || 'DEV';
    return `APLAN_MCP_${k}`;
}
/** ITSAPLAN_* twin used only as read fallback for existing installs. */
export function legacyItsaplanKeyRef(roleKey) {
    const k = String(roleKey || 'DEV').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_') || 'DEV';
    return `ITSAPLAN_KEY_${k}`;
}
export function legacyItsaplanMcpRef(roleKey) {
    const k = String(roleKey || 'DEV').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_') || 'DEV';
    return `ITSAPLAN_MCP_${k}`;
}
function fromEnv(name) {
    const n = name.trim();
    if (!n)
        return '';
    return (process.env[n] ?? '').trim();
}
async function fromCredentials(credentials, name) {
    const n = name.trim();
    if (!n || !credentials?.resolve)
        return '';
    try {
        const hit = await credentials.resolve(n);
        return (hit?.value ?? '').trim();
    }
    catch {
        return '';
    }
}
/**
 * Resolve one secret by preferred env/ref name, then APLAN auto-name, then ITSAPLAN legacy.
 * Never logs the value.
 */
export async function resolveSecretValue(credentials, preferredEnvName, autoRef, legacyRef) {
    const candidates = [preferredEnvName, autoRef, legacyRef || ''].map((s) => s.trim()).filter(Boolean);
    const seen = new Set();
    const names = candidates.filter((n) => (seen.has(n) ? false : (seen.add(n), true)));
    for (const name of names) {
        const viaCred = await fromCredentials(credentials, name);
        if (viaCred)
            return { value: viaCred, source: 'credentials', ref: name };
    }
    for (const name of names) {
        const viaEnv = fromEnv(name);
        if (viaEnv) {
            const isLegacy = Boolean(legacyRef && name === legacyRef);
            return { value: viaEnv, source: isLegacy ? 'legacy' : 'env', ref: name };
        }
    }
    return { value: '', source: '', ref: preferredEnvName.trim() || autoRef };
}
/** Soft-read ctx.credentials without hard-inject (Desktop base composition mounts it). */
export function softCredentials(ctx) {
    try {
        if (ctx.credentials && typeof ctx.credentials === 'object')
            return ctx.credentials;
        if (typeof ctx.get === 'function') {
            const c = ctx.get('credentials');
            if (c && typeof c === 'object')
                return c;
        }
    }
    catch {
        /* ignore */
    }
    return undefined;
}
