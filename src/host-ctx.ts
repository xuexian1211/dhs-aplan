import type { Context } from '@deepseek-ai/cordis'

/**
 * Agents created on the plugin fiber are disposed when Cordis reloads the
 * plugin (e.g. cordis.patch.yml touch). Own them on the app root fiber so
 * workbench sessions survive config reloads. Session files on disk are never
 * deleted by this ownership choice.
 */
export function hostCtx(ctx: Context): Context {
  const root = (ctx as Context & { root?: Context }).root
  return root && typeof root === 'object' ? root : ctx
}
