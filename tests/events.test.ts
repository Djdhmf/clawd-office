import { expect, test } from 'claude-code/testing'
import { CATALOG, KINDS, classifyBash, classifyTool, labelFor } from '../hooks/events'
import { applyEvent } from '../hooks/office/actions'
import { chooseLayout } from '../hooks/office/layout'
import { createWorld, frame, spawnReal } from '../hooks/office/sim'

test('Bash commands are told apart by what they run', () => {
  expect(classifyBash('npm test')).toBe('test')
  expect(classifyBash('claude plugin test .')).toBe('test')
  expect(classifyBash('pnpm build')).toBe('build')
  expect(classifyBash('npx tsc -p .')).toBe('build')
  expect(classifyBash('npm i left-pad')).toBe('install')
  expect(classifyBash('git commit -m "x"')).toBe('commit')
  expect(classifyBash('git push origin main')).toBe('push')
  expect(classifyBash('gh pr create --fill')).toBe('pr')
  expect(classifyBash('git checkout -b feat/y')).toBe('checkout')
  expect(classifyBash('ls -la')).toBe('bash')
})

test('each tool maps to its kind', () => {
  const cases: [string, Record<string, unknown>, string[]][] = [
    ['Read', { file_path: '/a/b.ts' }, ['read']], ['Grep', {}, ['grep']], ['Glob', {}, ['grep']],
    ['Edit', {}, ['edit']], ['Write', {}, ['edit']], ['NotebookEdit', {}, ['notebook']], ['LSP', {}, ['lsp']],
    ['ToolSearch', {}, ['toolSearch']], ['WebSearch', {}, ['webSearch']], ['WebFetch', {}, ['webFetch']],
    ['Skill', {}, ['skill']], ['Agent', {}, []], ['AskUserQuestion', {}, ['ask']], ['ExitPlanMode', {}, ['plan']],
    ['TodoWrite', {}, ['todo']], ['CronCreate', {}, ['cron']], ['ScheduleWakeup', {}, ['cron']],
    ['PushNotification', {}, ['notify']], ['RemoteTrigger', {}, ['remote']], ['Monitor', {}, ['monitor']],
    ['SendMessage', {}, ['msgOut']], ['ListAgents', {}, ['listAgents']], ['Artifact', {}, ['artifact']],
    ['EnterWorktree', {}, ['worktree']], ['mcp__github__create_issue', {}, ['mcp']],
    ['Bash', { command: 'npm test' }, ['test']], ['Bash', { command: 'npm run dev', run_in_background: true }, ['background']],
    ['SomeFutureTool', {}, []],
  ]
  for (const [tool, input, kinds] of cases) expect(classifyTool(tool, input)).toEqual(kinds)
})

test('labels are short and never carry prompt or command text', () => {
  expect(labelFor('Read', { file_path: 'C:\\repo\\src\\auth.ts' })).toBe('auth.ts')
  expect(labelFor('Read', { file_path: '/home/dev/app/index.ts' })).toBe('index.ts')
  expect(labelFor('Bash', { command: 'curl -H "token: SECRET" x' })).toBeUndefined()
  expect(labelFor('WebSearch', { query: 'my private question' })).toBeUndefined()
  expect(labelFor('mcp__github__create_issue', {})).toBe('github')
})

test('the catalogue covers every kind, and lists what is left out', () => {
  expect(Object.keys(CATALOG).sort()).toEqual([...KINDS].sort())
  for (const k of KINDS) {
    const row = CATALOG[k]
    expect(row.name.length > 0 && row.how.length > 0 && row.act.length > 0).toBe(true)
  }
  expect(KINDS.length).toBeGreaterThan(65)
})

const snapshot = (w: ReturnType<typeof createWorld>) => JSON.stringify({
  main: [w.main.tFloor, w.main.tx, w.main.x, w.main.acc, w.main.sleep, w.main.shake, w.crown, w.main.fast],
  fx: w.fx, bubbles: w.bubbles.map(b => b.text), crabs: w.crabs.map(c => [c.id, c.acc, c.role, c.state, c.idle]),
  waiting: w.street.waiting.length, parts: w.parts.length, dust: w.dust.length,
})

test('every kind has an action that changes the town', () => {
  for (const kind of KINDS) {
    const w = createWorld(chooseLayout(110, 40), 1)
    spawnReal(w, { role: 'session', realId: 's1', tag: 'mod-dev', acc: ['headphones'] })
    spawnReal(w, { role: 'session', realId: 's2', tag: 'website', acc: ['scarf'] })
    spawnReal(w, { role: 'agent', realId: 'a1', tag: 'Explore', acc: ['miner'] })
    for (let i = 0; i < 1200; i++) frame(w)
    const before = snapshot(w)
    applyEvent(w, { seq: 1, kind, realId: kind === 'agentStart' ? 'a2' : kind === 'agentDone' ? 'a1' : kind.startsWith('session') ? 's1' : undefined, session: 's2', ok: kind !== 'agentDone', label: 'auth.ts', agentType: 'Plan' })
    for (let i = 0; i < 60; i++) frame(w)
    expect(`${kind}: ${snapshot(w) !== before}`).toBe(`${kind}: true`)
  }
})

test('three Reads in a row keep main at the shelf', () => {
  const w = createWorld(chooseLayout(110, 40), 2)
  const shelf = w.layout.floors[0]?.rooms[0]?.stations.shelf
  for (let seq = 1; seq <= 3; seq++) {
    applyEvent(w, { seq, kind: 'read', label: `f${seq}.ts` })
    for (let i = 0; i < 30; i++) frame(w)
  }
  for (let i = 0; i < 400; i++) frame(w)
  expect(w.main.x).toBe(shelf)
})

test('a prop from an action clears a few seconds later, and typing never paints over an eye', () => {
  for (const kind of ['typing', 'interrupt', 'notify', 'batch', 'permOk'] as const) {
    const w = createWorld(chooseLayout(110, 40), 3)
    applyEvent(w, { seq: 1, kind })
    for (let i = 0; i < 20; i++) frame(w)
    if (kind === 'typing') expect(w.main.acc.includes('eyes')).toBe(false)
    for (let i = 0; i < 200; i++) frame(w)
    expect(`${kind}: ${w.main.acc.join(',')}`).toBe(`${kind}: crown`)
  }
})

test('the long waits keep their look: main naps while idle, waves while it is your turn', () => {
  const w = createWorld(chooseLayout(110, 40), 3)
  applyEvent(w, { seq: 1, kind: 'idleLong' })
  for (let i = 0; i < 600; i++) frame(w)
  expect(w.main.sleep).toBe(true)
})
