import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

function opens(on: On, stored?: Record<string, unknown>) {
  mock.store(on, stored)
  const opened: string[] = []
  on('ui.open', ($, e) => {
    opened.push(e.id)

    return { value: { isPlaced: true as const } }
  })
  // The engine's own session start, beneath the mod.
  on('session.start', ($, e) => ({ cwd: e.cwd }))

  return opened
}

test('session start opens the office pane', async ($, on) => {
  const opened = opens(on)

  const result = await $.session.start({ cwd: 'C:/project', surface: 'terminal', isInteractive: true })

  expect(opened).toEqual(['office'])
  expect(result.cwd).toBe('C:/project')
})

test('a stored off skips the auto-open', async ($, on) => {
  const opened = opens(on, { enabled: false })

  await $.session.start({ cwd: 'C:/project', surface: 'terminal', isInteractive: true })

  expect(opened).toEqual([])
})
