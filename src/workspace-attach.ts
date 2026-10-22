import type { Context } from '@deepseek-ai/cordis'
import path from 'node:path'

export type WorkspaceAttachLogFn = (msg: string) => void

type WorkspaceEntity = {
  record?: { path?: string; title?: string; sessionIds?: string[] }
  attachSession: (sessionId: string) => Promise<void>
}

type WorkspaceRegistry = {
  resolveByPath: (path: string) => Promise<WorkspaceEntity | undefined>
  create: (path: string, title?: string) => Promise<WorkspaceEntity>
}

/** Place a session under the workspace path bucket so it shows in the workbench. */
export async function ensureWorkspaceAttached(
  ctx: Context,
  sessionId: string,
  cwd: string,
  log: WorkspaceAttachLogFn,
  tag: string,
): Promise<void> {
  const registry =
    (ctx as Context & { workspaceRegistry?: WorkspaceRegistry }).workspaceRegistry ??
    (ctx as { get?: (name: string) => WorkspaceRegistry | undefined }).get?.('workspaceRegistry')
  if (!registry || typeof registry.resolveByPath !== 'function') {
    log(`${tag} workspaceRegistry unavailable; session stays ungrouped`)
    return
  }
  try {
    let entity = await registry.resolveByPath(cwd)
    if (!entity) {
      const title = path.basename(cwd) || 'workspace'
      entity = await registry.create(cwd, title)
      log(`${tag} created workspace title=${title} path=${cwd}`)
    }
    const already = entity.record?.sessionIds?.includes(sessionId)
    if (already) {
      log(`${tag} session already on workspace path=${entity.record?.path ?? cwd}`)
      return
    }
    await entity.attachSession(sessionId)
    log(
      `${tag} attached session=${sessionId} to workspace=${entity.record?.title ?? path.basename(cwd)}`,
    )
  } catch (err) {
    log(
      `${tag} workspace attach failed session=${sessionId}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    )
  }
}
