import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { SessionId } from '@deepseek-ai/dsh-session';
import path from 'node:path';
import { mountPlanMcpTools } from './plan-mcp-tools.js';
import { sessionTitleForRun } from './title.js';
import { hostCtx } from './host-ctx.js';
/** Side-effect imports so Context gains `agents` / `systemPrompt` typings. */
import '@deepseek-ai/dsh-agent';
import '@deepseek-ai/dsh-system-prompt';
const PLAN_SYSTEM_SECTION = 'dhs-aplan:plan-system-prompt';
export async function runHarnessTurn(ctx, config, run, log, options = {}) {
    // Own agent lifecycle on the host (root) fiber — see host-ctx.ts. Plugin remount
    // must only stop claim loops, never dispose AgentHandles (audit trail).
    const agents = hostCtx(ctx).agents;
    if (typeof agents?.create !== 'function') {
        throw new Error('dhs-aplan mode=harness requires ctx.agents (load @deepseek-ai/dsh-agent + dsh-agent-loop in the profile)');
    }
    const tag = config.roleKey ? `[dhs-aplan:${config.roleKey}]` : '[dhs-aplan]';
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
                ...(meta ? { meta } : {}),
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
            ...(meta ? { meta } : {}),
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
    let turnError;
    const stopErrorWatch = watchAgentError(agent, (error) => {
        turnError = error;
    });
    let timer;
    let onAbort;
    try {
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
                    reject(new Error('dhs-aplan runner stopped during the turn (plugin disposed / config changed)'));
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
        const output = extractAssistantOutput(agent);
        if (output.startsWith('[dhs-aplan harness]')) {
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
    const prefix = (config.sessionIdPrefix || 'dhs-aplan-').trim() || 'dhs-aplan-';
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
    const cwd = config.cwd.trim();
    if (!cwd)
        return undefined;
    if (!path.isAbsolute(cwd)) {
        throw new Error(`dhs-aplan config.cwd must be an absolute path, got: ${cwd}`);
    }
    return { cwd };
}
async function ensureWorkspaceAttached(ctx, sessionId, cwd, log, tag) {
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
        throw new Error('dhs-aplan mode=harness requires ctx.systemPrompt (load @deepseek-ai/dsh-system-prompt)');
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
function extractAssistantOutput(agent) {
    const messages = agent.session.deriveMessages();
    const assistants = messages.filter((m) => m.role === 'assistant');
    const last = assistants.at(-1);
    if (!last) {
        return '[dhs-aplan harness] agent went idle but no assistant message was produced.';
    }
    const parts = [];
    for (const block of last.content) {
        if (block.type === 'text')
            parts.push(block.text);
        else
            parts.push(`[${block.type}]`);
    }
    const text = parts.join('').trim();
    return text || '[dhs-aplan harness] last assistant message had empty text content.';
}
