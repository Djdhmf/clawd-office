import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const PANE = (placement: 'dock' | 'inline', bodyColumns = 110, bodyRows = 40) => ({
  plugin: 'clawd-office',
  surface: 'terminal' as const,
  component: 'Pane' as const,
  requestId: 'office',
  props: { title: 'Clawd Office', isFocused: false, bodyColumns, placement, scroll: { offset: 0, bodyRows }, view: {} },
})

function engine(on: On, stored?: Record<string, unknown>) {
  mock.store(on, stored)
  const opened: string[] = []
  const closed: string[] = []
  on('ui.open', ($, e) => { opened.push(e.id); return { value: { isPlaced: true as const } } })
  on('ui.close', ($, e) => { closed.push(e.id); return { value: undefined } })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('ui.render', { component: 'Pane' }, ($, e) => $.ui.resolve(e).Box({ children: [] }))
  on('tool.call', () => ({ result: { stdout: 'ok', stderr: '' } } as never))
  on('agent.spawn', ($, e) => ({ model: 'sonnet', agentId: `agent-${e.subagentType}` }))

  return { opened, closed }
}

const office = ($: Engine, args: string) =>
  $.command.run({ command: 'office', args, origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 160 } })

test('/office off is kept, so the next session does not open it; /office on opens it', async ($, on) => {
  const e = engine(on)
  await $.session.start({ cwd: 'C:/p', surface: 'terminal', isInteractive: true })
  expect(e.opened).toEqual(['office'])

  expect(await office($, 'off')).toMatchObject({ text: expect.stringContaining('off') })
  expect(e.closed).toEqual(['office'])
  await $.session.start({ cwd: 'C:/p', surface: 'terminal', isInteractive: true })
  expect(e.opened).toEqual(['office'])

  await office($, 'on')
  expect(e.opened).toEqual(['office', 'office'])
})

test('docked, the pane draws the office as a Client', async ($, on) => {
  engine(on)
  const ui = await $.ui.mount(PANE('dock'))
  const client = await ui.find({ type: 'Client', key: 'office' })
  expect(client?.props.module).toBe('hooks/office/client.ts')
  expect((await ui.find({ in: 'office' }))?.text).toMatch(/[▀▄█]/)
  await ui.unmount()
})

test('not docked, the office draws nothing, closes, and /office says why', async ($, on) => {
  const e = engine(on)
  const ui = await $.ui.mount(PANE('inline'))
  expect(await ui.find({ type: 'Client' })).toBeUndefined()
  await ui.unmount()
  expect(e.closed).toContain('office')

  const reply = await office($, 'on')
  expect(reply).toMatchObject({ text: expect.stringContaining('fullscreen') })
  expect(reply).toMatchObject({ text: expect.stringContaining('110') })
})

test('the hooks pass tool calls through unchanged', async ($, on) => {
  engine(on)
  const ran = await $.tool.call({ tool: 'Bash', command: 'npm test', description: 'run tests' } as never)
  expect(ran).toMatchObject({ result: { stdout: 'ok', stderr: '' } })
})

test('the feed stays at the last 100 events while the office is closed', async ($, on) => {
  engine(on)
  for (let i = 0; i < 150; i++) await $.tool.call({ tool: 'Read', file_path: `/a/f${i}.ts` } as never)
  const ui = await $.ui.mount(PANE('dock'))
  const props = (await ui.find({ type: 'Client', key: 'office' }))?.props.props as { events: { label?: string }[] }
  expect(props.events.length).toBeLessThanOrEqual(100)
  expect(props.events[props.events.length - 1]?.label).toBe('f149.ts')
  await ui.unmount()
})

test('a subagent shows as a crab, and stays through a resize', async ($, on) => {
  engine(on)
  await $.agent.spawn({ prompt: 'find the tests', subagentType: 'Explore', description: 'find tests' } as never)
  const ui = await $.ui.mount(PANE('dock'))
  await ui.advance(15000)
  expect((await ui.find({ in: 'office' }))?.text).toContain('Explore')
  await ui.redraw({ ...PANE('dock', 80, 32).props })
  await ui.advance(15000)
  expect((await ui.find({ in: 'office' }))?.text).toContain('Explore')
  await ui.unmount()
})

test('a message from another session reaches the office as a tube capsule', async ($, on) => {
  engine(on)
  on('session.receive', ($, e) => ({ text: e.text } as never))
  await $.session.receive({ origin: { kind: 'peer', name: 'mod-dev' }, text: 'the API is ready' } as never)
  const ui = await $.ui.mount(PANE('dock'))
  const props = (await ui.find({ type: 'Client', key: 'office' }))?.props.props as { events: { kind: string; session?: string }[] }
  expect(props.events.some(ev => ev.kind === 'msgIn' && ev.session === 'mod-dev')).toBe(true)
  expect(JSON.stringify(props.events)).not.toContain('the API is ready')
  await ui.unmount()
})
