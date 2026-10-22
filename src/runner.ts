import type { Context } from '@deepseek-ai/cordis'
import type { Config } from './config.js'
import { runHarnessTurn } from './harness.js'
import { McpClient } from './mcp-client.js'
import { PlanClient, type PlanRun } from './plan-client.js'
import { patchStatus, safeErrorMessage } from './status.js'

export type LogFn = (msg: string) => void

/** One claim loop for one Plan role (one external-agent key). */
export class RoleRunner {
  private stopped = false
  private readonly abort = new AbortController()
  private inFlight: { plan: PlanClient; run: PlanRun; reported: boolean } | undefined
  private loopDone: Promise<void> | undefined
  private readonly tag: string

  constructor(
    private readonly ctx: Context,
    private readonly config: Config,
    private readonly log: LogFn = console.log,
  ) {
    this.tag = config.roleKey ? `[dsh-aplan:${config.roleKey}]` : '[dsh-aplan]'
  }

  get label(): string {
    return `${this.config.role}${this.config.roleKey ? `(${this.config.roleKey})` : ''}`
  }

  start(): Promise<void> {
    this.loopDone ??= this.loop().catch((err) => {
      this.log(`${this.tag} runner crashed: ${err instanceof Error ? err.stack ?? err.message : String(err)}`)
      patchStatus(this.config.roleKey, {
        role: this.config.role,
        state: 'error',
        lastError: safeErrorMessage(err),
      })
    })
    return this.loopDone
  }

  /**
   * Stop claiming. An in-flight run is interrupted and reported failed right away so the
   * Plan claim lock is released instead of waiting for the lease to expire.
   */
  async stop(reason = 'runner stopped'): Promise<void> {
    if (this.stopped) return
    this.stopped = true
    this.abort.abort()
    const cur = this.inFlight
    if (cur && !cur.reported) {
      cur.reported = true
      try {
        await cur.plan.reportRun(cur.run.id, { status: 'failed', error: `dsh-aplan ${reason}` })
        this.log(`${this.tag} reported in-flight run=${cur.run.id} failed (${reason})`)
      } catch (e) {
        this.log(`${this.tag} could not report in-flight run=${cur.run.id}: ${e instanceof Error ? e.message : e}`)
      }
    }
  }

  private claimKey(): string {
    return (this.config.claimKey || '').trim()
  }

  private mcpBearer(): string {
    const direct = (this.config.mcpBearer || '').trim()
    if (direct) return direct
    return this.claimKey()
  }

  private async loop(): Promise<void> {
    const claimKey = this.claimKey()
    if (!claimKey) {
      this.log(`${this.tag} missing claim key (ref ${this.config.claimKeyEnv}) for role ${this.label}; idle`)
      patchStatus(this.config.roleKey, { role: this.config.role, state: 'no-key' })
      return
    }
    const plan = new PlanClient(this.config.baseUrl, claimKey)
    this.log(
      `${this.tag} ${this.label} runner started mode=${this.config.mode} base=${this.config.baseUrl} poll=${this.config.pollIntervalMs}ms`,
    )
    patchStatus(this.config.roleKey, { role: this.config.role, state: 'idle' })
    let backoff = this.config.pollIntervalMs
    while (!this.stopped) {
      try {
        patchStatus(this.config.roleKey, { role: this.config.role, state: 'claiming' })
        const run = await plan.claimRun()
        if (this.stopped) {
          if (run) {
            await plan.reportRun(run.id, { status: 'failed', error: 'dsh-aplan runner stopping; retry' }).catch(() => {})
          }
          break
        }
        if (!run) {
          backoff = this.config.pollIntervalMs
          patchStatus(this.config.roleKey, { role: this.config.role, state: 'idle' })
          await this.sleep(this.config.pollIntervalMs)
          continue
        }
        backoff = this.config.pollIntervalMs
        await this.handleRun(plan, run)
      } catch (err) {
        this.log(`${this.tag} claim loop error: ${err instanceof Error ? err.message : String(err)}`)
        patchStatus(this.config.roleKey, {
          role: this.config.role,
          state: 'error',
          lastError: safeErrorMessage(err),
        })
        backoff = Math.min(Math.max(backoff * 2, this.config.pollIntervalMs), 60_000)
        await this.sleep(backoff)
      }
    }
    this.log(`${this.tag} ${this.label} runner stopped`)
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      if (this.abort.signal.aborted) return resolve()
      const t = setTimeout(done, ms)
      const onAbort = () => done()
      function done() {
        clearTimeout(t)
        resolve()
      }
      this.abort.signal.addEventListener('abort', onAbort, { once: true })
    })
  }

  private async handleRun(plan: PlanClient, run: PlanRun): Promise<void> {
    const label = run.issueIdentifier ?? `run-${run.id}`
    this.log(
      `${this.tag} claimed run=${run.id} issue=${label} role=${this.config.role} trigger=${run.trigger} attempts=${run.attempts}`,
    )
    patchStatus(this.config.roleKey, {
      role: this.config.role,
      state: 'running',
      lastClaimAt: new Date().toISOString(),
      lastRunId: run.id,
      lastError: undefined,
    })
    const state = { plan, run, reported: false }
    this.inFlight = state

    let hbFailures = 0
    const beat = () => {
      void plan.heartbeatRun(run.id).then(
        () => {
          hbFailures = 0
          patchStatus(this.config.roleKey, {
            role: this.config.role,
            state: 'running',
            lastHeartbeatAt: new Date().toISOString(),
          })
        },
        (e) => {
          hbFailures += 1
          this.log(
            `${this.tag} heartbeat failed run=${run.id} (#${hbFailures}): ${e instanceof Error ? e.message : e}`,
          )
        },
      )
    }
    beat()
    const hb = setInterval(beat, Math.max(1000, this.config.heartbeatIntervalMs))

    const report = async (body: Parameters<PlanClient['reportRun']>[1]) => {
      if (state.reported) return
      state.reported = true
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          await plan.reportRun(run.id, body)
          return
        } catch (e) {
          this.log(
            `${this.tag} result report failed run=${run.id} attempt=${attempt}: ${e instanceof Error ? e.message : e}`,
          )
          if (attempt < 3) await new Promise((r) => setTimeout(r, 2000 * attempt))
        }
      }
    }

    try {
      if (this.config.postClaimComment && run.issueId != null) {
        await this.maybeComment(run)
      }

      if (this.config.mode === 'dry-run') {
        const output = [
          `[dsh-aplan dry-run] claimed by ${this.config.role} role; Harness turn not executed.`,
          `issue=${label}`,
          `trigger=${run.trigger}`,
          '--- systemPrompt ---',
          run.systemPrompt.slice(0, 2000),
          '--- prompt ---',
          run.prompt.slice(0, 4000),
        ].join('\n')
        await report({ status: 'success', output })
        this.log(`${this.tag} dry-run success run=${run.id}`)
        patchStatus(this.config.roleKey, { role: this.config.role, state: 'idle' })
        return
      }

      const output = await runHarnessTurn(this.ctx, this.config, run, this.log, {
        signal: this.abort.signal,
      })
      await report({ status: 'success', output })
      this.log(`${this.tag} harness success run=${run.id}`)
      patchStatus(this.config.roleKey, { role: this.config.role, state: 'idle' })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.log(`${this.tag} run failed run=${run.id}: ${message}`)
      await report({ status: 'failed', error: message.slice(0, 4000) })
      patchStatus(this.config.roleKey, {
        role: this.config.role,
        state: 'error',
        lastError: safeErrorMessage(err),
      })
    } finally {
      clearInterval(hb)
      if (this.inFlight === state) this.inFlight = undefined
    }
  }

  private async maybeComment(run: PlanRun): Promise<void> {
    const bearer = this.mcpBearer()
    if (!bearer) {
      this.log(`${this.tag} skip MCP comment: no claim/MCP key`)
      return
    }
    const mcpUrl = `${this.config.baseUrl.replace(/\/+$/, '')}${this.config.mcpPath.startsWith('/') ? '' : '/'}${this.config.mcpPath}`
    try {
      const mcp = new McpClient(mcpUrl, bearer)
      await mcp.initialize()
      await mcp.callTool(this.config.mcpCommentTool, {
        issueId: run.issueId,
        body: `【${this.config.role}·dsh-aplan】已领取 run #${run.id}（mode=${this.config.mode}）。`,
      })
      this.log(`${this.tag} MCP comment posted issueId=${run.issueId}`)
    } catch (err) {
      this.log(`${this.tag} MCP comment skipped: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
}

/** Back-compat alias for 0.2.x imports. */
export { RoleRunner as DevRoleRunner }
