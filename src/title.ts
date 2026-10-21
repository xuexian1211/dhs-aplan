/**
 * Session title norm, mirroring CodexHub `thread_name_for_run`
 * (codexhub/src/im/itsaplan/runtime.rs) and the AE handbook
 * (_manual/README.md 1.3 入口 B：线程名形如 `AE-42 标题`):
 *
 *   <ISSUE> · <role> · <issue title>
 *   itsaplan run <id> · <role> · <first meaningful prompt line>
 *
 * capped at 80 UTF-16 units with a trailing …
 */
export const TITLE_SEPARATOR = ' · '
export const TITLE_LIMIT = 80

export interface TitleRun {
  id: number
  prompt: string
  issueIdentifier: string | null
}

export function sessionTitleForRun(run: TitleRun, role: string): string {
  const ident = run.issueIdentifier?.trim() || ''
  const prefix = ident || `itsaplan run ${run.id}`
  const title = ident ? quotedTitleAfter(run.prompt ?? '', ident) : undefined
  const rest = title ?? promptSnippet(run.prompt ?? '')
  return finish(withRole(prefix, role), rest)
}

function withRole(prefix: string, role: string): string {
  const r = (role ?? '').trim()
  return r ? `${prefix}${TITLE_SEPARATOR}${r}` : prefix
}

function finish(prefix: string, rest: string): string {
  const tail = rest.trim()
  const name = tail ? `${prefix}${TITLE_SEPARATOR}${tail}` : prefix
  if (name.length <= TITLE_LIMIT) return name
  let cut = name.slice(0, TITLE_LIMIT - 1)
  // don't split a surrogate pair
  const last = cut.charCodeAt(cut.length - 1)
  if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1)
  return `${cut}…`
}

/**
 * The server frames issue work as `AE-69 "Title" of your project` (mention) or
 * `AE-69 "Title"` (assignment). Titles may themselves contain `"`, so prefer the
 * closing quote that precedes ` of your project` / end of line; fall back to the
 * first quote (CodexHub behaviour).
 */
export function quotedTitleAfter(prompt: string, ident: string): string | undefined {
  const marker = `${ident} "`
  const at = prompt.indexOf(marker)
  if (at < 0) return undefined
  const rest = prompt.slice(at + marker.length)
  const line = rest.split(/\r?\n/, 1)[0] ?? ''
  let end = -1
  const of = line.search(/"\s+(of|in)\s+(your|the)\s+project/i)
  if (of >= 0) end = of
  else {
    const m = /"\s*[.,:;)]?\s*$/.exec(line)
    if (m) end = m.index
    else end = line.indexOf('"')
  }
  if (end < 0) return undefined
  const title = line.slice(0, end).trim()
  return title || undefined
}

/** First line that says something; skips blanks, headings and the runner lead. */
export function promptSnippet(prompt: string): string {
  for (const raw of prompt.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    if (line.toLowerCase() === 'carry out the following task:') continue
    return line.split(/\s+/).join(' ')
  }
  return ''
}
