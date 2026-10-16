import { expect, test } from 'claude-code/testing'
import { ACCESSORIES, CRAB, blank, drawCrab } from '../hooks/office/sprites'
import { halfBlocks, runs, writeText } from '../hooks/office/cells'

const pose = { legsPhase: 0 as const, blink: false, dir: 1 as const, acc: [], t: 0 }

test('crab body is 9x6 with one-pixel eyes and no blush or mouth', () => {
  const px = blank(30, 20)
  drawCrab(px, 10, 10, pose)
  const painted: [number, number, string][] = []
  px.forEach((row, y) => row.forEach((c, x) => { if (c) painted.push([x, y, c]) }))
  const xs = painted.map(p => p[0]), ys = painted.map(p => p[1])
  expect(Math.min(...xs)).toBe(10)
  expect(Math.max(...xs)).toBe(18)
  expect(Math.min(...ys)).toBe(10)
  expect(Math.max(...ys)).toBe(15)
  expect(px[11]?.[12]).toBe(CRAB.eye)
  expect(px[11]?.[16]).toBe(CRAB.eye)
  expect(painted.filter(p => p[2] === CRAB.eye).length).toBe(2)
  expect(new Set(painted.map(p => p[2]))).toEqual(new Set([CRAB.body, CRAB.shade, CRAB.eye]))
})

test('facing left mirrors the body', () => {
  const right = blank(30, 20), left = blank(30, 20)
  drawCrab(right, 10, 10, pose)
  drawCrab(left, 10, 10, { ...pose, dir: -1 })
  expect(left[13]?.slice(10, 19)).toEqual([...(right[13]?.slice(10, 19) ?? [])].reverse())
})

test('every accessory draws without throwing and stays close to the body', () => {
  for (const acc of ACCESSORIES) {
    for (const dir of [1, -1] as const) {
      const px = blank(60, 40)
      drawCrab(px, 25, 20, { ...pose, dir, acc: [acc] })
      px.forEach((row, y) => row.forEach((c, x) => {
        if (!c) return
        expect(x >= 25 - 6 && x <= 25 + 8 + 6).toBe(true)
        expect(y >= 20 - 10 && y <= 20 + 6).toBe(true)
      }))
    }
  }
  expect(ACCESSORIES.length).toBeGreaterThan(40)
})

test('halfBlocks pairs two pixel rows into one row of cells', () => {
  const cells = halfBlocks([['#a', '#a', undefined, undefined], ['#b', '#a', '#c', undefined]])
  expect(cells).toEqual([[
    { ch: '▀', fg: '#a', bg: '#b' },
    { ch: '█', fg: '#a' },
    { ch: '▄', fg: '#c' },
    { ch: ' ' },
  ]])
})

test('runs merges neighbours drawn alike, and writeText lays text over cells', () => {
  const row = [{ ch: '▀', fg: '#a' }, { ch: '▀', fg: '#a' }, { ch: ' ' }, { ch: ' ' }]
  expect(runs(row)).toEqual([{ ch: '▀▀', fg: '#a' }, { ch: '  ' }])
  const grid = [[{ ch: ' ' }, { ch: ' ' }, { ch: ' ' }]]
  writeText(grid, 0, 1, 'hello', '#fff', true)
  expect(grid[0]).toEqual([{ ch: ' ' }, { ch: 'h', fg: '#fff', bold: true }, { ch: 'e', fg: '#fff', bold: true }])
})
