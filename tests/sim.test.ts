import { expect, test } from 'claude-code/testing'
import { chooseLayout } from '../hooks/office/layout'
import { createWorld, frame, relayout, retireReal, removeReal, spawnReal } from '../hooks/office/sim'
import type { World } from '../hooks/office/sim'

const FRAMES_PER_SECOND = 20
const run = (w: World, frames: number, each?: (w: World, f: number) => void) => {
  for (let f = 0; f < frames; f++) { frame(w); each?.(w, f) }
}
const standingOverlaps = (w: World) => {
  const st = w.crabs.filter(c => !c.plan.length && !c.inLift && !c.fight && c.role !== 'leaving')
  let pairs = 0, overlaps = 0
  for (let i = 0; i < st.length; i++) for (let j = i + 1; j < st.length; j++) {
    pairs++
    const a = st[i], b = st[j]
    if (a && b && a.floor === b.floor && Math.abs(a.x - b.x) < 7) overlaps++
  }

  return { pairs, overlaps }
}
const AGENT = (n: number) => ({ role: 'agent' as const, realId: `a${n}`, tag: 'Explore', acc: ['miner' as const] })

test('20 busy minutes: lift holds two at most, background stays at six or fewer, standing crabs keep apart', () => {
  const w = createWorld(chooseLayout(110, 40), 7)
  let maxRiders = 0, maxDecor = 0, pairs = 0, overlaps = 0, n = 0
  run(w, 24000, (w, f) => {
    if (f % 600 === 0) spawnReal(w, AGENT(n++))
    if (f % 600 === 300 && n > 0) retireReal(w, `a${n - 1}`, n % 4 === 0 ? 'failed' : 'done')
    maxRiders = Math.max(maxRiders, w.lift.riders.length)
    maxDecor = Math.max(maxDecor, w.crabs.filter(c => c.role === 'decor').length)
    if (f % 20 === 0) { const o = standingOverlaps(w); pairs += o.pairs; overlaps += o.overlaps }
  })
  expect(maxRiders).toBeLessThanOrEqual(2)
  expect(maxDecor).toBeLessThanOrEqual(6)
  expect(overlaps / pairs).toBeLessThan(0.001)
})

test('a retired subagent heads home within 80 seconds of its break', () => {
  const w = createWorld(chooseLayout(110, 40), 3)
  spawnReal(w, AGENT(1))
  run(w, 60 * FRAMES_PER_SECOND)
  retireReal(w, 'a1', 'done')
  run(w, 140 * FRAMES_PER_SECOND)
  expect(w.crabs.some(c => c.realId === 'a1')).toBe(false)
})

test('twelve subagents at once: desks fill, the rest wait on the street, none is dropped', () => {
  const w = createWorld(chooseLayout(110, 40), 5)
  for (let i = 0; i < 12; i++) spawnReal(w, AGENT(i))
  const seated = w.crabs.filter(c => c.role === 'agent').length
  expect(seated).toBeGreaterThan(0)
  expect(w.street.waiting.length).toBe(12 - seated)
  const seen = new Set<string>()
  for (let round = 0; round < 12; round++) {
    run(w, 30 * FRAMES_PER_SECOND)
    const working = w.crabs.find(c => c.role === 'agent' && c.state === 'work')
    if (working?.realId) { seen.add(working.realId); retireReal(w, working.realId, 'done') }
  }
  run(w, 60 * FRAMES_PER_SECOND)
  expect(w.street.waiting.length).toBe(0)
  expect(seen.size).toBe(12)
})

test('relayout keeps every real crab', () => {
  const w = createWorld(chooseLayout(110, 40), 9)
  for (let i = 0; i < 5; i++) spawnReal(w, AGENT(i))
  spawnReal(w, { role: 'session', realId: 's1', tag: 'website', acc: ['scarf'] })
  run(w, 400)
  const real = () => new Set([...w.crabs.map(c => c.realId), ...w.street.waiting.map(s => s.realId)].filter(Boolean))
  const before = real()
  relayout(w, chooseLayout(80, 32))
  run(w, 400)
  expect(real()).toEqual(before)
  relayout(w, chooseLayout(110, 40))
  expect(real()).toEqual(before)
})

test('a closed session walks out and is gone', () => {
  const w = createWorld(chooseLayout(110, 40), 11)
  spawnReal(w, { role: 'session', realId: 's1', tag: 'website', acc: ['scarf'] })
  run(w, 600)
  removeReal(w, 's1')
  run(w, 2400)
  expect(w.crabs.some(c => c.realId === 's1')).toBe(false)
})

test('the same seed gives the same town', () => {
  const a = createWorld(chooseLayout(110, 40), 42), b = createWorld(chooseLayout(110, 40), 42)
  run(a, 2000); run(b, 2000)
  expect(a.crabs.map(c => [c.id, Math.round(c.x), c.floor])).toEqual(b.crabs.map(c => [c.id, Math.round(c.x), c.floor]))
})

const decorIds = (w: World) => w.crabs.filter(c => c.role === 'decor').map(c => c.id).sort((a, b) => a - b)

test('a tiny first size does not cost the town its background crabs', () => {
  const w = createWorld(chooseLayout(20, 10), 13)
  relayout(w, chooseLayout(143, 66))
  run(w, 200)
  expect(decorIds(w).length).toBeGreaterThanOrEqual(4)
})

test('shrinking to the small strip and back keeps the same background crabs', () => {
  const w = createWorld(chooseLayout(110, 40), 17)
  run(w, 200)
  const before = decorIds(w)
  relayout(w, chooseLayout(60, 20))
  relayout(w, chooseLayout(110, 40))
  expect(decorIds(w)).toEqual(before)
})
