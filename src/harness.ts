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
import { ensureAgentPreset } from './ensure-agent-preset.js'
import { ensureWorkspaceAttached } from './workspace-attach.js'

/** Side-effect imports so Context gains `agents` / `systemPrompt` typings. */
import '@deepseek-ai/dsh-agent'
import '@deepseek-ai/dsh-system-prompt'

export type HarnessLogFn = (msg: string) => void

const PLAN_SYSTEM_SECTION = 'dsh-aplan:plan-system-prompt'


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
      'dsh-aplan mode=harness requires ctx.agents (load @deepseek-ai/dsh-agent + dsh-agent-loop in the profile)',
    )
  }

  const tag = config.roleKey ? `[dsh-aplan:${config.roleKey}]` : '[dsh-aplan]'
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
        meta,
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
      meta,
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

  // Host tool-fs/bash/pwsh are disabled on the web plane; coding tools live in agent presets.
  // meta.agentPreset covers fresh creates; ensureAgentPreset covers resume/live reuse.
  await ensureAgentPreset(ctx, agent, log, tag)

  let turnError: unknown
  const stopErrorWatch = watchAgentError(agent, (error) => {
    turnError = error
  })

  let timer: ReturnType<typeof setTimeout> | undefined
  let onAbort: (() => void) | undefined
  try {
    // Capture pre-followup assistant history so a blocked/empty turn cannot
    // reuse a prior interrupted reasoning-only message as a false success.
    const assistantBaseline = snapshotAssistantBaseline(agent)
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
            reject(new Error('dsh-aplan runner stopped during the turn (plugin disposed / config changed)'))
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
    const output = extractAssistantOutput(agent, assistantBaseline)
    if (output.startsWith('[dsh-aplan harness]')) {
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
  const prefix = (config.sessionIdPrefix || 'dsh-aplan-').trim() || 'dsh-aplan-'
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

function buildSessionMeta(config: Config): { cwd?: string; agentPreset: string } {
  // UI-created workspace sessions always set meta.agentPreset (usually "standard").
  // Omitting it leaves harness agents with Plan MCP only — no tool-fs/shell/git.
  const cwd = config.cwd.trim()
  if (cwd && !path.isAbsolute(cwd)) {
    throw new Error(`dsh-aplan config.cwd must be an absolute path, got: ${cwd}`)
  }
  const agentPreset = 'standard'
  return {
    ...(cwd ? { cwd } : {}),
    agentPreset,
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
    throw new Error('dsh-aplan mode=harness requires ctx.systemPrompt (load @deepseek-ai/dsh-system-prompt)')
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

/** Snapshot of assistant history before a harness followup. */
type AssistantBaseline = {
  lastAssistantId: string | null
  assistantCount: number
}

type ContentLike = { type?: string; text?: string; name?: string }

function snapshotAssistantBaseline(agent: Agent): AssistantBaseline {
  const assistants = agent.session.deriveMessages().filter((m) => m.role === 'assistant')
  const last = assistants.at(-1)
  return {
    lastAssistantId: last && typeof last.id === 'string' ? last.id : null,
    assistantCount: assistants.length,
  }
}

/**
 * True when the joined extraction is only `[type]` placeholders (e.g. `[reasoning]`),
 * with no real assistant text. Those used to look non-empty (11 chars) and false-succeed.
 */
export function isPlaceholderOnlyOutput(raw: string): boolean {
  const t = raw.trim()
  if (!t) return true
  return /^(?:\[[^\]]+\])+$/i.test(t)
}

function summarizeAssistantContent(content: readonly ContentLike[]): {
  realText: string
  placeholders: string[]
  toolNames: string[]
} {
  const textParts: string[] = []
  const placeholders: string[] = []
  const toolNames: string[] = []
  for (const block of content) {
    const type = block?.type
    if (type === 'text') {
      textParts.push(typeof block.text === 'string' ? block.text : '')
    } else if (type === 'tool-call') {
      toolNames.push(typeof block.name === 'string' && block.name ? block.name : 'tool-call')
    } else if (typeof type === 'string' && type.length > 0) {
      placeholders.push(`[${type}]`)
    }
  }
  return {
    realText: textParts.join('').trim(),
    placeholders,
    toolNames,
  }
}

/**
 * Extract success-gate output for this harness run only.
 * - Ignores assistants that existed before the followup (no reuse of prior `[reasoning]`).
 * - Placeholder-only content (`[reasoning]`, `[thinking]`, …) counts as empty → error string.
 * - Succeeds with real text, or with evidence of tool-calls produced this run.
 */
function extractAssistantOutput(agent: Agent, baseline: AssistantBaseline): string {
  const assistants = agent.session.deriveMessages().filter((m) => m.role === 'assistant')

  let startIdx = baseline.assistantCount
  if (baseline.lastAssistantId) {
    const byId = assistants.findIndex((m) => m.id === baseline.lastAssistantId)
    if (byId >= 0) startIdx = byId + 1
  }
  const produced = assistants.slice(Math.max(0, startIdx))

  if (produced.length === 0) {
    return '[dsh-aplan harness] agent went idle but no new assistant message was produced this turn.'
  }

  let anyRealText = false
  let anyTools = false
  const toolNames: string[] = []
  let lastRealText = ''

  for (const m of produced) {
    const summary = summarizeAssistantContent(m.content as readonly ContentLike[])
    if (summary.realText) {
      anyRealText = true
      lastRealText = summary.realText
    }
    if (summary.toolNames.length > 0) {
      anyTools = true
      toolNames.push(...summary.toolNames)
    }
  }

  if (anyRealText) return lastRealText

  if (anyTools) {
    const uniq = [...new Set(toolNames)]
    return `(tools this turn: ${uniq.join(', ')})`
  }

  // Reasoning/thinking-only (or other `[type]` placeholders) → same failure as empty text.
  return '[dsh-aplan harness] last assistant message had empty text content.'
}

