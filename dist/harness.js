import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { SessionId } from '@deepseek-ai/dsh-session';
import path from 'node:path';
/** Side-effect imports so Context gains `agents` / `systemPrompt` typings. */
import '@deepseek-ai/dsh-agent';
import '@deepseek-ai/dsh-system-prompt';
const PLAN_SYSTEM_SECTION = 'dhs-aplan:plan-system-prompt';
export async function runHarnessTurn(ctx, config, run, log) {
    if (typeof ctx.agents?.create !== 'function') {
        throw new Error('dhs-aplan mode=harness requires ctx.agents (load @deepseek-ai/dsh-agent + dsh-agent-loop in the profile)');
    }
    const sessionId = SessionId(buildSessionId(config, run));
    const agentOptions = buildAgentOptions(config);
    const meta = buildSessionMeta(config);
    let handle;
    let agent;
    const live = ctx.agents.get(sessionId);
    if (config.reuseSessionPerIssue && live) {
        log(`[dhs-aplan] harness reuse live session=${sessionId}`);
        agent = live;
        installPlanSystemPrompt(agent.ctx, run);
    }
    else if (config.reuseSessionPerIssue) {
        try {
            handle = await ctx.agents.resume({
                resumeSessionId: sessionId,
                ...(agentOptions ? { agentOptions } : {}),
                setup: (agentCtx) => {
                    installPlanSystemPrompt(agentCtx, run);
                },
            });
            agent = handle.agent;
            log(`[dhs-aplan] harness resumed session=${sessionId}`);
        }
        catch (resumeErr) {
            const reason = resumeErr instanceof Error ? resumeErr.message : String(resumeErr);
            log(`[dhs-aplan] harness resume skipped (${reason}); creating session=${sessionId}`);
            handle = await ctx.agents.create({
                sessionId,
                ...(agentOptions ? { agentOptions } : {}),
                ...(meta ? { meta } : {}),
                setup: (agentCtx) => {
                    installPlanSystemPrompt(agentCtx, run);
                },
            });
            agent = handle.agent;
            log(`[dhs-aplan] harness created session=${sessionId}`);
        }
    }
    else {
        handle = await ctx.agents.create({
            sessionId,
            ...(agentOptions ? { agentOptions } : {}),
            ...(meta ? { meta } : {}),
            setup: (agentCtx) => {
                installPlanSystemPrompt(agentCtx, run);
            },
        });
        agent = handle.agent;
        log(`[dhs-aplan] harness created session=${sessionId}`);
    }
    try {
        agent.followup(createUserMessage({
            content: [{ type: 'text', text: run.prompt }],
            source: { kind: 'user' },
        }));
        log(`[dhs-aplan] harness followup queued run=${run.id} session=${sessionId}`);
        await agent.whenIdle();
        const output = extractAssistantOutput(agent);
        log(`[dhs-aplan] harness idle run=${run.id} session=${sessionId} outputChars=${output.length}`);
        return output;
    }
    finally {
        if (config.disposeAfterRun && handle) {
            try {
                await handle.dispose();
                log(`[dhs-aplan] harness disposed session=${sessionId}`);
            }
            catch (disposeErr) {
                log(`[dhs-aplan] harness dispose failed session=${sessionId}: ${disposeErr instanceof Error ? disposeErr.message : String(disposeErr)}`);
            }
        }
    }
}
function buildSessionId(config, run) {
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
function buildAgentOptions(config) {
    const provider = config.provider.trim();
    const model = config.model.trim();
    if (!provider && !model)
        return undefined;
    return {
        ...(provider ? { provider } : {}),
        ...(model ? { model } : {}),
    };
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
