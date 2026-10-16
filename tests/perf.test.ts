import { expect, mock, test } from 'claude-code/testing'
import { chooseFps } from '../hooks/office/client'

type Node = { children?: unknown[]; props?: { children?: unknown[] } } | string

// Counts a drawn tree's nodes and the characters of its text.
function measure(node: unknown): { nodes: number; chars: number } {
  if (typeof node === 'string') return { nodes: 1, chars: node.length }
  if (!node || typeof node !== 'object') return { nodes: 0, chars: 0 }
  const n = node as Exclude<Node, string>
  const kids = (n.children ?? n.props?.children ?? []) as unknown[]

  return kids.map(measure).reduce((a, b) => ({ nodes: a.nodes + b.nodes, chars: a.chars + b.chars }), { nodes: 1, chars: 0 })
}

test('a large, busy office stays well inside the drawing limits', async ($, on) => {
  mock.store(on)
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('ui.close', () => ({ value: undefined }))
  let n = 0
  on('agent.spawn', () => ({ model: 'sonnet', agentId: `agent-${n++}` }))
  for (let i = 0; i < 12; i++) await $.agent.spawn({ prompt: 'x', subagentType: i % 2 ? 'Explore' : 'Plan', description: 'x' } as never)
  const ui = await $.ui.mount({
    plugin: 'clawd-office', surface: 'terminal', component: 'Pane', requestId: 'office',
    props: { title: 'Clawd Office', isFocused: false, bodyColumns: 140, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} },
  })
  await ui.advance(20000)
  const size = measure(await ui.drawn({ in: 'office' }))
  expect(size.nodes).toBeLessThan(20000)
  expect(size.chars).toBeLessThan(100000)
  expect(size.chars).toBeGreaterThan(140 * 60 * 0.9)
  await ui.unmount()
})

test('slow drawing drops the office to 10 frames a second, fast drawing keeps 20', () => {
  expect(chooseFps([5, 6, 4, 7])).toBe(20)
  expect(chooseFps([30, 28, 26, 31])).toBe(10)
  expect(chooseFps([])).toBe(20)
})

test('a big panel stays under the drawing limit by drawing less detail, never unmounting', async ($, on) => {
  mock.store(on)
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('ui.close', () => ({ value: undefined }))
  let n = 0
  on('agent.spawn', () => ({ model: 'sonnet', agentId: `big-${n++}` }))
  for (let i = 0; i < 12; i++) await $.agent.spawn({ prompt: 'x', subagentType: 'Explore', description: 'x' } as never)
  for (const [cols, rows] of [[143, 66], [180, 80], [220, 100]] as const) {
    const ui = await $.ui.mount({
      plugin: 'clawd-office', surface: 'terminal', component: 'Pane', requestId: 'office',
      props: { title: 'Clawd Office', isFocused: false, bodyColumns: cols, placement: 'dock', scroll: { offset: 0, bodyRows: rows }, view: {} },
    })
    await ui.advance(10000)
    const drawn = JSON.stringify(await ui.drawn({ in: 'office' }))
    expect(drawn.length).toBeLessThan(95000)
    expect(drawn).toContain('Explore')
    await ui.unmount()
  }
})
