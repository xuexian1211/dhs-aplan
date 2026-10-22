import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { hostCtx } from './host-ctx.js'

export type EnsurePresetLogFn = (msg: string) => void

/**
 * Web/Desktop disables host-plane tool-fs / tool-bash / tool-pwsh and mounts them
 * only inside an agent preset (see dsh-web-app cordis patch + presets/standard).
 * Programmatic agents.create must also set meta.agentPreset (see buildSessionMeta).
 * This helper is the resume/live-reuse fallback: bind the profile default
 * (usually `standard`) before the first followup when the session header lacked it.
 *
 * Prefer agentPresets.select (records agent-preset/selected). If the session
 * already has turns, select throws agent-preset/locked — fall back to
 * recompose/mount which still attaches the preset tool realm.
 */
type AgentPresetsService = {
  defaultId?: string
  composedPreset?: (ctx: Context) => string | undefined
  select?: (agent: Agent, agentPreset: string) => Promise<string>
  recompose?: (ctx: Context, id: string) => Promise<{ id: string } | undefined>
  mount?: (ctx: Context, id: string) => Promise<{ id: string } | undefined>
}

function resolveAgentPresets(ctx: Context): AgentPresetsService | undefined {
  const host = hostCtx(ctx) as Context & {
    agentPresets?: AgentPresetsService
    get?: (name: string) => unknown
  }
  if (host.agentPresets && typeof host.agentPresets === 'object') return host.agentPresets
  try {
    const viaGet = host.get?.('agentPresets') as AgentPresetsService | undefined
    if (viaGet && typeof viaGet === 'object') return viaGet
  } catch {
    /* ignore */
  }
  const local = ctx as Context & { agentPresets?: AgentPresetsService; get?: (name: string) => unknown }
  if (local.agentPresets && typeof local.agentPresets === 'object') return local.agentPresets
  try {
    const viaGet = local.get?.('agentPresets') as AgentPresetsService | undefined
    if (viaGet && typeof viaGet === 'object') return viaGet
  } catch {
    /* ignore */
  }
  return undefined
}

export async function ensureAgentPreset(
  ctx: Context,
  agent: Agent,
  log: EnsurePresetLogFn,
  tag: string,
): Promise<string | undefined> {
  const agentPresets = resolveAgentPresets(ctx)
  if (!agentPresets) {
    log(
      `${tag} CRITICAL: agentPresets service missing — coding tools (read/write/edit/shell) will not mount; only Plan MCP / host leftovers remain`,
    )
    return undefined
  }

  const already = agentPresets.composedPreset?.(agent.ctx)
  if (already) {
    log(`${tag} agent preset already bound id=${already}`)
    return already
  }

  const defaultId = (agentPresets.defaultId || 'standard').trim() || 'standard'

  if (typeof agentPresets.select === 'function') {
    try {
      const id = await agentPresets.select(agent, defaultId)
      log(`${tag} agent preset selected id=${id}`)
      return id
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      log(`${tag} agent preset select skipped (${reason}); falling back to recompose/mount`)
    }
  }

  if (typeof agentPresets.recompose === 'function') {
    const preset = await agentPresets.recompose(agent.ctx, defaultId)
    const id = preset?.id ?? defaultId
    log(`${tag} agent preset recomposed id=${id}`)
    return id
  }

  if (typeof agentPresets.mount === 'function') {
    const preset = await agentPresets.mount(agent.ctx, defaultId)
    const id = preset?.id ?? defaultId
    log(`${tag} agent preset mounted id=${id}`)
    return id
  }

  log(
    `${tag} CRITICAL: agentPresets has no select/recompose/mount — cannot bind coding-tool preset ${defaultId}`,
  )
  return undefined
}
