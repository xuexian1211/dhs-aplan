import { resolveSecret } from './config.js';
import { McpClient } from './mcp-client.js';
const MOUNTED = Symbol.for('dhs-aplan.planMcpMounted');
/**
 * Register Plan MCP tools on the agent scope under their native names
 * (add_comment, get_issue, …) so Plan prompts that name those tools work.
 */
export async function mountPlanMcpTools(agentCtx, config, log) {
    if (!config.mountPlanMcp) {
        log('[dhs-aplan] mountPlanMcp=false; skipping Plan MCP tools');
        return;
    }
    const marked = agentCtx;
    if (marked[MOUNTED]) {
        log('[dhs-aplan] Plan MCP tools already mounted on this agent scope');
        return;
    }
    const tools = agentCtx.tools;
    if (!tools || typeof tools.register !== 'function') {
        throw new Error('dhs-aplan mountPlanMcp requires ctx.tools on the agent scope (dsh-tools / agent-loop)');
    }
    const bearer = (config.mcpBearerEnv.trim() ? resolveSecret(config.mcpBearerEnv) : '') ||
        resolveSecret(config.claimKeyEnv);
    if (!bearer) {
        throw new Error('dhs-aplan mountPlanMcp: missing claim/MCP bearer key');
    }
    const mcpUrl = `${config.baseUrl.replace(/\/+$/, '')}${config.mcpPath.startsWith('/') ? '' : '/'}${config.mcpPath}`;
    const createDef = await loadCreateMcpToolDefinition();
    if (!createDef) {
        throw new Error('dhs-aplan mountPlanMcp: @deepseek-ai/dsh-mcp-client is not resolvable in this Desktop runtime');
    }
    const mcp = new McpClient(mcpUrl, bearer);
    await mcp.initialize();
    const listed = await mcp.listTools();
    if (listed.length === 0) {
        throw new Error(`dhs-aplan mountPlanMcp: tools/list returned empty from ${mcpUrl}`);
    }
    let registered = 0;
    const failures = [];
    for (const tool of listed) {
        const name = tool.name?.trim();
        if (!name)
            continue;
        try {
            const definition = createDef(agentCtx, {
                name,
                rawName: name,
                description: tool.description ?? `Plan MCP tool ${name}`,
                inputSchema: tool.inputSchema ?? { type: 'object', properties: {} },
                outputSchema: tool.outputSchema,
                call: async (args) => mcp.callTool(name, args ?? {}),
            });
            tools.register(definition);
            registered += 1;
        }
        catch (err) {
            failures.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    if (registered === 0) {
        throw new Error(`dhs-aplan mountPlanMcp: registered 0/${listed.length} tools` +
            (failures[0] ? `; first error: ${failures[0]}` : ''));
    }
    marked[MOUNTED] = true;
    log(`[dhs-aplan] Plan MCP mounted url=${mcpUrl} tools=${registered}/${listed.length}` +
        (failures.length ? ` skipped=${failures.length}` : ''));
    if (failures.length && failures.length <= 8) {
        for (const f of failures)
            log(`[dhs-aplan] Plan MCP skip: ${f}`);
    }
    else if (failures.length) {
        log(`[dhs-aplan] Plan MCP skip examples: ${failures.slice(0, 3).join(' | ')}`);
    }
    // Help the model when Plan prompts say "add_comment" and tools are present under that exact name.
    if (typeof agentCtx.systemPrompt?.section === 'function') {
        agentCtx.systemPrompt.section({
            name: 'dhs-aplan:plan-mcp-tools',
            order: 1400,
            text: [
                'Its a Plan MCP tools are available under their native names (for example add_comment, get_issue, update_issue, get_issue_by_number).',
                'When a task names one of those tools, call it directly with the given arguments. Do not claim the tool is missing if it appears in your tool list.',
            ].join(' '),
            interpolate: false,
        });
    }
}
async function loadCreateMcpToolDefinition() {
    try {
        const mod = (await import(
        /* webpackIgnore: true */ '@deepseek-ai/dsh-mcp-client'));
        if (typeof mod.createMcpToolDefinition === 'function') {
            return mod.createMcpToolDefinition;
        }
    }
    catch {
        /* try createRequire from Desktop asar below */
    }
    try {
        const { createRequire } = await import('node:module');
        const require = createRequire('C:/Program Files/DSH Desktop/resources/app.asar/package.json');
        const mod = require('@deepseek-ai/dsh-mcp-client');
        if (typeof mod.createMcpToolDefinition === 'function') {
            return mod.createMcpToolDefinition;
        }
    }
    catch {
        /* ignore */
    }
    return null;
}
