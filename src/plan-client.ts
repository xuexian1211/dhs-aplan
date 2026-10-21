/** Minimal It's a Plan External Agent HTTP client (CodexHub-compatible shapes). */

export interface PlanRun {
  id: number
  trigger: string
  prompt: string
  systemPrompt: string
  attempts: number
  issueId: number | null
  issueIdentifier: string | null
}

export type ResultStatus = 'success' | 'failed'

export interface RunResultBody {
  status: ResultStatus
  output?: string
  error?: string
}

export class PlanClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, '')
  }

  private async request(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    timeoutMs = 30_000,
  ): Promise<string> {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          'x-api-key': this.apiKey,
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      })
      const text = await res.text()
      if (!res.ok) {
        throw new Error(`Plan ${method} ${path} → ${res.status}: ${text.slice(0, 200)}`)
      }
      return text
    } finally {
      clearTimeout(timer)
    }
  }

  async claimRun(): Promise<PlanRun | null> {
    const text = await this.request('POST', '/agent-runs/claim')
    const parsed = JSON.parse(text) as { run: PlanRun | null }
    return parsed.run ?? null
  }

  async heartbeatRun(runId: number): Promise<void> {
    await this.request('POST', `/agent-runs/${runId}/heartbeat`)
  }

  async reportRun(runId: number, result: RunResultBody): Promise<void> {
    await this.request('POST', `/agent-runs/${runId}/result`, result)
  }
}
