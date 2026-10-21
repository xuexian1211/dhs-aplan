import { resolveSecret } from './config.js';
import { McpClient } from './mcp-client.js';
import { PlanClient } from './plan-client.js';
export class DevRoleRunner {
    config;
    log;
    stopped = false;
    busy = false;
    constructor(config, log = console.log) {
        this.config = config;
        this.log = log;
    }
    stop() {
        this.stopped = true;
    }
    async loop() {
        const claimKey = resolveSecret(this.config.claimKeyEnv);
        if (!claimKey) {
            this.log(`[dhs-aplan] missing claim key env ${this.config.claimKeyEnv}; idle`);
            return;
        }
        const plan = new PlanClient(this.config.baseUrl, claimKey);
        this.log(`[dhs-aplan] 开发 runner started mode=${this.config.mode} base=${this.config.baseUrl} poll=${this.config.pollIntervalMs}ms`);
        while (!this.stopped) {
            if (this.busy) {
                await sleep(500);
                continue;
            }
            try {
                const run = await plan.claimRun();
                if (!run) {
                    await sleep(this.config.pollIntervalMs);
                    continue;
                }
                this.busy = true;
                await this.handleRun(plan, run);
            }
            catch (err) {
                this.log(`[dhs-aplan] claim loop error: ${err instanceof Error ? err.message : String(err)}`);
                await sleep(this.config.pollIntervalMs);
            }
            finally {
                this.busy = false;
            }
        }
        this.log('[dhs-aplan] 开发 runner stopped');
    }
    async handleRun(plan, run) {
        const label = run.issueIdentifier ?? `run-${run.id}`;
        this.log(`[dhs-aplan] claimed run=${run.id} issue=${label} trigger=${run.trigger} attempts=${run.attempts}`);
        const hb = setInterval(() => {
            void plan.heartbeatRun(run.id).catch((e) => {
                this.log(`[dhs-aplan] heartbeat failed run=${run.id}: ${e instanceof Error ? e.message : e}`);
            });
        }, this.config.heartbeatIntervalMs);
        try {
            if (this.config.postClaimComment && run.issueId != null) {
                await this.maybeComment(run);
            }
            if (this.config.mode === 'dry-run') {
                const output = [
                    '[dhs-aplan dry-run] claimed by 开发 role; Harness turn not executed.',
                    `issue=${label}`,
                    `trigger=${run.trigger}`,
                    '--- systemPrompt ---',
                    run.systemPrompt.slice(0, 2000),
                    '--- prompt ---',
                    run.prompt.slice(0, 4000),
                ].join('\n');
                await plan.reportRun(run.id, { status: 'success', output });
                this.log(`[dhs-aplan] dry-run success run=${run.id}`);
                return;
            }
            // harness mode: stub until session dispatch is wired
            await plan.reportRun(run.id, {
                status: 'failed',
                error: 'dhs-aplan mode=harness is not implemented yet; set mode=dry-run or wait for session dispatch.',
            });
            this.log(`[dhs-aplan] harness stub failed run=${run.id}`);
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this.log(`[dhs-aplan] run failed run=${run.id}: ${message}`);
            try {
                await plan.reportRun(run.id, { status: 'failed', error: message });
            }
            catch (reportErr) {
                this.log(`[dhs-aplan] result report also failed run=${run.id}: ${reportErr instanceof Error ? reportErr.message : reportErr}`);
            }
        }
        finally {
            clearInterval(hb);
        }
    }
    async maybeComment(run) {
        const bearer = (this.config.mcpBearerEnv.trim() ? resolveSecret(this.config.mcpBearerEnv) : '') ||
            resolveSecret(this.config.claimKeyEnv);
        if (!bearer) {
            this.log('[dhs-aplan] skip MCP comment: no claim/MCP key');
            return;
        }
        const mcpUrl = `${this.config.baseUrl.replace(/\/+$/, '')}${this.config.mcpPath.startsWith('/') ? '' : '/'}${this.config.mcpPath}`;
        try {
            const mcp = new McpClient(mcpUrl, bearer);
            await mcp.initialize();
            await mcp.callTool(this.config.mcpCommentTool, {
                issueId: run.issueId,
                body: `【开发·dhs-aplan】已领取 run #${run.id}（mode=${this.config.mode}）。`,
            });
            this.log(`[dhs-aplan] MCP comment posted issueId=${run.issueId}`);
        }
        catch (err) {
            this.log(`[dhs-aplan] MCP comment skipped: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
