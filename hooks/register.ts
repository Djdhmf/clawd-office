import type { EngineInterface, Register } from 'claude-code'
import { classifyTool, labelFor } from './events'
import type { EventKind, OfficeEvent } from './events'
import { createFeed } from './feed'
import type { OfficeProps, Roster } from './office/client'
import { claudeDir, lettersFrom, readOpenSessions, readPeerFiles, reconcileAgents, trimRoster, writeOwnFile } from './sessions'
import type { Disk } from './sessions'

const POLL_MS = 2000

export const OFFICE = 'office'
const TITLE = 'Clawd Office'
const ENABLED_KEY = 'enabled'
const COST_MILESTONES = [1, 2, 5, 10, 20, 50, 100]
const IDLE_LONG_MS = 10 * 60 * 1000

export const DOCK_HELP =
  'Clawd Office only opens as a side panel docked beside the conversation: that needs Claude Code\'s fullscreen layout and a window at least 110 columns wide. Turn on the fullscreen layout (or widen the window), then run /office again.'

// What the hooks module keeps for the office: a bounded feed of events, the
// roster of real crabs, and what the pane last showed.
const feed = createFeed()
const roster: Roster = { agents: [], sessions: [] }
let placement: 'dock' | 'inline' | undefined
let isOpen = false
let size = { columns: 110, rows: 40 }
let lastTurnAt = Date.now()
let idleReported = false
let lastContext = 0
let costShown = 0
let lastTyping = 0
let lastThinking = 0
const askedTools = new Set<string>()

const push = (kind: EventKind, extra: Omit<OfficeEvent, 'seq' | 'kind'> = {}) => feed.push({ kind, ...extra })
const field = (e: unknown, key: string): unknown => (e && typeof e === 'object' ? (e as Record<string, unknown>)[key] : undefined)
const text = (e: unknown, key: string): string | undefined => {
  const v = field(e, key)

  return typeof v === 'string' && v !== '' ? v : undefined
}
const base = (path: string | undefined) => path?.split(/[\\/]/).filter(Boolean).pop()?.slice(0, 40)

const propsFor = (since: number): OfficeProps => ({
  events: feed.since(since),
  roster: trimRoster({ agents: [...roster.agents], sessions: [...roster.sessions] }),
  columns: size.columns,
  rows: size.rows,
})

// Opens the office and says how it went: the dock help when it cannot dock.
async function open($: EngineInterface): Promise<string> {
  const opened = await $.ui.open({ id: OFFICE, title: TITLE }).catch(() => undefined)
  if (!opened || !opened.isPlaced) {
    const why = opened && !opened.isPlaced && opened.reason ? ` (${opened.reason})` : ''

    return `${DOCK_HELP}${why}`
  }
  isOpen = true
  if (placement === 'inline') return DOCK_HELP

  return 'Clawd Office is open.'
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({ name: 'office', description: 'Show or hide Clawd Office, the crab office side panel', argumentHint: '[on|off]' }).catch(() => undefined)
    if ((await $.store.get(ENABLED_KEY)) !== false) void open($).catch(() => undefined)
    // A long quiet spell: main naps.
    $.clock.every(60_000, () => {
      if (!idleReported && Date.now() - lastTurnAt > IDLE_LONG_MS) { idleReported = true; push('idleLong') }
    })
    void startSharing($).catch(() => undefined)

    return started
  })

  on('command.run', { command: 'office' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const enable = arg === 'on' ? true : arg === 'off' ? false : !isOpen
    await $.store.set(ENABLED_KEY, enable)
    if (!enable) {
      isOpen = false
      await $.ui.close({ id: OFFICE }).catch(() => undefined)

      return { text: 'Clawd Office is off. /office on brings it back.' }
    }

    return { text: await open($) }
  })

  // Docked, the office draws; seated inline, it closes rather than take the prompt's strip.
  on('ui.render', { component: 'Pane', requestId: OFFICE }, async ($, e) => {
    placement = e.props.placement
    if (e.props.placement !== 'dock' || e.surface !== 'terminal') {
      isOpen = false
      void $.ui.close({ id: OFFICE }).catch(() => undefined)

      return $.ui.resolve(e).Box({ children: [] })
    }
    const { Client } = $.ui.resolve(e)
    isOpen = true
    size = { columns: e.props.bodyColumns, rows: e.props.scroll.bodyRows }

    return Client({ key: OFFICE, module: './office/client.ts', props: propsFor(0), width: size.columns, height: size.rows })
  })

  // The office asks for what happened since the last event it saw.
  on('ui.message', async ($, e, next) => {
    const since = field(e.data, 'since')
    if (e.element === OFFICE && typeof since === 'number') return { props: propsFor(since) }

    return next(e)
  })

  // ---------- observers: each passes the event on unchanged ----------

  on('tool.call', async ($, e, next) => {
    if (e.agentId) return next(e)
    const input = e as unknown as Record<string, unknown>
    const kinds = classifyTool(e.tool, input)
    const label = labelFor(e.tool, input)
    if (askedTools.delete(e.tool)) push('permOk', { label: e.tool })
    const isTest = kinds.includes('test')
    for (const kind of kinds) {
      if (kind === 'todo') {
        const todos = field(input, 'todos')
        push('todo', { value: Array.isArray(todos) ? todos.filter(t => field(t, 'status') === 'completed').length : 0 })
      } else if (kind !== 'test') push(kind, label ? { label } : {})
    }
    const ran = await next(e)
    const failed = 'isError' in ran && ran.isError === true
    if (isTest) push('test', { ok: !failed })
    else if (failed) push('toolFail', { label: e.tool })

    return ran
  })

  on('turn.start', async ($, e, next) => {
    if (!field(e, 'agentId')) { lastTurnAt = Date.now(); idleReported = false; push('turnStart') }

    return next(e)
  })
  // turn.step streams: forward its chunks untouched.
  on('turn.step', async function* ($, e, next) {
    if (!field(e, 'agentId') && Date.now() - lastThinking > 20000) { lastThinking = Date.now(); push('thinking') }

    return yield* next(e)
  })
  on('turn.complete', async ($, e, next) => {
    if (!field(e, 'agentId')) {
      lastTurnAt = Date.now()
      const reason = field(e, 'reason')
      push(reason === 'aborted' ? 'interrupt' : reason === 'error' ? 'turnFail' : 'turnDone')
    }

    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    push('prompt')

    return next(e)
  })
  on('prompt.change', async ($, e, next) => {
    if (Date.now() - lastTyping > 15000) { lastTyping = Date.now(); push('typing') }

    return next(e)
  })
  on('prompt.attachment', async ($, e, next) => {
    push('image')

    return next(e)
  })
  on('prompt.mention', async ($, e, next) => {
    const label = base(text(e, 'path') ?? text(e, 'text'))
    push('mention', label ? { label } : {})

    return next(e)
  })
  on('prompt.fill', async ($, e, next) => {
    if (e.origin.kind === 'plugin' && e.origin.name === 'prompt-enhancer') push('enhance')

    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const spawned = await next(e)
    const agentId = field(spawned, 'agentId')
    if (typeof agentId === 'string') {
      roster.agents = trimRoster({ ...roster, agents: [...roster.agents.filter(a => a.id !== agentId), { id: agentId, type: e.subagentType, status: 'running' }] }).agents
      push('agentStart', { realId: agentId, agentType: e.subagentType })
    }

    return spawned
  })

  on('session.send', async ($, e, next) => {
    push('msgOut', { session: e.to.slice(0, 40) })

    return next(e)
  })
  on('session.receive', async ($, e, next) => {
    const from = text(e.origin, 'name')?.slice(0, 40)
    push('msgIn', from ? { session: from } : {})

    return next(e)
  })
  on('session.measure', async ($, e, next) => {
    const tokens = e.context.tokens
    const used = tokens !== undefined && e.context.window > 0 ? tokens / e.context.window : undefined
    if (used !== undefined && Math.abs(used - lastContext) >= 0.1) { lastContext = used; push('context', { value: Math.round(used * 100) / 100 }) }
    const usd = e.cost?.usd
    const milestone = usd === undefined ? undefined : [...COST_MILESTONES].reverse().find(m => usd >= m)
    if (milestone !== undefined && milestone > costShown) { costShown = milestone; push('cost', { value: milestone }) }

    return next(e)
  })
  on('session.end', async ($, e, next) => {
    push('sessionEnd')

    return next(e)
  })
  on('session.attach', async ($, e, next) => {
    push('remoteControl')

    return next(e)
  })
  on('config.set', async ($, e, next) => {
    if (/fast/i.test(String(field(e, 'key') ?? ''))) push('fast', { ok: field(e, 'value') === true })

    return next(e)
  })

  // Classic hook events: observed, never answered. The engine reads each
  // event name and hook off the source, so every one is written out.
  on('classic.PreCompact', async ($, e, next) => { push('compact'); return next(e) })
  on('classic.PermissionRequest', async ($, e, next) => {
    const tool = text(e, 'tool_name')
    if (tool) askedTools.add(tool)
    push('permAsk', labelOf(tool))

    return next(e)
  })
  on('classic.PermissionDenied', async ($, e, next) => { askedTools.delete(text(e, 'tool_name') ?? ''); push('permDenied'); return next(e) })
  on('classic.Notification', async ($, e, next) => { push('notify'); return next(e) })
  on('classic.StopFailure', async ($, e, next) => { push(field(e, 'error') === 'rate_limit' ? 'rateLimit' : 'turnFail'); return next(e) })
  on('classic.PostToolBatch', async ($, e, next) => { push('batch'); return next(e) })
  on('classic.SubagentStop', async ($, e, next) => {
    const id = text(e, 'agent_id')
    if (id) {
      roster.agents = roster.agents.map(a => (a.id === id ? { ...a, status: 'completed' as const } : a))
      push('agentDone', { realId: id, ok: true })
    }

    return next(e)
  })
  on('classic.TaskCreated', async ($, e, next) => { push('taskCreated'); return next(e) })
  on('classic.TaskCompleted', async ($, e, next) => { push('taskDone'); return next(e) })
  on('classic.TeammateIdle', async ($, e, next) => { push('teammateIdle', labelOf(text(e, 'teammate_name'), 20)); return next(e) })
  on('classic.InstructionsLoaded', async ($, e, next) => { push('instructions'); return next(e) })
  on('classic.ConfigChange', async ($, e, next) => { push('config'); return next(e) })
  on('classic.CwdChanged', async ($, e, next) => { push('cwd', labelOf(base(text(e, 'new_cwd') ?? text(e, 'cwd')))); return next(e) })
  on('classic.DirectoryAdded', async ($, e, next) => { push('cwd', labelOf(base(text(e, 'directory') ?? text(e, 'path')))); return next(e) })
  on('classic.FileChanged', async ($, e, next) => { push('fileChanged', labelOf(base(text(e, 'file_path') ?? text(e, 'path')))); return next(e) })
  on('classic.WorktreeCreate', async ($, e, next) => { push('worktree'); return next(e) })
  on('classic.PostModelSwitch', async ($, e, next) => { push('model', labelOf(text(e, 'model') ?? text(e, 'new_model'))); return next(e) })
  on('classic.Elicitation', async ($, e, next) => { push('elicitation', labelOf(text(e, 'mcp_server_name'), 20)); return next(e) })
  on('classic.UserPromptExpansion', async ($, e, next) => { push('expand'); return next(e) })
  on('classic.SessionStart', async ($, e, next) => {
    const source = field(e, 'source')
    if (source === 'clear') push('clear')
    if (source === 'resume') push('resume')

    return next(e)
  })
}

// Every 2 s: the other sessions into the roster, their messages to each
// other as letters, subagents settled against the engine's list, and this
// session's events written for the other offices to read.
async function startSharing($: EngineInterface): Promise<void> {
  const dir = await claudeDir($).catch(() => undefined)
  if (!dir) return
  const self = await $.session.id().catch(() => '')
  const name = ((await $.session.cwd().catch(() => '')).split(/[\\/]/).filter(Boolean).pop() ?? 'session').slice(0, 24)
  const disk: Disk = {
    list: d => $.fs.list(d),
    read: async p => String(await $.fs.read(p)),
    write: (p, t) => $.fs.write(p, t),
  }
  const seen = new Map<string, number>()
  let primed = false
  let written = 0
  let polling = false
  const poll = async () => {
    const open = await readOpenSessions(disk, dir, self)
    roster.sessions = open.map(s => ({ id: s.sessionId, name: s.name, busy: s.busy }))
    const letters = lettersFrom(await readPeerFiles(disk, dir, self), open, seen)
    // The first read only learns where each peer is, so old messages are not replayed.
    if (primed) for (const l of letters) push('peerLetter', { realId: l.from, session: l.to })
    primed = true
    if (roster.agents.some(a => a.status === 'running')) {
      const list = await $.agent.list().catch(() => [])
      roster.agents = reconcileAgents(roster, list.map(a => ({ id: a.id, status: a.status }))).agents
    }
    if (self && feed.last() > written) {
      written = feed.last()
      await writeOwnFile(disk, dir, self, name, feed.since(0))
    }
  }
  $.clock.every(POLL_MS, () => {
    if (polling) return
    polling = true
    void poll().catch(() => undefined).finally(() => { polling = false })
  })
}

function labelOf(v: string | undefined, max = 30): { label?: string } {
  return v ? { label: v.slice(0, max) } : {}
}
