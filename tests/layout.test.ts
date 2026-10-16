import { expect, test } from 'claude-code/testing'
import { chooseLayout } from '../hooks/office/layout'

const names = (l: ReturnType<typeof chooseLayout>) => l.floors.map(f => f.rooms.map(r => r.name))

test('large at 100x40 and up: four floors in the designed order, an elevator and a tube', () => {
  const l = chooseLayout(110, 40)
  expect(l.size).toBe('large')
  expect(names(l)).toEqual([
    ['Main office'],
    ['Agent workshop', 'Team room'],
    ['Sessions', 'Library'],
    ['Break room', 'Kitchen'],
  ])
  expect(l.shaftW).toBe(22)
  expect(l.tube).toBeDefined()
  expect(l.width).toBe(110)
  expect(l.height).toBe(80)
})

test('medium: three floors, merged rooms keep their stations', () => {
  const l = chooseLayout(80, 32)
  expect(l.size).toBe('medium')
  expect(names(l)).toEqual([['Main office'], ['Agent workshop', 'Sessions'], ['Break room']])
  const workshop = l.floors[1]?.rooms[0]
  expect(workshop?.stations.kanban).toBeDefined()
  const breakRoom = l.floors[2]?.rooms[0]
  expect(breakRoom?.stations.coffee).toBeDefined()
  expect(breakRoom?.stations.books).toBeDefined()
})

test('small: one strip with the main crab and workshop desks', () => {
  const l = chooseLayout(60, 20)
  expect(l.size).toBe('small')
  expect(names(l)).toEqual([['Main office', 'Agent workshop']])
  expect(l.shaftW).toBe(0)
  expect(l.floors[0]?.rooms[1]?.desks.length).toBeGreaterThan(0)
})

test('every room fits its floor, and desks and spots never crowd', () => {
  for (const [c, r] of [[160, 60], [110, 40], [100, 40], [80, 32], [70, 31], [60, 20], [40, 12]] as const) {
    const l = chooseLayout(c, r)
    for (const floor of l.floors) {
      for (const room of floor.rooms) {
        expect(room.x0 >= l.shaftW && room.x1 <= l.width && room.x0 < room.x1).toBe(true)
        for (const list of [room.desks, room.spots]) {
          const sorted = [...list].sort((a, b) => a - b)
          sorted.slice(1).forEach((x, i) => expect(x - (sorted[i] ?? 0)).toBeGreaterThanOrEqual(11))
          list.forEach(x => expect(x >= room.x0 + 4 && x <= room.x1 - 5).toBe(true))
        }
      }
      expect(floor.standY).toBeLessThan(l.street.y)
    }
  }
})

test('main office stations keep their left-to-right order at every size', () => {
  for (const [c, r] of [[160, 60], [110, 40], [80, 32], [60, 20]] as const) {
    const s = chooseLayout(c, r).floors[0]?.rooms[0]?.stations ?? {}
    const order = (['telescope', 'inbox', 'board', 'desk', 'console', 'phone', 'shelf'] as const).map(k => s[k] ?? -1)
    order.forEach(x => expect(x).toBeGreaterThan(0))
    order.slice(1).forEach((x, i) => expect(x).toBeGreaterThan(order[i] ?? 0))
  }
})

test('a tall panel fills with taller floors, not an empty street', () => {
  const l = chooseLayout(143, 66)
  expect(l.size).toBe('large')
  expect(l.floorH).toBeGreaterThan(17)
  expect(l.floorH).toBeLessThanOrEqual(26)
  expect(l.height - l.street.y).toBeLessThanOrEqual(20)
  const first = l.floors[0]
  expect(first?.top).toBeLessThanOrEqual(12)
})
