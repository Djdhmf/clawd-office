// The office's surface module: it keeps a world on the frame clock, takes in
// the hooks module's new events and roster, lays the town out again when the
// pane is resized, and draws the cells as rows of coloured text runs.
import type { ClientModule, ClientSurface } from 'claude-code'
import type { OfficeEvent } from '../events'
import { applyEvent } from './actions'
import { runs } from './cells'
import type { Cell } from './cells'
import { chooseLayout } from './layout'
import { drawWorld } from './render'
import type { Detail } from './render'
import { createWorld, frame, relayout, removeReal, retireReal, setSessionIdle, spawnReal } from './sim'
import type { World } from './sim'
import type { Accessory } from './sprites'

export type RosterAgent = { id: string; type: string; status: 'running' | 'completed' | 'failed' }
export type RosterSession = { id: string; name: string; busy: boolean }
export type Roster = { agents: RosterAgent[]; sessions: RosterSession[] }
export type OfficeProps = { events: OfficeEvent[]; roster: Roster; columns: number; rows: number }

const FRAME_MS = 50
const POLL_MS = 500
const AGENT_LOOKS: Record<string, Accessory[]> = {
  Explore: ['miner'], Plan: ['plan'], 'general-purpose': ['hard'], reviewer: ['detective'], 'code-reviewer': ['detective'],
}
const SESSION_LOOKS: Accessory[] = ['headphones', 'scarf', 'beanie', 'party']

type Office = {
  w: World; seen: number; columns: number; rows: number; done: Set<string>; drawMs: number[]; fps: 10 | 20
  /** How much detail fits, and how much of the panel the town uses, under the size budget. */
  detail: Detail; scale: number
}

const SLOW_DRAW_MS = 25
const DRAW_SAMPLES = 40
// The Client unmounts past 100,000 serialized characters. The budget is
// measured on the very tree the engine serializes, so 5% under is safe.
const SIZE_BUDGET = 95_000
const MIN_SCALE = 0.5

/** Redraws at 20 a second unless drawing has been slow, then at 10. */
export function chooseFps(drawMs: readonly number[]): 10 | 20 {
  if (drawMs.length === 0) return 20
  const average = drawMs.reduce((a, b) => a + b, 0) / drawMs.length

  return average > SLOW_DRAW_MS ? 10 : 20
}
const offices = new WeakMap<object, Office>()

const OfficeView: ClientModule<OfficeProps, { tick: number }> = (props, surface) => {
  const columns = Math.max(20, surface.columns || props.columns)
  const rows = Math.max(10, surface.rows || props.rows)
  let o = offices.get(surface)
  if (!o) {
    o = { w: createWorld(chooseLayout(columns, rows), 1), seen: 0, columns, rows, done: new Set(), drawMs: [], fps: 20, detail: 'full', scale: 1 }
    offices.set(surface, o)
    start(surface)
  } else if (o.columns !== columns || o.rows !== rows) {
    o.columns = columns
    o.rows = rows
    o.detail = 'full'
    o.scale = 1
    relayout(o.w, chooseLayout(columns, rows))
  }
  absorb(o, props)
  const started = Date.now()
  const tree = fitDrawing(o, surface.elements)
  o.drawMs = [...o.drawMs, Date.now() - started].slice(-DRAW_SAMPLES)
  o.fps = chooseFps(o.drawMs)

  return tree
}

/**
 * Draws the town, never past the size budget: when a drawing would be too
 * big it draws less detail, then a smaller town, until it fits.
 */
export function fitDrawing(o: Office, elements: ClientSurface['elements']) {
  const { Box, Text } = elements
  const build = () => Box({ flexDirection: 'column', children: drawWorld(o.w, o.detail).map(line => Text({ children: runs(line).map(run => cellText(Text, run)) })) })
  let tree = build()
  while (JSON.stringify(tree).length > SIZE_BUDGET) {
    if (o.detail === 'full') o.detail = 'low'
    else if (o.scale > MIN_SCALE) {
      o.scale = Math.max(MIN_SCALE, Math.round((o.scale - 0.1) * 10) / 10)
      relayout(o.w, chooseLayout(Math.floor(o.columns * o.scale), Math.floor(o.rows * o.scale)))
    } else break
    tree = build()
  }

  return tree
}

export default OfficeView

function start(surface: ClientSurface<{ tick: number }>): void {
  surface.setState({ tick: 0 })
  surface.every(FRAME_MS, () => {
    const o = offices.get(surface)
    if (!o) return
    frame(o.w)
    // The world always moves at 20 frames a second; when drawing is slow,
    // only every second frame is drawn.
    if (o.fps === 20 || o.w.frameNo % 2 === 0) surface.setState({ tick: o.w.frameNo })
  })
  // Asks the hooks module for what happened since the last event seen.
  surface.every(POLL_MS, () => surface.post({ since: offices.get(surface)?.seen ?? 0 }))
}

// New events are acted out; the roster seats, retires and removes real crabs.
function absorb(o: Office, props: OfficeProps): void {
  for (const ev of props.events) {
    if (ev.seq <= o.seen) continue
    o.seen = ev.seq
    applyEvent(o.w, ev)
  }
  for (const a of props.roster.agents) {
    if (a.status === 'running' && !o.done.has(a.id)) {
      spawnReal(o.w, { role: 'agent', realId: a.id, tag: a.type, acc: AGENT_LOOKS[a.type] ?? ['hard'] })
    } else if (a.status !== 'running' && !o.done.has(a.id)) {
      o.done.add(a.id)
      retireReal(o.w, a.id, a.status === 'failed' ? 'failed' : 'done')
    }
  }
  const open = new Set(props.roster.sessions.map(s => s.id))
  props.roster.sessions.forEach(s => {
    spawnReal(o.w, { role: 'session', realId: s.id, tag: s.name, acc: [SESSION_LOOKS[hash(s.id) % SESSION_LOOKS.length] ?? 'scarf'] })
    setSessionIdle(o.w, s.id, !s.busy)
  })
  for (const c of o.w.crabs) if (c.role === 'session' && c.realId && !open.has(c.realId)) removeReal(o.w, c.realId)
  for (const spec of o.w.street.waiting) if (spec.role === 'session' && !open.has(spec.realId)) removeReal(o.w, spec.realId)
}

function cellText(Text: ClientSurface['elements']['Text'], run: Cell) {
  if (run.fg === undefined && run.bg === undefined) return run.ch

  return Text({
    ...(run.fg === undefined ? {} : { color: run.fg }),
    ...(run.bg === undefined ? {} : { backgroundColor: run.bg }),
    ...(run.bold ? { bold: true } : {}),
    children: [run.ch],
  })
}

function hash(s: string): number {
  let h = 0
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0

  return h
}
