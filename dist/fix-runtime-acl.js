import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
function run(cmd, args, label, log) {
    const r = spawnSync(cmd, args, { encoding: 'utf8', windowsHide: true, shell: false });
    const out = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim();
    if (out)
        log(`[dsh-aplan] fixRuntimeAcl ${label}: ${out.split(/\r?\n/).slice(0, 6).join(' | ')}`);
    if (r.error) {
        log(`[dsh-aplan] fixRuntimeAcl ${label} spawn error: ${r.error.message}`);
        return 1;
    }
    return r.status ?? 1;
}
function icaclsSummary(target) {
    const r = spawnSync('icacls.exe', [target], { encoding: 'utf8', windowsHide: true });
    return `${r.stdout ?? ''}${r.stderr ?? ''}`;
}
/** Resolve the packaged / repo copy of Fix-runtime-acl.ps1 when present. */
export function resolveFixScriptPath() {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const candidates = [
        path.join(here, '..', 'scripts', 'Fix-runtime-acl.ps1'),
        path.join(process.cwd(), 'scripts', 'Fix-runtime-acl.ps1'),
    ];
    for (const p of candidates) {
        try {
            if (fs.existsSync(p))
                return p;
        }
        catch {
            /* ignore */
        }
    }
    return undefined;
}
function fixOneInline(workspace, log) {
    const runtime = path.join(workspace, '.runtime');
    if (!fs.existsSync(runtime)) {
        try {
            fs.mkdirSync(runtime, { recursive: true });
            log(`[dsh-aplan] fixRuntimeAcl created ${runtime}`);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            log('[dsh-aplan] fixRuntimeAcl mkdir failed ' + runtime + ': ' + msg);
            return;
        }
    }
    const user = process.env.USERNAME
        ? `${process.env.USERDOMAIN ? process.env.USERDOMAIN + '\\' : ''}${process.env.USERNAME}`
        : os.userInfo().username;
    run('takeown.exe', ['/F', runtime, '/R', '/D', 'Y'], 'takeown', log);
    run('icacls.exe', [runtime, '/grant', `${user}:(OI)(CI)(F)`, '/T', '/C'], 'grant', log);
    const rem = run('icacls.exe', [runtime, '/remove:d', 'Everyone', '/T', '/C'], 'remove-Everyone-DENY', log);
    if (rem !== 0)
        log('[dsh-aplan] fixRuntimeAcl remove Everyone DENY exit=' + rem + ' (ok if ACE absent)');
    run('icacls.exe', [runtime, '/setintegritylevel', '(OI)(CI)M', '/T', '/C'], 'setintegritylevel-Medium', log);
    const summary = icaclsSummary(runtime);
    const hasMedium = /Medium Mandatory Level/i.test(summary);
    const hasEveryoneDeny = /Everyone:.*DENY/i.test(summary) || /Everyone:\(N\)/i.test(summary);
    const rootLow = /Low Mandatory Level/i.test(icaclsSummary(workspace));
    log('[dsh-aplan] fixRuntimeAcl verify workspace=' + workspace + ' medium=' + (hasMedium ? 'yes' : 'no') + ' everyoneDeny=' + (hasEveryoneDeny ? 'YES' : 'no') + ' rootLow=' + (rootLow ? 'YES' : 'no'));
    if (rootLow && hasMedium) {
        log('[dsh-aplan] fixRuntimeAcl WARN: repo-root Low IL + .runtime Medium -> No-Write-Up may still block Low sandbox writes into .runtime');
    }
}
function fixOneViaScript(script, workspace, log) {
    const shell = process.env.SystemRoot
        ? path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
        : 'powershell.exe';
    const r = spawnSync(shell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-Workspace', workspace], { encoding: 'utf8', windowsHide: true, timeout: 120_000 });
    const out = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim();
    if (out) {
        for (const line of out.split(/\r?\n/).slice(0, 40))
            log(`[dsh-aplan] fixRuntimeAcl| ${line}`);
    }
    if (r.error) {
        log(`[dsh-aplan] fixRuntimeAcl script spawn error: ${r.error.message}`);
        return false;
    }
    if ((r.status ?? 1) !== 0) {
        log(`[dsh-aplan] fixRuntimeAcl script exit=${r.status}`);
        return false;
    }
    return true;
}
export function fixRuntimeAclForWorkspaces(opts) {
    if (!opts.enabled) {
        opts.log('[dsh-aplan] fixRuntimeAcl skipped (fixRuntimeAcl=false)');
        return;
    }
    if (process.platform !== 'win32') {
        opts.log('[dsh-aplan] fixRuntimeAcl skipped (not win32)');
        return;
    }
    const seen = new Set();
    const roots = [];
    for (const raw of opts.workspaces) {
        const w = String(raw ?? '').trim();
        if (!w)
            continue;
        let abs;
        try {
            abs = path.resolve(w);
        }
        catch {
            continue;
        }
        const key = abs.toLowerCase();
        if (seen.has(key))
            continue;
        seen.add(key);
        if (!fs.existsSync(abs)) {
            opts.log('[dsh-aplan] fixRuntimeAcl skip missing cwd=' + abs);
            continue;
        }
        roots.push(abs);
    }
    if (roots.length === 0) {
        opts.log('[dsh-aplan] fixRuntimeAcl no cwd configured; nothing to fix');
        return;
    }
    const script = resolveFixScriptPath();
    for (const workspace of roots) {
        opts.log('[dsh-aplan] fixRuntimeAcl start workspace=' + workspace);
        try {
            if (script && fixOneViaScript(script, workspace, opts.log))
                continue;
            fixOneInline(workspace, opts.log);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            opts.log('[dsh-aplan] fixRuntimeAcl failed workspace=' + workspace + ': ' + msg);
        }
    }
}
