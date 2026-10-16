// Draws the world as terminal cells: the building, its furniture and
// effects, the crabs with their accessories, then text over the pixels (room
// names, name tags, speech bubbles, the elevator's "n/2" and the street's
// "+N" sign). Ported from docs/mockup/crab-town-v5.html.
import { halfBlocks, writeText } from './cells'
import type { Cell } from './cells'
import type { Room } from './layout'
import { LIFT_CAP, isFx, standY } from './sim'
import type { Crab, World } from './sim'
import { blank, drawCrab, paint } from './sprites'
import type { Pixels } from './sprites'

const WALLS: Record<Room['name'], [string, string]> = {
  'Main office': ['#3B302A', '#2B2622'],
  'Agent workshop': ['#2C3A40', '#232A2E'],
  'Team room': ['#3A2C36', '#2A2028'],
  Sessions: ['#332D40', '#26232E'],
  Library: ['#3A2E26', '#2A231E'],
  'Break room': ['#3A332A', '#2A2620'],
  Kitchen: ['#2F3A2A', '#242A20'],
}
const SPINES = ['#3E6AA8', '#D97757', '#E8C15A', '#2E9E6A', '#9A5CB4']
const num = (v: number | boolean | undefined) => (typeof v === 'number' ? v : 0)

/**
 * How much fine pixel work to draw: `low` merges the busiest details (book
 * spines, window bars, lamps, drawer knobs, rack lights) so a big panel's
 * drawing stays under the Client's size limit.
 */
export type Detail = 'full' | 'low'

export function drawWorld(w: World, detail: Detail = 'full'): Cell[][] {
  const L = w.layout
  const t = w.tick
  const px = blank(L.width, L.height)
  const rect = (x: number, y: number, ww: number, h: number, c: string) => paint(px, x, y, ww, h, c)
  const dot = (x: number, y: number, c: string) => paint(px, x, y, 1, 1, c)
  const top = L.floors[0]?.top ?? 0

  // the sky and its drifting clouds
  rect(0, 0, L.width, L.height, '#0E0D0C')
  rect(0, 0, L.width, top, '#3E6E9E')
  for (const seed of [8, 40, 75, 100]) {
    const cx = ((seed + t * 0.015 * 2) % (L.width + 8)) - 8
    rect(cx, seed % 3, 6, 1, '#DDE8F2')
    rect(cx + 1, (seed % 3) + 1, 3, 1, '#F2F6FA')
  }
  if (L.size === 'large') { rect(L.width - 20, top - 3, 1, 3, '#888888'); rect(L.width - 22, top - 4, 5, 1, '#BBBBBB'); dot(L.width - 20, top - 5, isFx(w, 'dish') && t % 4 < 2 ? '#7FD1A8' : '#555555') }

  // rooms: walls, floors, windows, lamps, doorways
  for (const floor of L.floors) {
    for (const r of floor.rooms) {
      const [wall, fl] = WALLS[r.name]
      const dark = r.name === 'Main office' && isFx(w, 'lightsOff')
      rect(r.x0, floor.top, r.x1 - r.x0, L.floorH, dark ? '#16120F' : wall)
      rect(r.x0, floor.standY - 1, r.x1 - r.x0, 2, fl)
      if (r.name !== 'Library' && r.name !== 'Team room' && r.x1 - r.x0 > 24) {
        const wx = r.x0 + 3
        rect(wx, floor.top + 4, 7, 5, '#4D7FB0')
        if (detail === 'full') {
          rect(wx + ((t / 30 + floor.index * 2) % 6), floor.top + 5, 2, 1, '#E8F0F6')
          rect(wx + 3, floor.top + 4, 1, 5, '#2A2420')
          rect(wx, floor.top + 6, 7, 1, '#2A2420')
        }
      }
      if (!dark && detail === 'full') {
        for (const f of [0.35, 0.75]) {
          const lx = Math.floor(r.x0 + (r.x1 - r.x0) * f)
          const alarm = r.name === 'Main office' && isFx(w, 'alarm')
          dot(lx, floor.top + 1, '#555555')
          rect(lx - 1, floor.top + 2, 3, 1, alarm ? (t % 4 < 2 ? '#FF3B30' : '#7A1A15') : '#E8D7A0')
        }
      }
      if (r.x0 > L.shaftW) rect(r.x0, floor.top, 1, 8, '#1A1816')
      furnish(w, px, r, floor.top, floor.standY, t, detail)
    }
    rect(0, floor.top, L.width, 1, '#1A1816')
  }

  // the elevator shaft and its car
  if (L.shaftW > 0) {
    const last = L.floors[L.floors.length - 1]
    const shaftH = (last?.standY ?? 0) + 1 - top
    rect(0, top, L.shaftW, shaftH, '#1E1C1A')
    rect(L.shaftW - 1, top, 1, shaftH, '#111111')
    for (const f of L.floors) { rect(1, f.standY - 10, L.shaftW - 2, 1, '#3A3A3A'); dot(L.shaftW, f.standY - 11, w.lift.floor === f.index && w.lift.door > 0.5 ? '#7FD1A8' : '#7A2A2A') }
    const cy = w.lift.y - 9
    rect(10, top + 1, 1, Math.max(0, cy - top - 1), '#444444')
    rect(1, cy, L.shaftW - 2, 10, '#6B6B70')
    rect(2, cy + 1, L.shaftW - 4, 8, '#2B2B2E')
    w.lift.riders.forEach((r, i) => crab(w, px, r, 6 + i * 10, w.lift.y))
    const half = ((L.shaftW - 4) / 2) * (1 - w.lift.door)
    if (half >= 0.5) { rect(2, cy + 1, half, 8, '#8A8A90'); rect(2 + (L.shaftW - 4) - half, cy + 1, half, 8, '#8A8A90') }
  }

  // the street and its door
  rect(0, L.street.y, L.width, L.height - L.street.y, '#2A2A2A')
  for (let x = (t / 4) % 10; x < L.width; x += 10) rect(x, L.height - 2, 4, 1, '#555555')
  const lastStand = L.floors[L.floors.length - 1]?.standY ?? L.street.y
  rect(L.width - 7, lastStand - 9, 6, 9, '#4B3325')
  dot(L.width - 3, lastStand - 5, '#E8C15A')
  if (isFx(w, 'truck')) { const tx = L.width - ((t - num(w.fx.truckAt)) / 40) * 30; rect(tx, L.height - 6, 10, 4, '#3E6AA8'); rect(tx - 3, L.height - 5, 3, 3, '#9FD3E8') }
  if (isFx(w, 'bird')) { const k = Math.min(1, (t - num(w.fx.birdAt)) / 30); rect(2 + k * 30, top + 1 + k * 4, 2, 1, '#DDDDDD') }

  // the pneumatic tube between Sessions and the Main office
  const tube = L.tube
  if (tube) {
    const a = L.floors[tube.floors[0]]?.standY ?? 0
    const b = L.floors[tube.floors[1]]?.standY ?? 0
    rect(tube.x, a - 6, 2, b - a + 1, '#7F9AA8')
    if (isFx(w, 'tube')) {
      const k = Math.min(1, (t - num(w.fx.tubeAt)) / 20)
      const from = (L.floors[num(w.fx.tubeFrom)]?.standY ?? a) - 5
      const to = (L.floors[num(w.fx.tubeTo)]?.standY ?? a) - 5
      rect(tube.x, from + (to - from) * k, 2, 2, '#E8C15A')
    }
  }

  // the crabs, then dust and particles
  for (const c of w.crabs) if (!c.inLift) crab(w, px, c, c.x - 4, standY(w, c.floor))
  for (const d of w.dust) dot(d.x + ((t * 7) % 5) - 2, d.y - ((t * 3) % 3), '#DDDDDD')
  for (const p of w.parts) { p.x += p.vx; p.y += p.vy; p.vy += p.kind === 'smoke' ? -0.005 : 0.04; dot(p.x, p.y, p.c) }

  // text over the pixels
  const cells = halfBlocks(px)
  const row = (y: number) => Math.floor(y / 2)
  for (const floor of L.floors) for (const r of floor.rooms) writeText(cells, row(floor.top + 2), r.x0 + 2, r.name, '#DDDDDD', true)
  for (const c of w.crabs) {
    if (c.inLift || !c.tag || (c.tagUntil !== undefined && t >= c.tagUntil)) continue
    writeText(cells, row(standY(w, c.floor) + 1), Math.round(c.x) - 4, c.tag, c.tagColor ?? '#DDDDDD', true)
  }
  for (const b of w.bubbles) {
    const ri = w.lift.riders.indexOf(b.crab)
    const x = ri >= 0 ? 4 + ri * 10 : Math.round(b.crab.x) - 3
    const y = ri >= 0 ? w.lift.y : standY(w, b.crab.floor)
    const col = Math.max(0, Math.min(L.width - b.text.length - 2, x))
    writeText(cells, row(y - 12), col, ` ${b.text} `, '#2A211D', false, '#F5EEDC')
  }
  if (L.shaftW > 0) writeText(cells, row(w.lift.y - 11), 8, `${w.lift.riders.length}/${LIFT_CAP}`, '#E8C15A', true)
  const waiting = w.street.waiting.length
  if (waiting > 0) writeText(cells, row(L.street.y + 2), L.width - 10, ` +${waiting} `, '#2A211D', true, '#E8C15A')

  return cells
}

function crab(w: World, px: Pixels, c: Crab, x: number, stand: number): void {
  const shake = c.shake && w.tick % 2 ? 1 : 0
  drawCrab(px, Math.round(x) + shake, stand - 6, {
    legsPhase: c.moving ? ((Math.floor(c.x * 1.2) & 3) as 0 | 1 | 2 | 3) : 0,
    blink: !!c.sleep || (w.tick + c.seed) % 60 < 2,
    dir: c.dir,
    acc: c.acc,
    t: w.tick,
    hop: c.hop,
    crown: c.role === 'main' ? w.crown : undefined,
  })
}

// Each room's furniture, from its stations and desks.
function furnish(w: World, px: Pixels, r: Room, top: number, f: number, t: number, detail: Detail): void {
  const rect = (x: number, y: number, ww: number, h: number, c: string) => paint(px, x, y, ww, h, c)
  const fine = detail === 'full'
  const dot = (x: number, y: number, c: string) => { if (fine) paint(px, x, y, 1, 1, c) }
  const s = r.stations
  const desk = (x: number, on: boolean) => {
    rect(x - 5, f - 3, 11, 1, '#6B4A35'); rect(x - 4, f - 2, 1, 2, '#4B3325'); rect(x + 4, f - 2, 1, 2, '#4B3325')
    rect(x - 3, f - 7, 5, 4, '#2A2A2A'); rect(x - 2, f - 6, 3, 2, on ? (t % 4 < 2 ? '#7FD1A8' : '#5FB18A') : '#2F3F45')
  }
  // Full detail: a spine per book. Low: each shelf's books as one coloured band.
  const shelf = (x: number) => {
    rect(x, f - 12, 6, 12, '#5A3E2A')
    for (let j = 0; j < 3; j++) {
      if (fine) for (let i = 0; i < 5; i++) rect(x + i, f - 11 + j * 4, 1, 3, SPINES[(i + j * 2 + x) % 5] ?? '#3E6AA8')
      else rect(x, f - 11 + j * 4, 5, 3, SPINES[(j + x) % 5] ?? '#3E6AA8')
    }
  }

  if (s.chute !== undefined) { rect(s.chute - 2, top + 10, 3, f - top - 10, '#5A5A60'); rect(s.chute - 3, top + 10, 5, 2, '#777777') }
  if (s.telescope !== undefined) { const x = s.telescope - 2; rect(x, f - 4, 1, 4, '#777777'); rect(x + 3, f - 4, 1, 4, '#777777'); rect(x, f - 7, 6, 2, '#B08D57'); rect(x + 5, f - 8, 2, 2, '#B08D57') }
  if (s.inbox !== undefined) {
    const x = s.inbox
    rect(x, f - 5, 1, 5, '#555555'); rect(x - 2, f - 6, 5, 1, '#8A6A4A')
    if (isFx(w, 'letter')) { w.fx.letterY = Math.min(f - 7, num(w.fx.letterY) + 0.3); rect(x - 1, top + num(w.fx.letterY), 3, 2, '#F5EEDC') }
  }
  if (s.board !== undefined) {
    const x = s.board - 4
    rect(x, top + 4, 11, 7, '#EEEEEE')
    for (let i = 0; i < Math.min(3, num(w.fx.todos)); i++) { dot(x + 2, top + 6 + i * 2, i < num(w.fx.ticked) ? '#2E9E6A' : '#AAAAAA'); rect(x + 4, top + 6 + i * 2, 5, 1, '#3E6AA8') }
    for (let i = 0; i < num(w.fx.stickies); i++) rect(x + 8 - i * 2, top + 9, 2, 1, '#E8C15A')
    if (w.fx.picture) { rect(x + 12, top + 4, 6, 5, '#B08D57'); rect(x + 13, top + 5, 4, 3, '#4D7FB0') }
  }
  if (s.desk !== undefined && r.name === 'Main office') {
    const x = s.desk
    rect(x - 6, f - 3, 14, 1, '#6B4A35'); rect(x - 5, f - 2, 1, 2, '#4B3325'); rect(x + 6, f - 2, 1, 2, '#4B3325')
    rect(x - 4, f - 7, 5, 4, '#2A2A2A'); rect(x - 3, f - 6, 3, 2, isFx(w, 'typing') ? (t % 4 < 2 ? '#7FD1A8' : '#5FB18A') : '#2F3F45')
    if (num(w.fx.context) > 0.8) for (let i = 0; i < 4; i++) rect(x + 2 + (i % 2), f - 5 - i, 3, 1, '#F5EEDC')
    if (isFx(w, 'phoneDock') && t % 4 < 2) dot(x + 5, f - 5, '#7FD1A8')
    if (w.fx.pr) { rect(x + 4, top + 4, 5, 4, '#2E9E6A'); rect(x + 5, top + 5, 3, 1, '#F5EEDC') }
    // the context gauge on the wall
    const g = num(w.fx.context) || 0.3
    rect(x + 11, top + 3, 1, 8, '#222222'); rect(x + 11, top + 11 - Math.round(8 * g), 1, Math.round(8 * g), g > 0.8 ? '#D9534F' : '#7FD1A8')
  }
  if (s.console !== undefined) {
    const x = s.console - 4
    const alarm = isFx(w, 'alarm')
    rect(x, f - 9, 8, 9, '#222222'); rect(x + 1, f - 8, 6, 4, alarm ? '#3A0B0B' : '#0B2A1A')
    for (let i = 0; i < 3; i++) rect(x + 1, f - 8 + i, 1 + ((i * 3 + Math.floor(t / 2)) % 5), 1, alarm ? '#FF6B5B' : '#3DB47A')
    if (isFx(w, 'hourglass')) { rect(x + 5, f - 12, 3, 1, '#B08D57'); rect(x + 5, f - 9, 3, 1, '#B08D57'); dot(x + 6, f - 10 - (Math.floor(t / 6) % 2), '#E8C15A') }
  }
  if (s.phone !== undefined) { const x = s.phone - 3; rect(x, f - 3, 7, 1, '#6B4A35'); rect(x + 1, f - 2, 1, 2, '#4B3325'); rect(x + 5, f - 2, 1, 2, '#4B3325'); if (!isFx(w, 'phone')) rect(x + 2, f - 5, 3, 2, '#D9534F') }
  if (s.shelf !== undefined) shelf(s.shelf - 3)
  if (s.catalog !== undefined) {
    const x = s.catalog - 4
    rect(x, f - 7, 8, 7, '#7A5A3A')
    for (let j = 0; j < 3; j++) for (let i = 0; i < 2; i++) { rect(x + 1 + i * 4, f - 6 + j * 2, 3, 1, '#5A3E2A'); dot(x + 2 + i * 4, f - 6 + j * 2, '#E8C15A') }
    if (w.fx.poster) { rect(x, top + 3, 7, 5, '#F5EEDC'); rect(x + 1, top + 4, 5, 1, '#D97757') }
  }
  for (const x of r.desks) desk(x, w.crabs.some(c => c.deskX === x && c.state === 'work' && !c.idle && c.floor === r.floor))
  if (s.kanban !== undefined) {
    const x = s.kanban - 8
    rect(x, top + 3, 16, 8, '#EEEEEE')
    for (let i = 0; i < Math.min(6, num(w.fx.tasksTodo)); i++) rect(x + 1 + (i % 2) * 3, top + 5 + Math.floor(i / 2) * 2, 2, 1, '#E8C15A')
    for (let i = 0; i < Math.min(6, num(w.fx.tasksDone)); i++) rect(x + 10 + (i % 2) * 3, top + 5 + Math.floor(i / 2) * 2, 2, 1, '#7FD1A8')
  }
  if (r.name === 'Agent workshop' && r.x1 - r.x0 > 50) {
    const x = r.x1 - 8
    rect(x, f - 12, 5, 12, '#222222')
    for (let j = 0; j < 5; j++) dot(x + 3, f - 11 + j * 2, Math.floor(t / 4 + j * 3) % 4 ? '#3DB47A' : '#E8C15A')
  }
  if (r.name === 'Library') { for (let x = r.x0 + 6; x < r.x1 - 10; x += 8) shelf(x); rect(r.x1 - 7, f - 3, 3, 3, '#8A5A3A'); rect(r.x1 - 7, f - 7, 3, 4, '#3DB47A') }
  if (s.couch !== undefined) { const x = s.couch - 6; rect(x, f - 3, 14, 2, '#5A3E66'); rect(x, f - 5, 14, 2, '#6E4C7D') }
  if (s.tv !== undefined) { rect(s.tv - 4, top + 4, 8, 6, '#222222'); rect(s.tv - 3, top + 5, 6, 4, ['#4D7FB0', '#7FD1A8', '#D97757'][Math.floor(t / 20) % 3] ?? '#4D7FB0') }
  if (s.pingpong !== undefined) { rect(s.pingpong - 6, f - 3, 12, 1, '#2E7D5B'); dot(s.pingpong, f - 4, '#DDDDDD') }
  if (s.coffee !== undefined) { const x = s.coffee - 2; rect(x, f - 6, 4, 6, '#3A3A3A'); dot(x + 1, f - 4, '#D97757'); dot(x + 1 + (Math.floor(t / 5) % 2), f - 8, '#888888') }
  if (s.cooler !== undefined) { rect(s.cooler - 1, f - 7, 3, 3, '#9FD3E8'); rect(s.cooler - 1, f - 4, 3, 4, '#DDDDDD') }
  if (s.fridge !== undefined) { rect(s.fridge - 3, f - 11, 7, 11, '#C9CED2'); rect(s.fridge + 2, f - 9, 1, 2, '#888888') }
  if (s.books !== undefined && r.name !== 'Library') shelf(s.books - 3)
}
