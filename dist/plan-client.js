/** Minimal It's a Plan External Agent HTTP client (CodexHub-compatible shapes). */
export class PlanClient {
    baseUrl;
    apiKey;
    constructor(baseUrl, apiKey) {
        this.baseUrl = baseUrl;
        this.apiKey = apiKey;
        this.baseUrl = baseUrl.replace(/\/+$/, '');
    }
    async request(method, path, body, timeoutMs = 30_000) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), timeoutMs);
        try {
            const res = await fetch(`${this.baseUrl}${path}`, {
                method,
                headers: {
                    'x-api-key': this.apiKey,
                    ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
                },
                body: body !== undefined ? JSON.stringify(body) : undefined,
                signal: ctrl.signal,
            });
            const text = await res.text();
            if (!res.ok) {
                throw new Error(`Plan ${method} ${path} → ${res.status}: ${text.slice(0, 200)}`);
            }
            return text;
        }
        finally {
            clearTimeout(timer);
        }
    }
    async claimRun() {
        const text = await this.request('POST', '/agent-runs/claim');
        const parsed = JSON.parse(text);
        return parsed.run ?? null;
    }
    async heartbeatRun(runId) {
        await this.request('POST', `/agent-runs/${runId}/heartbeat`);
    }
    async reportRun(runId, result) {
        await this.request('POST', `/agent-runs/${runId}/result`, result);
    }
}
