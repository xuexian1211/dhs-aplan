/**
 * Resolve Plan claim / MCP bearer secrets without logging values.
 *
 * Prefer DSH native credentials store (ctx.credentials → .credentials.yaml),
 * then process.env, then a one-shot ITSAPLAN_* → APLAN_* migration fallback.
 */
export type CredentialsLike = {
  resolve?: (ref: string) => Promise<{ value?: string; source?: string } | undefined>
  set?: (ref: string, value: string) => Promise<unknown>
  describe?: (ref: string) => Promise<{ configured: boolean; source?: string; writable?: boolean }>
}

/** Stable credential ref / env name for a role's claim key. */
export function aplanKeyRef(roleKey: string): string {
  const k = String(roleKey || 'DEV').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_') || 'DEV'
  return `APLAN_KEY_${k}`
}

/** Stable credential ref / env name for a role's MCP bearer (optional). */
export function aplanMcpRef(roleKey: string): string {
  const k = String(roleKey || 'DEV').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_') || 'DEV'
  return `APLAN_MCP_${k}`
}

/** ITSAPLAN_* twin used only as read fallback for existing installs. */
export function legacyItsaplanKeyRef(roleKey: string): string {
  const k = String(roleKey || 'DEV').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_') || 'DEV'
  return `ITSAPLAN_KEY_${k}`
}

export function legacyItsaplanMcpRef(roleKey: string): string {
  const k = String(roleKey || 'DEV').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_') || 'DEV'
  return `ITSAPLAN_MCP_${k}`
}

function fromEnv(name: string): string {
  const n = name.trim()
  if (!n) return ''
  return (process.env[n] ?? '').trim()
}

async function fromCredentials(credentials: CredentialsLike | undefined, name: string): Promise<string> {
  const n = name.trim()
  if (!n || !credentials?.resolve) return ''
  try {
    const hit = await credentials.resolve(n)
    return (hit?.value ?? '').trim()
  } catch {
    return ''
  }
}

/**
 * Resolve one secret by preferred env/ref name, then APLAN auto-name, then ITSAPLAN legacy.
 * Never logs the value.
 */
export async function resolveSecretValue(
  credentials: CredentialsLike | undefined,
  preferredEnvName: string,
  autoRef: string,
  legacyRef?: string,
): Promise<{ value: string; source: 'credentials' | 'env' | 'legacy' | ''; ref: string }> {
  const candidates = [preferredEnvName, autoRef, legacyRef || ''].map((s) => s.trim()).filter(Boolean)
  const seen = new Set<string>()
  const names = candidates.filter((n) => (seen.has(n) ? false : (seen.add(n), true)))

  for (const name of names) {
    const viaCred = await fromCredentials(credentials, name)
    if (viaCred) return { value: viaCred, source: 'credentials', ref: name }
  }
  for (const name of names) {
    const viaEnv = fromEnv(name)
    if (viaEnv) {
      const isLegacy = Boolean(legacyRef && name === legacyRef)
      return { value: viaEnv, source: isLegacy ? 'legacy' : 'env', ref: name }
    }
  }
  return { value: '', source: '', ref: preferredEnvName.trim() || autoRef }
}

/** Soft-read ctx.credentials without hard-inject (Desktop base composition mounts it). */
export function softCredentials(ctx: {
  credentials?: CredentialsLike
  get?: (name: string) => unknown
}): CredentialsLike | undefined {
  try {
    if (ctx.credentials && typeof ctx.credentials === 'object') return ctx.credentials
    if (typeof ctx.get === 'function') {
      const c = ctx.get('credentials') as CredentialsLike | undefined
      if (c && typeof c === 'object') return c
    }
  } catch {
    /* ignore */
  }
  return undefined
}
