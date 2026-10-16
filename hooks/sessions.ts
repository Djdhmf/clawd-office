// The person's other Claude Code sessions, as the office sees them: each
// open session's record in ~/.claude/sessions, and the small event file each
// running office writes to ~/.claude/claude-office/<session>.json so every
// office can show what the others are doing. Files hold short labels only.
import type { EngineInterface } from 'claude-code'
import type { EventKind, OfficeEvent } from './events'
import type { Roster } from './office/client'

/** The file access the session functions need; the hooks module wraps $.fs. */
export type Disk = {
  list: (dir: string) => Promise<{ name: string; kind: string }[]>
  read: (path: string) => Promise<string>
  write: (path: string, text: string) => Promise<void>
}

export type SessionInfo = { sessionId: string; name: string; busy: boolean; updatedAt: number }

const SHARED_MAX = 50
// The kinds whose label is a file's base name, a tool, a server or a model:
// safe to share. Every other label is dropped from the shared file.
const LABELLED = new Set<EventKind>([
  'read', 'edit', 'notebook', 'mcp', 'toolFail', 'permAsk', 'permOk', 'cwd', 'fileChanged', 'model', 'teammateIdle', 'elicitation', 'mention',
])

const parse = (body: string): unknown => {
  try { return JSON.parse(body) } catch { return undefined }
}
const field = (o: unknown, key: string): unknown => (o && typeof o === 'object' ? (o as Record<string, unknown>)[key] : undefined)
const str = (o: unknown, key: string): string | undefined => {
  const v = field(o, key)

  return typeof v === 'string' && v !== '' ? v : undefined
}

/** Where Claude Code keeps its files: CLAUDE_CONFIG_DIR, else ~/.claude. */
export async function claudeDir($: EngineInterface): Promise<string | undefined> {
  const configured = await $.env.get('CLAUDE_CONFIG_DIR')
  if (configured) return configured
  const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))

  return home ? `${home}/.claude` : undefined
}

async function jsonFiles(disk: Disk, dir: string): Promise<{ name: string; body: unknown }[]> {
  const entries = await disk.list(dir).catch(() => [])
  const out: { name: string; body: unknown }[] = []
  for (const entry of entries) {
    if (entry.kind !== 'file' || !entry.name.endsWith('.json')) continue
    const text = await disk.read(`${dir}/${entry.name}`).catch(() => undefined)
    if (typeof text === 'string') out.push({ name: entry.name, body: parse(text) })
  }

  return out
}

/** The other open sessions, busy or idle; this one and unreadable records left out. */
export async function readOpenSessions(disk: Disk, dir: string, selfId: string): Promise<SessionInfo[]> {
  const out: SessionInfo[] = []
  for (const { body } of await jsonFiles(disk, `${dir}/sessions`)) {
    const sessionId = str(body, 'sessionId')
    if (!sessionId || sessionId === selfId) continue
    const updatedAt = field(body, 'updatedAt')
    out.push({
      sessionId,
      name: (str(body, 'name') ?? str(body, 'cwd')?.split(/[\\/]/).pop() ?? 'session').slice(0, 24),
      busy: str(body, 'status') === 'busy',
      updatedAt: typeof updatedAt === 'number' ? updatedAt : 0,
    })
  }

  return out
}

/** An event as it may be shared: kind and outcome, and a label only where it is a name, not text. */
export function sanitize(ev: OfficeEvent): OfficeEvent {
  const out: OfficeEvent = { seq: ev.seq, kind: ev.kind }
  if (ev.label && LABELLED.has(ev.kind)) out.label = ev.label.slice(0, 40)
  if (ev.session && (ev.kind === 'msgOut' || ev.kind === 'msgIn')) out.session = ev.session.slice(0, 40)
  if (ev.agentType) out.agentType = ev.agentType.slice(0, 30)
  if (ev.ok !== undefined) out.ok = ev.ok
  if (ev.value !== undefined) out.value = ev.value

  return out
}

/** Writes this session's recent events for the other offices to read. */
export async function writeOwnFile(disk: Disk, dir: string, sessionId: string, name: string, events: OfficeEvent[]): Promise<void> {
  const body = { sessionId, name, updatedAt: Date.now(), events: events.slice(-SHARED_MAX).map(sanitize) }
  await disk.write(`${dir}/claude-office/${sessionId}.json`, JSON.stringify(body))
}

/** The other offices' recent events, by session; unreadable files and this one left out. */
export async function readPeerFiles(disk: Disk, dir: string, selfId: string): Promise<Record<string, OfficeEvent[]>> {
  const out: Record<string, OfficeEvent[]> = {}
  for (const { body } of await jsonFiles(disk, `${dir}/claude-office`)) {
    const sessionId = str(body, 'sessionId')
    const events = field(body, 'events')
    if (!sessionId || sessionId === selfId || !Array.isArray(events)) continue
    out[sessionId] = events.filter((ev): ev is OfficeEvent => typeof field(ev, 'seq') === 'number' && typeof field(ev, 'kind') === 'string')
  }

  return out
}

/**
 * The messages one open session sent another since last seen, as letters to
 * carry between their crabs. `seen` keeps the last event read per session.
 */
export function lettersFrom(peers: Record<string, OfficeEvent[]>, open: SessionInfo[], seen: Map<string, number>): { from: string; to: string }[] {
  const letters: { from: string; to: string }[] = []
  for (const [from, events] of Object.entries(peers)) {
    if (!open.some(s => s.sessionId === from)) continue
    const last = seen.get(from) ?? 0
    for (const ev of events) {
      if (ev.seq <= last) continue
      seen.set(from, Math.max(seen.get(from) ?? 0, ev.seq))
      if (ev.kind !== 'msgOut' || !ev.session) continue
      const to = open.find(s => s.name === ev.session || s.sessionId === ev.session)
      if (to && to.sessionId !== from) letters.push({ from, to: to.sessionId })
    }
  }

  return letters
}

/** Settles the roster's subagents against what `$.agent.list()` reports. */
export function reconcileAgents(roster: Roster, list: { id: string; status: string }[]): Roster {
  return {
    ...roster,
    agents: roster.agents.map(a => {
      const status = list.find(l => l.id === a.id)?.status
      if (status === 'failed' || status === 'killed') return { ...a, status: 'failed' as const }
      if (status === 'completed') return { ...a, status: 'completed' as const }

      return a
    }),
  }
}

const FINISHED_KEPT = 20

/** Every running subagent, and only the latest finished ones, so the panel's props stay small. */
export function trimRoster(roster: Roster): Roster {
  const finished = roster.agents.filter(a => a.status !== 'running').slice(-FINISHED_KEPT)

  return { ...roster, agents: roster.agents.filter(a => a.status === 'running' || finished.includes(a)) }
}
