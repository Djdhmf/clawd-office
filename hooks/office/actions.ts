// What each real event looks like in the office: the main crab walks to a
// station and picks up a prop, a subagent's crab arrives or reports, a
// session's crab types, dozes or carries a letter, and the rooms light up.
// Main's actions play one after another from a short queue; an event of the
// kind already playing merges into it, so three Reads keep main at the shelf.
import type { EventKind, OfficeEvent } from '../events'
import type { StationName } from './layout'
import { fxOn, later, removeReal, retireReal, roomNamed, say, setSessionIdle, spawnReal, standY, station } from './sim'
import type { Crab, World } from './sim'
import type { Accessory } from './sprites'

// How long each of main's actions holds the stage, in ticks (10 a second).
const HOLD = 25
const QUEUE_MAX = 5

const AGENT_LOOKS: Record<string, Accessory[]> = {
  Explore: ['miner'], Plan: ['plan'], 'general-purpose': ['hard'], reviewer: ['detective'], 'code-reviewer': ['detective'],
}
const CROWNS: Record<string, string> = { opus: '#E8C15A', sonnet: '#C9CED2', haiku: '#C08A4A', fable: '#B07FE8' }

type Stage = { queue: OfficeEvent[]; until: number; playing?: EventKind; scheduled: boolean }
const stages = new WeakMap<World, Stage>()
const stageOf = (w: World): Stage => {
  let s = stages.get(w)
  if (!s) { s = { queue: [], until: 0, scheduled: false }; stages.set(w, s) }

  return s
}

// The kinds that are played by someone other than main, at once.
const ELSEWHERE = new Set<EventKind>([
  'agentStart', 'agentDone', 'taskCreated', 'taskDone', 'teammateIdle', 'peerLetter',
  'sessionOpen', 'sessionBusy', 'sessionIdle', 'sessionClose', 'context', 'cost', 'enhance',
])

export function applyEvent(w: World, ev: OfficeEvent): void {
  if (ELSEWHERE.has(ev.kind)) { playElsewhere(w, ev); return }
  const s = stageOf(w)
  if (s.playing === ev.kind && !s.queue.length && w.tick < s.until) {
    s.until = w.tick + HOLD
    const text = bubbleFor(ev)
    if (text) say(w, w.main, text, 30)

    return
  }
  s.queue.push(ev)
  if (s.queue.length > QUEUE_MAX) s.queue.shift()
  pump(w)
}

function pump(w: World): void {
  const s = stageOf(w)
  if (w.tick < s.until) {
    if (!s.scheduled) { s.scheduled = true; later(w, s.until - w.tick, () => { s.scheduled = false; pump(w) }) }

    return
  }
  const ev = s.queue.shift()
  if (!ev) return
  s.playing = ev.kind
  s.until = w.tick + HOLD
  playMain(w, ev)
  if (s.queue.length) pump(w)
}

function bubbleFor(ev: OfficeEvent): string | undefined {
  const l = ev.label
  switch (ev.kind) {
    case 'read': return l ? `Read ${l}` : 'reading...'
    case 'edit': return l ? `Edit ${l}` : 'editing...'
    default: return undefined
  }
}

// ---------- main's actions ----------

// How long a prop stays in main's claws once its action has played: 6 s.
const PROP_TICKS = 60
let propToken = 0

function playMain(w: World, ev: OfficeEvent): void {
  const m = w.main
  m.sleep = false
  m.shake = false
  m.acc = base(w)
  const l = ev.label
  // Puts a prop in main's claws and takes it away later, unless a newer action has.
  const hold = (acc: Accessory[]) => {
    m.acc = [...base(w), ...acc]
    if (!acc.length) return
    const token = ++propToken
    later(w, PROP_TICKS, () => { if (token === propToken) m.acc = base(w) })
  }
  const at = (name: StationName, offset: number, acc: Accessory[], text: string, then?: () => void) => {
    const s = station(w, name)
    const room = roomNamed(w, 'Main office')
    const x = Math.max((room?.x0 ?? 0) + 5, Math.min((room?.x1 ?? w.layout.width) - 6, (s?.x ?? m.x) + offset))
    goWalk(w, m, s?.floor ?? m.floor, x)
    m.arrive = () => { hold(acc); if (text) say(w, m, text, 40); then?.() }
  }
  const now = (acc: Accessory[], text: string, then?: () => void) => {
    hold(acc)
    say(w, m, text, 40)
    then?.()
  }
  const fail = (text: string) => {
    fxOn(w, 'alarm', 40)
    m.shake = true
    say(w, m, text, 30)
    puff(w, m)
    later(w, 25, () => { m.shake = false })
  }

  switch (ev.kind) {
    case 'prompt': w.fx.letterY = 0; fxOn(w, 'letter', 45); return at('inbox', 0, ['letter'], 'a new task!')
    case 'typing': return now([], 'hm? go on...', () => { m.hop = -1; later(w, 4, () => { m.hop = 0 }) })
    case 'image': return at('desk', -2, [], 'ooh, a screenshot', () => { w.fx.picture = true })
    case 'mention': return at('board', 0, [], `${l ? '@' + l : 'a file'} noted`, () => { w.fx.stickies = Math.min(4, num(w.fx.stickies) + 1) })
    case 'expand': return now(['blueprint'], 'a slash command!')
    case 'interrupt': return now(['stop'], 'stopping!')
    case 'turnStart': return now([], 'right, lets go', () => { m.hop = -1; later(w, 5, () => { m.hop = 0 }) })
    case 'thinking': {
      const desk = station(w, 'desk')?.x ?? m.x
      goWalk(w, m, m.floor, m.x > desk ? desk - 10 : desk + 10)
      return now(['think'], '...')
    }
    case 'batch': return now(['juggle'], 'tools in parallel!')
    case 'turnDone': return at('inbox', 2, ['wave'], 'your turn!')
    case 'turnFail': return fail('something broke, retrying')
    case 'read': return at('shelf', 0, ['book'], bubbleFor(ev) ?? 'reading...')
    case 'grep': return at('catalog', 0, ['magnifier'], 'searching the files')
    case 'edit': fxOn(w, 'typing', 60); return at('desk', 0, [], bubbleFor(ev) ?? 'editing...')
    case 'notebook': return at('desk', 4, ['notebook'], l ? `notebook ${l}` : 'notebook edit')
    case 'lsp': return at('shelf', 0, ['dictionary'], 'go to definition...')
    case 'toolSearch': return at('phone', 0, ['toolbox'], 'which tool fits?')
    case 'toolFail': return fail('oops, that failed')
    case 'bash': return at('console', 0, [], 'running a command')
    case 'test': return at('console', 0, [], 'running tests', () => {
      if (ev.ok === true) later(w, 20, () => { say(w, m, 'all green!', 30); burst(w, 'confetti') })
      if (ev.ok === false) later(w, 20, () => fail('tests failing!'))
    })
    case 'build': return at('console', 0, ['hammer'], 'building...')
    case 'install': w.fx.truckAt = w.tick; fxOn(w, 'truck', 45); return at('console', 0, [], 'packages incoming')
    case 'background': return at('console', 0, [], 'started in the background', () => fxOn(w, 'hourglass', 300))
    case 'monitor': return at('console', -8, ['binoculars'], 'watching the output')
    case 'commit': return at('desk', 6, ['parcel'], 'git commit')
    case 'push': return at('chute', 4, ['parcel'], 'git push!', () => {
      later(w, 15, () => { m.acc = base(w); say(w, m, 'whoosh, pushed', 30); w.dust.push({ x: station(w, 'chute')?.x ?? m.x, y: 8, until: w.tick + 10 }) })
    })
    case 'pr': return at('desk', 4, [], 'PR opened!', () => { w.fx.pr = true })
    case 'checkout': return now(['map'], 'switching branch')
    case 'worktree': return now(['box'], 'a new worktree!')
    case 'webSearch': return at('telescope', 0, [], 'searching the web')
    case 'webFetch': w.fx.birdAt = w.tick; fxOn(w, 'bird', 40); return at('telescope', 0, [], 'a pigeon brought a page!')
    case 'skill': return at('desk', -6, ['spellbook'], l ? `casting ${l}` : 'casting a skill')
    case 'listAgents': return at('board', 0, ['clipboard'], 'who else is in?')
    case 'msgIn': tube(w, 'up'); return later(w, 20, () => at('tube', 0, ['capsule'], ev.session ? `message from ${ev.session}` : 'a message!'))
    case 'msgOut': return at('tube', 0, ['capsule'], ev.session ? `message to ${ev.session}` : 'sending a message', () => { m.acc = base(w); tube(w, 'down') })
    case 'mcp': return at('phone', 0, ['phone'], `calling ${l ?? 'a server'}...`, () => fxOn(w, 'phone', 45))
    case 'elicitation': return at('inbox', 2, ['clipboard'], 'needs your input')
    case 'permAsk': return at('inbox', 0, ['bell'], 'may I?')
    case 'permOk': return now(['stampOk'], 'approved!')
    case 'permDenied': return now(['stampNo'], 'denied... fair')
    case 'ask': return at('inbox', 2, ['sign'], 'a question for you')
    case 'plan': return at('board', 6, ['blueprint'], 'heres the plan')
    case 'todo': return at('board', 0, [], ev.value ? 'tick!' : 'making a todo list', () => {
      w.fx.todos = Math.max(3, num(w.fx.todos))
      if (ev.value !== undefined) w.fx.ticked = Math.min(3, ev.value)
    })
    case 'cron': return now(['alarmclock'], 'see you later')
    case 'notify': return now(['megaphone'], 'hey! over here!')
    case 'remote': return now([], 'pinging the cloud', () => fxOn(w, 'dish', 35))
    case 'artifact': return at('catalog', 0, [], 'published a page!', () => { w.fx.poster = true })
    case 'compact': return at('desk', 3, ['broom'], 'compacting...', () => {
      for (let i = 0; i < 6; i++) w.dust.push({ x: m.x + (i - 3) * 2, y: standY(w, m.floor) - 1, until: w.tick + 30 })
      w.fx.context = 0.25
    })
    case 'instructions': return at('shelf', 0, ['rulebook'], 'reading CLAUDE.md')
    case 'rateLimit': return at('console', 0, [], 'rate limited, waiting', () => fxOn(w, 'hourglass', 45))
    case 'model': {
      const name = (l ?? '').toLowerCase()
      w.crown = Object.entries(CROWNS).find(([k]) => name.includes(k))?.[1] ?? '#9FC4E8'
      return now([], l ? `now: ${l}` : 'a new model!')
    }
    case 'fast': m.fast = ev.ok ?? !m.fast; return now([], m.fast ? 'fast mode on!' : 'fast mode off')
    case 'config': return now(['wrench'], 'settings updated')
    case 'cwd': return at('desk', -10, ['box'], l ? `moved to ${l}` : 'a new folder')
    case 'fileChanged': return now(['newspaper'], l ? `${l} changed!` : 'a file changed!')
    case 'remoteControl': return at('desk', 4, [], 'hi from your phone!', () => fxOn(w, 'phoneDock', 6000))
    case 'clear': return at('board', 0, ['broom'], 'fresh start', () => {
      Object.assign(w.fx, { todos: 0, ticked: 0, stickies: 0, picture: false, pr: false, poster: false })
    })
    case 'resume': return now(['mug'], 'where were we?')
    case 'idleLong': return at('desk', 0, [], 'zzz', () => { m.sleep = true })
    case 'sessionEnd': say(w, m, 'night all', 30); return fxOn(w, 'lightsOff', 60)
    default: return undefined
  }
}

// ---------- everyone else ----------

function playElsewhere(w: World, ev: OfficeEvent): void {
  switch (ev.kind) {
    case 'agentStart': {
      const type = ev.agentType ?? 'general-purpose'
      say(w, w.main, `${type}, you're up!`, 30)
      spawnReal(w, { role: 'agent', realId: ev.realId ?? `agent-${ev.seq}`, tag: type, acc: AGENT_LOOKS[type] ?? ['hard'] })
      return
    }
    case 'agentDone': if (ev.realId) retireReal(w, ev.realId, ev.ok === false ? 'failed' : 'done'); return
    case 'taskCreated':
      w.fx.tasksTodo = Math.min(6, num(w.fx.tasksTodo) + 1)
      say(w, w.main, 'a new team task', 25)
      return
    case 'taskDone':
      if (num(w.fx.tasksTodo) > 0) w.fx.tasksTodo = num(w.fx.tasksTodo) - 1
      w.fx.tasksDone = Math.min(6, num(w.fx.tasksDone) + 1)
      say(w, w.main, 'team task done!', 25)
      return
    case 'teammateIdle': {
      const id = ev.realId ?? `teammate-${ev.label ?? ev.seq}`
      const t = w.crabs.find(c => c.realId === id) ?? spawnReal(w, { role: 'teammate', realId: id, tag: ev.label ?? 'teammate', acc: ['teamcap'] })
      if (t) say(w, t, 'anything for me?', 30)
      return
    }
    case 'peerLetter': return letter(w, ev.realId, ev.session)
    case 'sessionOpen':
      if (ev.realId) spawnReal(w, { role: 'session', realId: ev.realId, tag: ev.label ?? 'session', acc: [lookFor(ev.realId)] })
      return
    case 'sessionBusy': if (ev.realId) setSessionIdle(w, ev.realId, false); return
    case 'sessionIdle': if (ev.realId) setSessionIdle(w, ev.realId, true); return
    case 'sessionClose': if (ev.realId) removeReal(w, ev.realId); return
    case 'context':
      w.fx.context = Math.max(0, Math.min(1, ev.value ?? num(w.fx.context)))
      say(w, w.main, `context ${Math.round(num(w.fx.context) * 100)}%`, 25)
      return
    case 'cost': say(w, w.main, `$${ev.value ?? '?'} spent!`, 30); burst(w, 'coins'); return
    case 'enhance': {
      const lib = w.librarian
      if (!lib || !w.crabs.includes(lib)) { say(w, w.main, 'prompt polished!', 30); return }
      const inbox = station(w, 'inbox')
      goWalk(w, lib, inbox?.floor ?? 0, (inbox?.x ?? w.main.x) + 12)
      say(w, lib, 'polishing your prompt!', 40)
      const home = roomNamed(w, 'Library') ?? roomNamed(w, 'Break room')
      lib.arrive = () => {
        lib.dir = -1
        say(w, lib, 'clearer now!', 30)
        later(w, 35, () => { if (home) goWalk(w, lib, home.floor, home.stations.books ?? (home.x0 + home.x1) / 2) })
      }
      return
    }
    default: return undefined
  }
}

// One session's crab carries a letter to the other's desk.
function letter(w: World, fromId?: string, toId?: string): void {
  const from = w.crabs.find(c => c.realId === fromId && c.role === 'session')
  const to = w.crabs.find(c => c.realId === toId && c.role === 'session')
  if (!from || !to || from.plan.length) return
  const home = from.deskX ?? from.x
  from.acc = [...from.acc, 'letter']
  say(w, from, `a note for ${to.tag ?? 'you'}`, 30)
  goWalk(w, from, to.floor, to.x - 11)
  from.arrive = () => {
    from.dir = 1
    to.dir = -1
    to.sleep = false
    later(w, 26, () => { from.acc = from.acc.filter(a => a !== 'letter'); to.acc = [...to.acc, 'letter']; say(w, to, 'thanks!', 30) })
    later(w, 52, () => { to.acc = to.acc.filter(a => a !== 'letter'); goWalk(w, from, from.floor, home) })
  }
}

// ---------- helpers ----------

function base(w: World): Accessory[] {
  return w.main.fast ? ['crown', 'shoes'] : ['crown']
}
function num(v: number | boolean | undefined): number {
  return typeof v === 'number' ? v : 0
}
function lookFor(id: string): Accessory {
  const looks: Accessory[] = ['headphones', 'scarf', 'beanie', 'party']
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0

  return looks[h % looks.length] ?? 'scarf'
}
// Walks exactly to a station (stations are fixed places, not claimed spots).
function goWalk(w: World, c: Crab, floor: number, x: number): void {
  c.plan = []
  if (floor !== c.floor && w.layout.shaftW > 0) {
    c.waitX = w.layout.waitX
    c.plan.push({ walk: w.layout.waitX }, { lift: floor })
  }
  c.tFloor = floor
  c.tx = Math.round(x)
  c.plan.push({ walk: Math.round(x) })
}
function tube(w: World, way: 'up' | 'down'): void {
  const t = w.layout.tube
  if (!t) return
  w.fx.tubeAt = w.tick
  w.fx.tubeFrom = way === 'up' ? t.floors[1] : t.floors[0]
  w.fx.tubeTo = way === 'up' ? t.floors[0] : t.floors[1]
  fxOn(w, 'tube', 22)
}
function burst(w: World, kind: 'confetti' | 'coins'): void {
  const colours = ['#E85A9A', '#7FD1A8', '#E8C15A', '#9FC4E8', '#D97757']
  for (let i = 0; i < 24; i++) {
    w.parts.push({
      kind, x: w.main.x + w.rng.range(-4, 4), y: standY(w, w.main.floor) - 8,
      vx: w.rng.range(-0.4, 0.4), vy: w.rng.range(-0.6, -0.15), until: w.tick + 30,
      c: kind === 'coins' ? '#E8C15A' : w.rng.pick(colours),
    })
  }
}
function puff(w: World, c: Crab): void {
  for (let i = 0; i < 8; i++) {
    w.parts.push({ kind: 'smoke', x: c.x + w.rng.range(-2, 2), y: standY(w, c.floor) - 7, vx: w.rng.range(-0.1, 0.1), vy: w.rng.range(-0.2, -0.05), until: w.tick + 25, c: '#888888' })
  }
}
