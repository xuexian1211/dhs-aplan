declare module '@deepseek-ai/dsh-mcp-client' {
  export const name: string
  export const inject: readonly string[]
  export function apply(ctx: unknown, config: unknown): void | Promise<void>
  export function createMcpToolDefinition(
    ctx: unknown,
    options: {
      name: string
      rawName: string
      description: string
      inputSchema: unknown
      outputSchema?: unknown
      taskRequired?: boolean
      call: (args: Record<string, unknown>, execution: { signal?: AbortSignal }) => Promise<unknown>
    },
  ): unknown
}