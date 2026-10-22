import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { SessionId } from '@deepseek-ai/dsh-session';
import path from 'node:path';
import { mountPlanMcpTools } from './plan-mcp-tools.js';
import { sessionTitleForRun } from './title.js';
import { hostCtx } from './host-ctx.js';
import { ensureAgentPreset } from './ensure-agent-preset.js';
import { ensureWorkspaceAttached } from './workspace-attach.js';
/** Side-effect imports so Context gains `agents` / `systemPrompt` typings. */
import '@deepseek-ai/dsh-agent';
import '@deepseek-ai/dsh-system-prompt';
const PLAN_SYSTEM_SECTION = 'dsh-aplan:plan-system-prompt';
export async function runHarnessTurn(ctx, config, run, log, options = {}) {
    // Own agent lifecycle on the host (root) fiber — see host-ctx.ts. Plugin remount
    // must only stop claim loops, never dispose AgentHandles (audit trail).
    const agents = hostCtx(ctx).agents;
    if (typeof agents?.create !== 'function') {
        throw new Error('dsh-aplan mode=harness requires ctx.agents (load @deepseek-ai/dsh-agent + dsh-agent-loop in the profile)');
    }
    const tag = config.roleKey ? `[dsh-aplan:${config.roleKey}]` : '[dsh-aplan]';
    const sessionId = SessionId(buildSessionId(config, run));
    const agentOptions = buildAgentOptions(ctx, config, log, tag);
    const meta = buildSessionMeta(config);
    const setup = async (agentCtx) => {
        installPlanSystemPrompt(agentCtx, run);
        await mountPlanMcpTools(agentCtx, config, log);
    };
    let handle;
    let agent;
    let createdFresh = false;
    const live = agents.get(sessionId);
    if (config.reuseSessionPerIssue && live) {
        log(`${tag} harness reuse live session=${sessionId}`);
        agent = live;
        await setup(agent.ctx);
    }
    else if (config.reuseSessionPerIssue) {
        try {
            handle = await agents.resume({
                resumeSessionId: sessionId,
                ...(agentOptions ? { agentOptions } : {}),
                setup,
            });
            agent = handle.agent;
            log(`${tag} harness resumed session=${sessionId}`);
        }
        catch (resumeErr) {
            const reason = resumeErr instanceof Error ? resumeErr.message : String(resumeErr);
            log(`${tag} harness resume skipped (${reason}); creating session=${sessionId}`);
            handle = await agents.create({
                sessionId,
                ...(agentOptions ? { agentOptions } : {}),
                meta,
                setup,
            });
            agent = handle.agent;
            createdFresh = true;
            log(`${tag} harness created session=${sessionId}`);
        }
    }
    else {
        handle = await agents.create({
            sessionId,
            ...(agentOptions ? { agentOptions } : {}),
            meta,
            setup,
        });
        agent = handle.agent;
        createdFresh = true;
        log(`${tag} harness created session=${sessionId}`);
    }
    if (config.setSessionTitle && (createdFresh || config.renameExistingSession)) {
        applySessionTitle(ctx, agent, sessionTitleForRun(run, config.role), String(sessionId), log, tag);
    }
    // meta.cwd alone only places the session under the path bucket; UI grouping needs attachSession.
    if (meta?.cwd) {
        await ensureWorkspaceAttached(ctx, String(sessionId), meta.cwd, log, tag);
    }
    else if (createdFresh) {
        log(`${tag} no config.cwd; session will stay ungrouped unless the profile sets cwd`);
    }
    // Host tool-fs/bash/pwsh are disabled on the web plane; coding tools live in agent presets.
    // meta.agentPreset covers fresh creates; ensureAgentPreset covers resume/live reuse.
    await ensureAgentPreset(ctx, agent, log, tag);
    // Session permission / sandbox mode (DSH three levels: read-only | workspace-write | danger-full-access).
    // AE-133 only succeeded after the user set DSH session permission to 完全权限.
    applyPermissionPreset(ctx, agent, config, log, tag);
    let turnError;
    const stopErrorWatch = watchAgentError(agent, (error) => {
        turnError = error;
    });
    let timer;
    let onAbort;
    try {
        // Capture pre-followup assistant history so a blocked/empty turn cannot
        // reuse a prior interrupted reasoning-only message as a false success.
        const assistantBaseline = snapshotAssistantBaseline(agent);
        agent.followup(createUserMessage({
            content: [{ type: 'text', text: run.prompt }],
            source: { kind: 'user' },
        }));
        log(`${tag} harness followup queued run=${run.id} session=${sessionId}`);
        const stoppers = [];
        if (config.turnTimeoutMs > 0) {
            stoppers.push(new Promise((_, reject) => {
                timer = setTimeout(() => {
                    interruptAgent(agent, log, tag);
                    reject(new Error(`harness turn timed out after ${config.turnTimeoutMs}ms`));
                }, config.turnTimeoutMs);
            }));
        }
        if (options.signal) {
            stoppers.push(new Promise((_, reject) => {
                onAbort = () => {
                    interruptAgent(agent, log, tag);
                    reject(new Error('dsh-aplan runner stopped during the turn (plugin disposed / config changed)'));
                };
                if (options.signal.aborted)
                    onAbort();
                else
                    options.signal.addEventListener('abort', onAbort, { once: true });
            }));
        }
        await Promise.race([agent.whenIdle(), ...stoppers]);
        if (turnError) {
            const message = turnError instanceof Error ? turnError.message : String(turnError);
            throw new Error(`harness session error: ${message}`);
        }
        const output = extractAssistantOutput(agent, assistantBaseline);
        if (output.startsWith('[dsh-aplan harness]')) {
            throw new Error(output);
        }
        log(`${tag} harness idle run=${run.id} session=${sessionId} outputChars=${output.length}`);
        return output;
    }
    finally {
        if (timer)
            clearTimeout(timer);
        if (onAbort && options.signal)
            options.signal.removeEventListener('abort', onAbort);
        stopErrorWatch();
        if (config.disposeAfterRun && handle) {
            try {
                await handle.dispose();
                log(`${tag} harness disposed session=${sessionId}`);
            }
            catch (disposeErr) {
                log(`${tag} harness dispose failed session=${sessionId}: ${disposeErr instanceof Error ? disposeErr.message : String(disposeErr)}`);
            }
        }
    }
}
export function buildSessionId(config, run) {
    const prefix = (config.sessionIdPrefix || 'dsh-aplan-').trim() || 'dsh-aplan-';
    if (config.reuseSessionPerIssue) {
        const key = (run.issueIdentifier && run.issueIdentifier.trim()) ||
            (run.issueId != null ? `issue-${run.issueId}` : `run-${run.id}`);
        return `${prefix}${sanitizeId(key)}`;
    }
    return `${prefix}run-${run.id}`;
}
function sanitizeId(raw) {
    return raw.replace(/[^a-zA-Z0-9._:-]+/g, '-').slice(0, 120);
}
/**
 * Pin the session title via @deepseek-ai/dsh-session-title `rename()`.
 * A user-source title also stops the automatic LLM title (which timed out on AE-69).
 */
function applySessionTitle(ctx, agent, title, sessionId, log, tag) {
    try {
        const svc = ctx.get?.('sessionTitle');
        if (!svc || typeof svc.rename !== 'function') {
            log(`${tag} sessionTitle service unavailable; title not set session=${sessionId}`);
            return;
        }
        const session = agent.session;
        const current = svc.get?.(session)?.title;
        if (current === title)
            return;
        svc.rename(session, title);
        log(`${tag} session title set session=${sessionId} title=${title}`);
    }
    catch (err) {
        log(`${tag} session title failed session=${sessionId}: ${err instanceof Error ? err.message : String(err)}`);
    }
}
function interruptAgent(agent, log, tag) {
    const a = agent;
    for (const name of ['interrupt', 'abort', 'cancel', 'stop']) {
        const fn = a[name];
        if (typeof fn === 'function') {
            try {
                ;
                fn.call(agent);
                log(`${tag} harness agent.${name}() called`);
            }
            catch {
                /* best effort */
            }
            return;
        }
    }
}
/**
 * Apply the role's DSH permission preset via `ctx.permissionPresets.set(session, name)`.
 * Bundles sandbox mode + approval policy (see @deepseek-ai/dsh-permission-presets / dsh-base):
 * - read-only → sandbox read-only + approval ask (仅可查看)
 * - workspace-write → sandbox workspace-write + approval ask (工作区内修改)
 * - danger-full-access → sandbox danger-full-access + approval never (完全权限)
 */
function applyPermissionPreset(ctx, agent, config, log, tag) {
    const preset = (config.permissionPreset || '').trim();
    if (!preset)
        return;
    try {
        const host = hostCtx(ctx);
        const svc = host.permissionPresets ?? host.get?.('permissionPresets');
        if (!svc || typeof svc.set !== 'function') {
            log(`${tag} permissionPresets service unavailable; preset=${preset} not applied`);
            return;
        }
        const session = agent.session;
        if (!session) {
            log(`${tag} permission preset skipped (no agent.session) preset=${preset}`);
            return;
        }
        svc.set(session, preset);
        log(`${tag} permission preset set preset=${preset}`);
    }
    catch (err) {
        log(`${tag} permission preset failed preset=${preset}: ${err instanceof Error ? err.message : String(err)}`);
    }
}
function buildAgentOptions(ctx, config, log, tag) {
    let provider = config.provider.trim();
    let model = config.model.trim();
    if (!provider || !model) {
        const defaults = readDefaultModel(ctx);
        if (defaults) {
            if (!provider)
                provider = defaults.provider;
            if (!model)
                model = defaults.model;
            log(`${tag} harness model from agentDefaultModel provider=${provider} model=${model}`);
        }
    }
    if (!provider && !model) {
        log(`${tag} harness warning: no provider/model in config and agentDefaultModel missing`);
        return undefined;
    }
    const effort = (config.reasoningEffort || '').trim();
    if (effort)
        log(`${tag} harness reasoningEffort=${effort}`);
    return {
        ...(provider ? { provider } : {}),
        ...(model ? { model } : {}),
        ...(effort ? { reasoningEffort: effort } : {}),
    };
}
function readDefaultModel(ctx) {
    try {
        const svc = ctx.agentDefaultModel ??
            ctx.get?.('agentDefaultModel');
        const sel = svc?.currentSelection?.();
        if (!sel?.provider || !sel?.model)
            return undefined;
        return { provider: String(sel.provider).trim(), model: String(sel.model).trim() };
    }
    catch {
        return undefined;
    }
}
function buildSessionMeta(config) {
    // UI-created workspace sessions always set meta.agentPreset (usually "standard").
    // Omitting it leaves harness agents with Plan MCP only — no tool-fs/shell/git.
    const cwd = config.cwd.trim();
    if (cwd && !path.isAbsolute(cwd)) {
        throw new Error(`dsh-aplan config.cwd must be an absolute path, got: ${cwd}`);
    }
    const agentPreset = 'standard';
    return {
        ...(cwd ? { cwd } : {}),
        agentPreset,
    };
}
function watchAgentError(agent, onError) {
    try {
        const agentCtx = agent.ctx;
        if (typeof agentCtx.on !== 'function')
            return () => { };
        return agentCtx.on('agent/error', (payload) => {
            onError(payload?.error ?? payload);
        });
    }
    catch {
        return () => { };
    }
}
function installPlanSystemPrompt(agentCtx, run) {
    const text = run.systemPrompt?.trim() ?? '';
    if (!text)
        return;
    if (typeof agentCtx.systemPrompt?.section !== 'function') {
        throw new Error('dsh-aplan mode=harness requires ctx.systemPrompt (load @deepseek-ai/dsh-system-prompt)');
    }
    // Unique per run so reuseSessionPerIssue can re-register without colliding.
    const name = `${PLAN_SYSTEM_SECTION}:${run.id}`;
    agentCtx.systemPrompt.section({
        name,
        order: 1500,
        text,
        interpolate: false,
    });
}
function snapshotAssistantBaseline(agent) {
    const assistants = agent.session.deriveMessages().filter((m) => m.role === 'assistant');
    const last = assistants.at(-1);
    return {
        lastAssistantId: last && typeof last.id === 'string' ? last.id : null,
        assistantCount: assistants.length,
    };
}
/**
 * True when the joined extraction is only `[type]` placeholders (e.g. `[reasoning]`),
 * with no real assistant text. Those used to look non-empty (11 chars) and false-succeed.
 */
export function isPlaceholderOnlyOutput(raw) {
    const t = raw.trim();
    if (!t)
        return true;
    return /^(?:\[[^\]]+\])+$/i.test(t);
}
function summarizeAssistantContent(content) {
    const textParts = [];
    const placeholders = [];
    const toolNames = [];
    for (const block of content) {
        const type = block?.type;
        if (type === 'text') {
            textParts.push(typeof block.text === 'string' ? block.text : '');
        }
        else if (type === 'tool-call') {
            toolNames.push(typeof block.name === 'string' && block.name ? block.name : 'tool-call');
        }
        else if (typeof type === 'string' && type.length > 0) {
            placeholders.push(`[${type}]`);
        }
    }
    return {
        realText: textParts.join('').trim(),
        placeholders,
        toolNames,
    };
}
/**
 * Extract success-gate output for this harness run only.
 * - Ignores assistants that existed before the followup (no reuse of prior `[reasoning]`).
 * - Placeholder-only content (`[reasoning]`, `[thinking]`, …) counts as empty → error string.
 * - Succeeds with real text, or with evidence of tool-calls produced this run.
 */
function extractAssistantOutput(agent, baseline) {
    const assistants = agent.session.deriveMessages().filter((m) => m.role === 'assistant');
    let startIdx = baseline.assistantCount;
    if (baseline.lastAssistantId) {
        const byId = assistants.findIndex((m) => m.id === baseline.lastAssistantId);
        if (byId >= 0)
            startIdx = byId + 1;
    }
    const produced = assistants.slice(Math.max(0, startIdx));
    if (produced.length === 0) {
        return '[dsh-aplan harness] agent went idle but no new assistant message was produced this turn.';
    }
    let anyRealText = false;
    let anyTools = false;
    const toolNames = [];
    let lastRealText = '';
    for (const m of produced) {
        const summary = summarizeAssistantContent(m.content);
        if (summary.realText) {
            anyRealText = true;
            lastRealText = summary.realText;
        }
        if (summary.toolNames.length > 0) {
            anyTools = true;
            toolNames.push(...summary.toolNames);
        }
    }
    if (anyRealText)
        return lastRealText;
    if (anyTools) {
        const uniq = [...new Set(toolNames)];
        return `(tools this turn: ${uniq.join(', ')})`;
    }
    // Reasoning/thinking-only (or other `[type]` placeholders) → same failure as empty text.
    return '[dsh-aplan harness] last assistant message had empty text content.';
}
