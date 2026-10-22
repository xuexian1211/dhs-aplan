import type { Context } from '@deepseek-ai/cordis'
import type { Config } from './config.js'
import { McpClient } from './mcp-client.js'

export type LogFn = (msg: string) => void

const MOUNTED = Symbol.for('dhs-aplan.planMcpMounted')

/** Tools Plan prompts name by default; missing any is a hard mount failure. */
const REQUIRED_PLAN_TOOLS = ['get_project', 'add_comment', 'update_issue', 'get_issue'] as const

type ToolsHost = {
  register: (definition: unknown) => () => void
}

type CreateMcpToolDefinition = (
  ctx: Context,
  options: {
    name: string
    rawName: string
    description: string
    inputSchema: unknown
    outputSchema?: unknown
    call: (args: Record<string, unknown>, execution: { signal?: AbortSignal }) => Promise<unknown>
  },
) => unknown

/**
 * Register Plan MCP tools on the agent scope under their native names
 * (add_comment, get_issue, …) so Plan prompts that name those tools work.
 */
export async function mountPlanMcpTools(
  agentCtx: Context,
  config: Config,
  log: LogFn,
): Promise<void> {
  const tag = config.roleKey ? `[dhs-aplan:${config.roleKey}]` : '[dhs-aplan]'

  // Force-mount even if a stale per-role flag says false (AE-133 req).
  if (config.mountPlanMcp === false) {
    log(`${tag} CRITICAL: mountPlanMcp=false ignored; forcing Plan MCP tools (silent skip caused AE-133 tool gap)`)
  }
  log(`${tag} mounting Plan MCP tools baseUrl=${config.baseUrl} mcpPath=${config.mcpPath}`)

  const marked = agentCtx as Context & { [MOUNTED]?: boolean }
  if (marked[MOUNTED]) {
    log(`${tag} Plan MCP tools already mounted on this agent scope`)
    return
  }

  const tools = (agentCtx as Context & { tools?: ToolsHost }).tools
  if (!tools || typeof tools.register !== 'function') {
    throw new Error(
      `${tag} mountPlanMcp HARD FAIL: ctx.tools missing on agent scope (dsh-tools / agent-loop)`,
    )
  }

  const usedMcpBearer = Boolean(config.mcpBearer && String(config.mcpBearer).trim())
  const bearer =
    (config.mcpBearer && String(config.mcpBearer).trim()) ||
    (config.claimKey && String(config.claimKey).trim()) ||
    ''
  if (!bearer) {
    throw new Error(
      `${tag} mountPlanMcp HARD FAIL: missing claim/MCP bearer (claimKeyEnv=${config.claimKeyEnv || '?'} mcpBearerEnv=${config.mcpBearerEnv || '(reuse claim)'})`,
    )
  }
  if (config.mcpBearerEnv.trim() && !usedMcpBearer) {
    log(
      `${tag} WARN: mcpBearerEnv=${config.mcpBearerEnv} resolved empty; falling back to claim key for Plan MCP`,
    )
  }
  log(
    `${tag} Plan MCP bearer source=${usedMcpBearer ? 'mcpBearerEnv:' + config.mcpBearerEnv : 'claimKeyEnv:' + config.claimKeyEnv}`,
  )

  const mcpUrl = `${config.baseUrl.replace(/\/+$/, '')}${
    config.mcpPath.startsWith('/') ? '' : '/'
  }${config.mcpPath}`

  const createDef = await loadCreateMcpToolDefinition()
  if (!createDef) {
    throw new Error(
      `${tag} mountPlanMcp HARD FAIL: @deepseek-ai/dsh-mcp-client is not resolvable in this Desktop runtime`,
    )
  }

  const mcp = new McpClient(mcpUrl, bearer)
  await mcp.initialize()
  const listed = await mcp.listTools()
  if (listed.length === 0) {
    throw new Error(`${tag} mountPlanMcp HARD FAIL: tools/list returned empty from ${mcpUrl}`)
  }

  let registered = 0
  const failures: string[] = []
  const registeredNames = new Set<string>()
  for (const tool of listed) {
    const name = tool.name?.trim()
    if (!name) continue
    try {
      const definition = createDef(agentCtx, {
        name,
        rawName: name,
        description: tool.description ?? `Plan MCP tool ${name}`,
        inputSchema: tool.inputSchema ?? { type: 'object', properties: {} },
        outputSchema: tool.outputSchema,
        call: async (args) => mcp.callTool(name, args ?? {}),
      })
      tools.register(definition)
      registered += 1
      registeredNames.add(name)
    } catch (err) {
      failures.push(`${name}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  if (registered === 0) {
    throw new Error(
      `${tag} mountPlanMcp HARD FAIL: registered 0/${listed.length} tools` +
        (failures[0] ? `; first error: ${failures[0]}` : ''),
    )
  }

  const missingRequired = REQUIRED_PLAN_TOOLS.filter((n) => !registeredNames.has(n))
  if (missingRequired.length) {
    throw new Error(
      `${tag} mountPlanMcp HARD FAIL: required tools missing after register: ${missingRequired.join(', ')} (registered=${registered}/${listed.length})`,
    )
  }


  marked[MOUNTED] = true
  log(
    `${tag} Plan MCP mounted url=${mcpUrl} tools=${registered}/${listed.length} native=${REQUIRED_PLAN_TOOLS.join(',')}` +
      (failures.length ? ` skipped=${failures.length}` : ''),
  )
  if (failures.length && failures.length <= 8) {
    for (const f of failures) log(`${tag} Plan MCP skip: ${f}`)
  } else if (failures.length) {
    log(`${tag} Plan MCP skip examples: ${failures.slice(0, 3).join(' | ')}`)
  }

  // Help the model when Plan prompts say "add_comment" and tools are present under that exact name.
  if (typeof agentCtx.systemPrompt?.section === 'function') {
    agentCtx.systemPrompt.section({
      name: 'dhs-aplan:plan-mcp-tools',
      order: 1400,
      text: [
        'Its a Plan MCP tools are available under their native names (for example add_comment, get_project, update_issue, get_issue, get_issue_by_number).',
        'When a task names one of those tools, call it directly with the given arguments. Do not claim the tool is missing if it appears in your tool list.',
      ].join(' '),
      interpolate: false,
    })
  }
}

async function loadCreateMcpToolDefinition(): Promise<CreateMcpToolDefinition | null> {
  // Desktop loads plugins from a generation folder; bare import() cannot see app.asar deps.
  // Prefer createRequire against the installed Desktop asar, then fall back to import().
  const asarCandidates = [
    'C:/Program Files/DSH Desktop/resources/app.asar/package.json',
    'C:/Program Files/DSH Desktop/resources/app.asar/node_modules/@deepseek-ai/dsh-mcp-client/package.json',
  ]
  try {
    const { createRequire } = await import('node:module')
    for (const candidate of asarCandidates) {
      try {
        const require = createRequire(candidate)
        const mod = require('@deepseek-ai/dsh-mcp-client') as {
          createMcpToolDefinition?: CreateMcpToolDefinition
        }
        if (typeof mod.createMcpToolDefinition === 'function') {
          return mod.createMcpToolDefinition
        }
      } catch {
        /* try next */
      }
    }
  } catch {
    /* ignore */
  }
  try {
    const mod = (await import(
      /* webpackIgnore: true */ '@deepseek-ai/dsh-mcp-client'
    )) as { createMcpToolDefinition?: CreateMcpToolDefinition }
    if (typeof mod.createMcpToolDefinition === 'function') {
      return mod.createMcpToolDefinition
    }
  } catch {
    /* ignore */
  }
  return null
}