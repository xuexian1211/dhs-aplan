import type { Context } from '@deepseek-ai/cordis'
import type { Agent, AgentHandle, AgentOptions } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import path from 'node:path'
import type { Config } from './config.js'
import type { PlanRun } from './plan-client.js'
import { mountPlanMcpTools } from './plan-mcp-tools.js'
import { sessionTitleForRun } from './title.js'
import { hostCtx } from './host-ctx.js'

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

/** @deepseek-ai/dsh-session-title service (ctx.sessionTitle). Optional. */
type SessionTitleService = {
  get: (session: unknown) => { title?: string } | undefined
  rename: (session: unknown, title: string) => { title?: string }
}

export interface HarnessTurnOptions {
  /** Aborted when the plugin is disposed or the role runner is stopped. */
  signal?: AbortSignal
}

export async function runHarnessTurn(
  ctx: Context,
  config: Config,
  run: PlanRun,
  log: HarnessLogFn,
  options: HarnessTurnOptions = {},
): Promise<string> {
  // Own agent lifecycle on the host (root) fiber — see host-ctx.ts. Plugin remount
  // must only stop claim loops, never dispose AgentHandles (audit trail).
  const agents = hostCtx(ctx).agents
  if (typeof agents?.create !== 'function') {
    throw new Error(
      'dhs-aplan mode=harness requires ctx.agents (load @deepseek-ai/dsh-agent + dsh-agent-loop in the profile)',
    )
  }

  const tag = config.roleKey ? `[dhs-aplan:${config.roleKey}]` : '[dhs-aplan]'
  const sessionId = SessionId(buildSessionId(config, run))
  const agentOptions = buildAgentOptions(ctx, config, log, tag)
  const meta = buildSessionMeta(config)
  const setup = async (agentCtx: Context) => {
    installPlanSystemPrompt(agentCtx, run)
    await mountPlanMcpTools(agentCtx, config, log)
  }

  let handle: AgentHandle | undefined
  let agent: Agent
  let createdFresh = false

  const live = agents.get(sessionId)
  if (config.reuseSessionPerIssue && live) {
    log(`${tag} harness reuse live session=${sessionId}`)
    agent = live
    await setup(agent.ctx)
  } else if (config.reuseSessionPerIssue) {
    try {
      handle = await agents.resume({
        resumeSessionId: sessionId,
        ...(agentOptions ? { agentOptions } : {}),
        setup,
      })
      agent = handle.agent
      log(`${tag} harness resumed session=${sessionId}`)
    } catch (resumeErr) {
      const reason = resumeErr instanceof Error ? resumeErr.message : String(resumeErr)
      log(`${tag} harness resume skipped (${reason}); creating session=${sessionId}`)
      handle = await agents.create({
        sessionId,
        ...(agentOptions ? { agentOptions } : {}),
        ...(meta ? { meta } : {}),
        setup,
      })
      agent = handle.agent
      createdFresh = true
      log(`${tag} harness created session=${sessionId}`)
    }
  } else {
    handle = await agents.create({
      sessionId,
      ...(agentOptions ? { agentOptions } : {}),
      ...(meta ? { meta } : {}),
      setup,
    })
    agent = handle.agent
    createdFresh = true
    log(`${tag} harness created session=${sessionId}`)
  }

  if (config.setSessionTitle && (createdFresh || config.renameExistingSession)) {
    applySessionTitle(ctx, agent, sessionTitleForRun(run, config.role), String(sessionId), log, tag)
  }

  // meta.cwd alone only places the session under the path bucket; UI grouping needs attachSession.
  if (meta?.cwd) {
    await ensureWorkspaceAttached(ctx, String(sessionId), meta.cwd, log, tag)
  } else if (createdFresh) {
    log(`${tag} no config.cwd; session will stay ungrouped unless the profile sets cwd`)
  }

  let turnError: unknown
  const stopErrorWatch = watchAgentError(agent, (error) => {
    turnError = error
  })

  let timer: ReturnType<typeof setTimeout> | undefined
  let onAbort: (() => void) | undefined
  try {
    agent.followup(
      createUserMessage({
        content: [{ type: 'text', text: run.prompt }],
        source: { kind: 'user' },
      }),
    )
    log(`${tag} harness followup queued run=${run.id} session=${sessionId}`)

    const stoppers: Promise<never>[] = []
    if (config.turnTimeoutMs > 0) {
      stoppers.push(
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            interruptAgent(agent, log, tag)
            reject(new Error(`harness turn timed out after ${config.turnTimeoutMs}ms`))
          }, config.turnTimeoutMs)
        }),
      )
    }
    if (options.signal) {
      stoppers.push(
        new Promise<never>((_, reject) => {
          onAbort = () => {
            interruptAgent(agent, log, tag)
            reject(new Error('dhs-aplan runner stopped during the turn (plugin disposed / config changed)'))
          }
          if (options.signal!.aborted) onAbort()
          else options.signal!.addEventListener('abort', onAbort, { once: true })
        }),
      )
    }
    await Promise.race([agent.whenIdle(), ...stoppers])

    if (turnError) {
      const message = turnError instanceof Error ? turnError.message : String(turnError)
      throw new Error(`harness session error: ${message}`)
    }
    const output = extractAssistantOutput(agent)
    if (output.startsWith('[dhs-aplan harness]')) {
      throw new Error(output)
    }
    log(`${tag} harness idle run=${run.id} session=${sessionId} outputChars=${output.length}`)
    return output
  } finally {
    if (timer) clearTimeout(timer)
    if (onAbort && options.signal) options.signal.removeEventListener('abort', onAbort)
    stopErrorWatch()
    if (config.disposeAfterRun && handle) {
      try {
        await handle.dispose()
        log(`${tag} harness disposed session=${sessionId}`)
      } catch (disposeErr) {
        log(
          `${tag} harness dispose failed session=${sessionId}: ${
            disposeErr instanceof Error ? disposeErr.message : String(disposeErr)
          }`,
        )
      }
    }
  }
}

export function buildSessionId(config: Config, run: PlanRun): string {
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

/**
 * Pin the session title via @deepseek-ai/dsh-session-title `rename()`.
 * A user-source title also stops the automatic LLM title (which timed out on AE-69).
 */
function applySessionTitle(
  ctx: Context,
  agent: Agent,
  title: string,
  sessionId: string,
  log: HarnessLogFn,
  tag: string,
): void {
  try {
    const svc = (ctx as { get?: (name: string) => unknown }).get?.('sessionTitle') as
      | SessionTitleService
      | undefined
    if (!svc || typeof svc.rename !== 'function') {
      log(`${tag} sessionTitle service unavailable; title not set session=${sessionId}`)
      return
    }
    const session = (agent as { session?: unknown }).session
    const current = svc.get?.(session)?.title
    if (current === title) return
    svc.rename(session, title)
    log(`${tag} session title set session=${sessionId} title=${title}`)
  } catch (err) {
    log(
      `${tag} session title failed session=${sessionId}: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}

function interruptAgent(agent: Agent, log: HarnessLogFn, tag: string): void {
  const a = agent as unknown as Record<string, unknown>
  for (const name of ['interrupt', 'abort', 'cancel', 'stop']) {
    const fn = a[name]
    if (typeof fn === 'function') {
      try {
        ;(fn as () => unknown).call(agent)
        log(`${tag} harness agent.${name}() called`)
      } catch {
        /* best effort */
      }
      return
    }
  }
}

function buildAgentOptions(
  ctx: Context,
  config: Config,
  log: HarnessLogFn,
  tag: string,
): AgentOptions | undefined {
  let provider = config.provider.trim()
  let model = config.model.trim()
  if (!provider || !model) {
    const defaults = readDefaultModel(ctx)
    if (defaults) {
      if (!provider) provider = defaults.provider
      if (!model) model = defaults.model
      log(`${tag} harness model from agentDefaultModel provider=${provider} model=${model}`)
    }
  }
  if (!provider && !model) {
    log(`${tag} harness warning: no provider/model in config and agentDefaultModel missing`)
    return undefined
  }
  const effort = (config.reasoningEffort || '').trim()
  if (effort) log(`${tag} harness reasoningEffort=${effort}`)
  return {
    ...(provider ? { provider } : {}),
    ...(model ? { model } : {}),
    ...(effort ? { reasoningEffort: effort as never } : {}),
  }
}

function readDefaultModel(ctx: Context): { provider: string; model: string } | undefined {
  try {
    const svc =
      (ctx as Context & { agentDefaultModel?: AgentDefaultModel }).agentDefaultModel ??
      (ctx as { get?: (name: string) => AgentDefaultModel | undefined }).get?.('agentDefaultModel')
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
  tag: string,
): Promise<void> {
  const registry =
    (ctx as Context & { workspaceRegistry?: WorkspaceRegistry }).workspaceRegistry ??
    (ctx as { get?: (name: string) => WorkspaceRegistry | undefined }).get?.('workspaceRegistry')
  if (!registry || typeof registry.resolveByPath !== 'function') {
    log(`${tag} workspaceRegistry unavailable; session stays ungrouped`)
    return
  }
  try {
    let entity = await registry.resolveByPath(cwd)
    if (!entity) {
      const title = path.basename(cwd) || 'workspace'
      entity = await registry.create(cwd, title)
      log(`${tag} created workspace title=${title} path=${cwd}`)
    }
    const already = entity.record?.sessionIds?.includes(sessionId)
    if (already) {
      log(`${tag} session already on workspace path=${entity.record?.path ?? cwd}`)
      return
    }
    await entity.attachSession(sessionId)
    log(`${tag} attached session=${sessionId} to workspace=${entity.record?.title ?? path.basename(cwd)}`)
  } catch (err) {
    log(
      `${tag} workspace attach failed session=${sessionId}: ${
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
    throw new Error('dhs-aplan mode=harness requires ctx.systemPrompt (load @deepseek-ai/dsh-system-prompt)')
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

