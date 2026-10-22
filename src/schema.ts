/**
 * Cordis `Config` schema. Every user-facing field is `.volatile()` so that
 * @deepseek-ai/dsh-settings serves it as the `dhs-aplan` settings namespace and the
 * plugin's GUI page (dist/client.js, Plugins → dhs-aplan) can edit it live.
 *
 * schemastery is carried by DSH Desktop. Resolve via createRequire(process.argv[1])
 * first (Desktop entry), then import.meta.url, then dynamic import; if it cannot
 * load, the plugin still runs without a schema (no GUI form values).
 */
import { createRequire } from 'node:module'
import { defaultConfig as d } from './config.js'

type Z = any

function build(z: Z): unknown {
  const s = (def: string) => z.string().default(def).volatile()
  const n = (def: number) => z.number().default(def).volatile()
  const b = (def: boolean) => z.boolean().default(def).volatile()
  const role = z.object({
    key: z.string(),
    role: z.string(),
    enabled: z.boolean().default(true),
    claimKeyEnv: z.string(),
    mcpBearerEnv: z.string(),
    mcpPath: z.string(),
    mcpCommentTool: z.string(),
    postClaimComment: z.boolean(),
    cwd: z.string(),
    provider: z.string(),
    model: z.string(),
    mode: z.string(),
    sessionIdPrefix: z.string(),
    reuseSessionPerIssue: z.boolean(),
    disposeAfterRun: z.boolean(),
    mountPlanMcp: z.boolean(),
    setSessionTitle: z.boolean(),
    renameExistingSession: z.boolean(),
  })
  return z.object({
    enabled: b(d.enabled),
    baseUrl: s(d.baseUrl),
    // Top-level role/claim/cwd/mode remain for back-compat + inheritance when roles[].
    role: s(d.role),
    claimKeyEnv: s(d.claimKeyEnv),
    mcpBearerEnv: s(d.mcpBearerEnv),
    mcpPath: s(d.mcpPath),
    pollIntervalMs: n(d.pollIntervalMs),
    heartbeatIntervalMs: n(d.heartbeatIntervalMs),
    turnTimeoutMs: n(d.turnTimeoutMs),
    mode: s(d.mode),
    postClaimComment: b(d.postClaimComment),
    mcpCommentTool: s(d.mcpCommentTool),
    cwd: s(d.cwd),
    provider: s(d.provider),
    model: s(d.model),
    sessionIdPrefix: s(d.sessionIdPrefix),
    reuseSessionPerIssue: b(d.reuseSessionPerIssue),
    disposeAfterRun: b(d.disposeAfterRun),
    mountPlanMcp: b(d.mountPlanMcp),
    setSessionTitle: b(d.setSessionTitle),
    renameExistingSession: b(d.renameExistingSession),
    roles: z.array(role).default([]).volatile(),
  })
}

function pickZ(mod: { default?: Z } | Z): Z {
  if (mod && typeof mod === 'object' && 'default' in (mod as object) && (mod as { default?: Z }).default) {
    return (mod as { default: Z }).default
  }
  return mod as Z
}

async function loadSchemastery(): Promise<Z | undefined> {
  const tried: string[] = []

  // 1) createRequire against Desktop process entry (process.argv[1])
  try {
    const entry = process.argv[1]
    if (entry) {
      tried.push(`createRequire(process.argv[1]=${entry})`)
      const require = createRequire(entry)
      const mod = require('@deepseek-ai/schemastery') as { default?: Z } | Z
      return pickZ(mod)
    }
  } catch (err) {
    tried.push(`argv1: ${err instanceof Error ? err.message : err}`)
  }

  // 2) createRequire against this module (import.meta.url)
  try {
    tried.push('createRequire(import.meta.url)')
    const require = createRequire(import.meta.url)
    const mod = require('@deepseek-ai/schemastery') as { default?: Z } | Z
    return pickZ(mod)
  } catch (err) {
    tried.push(`import.meta.url: ${err instanceof Error ? err.message : err}`)
  }

  // 3) Also try asar package.json anchors (same pattern as plan-mcp-tools)
  const asarAnchors = [
    'C:/Program Files/DSH Desktop/resources/app.asar/package.json',
    'C:/Program Files/DSH Desktop/resources/app.asar/node_modules/@deepseek-ai/schemastery/package.json',
  ]
  for (const anchor of asarAnchors) {
    try {
      tried.push(`createRequire(${anchor})`)
      const require = createRequire(anchor)
      const mod = require('@deepseek-ai/schemastery') as { default?: Z } | Z
      return pickZ(mod)
    } catch (err) {
      tried.push(`${anchor}: ${err instanceof Error ? err.message : err}`)
    }
  }

  // 4) dynamic import (host-module-fallback may help)
  try {
    tried.push('dynamic import')
    const mod = (await import('@deepseek-ai/schemastery' as string)) as { default?: Z } | Z
    return pickZ(mod)
  } catch (err) {
    tried.push(`import: ${err instanceof Error ? err.message : err}`)
  }

  console.warn(`[dhs-aplan] schemastery unavailable; GUI settings disabled (tried: ${tried.join(' | ')})`)
  return undefined
}

let schema: unknown
try {
  const z = await loadSchemastery()
  schema = z ? build(z) : undefined
} catch (err) {
  console.warn(
    `[dhs-aplan] schemastery unavailable; GUI settings disabled (${err instanceof Error ? err.message : err})`,
  )
  schema = undefined
}

export const ConfigSchema = schema
