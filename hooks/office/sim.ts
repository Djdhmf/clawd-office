// The office's simulation, deterministic from a seed: crabs that walk with
// eased steps, an elevator that carries two, standing spots that keep crabs
// apart, background crabs living their own lives, and real crabs (subagents,
// sessions, teammates) seated at desks or queued on the street behind a
// "+N" sign. Ported from docs/mockup/crab-town-v5.html; one frame is 50 ms,
// and the logic ticks every second frame (10 a second).
import type { Layout, Room, RoomName, StationName } from './layout'
import { createRng } from './rng'
import type { Rng } from './rng'
import type { Accessory } from './sprites'

export type Role = 'main' | 'librarian' | 'agent' | 'teammate' | 'session' | 'decor' | 'leaving'
type Step = { walk: number } | { lift: number }

export type Crab = {
  id: number
  role: Role
  floor: number
  /** The body's centre column, in pixels. */
  x: number
  v: number
  dir: 1 | -1
  acc: Accessory[]
  seed: number
  plan: Step[]
  moving: boolean
  wait: number
  tag?: string
  tagColor?: string
  tagUntil?: number
  realId?: string
  deskX?: number
  /** A real crab's stage: arriving, at work, reporting, or retired. */
  state?: 'arriving' | 'work' | 'reporting' | 'retired'
  tFloor?: number
  tx?: number
  waitX?: number
  awaitLift?: boolean
  liftTo?: number
  queuedAt?: number
  inLift?: boolean
  sleep?: boolean
  hop?: number
  shake?: boolean
  fast?: boolean
  idle?: boolean
  fight?: Crab
  fightUntil?: number
  goHomeAt?: number
  arrive?: () => void
}

export type RealSpec = { role: 'agent' | 'session' | 'teammate'; realId: string; tag: string; acc: Accessory[] }
export type Bubble = { crab: Crab; text: string; until: number }
export type Particle = { kind: 'confetti' | 'coins' | 'smoke'; x: number; y: number; vx: number; vy: number; until: number; c: string }

export type World = {
  layout: Layout
  rng: Rng
  frameNo: number
  tick: number
  crabs: Crab[]
  main: Crab
  librarian?: Crab
  lift: { floor: number; y: number; door: number; riders: Crab[]; target: number | null; dwell: number; v: number; state: 'idle' | 'closing' | 'moving' | 'opening' | 'open' }
  street: { waiting: RealSpec[] }
  bubbles: Bubble[]
  timers: { at: number; fn: () => void }[]
  /** Room effects keyed by name: an end tick, or a value (todos, context). */
  fx: Record<string, number | boolean | undefined>
  parts: Particle[]
  dust: { x: number; y: number; until: number }[]
  crown: string
  nextId: number
  /** Background crabs the current layout has no room for, kept for a bigger one. */
  parked: Crab[]
}

export const GAP = 11
export const DECOR_CAP = 6
export const LIFT_CAP = 2
const RANK: Record<Role, number> = { main: 0, librarian: 1, agent: 2, teammate: 2, session: 3, decor: 4, leaving: 5 }

export const LINES: string[][] = [
  ['ship it!', 'tests first.'], ['who broke main?', 'not me', 'git blame says u'], ['need coffee', 'same'],
  ['LGTM', 'u didnt read it', '...LGTM'], ['tabs or spaces?', 'FIGHT ME'], ['works on my machine', 'ship ur machine'],
  ['found the bug!', 'what was it', 'a typo'], ['deploy friday?', 'no.'], ['merge conflict :(', 'rebase?', 'scary'],
  ['nice PR!', 'ty <3'], ['token budget!!', 'compact it'], ['is it lunch', 'its 10am'],
  ['did u see that diff?', '400 files', 'lol'], ['who ate my snack', '...', 'the Explore crab'],
  ['how was the job?', 'grep grep grep', 'living the dream'], ['the boss is busy', 'big refactor', 'brave'],
  ['i got a hat today', 'nice hat'], ['elevator again?', 'only fits two', 'cozy'],
]
const DECOR_LOOKS: Accessory[][] = [['mug'], ['party'], [], ['beanie'], ['scarf'], ['headphones']]

// ---------- the layout, by name ----------

export function rooms(w: World): Room[] {
  return w.layout.floors.flatMap(f => f.rooms)
}
export function roomNamed(w: World, name: RoomName): Room | undefined {
  return rooms(w).find(r => r.name === name)
}
/** The first room holding a station, and where it is. */
export function station(w: World, name: StationName): { floor: number; x: number } | undefined {
  for (const r of rooms(w)) {
    const x = r.stations[name]
    if (x !== undefined) return { floor: r.floor, x }
  }

  return undefined
}
export function standY(w: World, floor: number): number {
  return w.layout.floors[floor]?.standY ?? w.layout.floors[0]?.standY ?? 0
}
const bottom = (w: World) => w.layout.floors.length - 1
const bounds = (w: World): [number, number] => [w.layout.shaftW + 5, w.layout.width - 8]

// ---------- the world ----------

export function createWorld(layout: Layout, seed: number): World {
  const main = { id: 1, role: 'main' as const, floor: 0, x: 0, v: 0, dir: -1 as const, acc: ['crown' as const], seed: 0, plan: [], moving: false, wait: 0, tag: 'main', tagColor: '#E8C15A' }
  const w: World = {
    layout, rng: createRng(seed), frameNo: 0, tick: 0, crabs: [main], main,
    lift: { floor: 0, y: 0, door: 1, riders: [], target: null, dwell: 0, v: 0, state: 'idle' },
    street: { waiting: [] }, bubbles: [], timers: [], fx: {}, parts: [], dust: [], crown: '#E8C15A', nextId: 2, parked: [],
  }
  placeAll(w)
  topUpDecor(w)

  return w
}

// How many background crabs each size starts with.
const DECOR_START: Record<Layout['size'], number> = { large: 4, medium: 3, small: 0 }

// Brings the background crabs up to the layout's starting number.
function topUpDecor(w: World): void {
  for (let i = w.crabs.filter(c => c.role === 'decor').length; i < DECOR_START[w.layout.size]; i++) {
    const floor = Math.max(1, bottom(w) - (i % 2))
    const c = makeCrab(w, { role: 'decor', floor, acc: [...(DECOR_LOOKS[i] ?? [])], wait: i * 15 })
    c.x = freeSpot(w, c, floor, w.rng.range(...bounds(w)))
  }
}

// Seats the main crab and the librarian, and parks the lift, for the layout.
function placeAll(w: World): void {
  const desk = station(w, 'desk')
  w.main.floor = desk?.floor ?? 0
  w.main.x = desk?.x ?? w.layout.width / 2
  w.lift.floor = bottom(w)
  w.lift.y = standY(w, bottom(w))
  const home = roomNamed(w, 'Library') ?? roomNamed(w, 'Break room')
  if (home && !w.librarian) {
    w.librarian = makeCrab(w, { role: 'librarian', floor: home.floor, acc: ['librarian', 'book'], tag: 'enhancer', tagColor: '#E8A0C8' })
  }
  if (w.librarian && home) {
    w.librarian.floor = home.floor
    w.librarian.x = freeSpot(w, w.librarian, home.floor, home.stations.books ?? (home.x0 + home.x1) / 2)
  }
}

function makeCrab(w: World, o: Partial<Crab> & Pick<Crab, 'role' | 'floor'>): Crab {
  const c: Crab = { id: w.nextId++, x: 0, v: 0, dir: 1, acc: [], seed: Math.floor(w.rng.range(0, 60)), plan: [], moving: false, wait: 0, ...o }
  w.crabs.push(c)

  return c
}

export function say(w: World, crab: Crab, text: string, ticks = 30): void {
  w.bubbles.push({ crab, text, until: w.tick + ticks })
}
export function later(w: World, ticks: number, fn: () => void): void {
  w.timers.push({ at: w.tick + ticks, fn })
}
export function fxOn(w: World, name: string, ticks: number): void {
  w.fx[name] = w.tick + ticks
}
export function isFx(w: World, name: string): boolean {
  const v = w.fx[name]

  return typeof v === 'number' && v > w.tick
}

// ---------- standing room ----------

function taken(w: World, floor: number, x: number, self: Crab): boolean {
  return w.crabs.some(o => o !== self && !o.inLift && (
    (o.tFloor === floor && o.tx !== undefined && Math.abs(o.tx - x) < GAP) ||
    (o.floor === floor && (!o.plan.length || o.awaitLift) && Math.abs(o.x - x) < GAP) ||
    (o.floor === floor && o.waitX !== undefined && Math.abs(o.waitX - x) < GAP)))
}

export function freeSpot(w: World, c: Crab, floor: number, want: number): number {
  const [lo, hi] = bounds(w)
  for (let d = 0; d < 120; d++) {
    for (const s of [1, -1]) {
      const x = Math.round(want + s * d)
      if (x >= lo && x <= hi && !taken(w, floor, x, c)) return x
    }
  }

  return Math.round(Math.min(hi, Math.max(lo, want)))
}

/** Walks to a spot on a floor, taking the elevator to another, claiming it. */
export function goTo(w: World, c: Crab, floor: number, want: number, exact = false): number {
  const x = exact ? want : freeSpot(w, c, floor, want)
  c.plan = []
  c.tFloor = floor
  c.tx = x
  if (floor !== c.floor) {
    const wx = freeSpot(w, c, c.floor, w.layout.waitX)
    c.waitX = wx
    c.plan.push({ walk: wx }, { lift: floor })
  }
  c.plan.push({ walk: x })

  return x
}

// When two standing crabs end up too close, the less important steps aside.
function unclump(w: World): void {
  const standing = w.crabs.filter(c => !c.plan.length && !c.inLift && !c.awaitLift && !c.fight && c.role !== 'leaving')
  for (const a of standing) {
    for (const b of standing) {
      if (a === b || a.floor !== b.floor || Math.abs(a.x - b.x) >= GAP - 2 || b.plan.length) continue
      if (RANK[a.role] > RANK[b.role] || (RANK[a.role] === RANK[b.role] && a.id > b.id)) continue
      if ((b.role === 'session' || b.role === 'agent') && b.x === b.deskX) continue
      const x = freeSpot(w, b, b.floor, b.x)
      if (Math.abs(x - b.x) >= 1) goTo(w, b, b.floor, x, true)
    }
  }
}

// ---------- motion ----------

function move(w: World, c: Crab): void {
  if (c.fight) {
    const mate = c.fight
    if (w.tick < (c.fightUntil ?? 0)) {
      const b = w.frameNo % 4 < 2
      c.hop = b ? -1 : 0
      mate.hop = b ? 0 : -1
      if (w.frameNo % 6 === 0) w.dust.push({ x: (c.x + mate.x) / 2, y: standY(w, c.floor) - 4, until: w.tick + 3 })

      return
    }
    c.hop = 0
    mate.hop = 0
    c.fight = undefined
  }
  const step = c.plan[0]
  if (!step || c.inLift) { c.moving = false; c.v = 0; return }
  if ('walk' in step) {
    const dx = step.walk - c.x
    if (Math.abs(dx) < 0.15) {
      c.x = step.walk
      c.plan.shift()
      c.moving = false
      c.v = 0
      if (!c.plan.length) {
        c.tx = undefined
        const f = c.arrive
        c.arrive = undefined
        f?.()
      }

      return
    }
    const max = c.fast ? 0.5 : 0.25
    const want = Math.sign(dx) * Math.min(max, Math.abs(dx) * 0.18 + 0.04)
    c.v += (want - c.v) * 0.25
    c.dir = dx > 0 ? 1 : -1
    c.x += c.v
    c.moving = true
    if (Math.sign(step.walk - c.x) !== Math.sign(dx)) c.x = step.walk
  } else {
    c.moving = false
    c.v = 0
    if (c.floor === step.lift && !c.inLift) { c.plan.shift(); c.awaitLift = false; return }
    if (!c.awaitLift) { c.awaitLift = true; c.queuedAt = w.tick }
    c.liftTo = step.lift
  }
}

function stepLift(w: World): void {
  const lift = w.lift
  const waiting = () => w.crabs.filter(c => c.awaitLift && !c.inLift).sort((a, b) => (a.queuedAt ?? 0) - (b.queuedAt ?? 0))
  if (lift.state === 'idle') {
    if (lift.riders.length) lift.target = lift.riders[0]?.liftTo ?? lift.floor
    else {
      const first = waiting()[0]
      if (!first) return
      lift.target = first.floor
    }
    lift.state = lift.target === lift.floor ? 'open' : 'closing'
    lift.dwell = 0
  }
  if (lift.state === 'closing') { lift.door = Math.max(0, lift.door - 0.08); if (lift.door === 0) lift.state = 'moving'; return }
  if (lift.state === 'moving') {
    const ty = standY(w, lift.target ?? 0)
    const dist = ty - lift.y
    if (Math.abs(dist) < 0.05) { lift.y = ty; lift.floor = lift.target ?? 0; lift.v = 0; lift.state = 'opening'; return }
    const want = Math.sign(dist) * Math.min(0.45, Math.abs(dist) * 0.12 + 0.04)
    lift.v += (want - lift.v) * 0.2
    lift.y += lift.v
    if (Math.sign(ty - lift.y) !== Math.sign(dist)) lift.y = ty

    return
  }
  if (lift.state === 'opening') { lift.door = Math.min(1, lift.door + 0.08); if (lift.door === 1) { lift.state = 'open'; lift.dwell = 0 } return }
  if (lift.dwell++ === 4) {
    lift.riders.filter(r => r.liftTo === lift.floor).forEach((r, i) => {
      r.inLift = false
      r.awaitLift = false
      r.waitX = undefined
      r.floor = lift.floor
      r.x = w.layout.shaftW + 3 + i * 10
      r.v = 0
    })
    lift.riders = lift.riders.filter(r => r.inLift)
    for (const c of waiting().filter(c => c.floor === lift.floor)) {
      if (lift.riders.length >= LIFT_CAP) break
      c.inLift = true
      c.waitX = undefined
      lift.riders.push(c)
    }
  }
  if (lift.dwell > 14) lift.state = 'idle'
}

// ---------- background crabs ----------

function idle(w: World, c: Crab): void {
  if (c.plan.length || c.inLift || c.awaitLift) return
  if (c.goHomeAt !== undefined && w.tick > c.goHomeAt) { leave(w, c); return }
  if (c.wait > 0) { c.wait--; return }
  c.sleep = false
  const roll = w.rng.next()
  const floors = w.layout.floors.length
  const at = (s: StationName) => station(w, s)
  if (roll < 0.26) {
    const f = floors > 1 && w.rng.next() < 0.3 ? 1 + Math.floor(w.rng.range(0, floors - 1)) : c.floor
    goTo(w, c, f, w.rng.range(...bounds(w)))
    c.wait = 20
  } else if (roll < 0.52) {
    const mate = w.crabs.find(o => o !== c && o.role === 'decor' && o.floor === c.floor && !o.plan.length && !o.inLift && !o.awaitLift && Math.abs(o.x - c.x) < 30 && Math.abs(o.x - c.x) >= GAP)
    if (!mate) { c.wait = 30; return }
    const lines = w.rng.pick(LINES)
    c.dir = mate.x > c.x ? 1 : -1
    mate.dir = c.dir === 1 ? -1 : 1
    mate.sleep = false
    lines.forEach((line, i) => later(w, i * 22, () => say(w, i % 2 ? mate : c, line, 24)))
    c.wait = 30 + lines.length * 22
    mate.wait = c.wait
    if (lines[1] === 'FIGHT ME' || w.rng.next() < 0.08) { c.fight = mate; c.fightUntil = w.tick + 40 + lines.length * 22 }
  } else if (roll < 0.64 && at('couch')) {
    const s = at('couch')
    if (s) { goTo(w, c, s.floor, s.x); c.arrive = () => { c.sleep = true; c.wait = 120; say(w, c, 'zzz', 40) } }
  } else if (roll < 0.74 && at('coffee')) {
    const s = at('coffee')
    if (s) goTo(w, c, s.floor, s.x)
    c.arrive = () => { if (!c.acc.includes('mug')) c.acc = [...c.acc, 'mug']; say(w, c, w.rng.pick(['ahh coffee', 'refill!', '*sip*'])); c.wait = 40 }
  } else if (roll < 0.82 && at('tv')) {
    const s = at('tv')
    if (s) goTo(w, c, s.floor, s.x)
    c.arrive = () => { c.dir = -1; say(w, c, w.rng.pick(['ooh a show', 'whats on?', 'turn it up'])); c.wait = 80 }
  } else if (roll < 0.9 && at('books')) {
    const s = at('books')
    if (s) goTo(w, c, s.floor, s.x)
    c.arrive = () => { if (!c.acc.includes('book')) c.acc = [...c.acc, 'book']; say(w, c, w.rng.pick(['good read', 'hmm, docs', 'chapter 3'])); c.wait = 70 }
  } else c.wait = Math.floor(w.rng.range(30, 80))
}

/** Sends a crab out through the street door; it is gone when it gets there. */
export function leave(w: World, c: Crab): void {
  c.role = 'leaving'
  c.tag = undefined
  c.sleep = false
  c.fight = undefined
  say(w, c, w.rng.pick(['bye all!', 'heading home', 'see ya']))
  goTo(w, c, bottom(w), w.layout.street.doorX, true)
  c.arrive = () => {
    const i = w.crabs.indexOf(c)
    if (i >= 0) w.crabs.splice(i, 1)
  }
}

function keepTidy(w: World): void {
  const decor = w.crabs.filter(o => o.role === 'decor')
  if (decor.length > DECOR_CAP) {
    const oldest = decor.find(o => o.goHomeAt === undefined) ?? decor[0]
    if (oldest) leave(w, oldest)
  }
}

// ---------- real crabs ----------

function deskRoom(w: World, role: RealSpec['role']): Room | undefined {
  if (role === 'agent') return roomNamed(w, 'Agent workshop')
  if (role === 'session') return roomNamed(w, 'Sessions')

  return roomNamed(w, 'Team room') ?? roomNamed(w, 'Agent workshop')
}

function freeDesk(w: World, room: Room, role: RealSpec['role']): number | undefined {
  if (role === 'teammate') {
    const spot = room.spots.find(x => !w.crabs.some(c => c.role === 'teammate' && c.deskX === x))

    return spot
  }

  return room.desks.find(x => !w.crabs.some(c => c.deskX === x && c.floor !== undefined && (c.role === role) && c.tFloor !== -1))
}

/** A real crab arrives through the street door to its desk; with no desk free it waits on the street. */
export function spawnReal(w: World, spec: RealSpec): Crab | undefined {
  if (w.crabs.some(c => c.realId === spec.realId) || w.street.waiting.some(s => s.realId === spec.realId)) return undefined
  const room = deskRoom(w, spec.role)
  if (!room) return undefined
  const deskX = freeDesk(w, room, spec.role)
  if (deskX === undefined) { w.street.waiting.push(spec); return undefined }
  const c = makeCrab(w, {
    role: spec.role, realId: spec.realId, tag: spec.tag, acc: [...spec.acc], floor: bottom(w), dir: -1, deskX, state: 'arriving',
    tagColor: spec.role === 'agent' ? '#9FC4E8' : spec.role === 'session' ? '#C9B6F2' : '#E89A9A',
  })
  c.x = w.layout.street.doorX
  goTo(w, c, room.floor, deskX, true)
  c.arrive = () => { c.state = 'work'; c.dir = 1; say(w, c, spec.role === 'session' ? 'hello, new session' : 'on it!') }

  return c
}

// Seats the next real crab waiting on the street when a desk frees up.
function seatWaiting(w: World): void {
  for (const spec of [...w.street.waiting]) {
    const room = deskRoom(w, spec.role)
    if (!room || freeDesk(w, room, spec.role) === undefined) continue
    w.street.waiting.splice(w.street.waiting.indexOf(spec), 1)
    spawnReal(w, spec)
  }
}

/** A subagent finished: it reports to main, retires to the break room, and later goes home. */
export function retireReal(w: World, realId: string, outcome: 'done' | 'failed'): void {
  const queued = w.street.waiting.findIndex(s => s.realId === realId)
  if (queued >= 0) { w.street.waiting.splice(queued, 1); return }
  const c = w.crabs.find(o => o.realId === realId && o.role !== 'leaving' && o.state !== 'reporting' && o.state !== 'retired')
  if (!c) return
  const failed = outcome === 'failed'
  c.state = 'reporting'
  c.deskX = undefined
  say(w, c, failed ? 'ow... it broke' : 'done!')
  c.acc = [...c.acc, failed ? 'bandage' : 'report']
  goTo(w, c, w.main.floor, w.main.x + 11)
  c.arrive = () => {
    c.dir = w.main.x < c.x ? -1 : 1
    say(w, c, failed ? 'it crashed, sorry' : 'heres my report', 35)
    later(w, 25, () => say(w, w.main, failed ? 'no worries, rest up' : w.rng.pick(['thanks!', 'nice work', 'perfect'])))
    later(w, 50, () => {
      c.acc = c.acc.filter(a => a !== 'report')
      c.role = 'decor'
      c.state = 'retired'
      c.tag = `${c.tag ?? 'agent'} (done)`
      c.tagColor = '#888888'
      c.tagUntil = w.tick + 150
      c.goHomeAt = w.tick + Math.floor(w.rng.range(500, 800))
      const rest = station(w, 'couch') ?? { floor: bottom(w), x: w.layout.width / 2 }
      goTo(w, c, rest.floor, rest.x + w.rng.range(0, 20))
      c.arrive = () => { c.wait = 40; say(w, c, w.rng.pick(['break time!', 'phew', 'coffee?'])) }
      keepTidy(w)
    })
  }
}

/** A session closed, or a real crab is gone for good: it heads home. */
export function removeReal(w: World, realId: string): void {
  const queued = w.street.waiting.findIndex(s => s.realId === realId)
  if (queued >= 0) w.street.waiting.splice(queued, 1)
  const c = w.crabs.find(o => o.realId === realId && o.role !== 'leaving')
  if (c) { c.deskX = undefined; leave(w, c) }
}

/** A session's crab types while busy and dozes while idle. */
export function setSessionIdle(w: World, realId: string, isIdle: boolean): void {
  const c = w.crabs.find(o => o.realId === realId && o.role === 'session')
  if (c) c.idle = isIdle
}

function runReal(w: World, c: Crab): void {
  if (c.state !== 'work' || c.plan.length) return
  c.moving = false
  if (c.role === 'session') {
    c.sleep = !!c.idle
    if (c.idle && w.tick % 50 === 0) say(w, c, 'z z', 20)
  }
}

/** The panel was resized: the town is laid out again, every real crab kept. */
export function relayout(w: World, layout: Layout): void {
  w.layout = layout
  const real = w.crabs.filter(c => c.realId && c.role !== 'leaving' && c.state !== 'retired')
  // Background crabs, including any parked by a smaller layout: a small one parks them all.
  const keep = [...w.crabs.filter(c => c.role === 'decor'), ...w.parked]
  w.parked = layout.size === 'small' ? keep : keep.slice(DECOR_CAP)
  w.crabs = [w.main, ...(w.librarian ? [w.librarian] : [])]
  w.lift = { floor: 0, y: 0, door: 1, riders: [], target: null, dwell: 0, v: 0, state: 'idle' }
  w.bubbles = []
  for (const c of [w.main, ...(w.librarian ? [w.librarian] : [])]) { c.plan = []; c.tx = undefined; c.awaitLift = false; c.inLift = false }
  if (w.librarian && !roomNamed(w, 'Library') && !roomNamed(w, 'Break room')) w.crabs = w.crabs.filter(c => c !== w.librarian)
  placeAll(w)
  for (const c of keep.slice(0, layout.size === 'small' ? 0 : DECOR_CAP)) {
    Object.assign(c, { plan: [], tx: undefined, tFloor: undefined, awaitLift: false, inLift: false, waitX: undefined, fight: undefined, arrive: undefined })
    c.floor = Math.min(c.floor, bottom(w))
    w.crabs.push(c)
    c.x = freeSpot(w, c, c.floor, c.x)
  }
  const waiting = [...w.street.waiting]
  w.street.waiting = []
  for (const c of real) {
    const spec: RealSpec = { role: c.role as RealSpec['role'], realId: c.realId ?? '', tag: c.tag ?? '', acc: c.acc }
    const room = deskRoom(w, spec.role)
    const deskX = room ? freeDesk(w, room, spec.role) : undefined
    if (!room || deskX === undefined) { w.street.waiting.push(spec); continue }
    Object.assign(c, { plan: [], tx: undefined, tFloor: undefined, awaitLift: false, inLift: false, waitX: undefined, arrive: undefined, floor: room.floor, x: deskX, deskX, state: 'work' })
    w.crabs.push(c)
  }
  w.street.waiting.push(...waiting)
  topUpDecor(w)
}

// ---------- the loop ----------

/** One 50 ms frame: motion every frame, logic every second one. */
export function frame(w: World): void {
  w.frameNo++
  if (w.frameNo % 2 === 0) {
    w.tick++
    const due = w.timers.filter(t => t.at <= w.tick)
    w.timers = w.timers.filter(t => t.at > w.tick)
    for (const t of due) t.fn()
    if (w.tick % 5 === 0) { unclump(w); seatWaiting(w) }
    for (const c of [...w.crabs]) {
      if (c.role === 'decor') idle(w, c)
      else if (c.role === 'agent' || c.role === 'session' || c.role === 'teammate') runReal(w, c)
    }
    w.bubbles = w.bubbles.filter(b => b.until > w.tick && w.crabs.includes(b.crab))
    w.dust = w.dust.filter(d => d.until > w.tick)
    w.parts = w.parts.filter(p => p.until > w.tick)
  }
  for (const c of [...w.crabs]) move(w, c)
  if (w.layout.shaftW > 0) stepLift(w)
}
