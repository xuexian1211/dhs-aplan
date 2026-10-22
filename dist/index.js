import { aplanKeyRef, aplanMcpRef, legacyItsaplanKeyRef, legacyItsaplanMcpRef, resolveSecretValue, softCredentials, } from './secrets.js';
import { startArchiveSweeper } from './archive.js';
import { defaultConfig, resolveRoles, configSignature } from './config.js';
import { RoleRunner } from './runner.js';
import { ConfigSchema } from './schema.js';
import { patchStatus, publishRuntimeStatus, removeStatus } from './status.js';
import { rehydrateAplanSessions } from './rehydrate.js';
import { fixRuntimeAclForWorkspaces } from './fix-runtime-acl.js';
export const name = 'dsh-aplan';
/** Cordis: agents required; workspaceRegistry used to attach sessions into the UI workspace tree. */
export const inject = ['agents', 'workspaceRegistry'];
/** Schema-backed volatile config → served to the GUI page by dsh-settings. */
export const Config = ConfigSchema;
/** How often live (volatile) config is re-read to reconcile role runners. */
const RECONCILE_MS = 3000;
/**
 * Supervisor: one RoleRunner per enabled role. GUI edits land on the volatile config
 * reference; a role whose resolved config changed is stopped and restarted (an idle
 * runner restarts immediately; a busy one reports its run failed first).
 */
export function apply(ctx, rawConfig = {}) {
    const log = (msg) => console.log(msg);
    const runners = new Map();
    let disposed = false;
    const credentials = softCredentials(ctx);
    const readRaw = () => snapshot(rawConfig);
    const read = async () => {
        try {
            const roles = resolveRoles(readRaw());
            const out = [];
            for (const cfg of roles) {
                const claim = await resolveSecretValue(credentials, cfg.claimKeyEnv, aplanKeyRef(cfg.roleKey || 'DEV'), legacyItsaplanKeyRef(cfg.roleKey || 'DEV'));
                let mcpValue = '';
                if (cfg.mcpBearerEnv.trim()) {
                    const mcp = await resolveSecretValue(credentials, cfg.mcpBearerEnv, aplanMcpRef(cfg.roleKey || 'DEV'), legacyItsaplanMcpRef(cfg.roleKey || 'DEV'));
                    mcpValue = mcp.value;
                    if (!mcpValue) {
                        log(`[dsh-aplan${cfg.roleKey ? ':' + cfg.roleKey : ''}] WARN: mcpBearerEnv=${cfg.mcpBearerEnv} resolved empty; Plan MCP will fall back to claim key`);
                    }
                }
                out.push({
                    ...cfg,
                    claimKey: claim.value,
                    mcpBearer: mcpValue,
                });
                if (!claim.value) {
                    patchStatus(cfg.roleKey, { role: cfg.role, state: 'no-key' });
                }
            }
            return out;
        }
        catch (err) {
            log(`[dsh-aplan] config error: ${err instanceof Error ? err.message : String(err)}`);
            return [];
        }
    };
    const publishPaused = (raw) => {
        const roles = Array.isArray(raw.roles) ? raw.roles : [];
        for (const r of roles) {
            if (!r || typeof r !== 'object')
                continue;
            const key = String(r.key ?? '').trim();
            if (r.enabled === false) {
                patchStatus(key, { role: String(r.role ?? key), state: 'paused' });
            }
        }
        if (raw.enabled === false) {
            patchStatus('_', { role: String(raw.role ?? '开发'), state: 'paused' });
        }
    };
    const reconcile = async () => {
        if (disposed)
            return;
        const raw = readRaw();
        publishPaused(raw);
        const wanted = new Map();
        for (const cfg of await read())
            wanted.set(cfg.roleKey || '_', cfg);
        for (const [key, entry] of runners) {
            const next = wanted.get(key);
            if (!next || configSignature(next) !== entry.sig) {
                runners.delete(key);
                await entry.runner.stop(next ? 'config changed' : 'role removed/disabled');
                if (!next)
                    removeStatus(key);
            }
        }
        for (const [key, cfg] of wanted) {
            if (runners.has(key) || disposed)
                continue;
            if (!cfg.claimKey) {
                log(`[dsh-aplan${cfg.roleKey ? ':' + cfg.roleKey : ''}] missing claim key (ref ${cfg.claimKeyEnv || aplanKeyRef(cfg.roleKey || 'DEV')}); idle`);
                patchStatus(cfg.roleKey, { role: cfg.role, state: 'no-key' });
                continue;
            }
            const runner = new RoleRunner(ctx, cfg, log);
            runners.set(key, { sig: configSignature(cfg), runner });
            patchStatus(cfg.roleKey, { role: cfg.role, state: 'idle' });
            void runner.start();
        }
        publishRuntimeStatus(rawConfig);
    };
    const stopArchive = startArchiveSweeper(() => {
        try {
            return resolveRoles(readRaw());
        }
        catch {
            return [];
        }
    }, log);
    ctx.effect(() => {
        let rehydrated = false;
        const boot = async () => {
            try {
                const raw0 = readRaw();
                const enabled = raw0.fixRuntimeAcl !== false;
                const cwds = [];
                if (typeof raw0.cwd === 'string' && raw0.cwd.trim())
                    cwds.push(raw0.cwd);
                for (const r of Array.isArray(raw0.roles) ? raw0.roles : []) {
                    if (r && typeof r === 'object' && typeof r.cwd === 'string' && r.cwd.trim())
                        cwds.push(r.cwd);
                }
                fixRuntimeAclForWorkspaces({ workspaces: cwds, enabled, log });
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                log('[dsh-aplan] fixRuntimeAcl boot error: ' + msg);
            }
            await reconcile();
            if (disposed || rehydrated)
                return;
            rehydrated = true;
            try {
                const configs = await read();
                await rehydrateAplanSessions(ctx, configs, log);
            }
            catch (err) {
                log(`[dsh-aplan] rehydrate boot failed: ${err instanceof Error ? err.message : String(err)}`);
            }
        };
        const first = setTimeout(() => void boot(), 0);
        const timer = setInterval(() => void reconcile(), RECONCILE_MS);
        return () => {
            disposed = true;
            clearTimeout(first);
            clearInterval(timer);
            stopArchive();
            for (const { runner } of runners.values())
                void runner.stop('plugin disposed');
            runners.clear();
            console.log('[dsh-aplan] DISPOSED — claim loops stop requested');
        };
    });
    console.log(`[dsh-aplan] 0.3.21 loaded baseUrl=${defaultConfig.baseUrl} gui=${ConfigSchema ? 'on' : 'off'} credentials=${credentials ? 'on' : 'env-only'}`);
}
function snapshot(raw) {
    const out = {};
    const src = (raw ?? {});
    for (const key of Object.keys(src))
        out[key] = plain(unref(src[key]));
    return out;
}
function unref(v) {
    if (v && typeof v === 'object' && !Array.isArray(v) && typeof v.get === 'function') {
        try {
            return v.get();
        }
        catch {
            return undefined;
        }
    }
    return v;
}
function plain(v) {
    if (Array.isArray(v))
        return v.map((x) => plain(unref(x)));
    if (v && typeof v === 'object') {
        const o = {};
        for (const k of Object.keys(v))
            o[k] = plain(unref(v[k]));
        return o;
    }
    return v;
}
export { defaultConfig, resolveRoles };
