import { expect, test } from 'claude-code/testing'
import { lettersFrom, readOpenSessions, readPeerFiles, reconcileAgents, sanitize, trimRoster, writeOwnFile } from '../hooks/sessions'
import type { Disk } from '../hooks/sessions'
import type { OfficeEvent } from '../hooks/events'

const DIR = 'C:/Users/me/.claude'

// An in-memory disk: `files` by path; what the code writes lands in `written`.
function memory(files: Record<string, string>, opts: { noDirs?: boolean } = {}) {
  const written: Record<string, string> = {}
  const disk: Disk = {
    list: async dir => {
      if (opts.noDirs) throw new Error('ENOENT')
      const prefix = `${dir}/`

      return Object.keys(files)
        .filter(p => p.startsWith(prefix) && !p.slice(prefix.length).includes('/'))
        .map(p => ({ name: p.slice(prefix.length), kind: 'file' }))
    },
    read: async path => {
      const body = files[path] ?? written[path]
      if (body === undefined) throw new Error('ENOENT')

      return body
    },
    write: async (path, text) => { written[path] = text },
  }

  return { disk, written }
}

const session = (id: string, name: string, status: string) => JSON.stringify({ sessionId: id, name, status, kind: 'interactive', updatedAt: 1 })

test('open sessions are read from their files, busy or idle, without this one', async () => {
  const { disk } = memory({
    [`${DIR}/sessions/1.json`]: session('me', 'this one', 'busy'),
    [`${DIR}/sessions/2.json`]: session('s2', 'website', 'busy'),
    [`${DIR}/sessions/3.json`]: session('s3', 'docs', 'idle'),
    [`${DIR}/sessions/3.key`]: 'not json',
  })
  expect(await readOpenSessions(disk, DIR, 'me')).toEqual([
    { sessionId: 's2', name: 'website', busy: true, updatedAt: 1 },
    { sessionId: 's3', name: 'docs', busy: false, updatedAt: 1 },
  ])
})

test('malformed or partial session files are ignored', async () => {
  const { disk } = memory({
    [`${DIR}/sessions/1.json`]: '{ "sessionId": "s1", "na',
    [`${DIR}/sessions/2.json`]: JSON.stringify({ name: 'no id' }),
    [`${DIR}/sessions/3.json`]: session('s3', 'ok', 'idle'),
  })
  expect((await readOpenSessions(disk, DIR, 'me')).map(s => s.sessionId)).toEqual(['s3'])
})

test('a missing sessions folder reads as none', async () => {
  const { disk } = memory({}, { noDirs: true })
  expect(await readOpenSessions(disk, DIR, 'me')).toEqual([])
  expect(await readPeerFiles(disk, DIR, 'me')).toEqual({})
})

test('the shared file holds short labels only, never prompt or message text', async () => {
  const { disk, written } = memory({})
  const events = [
    { seq: 1, kind: 'read', label: 'auth.ts' },
    { seq: 2, kind: 'msgOut', session: 'website', label: 'should never be kept' },
    { seq: 3, kind: 'test', ok: false },
  ] as OfficeEvent[]
  await writeOwnFile(disk, DIR, 'me', 'mod-dev', events)
  const parsed = JSON.parse(written[`${DIR}/claude-office/me.json`] ?? '{}')
  expect(parsed.sessionId).toBe('me')
  expect(parsed.name).toBe('mod-dev')
  expect(parsed.events).toEqual([
    { seq: 1, kind: 'read', label: 'auth.ts' },
    { seq: 2, kind: 'msgOut', session: 'website' },
    { seq: 3, kind: 'test', ok: false },
  ])
  expect(sanitize({ seq: 9, kind: 'prompt', label: 'my secret prompt' } as OfficeEvent)).toEqual({ seq: 9, kind: 'prompt' })
})

test('peer files are read, and a message between two other sessions becomes a letter once', async () => {
  const { disk } = memory({
    [`${DIR}/claude-office/me.json`]: JSON.stringify({ sessionId: 'me', events: [{ seq: 1, kind: 'msgOut', session: 'website' }] }),
    [`${DIR}/claude-office/s2.json`]: JSON.stringify({ sessionId: 's2', name: 'mod-dev', events: [{ seq: 4, kind: 'msgOut', session: 'docs' }, { seq: 5, kind: 'read' }] }),
    [`${DIR}/claude-office/bad.json`]: 'nope',
  })
  const peers = await readPeerFiles(disk, DIR, 'me')
  expect(Object.keys(peers)).toEqual(['s2'])
  const open = [{ sessionId: 's2', name: 'mod-dev', busy: true, updatedAt: 1 }, { sessionId: 's3', name: 'docs', busy: false, updatedAt: 1 }]
  const seen = new Map<string, number>()
  expect(lettersFrom(peers, open, seen)).toEqual([{ from: 's2', to: 's3' }])
  expect(lettersFrom(peers, open, seen)).toEqual([])
})

test('an agent the list shows as killed or failed is retired, a completed one done', () => {
  const roster = { agents: [
    { id: 'a1', type: 'Explore', status: 'running' as const },
    { id: 'a2', type: 'Plan', status: 'running' as const },
    { id: 'a3', type: 'general-purpose', status: 'running' as const },
  ], sessions: [] }
  const next = reconcileAgents(roster, [
    { id: 'a1', status: 'killed' }, { id: 'a2', status: 'completed' }, { id: 'a3', status: 'running' },
  ])
  expect(next.agents.map(a => [a.id, a.status])).toEqual([['a1', 'failed'], ['a2', 'completed'], ['a3', 'running']])
})

test('a long session keeps every running subagent but only the 20 latest finished ones', () => {
  const agents = Array.from({ length: 300 }, (_, i) => ({ id: `a${i}`, type: 'Explore', status: (i % 50 === 0 ? 'running' : 'completed') as 'running' | 'completed' }))
  const kept = trimRoster({ agents, sessions: [] }).agents
  expect(kept.filter(a => a.status === 'running').length).toBe(6)
  expect(kept.filter(a => a.status !== 'running').map(a => a.id)).toEqual(agents.filter(a => a.status !== 'running').slice(-20).map(a => a.id))
  expect(JSON.stringify(kept).length).toBeLessThan(5000)
})
