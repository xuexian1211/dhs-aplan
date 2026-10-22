import type { Context } from '@deepseek-ai/cordis'
import { defaultConfig, resolveRoles, type Config as ResolvedConfig, type RawConfig } from './config.js'
import { RoleRunner } from './runner.js'
import { ConfigSchema } from './schema.js'

export const name = 'dhs-aplan'

/** Cordis: agents required; workspaceRegistry used to attach sessions into the UI workspace tree. */
export const inject = ['agents', 'workspaceRegistry'] as const

/** Schema-backed volatile config → served to the GUI page by dsh-settings. */
export const Config = ConfigSchema

export interface PluginConfig extends RawConfig {}

/** How often live (volatile) config is re-read to reconcile role runners. */
const RECONCILE_MS = 3000

/**
 * Supervisor: one RoleRunner per enabled role. GUI edits land on the volatile config
 * reference; a role whose resolved config changed is stopped and restarted (an idle
 * runner restarts immediately; a busy one reports its run failed first).
 */
export function apply(ctx: Context, rawConfig: RawConfig = {}) {
  const log = (msg: string) => console.log(msg)
  const runners = new Map<string, { sig: string; runner: RoleRunner }>()
  let disposed = false

  const read = (): ResolvedConfig[] => {
    try {
      return resolveRoles(snapshot(rawConfig))
    } catch (err) {
      log(`[dhs-aplan] config error: ${err instanceof Error ? err.message : String(err)}`)
      return []
    }
  }

  const reconcile = async () => {
    if (disposed) return
    const wanted = new Map<string, ResolvedConfig>()
    for (const cfg of read()) wanted.set(cfg.roleKey || '_', cfg)
    for (const [key, entry] of runners) {
      const next = wanted.get(key)
      if (!next || JSON.stringify(next) !== entry.sig) {
        runners.delete(key)
        await entry.runner.stop(next ? 'config changed' : 'role removed/disabled')
      }
    }
    for (const [key, cfg] of wanted) {
      if (runners.has(key) || disposed) continue
      const runner = new RoleRunner(ctx, cfg, log)
      runners.set(key, { sig: JSON.stringify(cfg), runner })
      void runner.start()
    }
  }

  ctx.effect(() => {
    // Defer one tick so sibling plugins finish mounting.
    const first = setTimeout(() => void reconcile(), 0)
    const timer = setInterval(() => void reconcile(), RECONCILE_MS)
    return () => {
      disposed = true
      clearTimeout(first)
      clearInterval(timer)
      for (const { runner } of runners.values()) void runner.stop('plugin disposed')
      runners.clear()
      console.log('[dhs-aplan] DISPOSED — claim loops stop requested')
    }
  })

  const roles = read()
  console.log(
    `[dhs-aplan] 0.3.3 loaded roles=${roles.map((r) => `${r.role}:${r.mode}`).join(',') || '(none)'} baseUrl=${
      roles[0]?.baseUrl ?? defaultConfig.baseUrl
    } gui=${ConfigSchema ? 'on' : 'off'}`,
  )
}

/**
 * Plain copy of the config. `.volatile()` schema fields arrive as live references
 * (`{ get(), [cosmokit.volatile.write] }`); read each through `get()` so GUI edits
 * are seen on every reconcile tick.
 */
function snapshot(raw: RawConfig): RawConfig {
  const out: Record<string, unknown> = {}
  const src = (raw ?? {}) as Record<string, unknown>
  for (const key of Object.keys(src)) out[key] = plain(unref(src[key]))
  return out as RawConfig
}

function unref(v: unknown): unknown {
  if (v && typeof v === 'object' && !Array.isArray(v) && typeof (v as { get?: unknown }).get === 'function') {
    try {
      return (v as { get: () => unknown }).get()
    } catch {
      return undefined
    }
  }
  return v
}

function plain(v: unknown): unknown {
  if (Array.isArray(v)) return v.map((x) => plain(unref(x)))
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {}
    for (const k of Object.keys(v as object)) o[k] = plain(unref((v as Record<string, unknown>)[k]))
    return o
  }
  return v
}

export { defaultConfig, resolveRoles }
export type { ResolvedConfig, RawConfig }
