import type { Context } from '@deepseek-ai/cordis'
import { defaultConfig, type Config } from './config.js'
import { DevRoleRunner } from './runner.js'

export const name = 'dhs-aplan'

/** Cordis: agents required; workspaceRegistry used to attach sessions into the UI workspace tree. */
export const inject = ['agents', 'workspaceRegistry'] as const

export interface PluginConfig extends Config {}

/** Cordis may inject config from cordis.patch.yml `config:` on this row. */
export function apply(ctx: Context, rawConfig: Partial<Config> = {}) {
  const config: Config = { ...defaultConfig, ...rawConfig }

  const runner = new DevRoleRunner(ctx, config, (msg) => console.log(msg))

  ctx.effect(() => {
    let cancelled = false
    const started = (async () => {
      // Defer one tick so sibling plugins finish mounting.
      await Promise.resolve()
      if (cancelled) return
      await runner.loop()
    })()

    started.catch((err) => {
      console.error('[dhs-aplan] runner crashed:', err)
    })

    return () => {
      cancelled = true
      runner.stop()
      console.log('[dhs-aplan] DISPOSED — claim loop stop requested')
    }
  })

  console.log(
    `[dhs-aplan] 开发 MVP loaded mode=${config.mode} baseUrl=${config.baseUrl} claimKeyEnv=${config.claimKeyEnv}`,
  )
}

export { defaultConfig }
export type { Config }