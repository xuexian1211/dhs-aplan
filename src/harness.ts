import type { Context } from '@deepseek-ai/cordis'
import type { Agent, AgentHandle, AgentOptions } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import path from 'node:path'
import type { Config } from './config.js'
import type { PlanRun } from './plan-client.js'
import { mountPlanMcpTools } from './plan-mcp-tools.js'

/** Side-effect imports so Context gains `agents` / `systemPrompt` typings. */
import '@deepseek-ai/dsh-agent'
import '@deepseek-ai/dsh-system-prompt'

export type HarnessLogFn = (msg: string) => void

const PLAN_SYSTEM_SECTION = 'dhs-aplan:plan-system-prompt'

type WorkspaceEntity = {
  record?: { path?: string; title?: string; sessionIds?: string[] }
  attachSession: (sessionId: string) => Promise<void>
}

type WorkspaceRegistry = {
  resolveByPath: (path: string) => Promise<WorkspaceEntity | undefined>
  create: (path: string, title?: string) => Promise<WorkspaceEntity>
}

type AgentDefaultModel = {
  currentSelection: () => { provider: string; model: string; reasoningEffort?: string }
}

export async function runHarnessTurn(
  ctx: Context,
  config: Config,
  run: PlanRun,
  log: HarnessLogFn,
): Promise<string> {
  if (typeof ctx.agents?.create !== 'function') {
    throw new Error(
      'dhs-aplan mode=harness requires ctx.agents (load @deepseek-ai/dsh-agent + dsh-agent-loop in the profile)',
    )
  }

  const sessionId = SessionId(buildSessionId(config, run))
  const agentOptions = buildAgentOptions(ctx, config, log)
  const meta = buildSessionMeta(config)

  let handle: AgentHandle | undefined
  let agent: Agent
  let createdFresh = false

  const live = ctx.agents.get(sessionId)
  if (config.reuseSessionPerIssue && live) {
    log(`[dhs-aplan] harness reuse live session=${sessionId}`)
    agent = live
    installPlanSystemPrompt(agent.ctx, run)
    await mountPlanMcpTools(agent.ctx, config, log)
  } else if (config.reuseSessionPerIssue) {
    try {
      handle = await ctx.agents.resume({
        resumeSessionId: sessionId,
        ...(agentOptions ? { agentOptions } : {}),
        setup: async (agentCtx) => {
          installPlanSystemPrompt(agentCtx, run)
          await mountPlanMcpTools(agentCtx, config, log)
        },
      })
      agent = handle.agent
      log(`[dhs-aplan] harness resumed session=${sessionId}`)
    } catch (resumeErr) {
      const reason = resumeErr instanceof Error ? resumeErr.message : String(resumeErr)
      log(`[dhs-aplan] harness resume skipped (${reason}); creating session=${sessionId}`)
      handle = await ctx.agents.create({
        sessionId,
        ...(agentOptions ? { agentOptions } : {}),
        ...(meta ? { meta } : {}),
        setup: async (agentCtx) => {
          installPlanSystemPrompt(agentCtx, run)
          await mountPlanMcpTools(agentCtx, config, log)
        },
      })
      agent = handle.agent
      createdFresh = true
      log(`[dhs-aplan] harness created session=${sessionId}`)
    }
  } else {
    handle = await ctx.agents.create({
      sessionId,
      ...(agentOptions ? { agentOptions } : {}),
      ...(meta ? { meta } : {}),
      setup: async (agentCtx) => {
        installPlanSystemPrompt(agentCtx, run)
        await mountPlanMcpTools(agentCtx, config, log)
      },
    })
    agent = handle.agent
    createdFresh = true
    log(`[dhs-aplan] harness created session=${sessionId}`)
  }

  // meta.cwd alone only places the session under the path bucket; UI grouping needs attachSession.
  if (meta?.cwd) {
    await ensureWorkspaceAttached(ctx, String(sessionId), meta.cwd, log)
  } else if (createdFresh) {
    log('[dhs-aplan] no config.cwd; session will stay under 未分组 unless the profile sets cwd')
  }

  let turnError: unknown
  const stopErrorWatch = watchAgentError(agent, (error) => {
    turnError = error
  })

  try {
    agent.followup(
      createUserMessage({
        content: [{ type: 'text', text: run.prompt }],
        source: { kind: 'user' },
      }),
    )
    log(`[dhs-aplan] harness followup queued run=${run.id} session=${sessionId}`)
    await agent.whenIdle()
    if (turnError) {
      const message = turnError instanceof Error ? turnError.message : String(turnError)
      throw new Error(`harness session error: ${message}`)
    }
    const output = extractAssistantOutput(agent)
    if (output.startsWith('[dhs-aplan harness]')) {
      throw new Error(output)
    }
    log(
      `[dhs-aplan] harness idle run=${run.id} session=${sessionId} outputChars=${output.length}`,
    )
    return output
  } finally {
    stopErrorWatch()
    if (config.disposeAfterRun && handle) {
      try {
        await handle.dispose()
        log(`[dhs-aplan] harness disposed session=${sessionId}`)
      } catch (disposeErr) {
        log(
          `[dhs-aplan] harness dispose failed session=${sessionId}: ${
            disposeErr instanceof Error ? disposeErr.message : String(disposeErr)
          }`,
        )
      }
    }
  }
}

function buildSessionId(config: Config, run: PlanRun): string {
  const prefix = (config.sessionIdPrefix || 'dhs-aplan-').trim() || 'dhs-aplan-'
  if (config.reuseSessionPerIssue) {
    const key =
      (run.issueIdentifier && run.issueIdentifier.trim()) ||
      (run.issueId != null ? `issue-${run.issueId}` : `run-${run.id}`)
    return `${prefix}${sanitizeId(key)}`
  }
  return `${prefix}run-${run.id}`
}

function sanitizeId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9._:-]+/g, '-').slice(0, 120)
}

function buildAgentOptions(ctx: Context, config: Config, log: HarnessLogFn): AgentOptions | undefined {
  let provider = config.provider.trim()
  let model = config.model.trim()
  if (!provider || !model) {
    const defaults = readDefaultModel(ctx)
    if (defaults) {
      if (!provider) provider = defaults.provider
      if (!model) model = defaults.model
      log(`[dhs-aplan] harness model from agentDefaultModel provider=${provider} model=${model}`)
    }
  }
  if (!provider && !model) {
    log('[dhs-aplan] harness warning: no provider/model in config and agentDefaultModel missing')
    return undefined
  }
  return {
    ...(provider ? { provider } : {}),
    ...(model ? { model } : {}),
  }
}

function readDefaultModel(ctx: Context): { provider: string; model: string } | undefined {
  try {
    const svc = (ctx as Context & { agentDefaultModel?: AgentDefaultModel }).agentDefaultModel
      ?? (ctx as { get?: (name: string) => AgentDefaultModel | undefined }).get?.('agentDefaultModel')
    const sel = svc?.currentSelection?.()
    if (!sel?.provider || !sel?.model) return undefined
    return { provider: String(sel.provider).trim(), model: String(sel.model).trim() }
  } catch {
    return undefined
  }
}

function buildSessionMeta(config: Config): { cwd: string } | undefined {
  const cwd = config.cwd.trim()
  if (!cwd) return undefined
  if (!path.isAbsolute(cwd)) {
    throw new Error(`dhs-aplan config.cwd must be an absolute path, got: ${cwd}`)
  }
  return { cwd }
}

async function ensureWorkspaceAttached(
  ctx: Context,
  sessionId: string,
  cwd: string,
  log: HarnessLogFn,
): Promise<void> {
  const registry = (ctx as Context & { workspaceRegistry?: WorkspaceRegistry }).workspaceRegistry
    ?? (ctx as { get?: (name: string) => WorkspaceRegistry | undefined }).get?.('workspaceRegistry')
  if (!registry || typeof registry.resolveByPath !== 'function') {
    log('[dhs-aplan] workspaceRegistry unavailable; session stays under 未分组')
    return
  }
  try {
    let entity = await registry.resolveByPath(cwd)
    if (!entity) {
      const title = path.basename(cwd) || 'workspace'
      entity = await registry.create(cwd, title)
      log(`[dhs-aplan] created workspace title=${title} path=${cwd}`)
    }
    const already = entity.record?.sessionIds?.includes(sessionId)
    if (already) {
      log(`[dhs-aplan] session already on workspace path=${entity.record?.path ?? cwd}`)
      return
    }
    await entity.attachSession(sessionId)
    log(
      `[dhs-aplan] attached session=${sessionId} to workspace=${entity.record?.title ?? path.basename(cwd)}`,
    )
  } catch (err) {
    log(
      `[dhs-aplan] workspace attach failed session=${sessionId}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    )
  }
}

function watchAgentError(agent: Agent, onError: (error: unknown) => void): () => void {
  try {
    const agentCtx = agent.ctx as Context & {
      on?: (event: string, listener: (payload: { error?: unknown; agent?: Agent }) => void) => () => void
    }
    if (typeof agentCtx.on !== 'function') return () => {}
    return agentCtx.on('agent/error', (payload) => {
      onError(payload?.error ?? payload)
    })
  } catch {
    return () => {}
  }
}

function installPlanSystemPrompt(agentCtx: Context, run: PlanRun): void {
  const text = run.systemPrompt?.trim() ?? ''
  if (!text) return
  if (typeof agentCtx.systemPrompt?.section !== 'function') {
    throw new Error(
      'dhs-aplan mode=harness requires ctx.systemPrompt (load @deepseek-ai/dsh-system-prompt)',
    )
  }
  // Unique per run so reuseSessionPerIssue can re-register without colliding.
  const name = `${PLAN_SYSTEM_SECTION}:${run.id}`
  agentCtx.systemPrompt.section({
    name,
    order: 1500,
    text,
    interpolate: false,
  })
}

function extractAssistantOutput(agent: Agent): string {
  const messages = agent.session.deriveMessages()
  const assistants = messages.filter((m) => m.role === 'assistant')
  const last = assistants.at(-1)
  if (!last) {
    return '[dhs-aplan harness] agent went idle but no assistant message was produced.'
  }
  const parts: string[] = []
  for (const block of last.content) {
    if (block.type === 'text') parts.push(block.text)
    else parts.push(`[${block.type}]`)
  }
  const text = parts.join('').trim()
  return text || '[dhs-aplan harness] last assistant message had empty text content.'
}