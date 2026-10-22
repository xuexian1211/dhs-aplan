/**
 * CodexHub-parity auto-archive of completed/canceled Plan-issue sessions.
 *
 * DSH today exposes workspace session archive admission (cancel-in-turn when the
 * user archives in the UI) but has no Plan-column → session archive API like
 * Codex `thread/archive`. When enabled, this module only logs sweep intent
 * (and always when archiveDryRun=true). Forward-compatible config surface.
 */
import type { Config } from './config.js'

export type ArchiveLogFn = (msg: string) => void

export function startArchiveSweeper(
  configs: () => Config[],
  log: ArchiveLogFn,
): () => void {
  let timer: ReturnType<typeof setInterval> | undefined
  let disposed = false

  const arm = () => {
    if (timer) clearInterval(timer)
    timer = undefined
    const sample = configs()[0]
    if (!sample?.archiveDoneThreads) {
      log('[dsh-aplan] archive sweeper idle (archiveDoneThreads=false)')
      return
    }
    const minutes = Math.max(5, Number(sample.archiveSweepMinutes) || 240)
    const ms = minutes * 60_000
    log(
      `[dsh-aplan] archive sweeper armed every ${minutes}m dryRun=${sample.archiveDryRun} (DSH has no Plan-issue archive API yet; sweeps log only)`,
    )
    timer = setInterval(() => {
      if (disposed) return
      for (const cfg of configs()) {
        if (!cfg.archiveDoneThreads) continue
        const grace = Math.max(5, Number(cfg.archiveGraceMinutes) || 30)
        log(
          `[dsh-aplan${cfg.roleKey ? ':' + cfg.roleKey : ''}] archive sweep skipped: DSH cannot archive by Plan column yet (would wait ${grace}m after completed/canceled; dryRun=${cfg.archiveDryRun})`,
        )
      }
    }, ms)
  }

  arm()
  // Re-arm periodically so GUI toggles take effect without plugin reload.
  const rearm = setInterval(arm, 30_000)

  return () => {
    disposed = true
    if (timer) clearInterval(timer)
    clearInterval(rearm)
  }
}
