/** Thin JSON-RPC client for Plan /mcp (Bearer ≈ claim x-api-key). */
export class McpClient {
    mcpUrl;
    bearer;
    nextId = 1;
    constructor(mcpUrl, bearer) {
        this.mcpUrl = mcpUrl;
        this.bearer = bearer;
    }
    async rpc(method, params) {
        const id = this.nextId++;
        const res = await fetch(this.mcpUrl, {
            method: 'POST',
            headers: {
                authorization: `Bearer ${this.bearer}`,
                'content-type': 'application/json',
                accept: 'application/json, text/event-stream',
            },
            body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
        });
        const text = await res.text();
        if (!res.ok) {
            throw new Error(`MCP ${method} → ${res.status}: ${text.slice(0, 200)}`);
        }
        // Prefer plain JSON; some gateways wrap SSE — take first data JSON object if needed.
        let payload;
        try {
            payload = JSON.parse(text);
        }
        catch {
            const m = text.match(/data:\s*(\{[\s\S]*?\})\s*(?:\n|$)/);
            if (!m)
                throw new Error(`MCP non-JSON response: ${text.slice(0, 200)}`);
            payload = JSON.parse(m[1]);
        }
        if (payload.error) {
            throw new Error(`MCP error: ${payload.error.message ?? JSON.stringify(payload.error)}`);
        }
        return payload.result;
    }
    async initialize() {
        await this.rpc('initialize', {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'dsh-aplan', version: '0.2.3' },
        });
        // notifications/initialized has no id in some servers; ignore failures
        try {
            await fetch(this.mcpUrl, {
                method: 'POST',
                headers: {
                    authorization: `Bearer ${this.bearer}`,
                    'content-type': 'application/json',
                },
                body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
            });
        }
        catch {
            /* optional */
        }
    }
    async listTools() {
        const result = await this.rpc('tools/list', {});
        return Array.isArray(result?.tools) ? result.tools : [];
    }
    async callTool(name, args) {
        return this.rpc('tools/call', { name, arguments: args });
    }
}
