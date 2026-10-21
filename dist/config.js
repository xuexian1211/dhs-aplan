export const defaultConfig = {
    baseUrl: 'http://192.168.10.146:8001',
    claimKeyEnv: 'ITSAPLAN_KEY_DEV',
    mcpBearerEnv: '',
    mcpPath: '/mcp',
    pollIntervalMs: 5000,
    heartbeatIntervalMs: 15000,
    mode: 'dry-run',
    postClaimComment: true,
    mcpCommentTool: 'add_comment',
    cwd: '',
    provider: '',
    model: '',
    sessionIdPrefix: 'dhs-aplan-',
    reuseSessionPerIssue: true,
    disposeAfterRun: false,
    mountPlanMcp: true,
};
export function resolveSecret(envName) {
    const name = envName.trim();
    if (!name)
        return '';
    return (process.env[name] ?? '').trim();
}
