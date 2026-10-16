// Every real Claude Code event the office acts out, as a kind; what each
// means and how the mod sees it; and the classifiers that turn a tool call
// into kinds. Only events this build (2.1.301) actually raises have a kind:
// see README.md, "Not shown, and why", for the rows the design dropped.

export const KINDS = [
  // you and the prompt box
  'prompt', 'enhance', 'typing', 'image', 'mention', 'expand', 'interrupt',
  // the turn
  'turnStart', 'thinking', 'batch', 'turnDone', 'turnFail',
  // files and search
  'read', 'grep', 'edit', 'notebook', 'lsp', 'toolSearch', 'toolFail',
  // the shell
  'bash', 'test', 'build', 'install', 'background', 'monitor',
  // git
  'commit', 'push', 'pr', 'checkout', 'worktree',
  // the web
  'webSearch', 'webFetch',
  // agents, skills, teams
  'agentStart', 'agentDone', 'skill', 'taskCreated', 'taskDone', 'teammateIdle',
  // sessions talking to each other
  'peerLetter', 'msgIn', 'msgOut', 'listAgents', 'sessionOpen', 'sessionBusy', 'sessionIdle', 'sessionClose',
  // MCP
  'mcp', 'elicitation',
  // permissions and modes
  'permAsk', 'permOk', 'permDenied', 'ask', 'plan',
  // tasks and time
  'todo', 'cron', 'notify', 'remote', 'artifact',
  // context and cost
  'context', 'compact', 'instructions', 'cost', 'rateLimit',
  // settings and the session
  'model', 'fast', 'config', 'cwd', 'fileChanged', 'remoteControl', 'clear', 'resume', 'idleLong', 'sessionEnd',
] as const

export type EventKind = (typeof KINDS)[number]

/** One thing that happened, as the office acts it out. */
export type OfficeEvent = {
  seq: number
  kind: EventKind
  /** A short label: a file's base name, an MCP server, a model; never prompt or command text. */
  label?: string
  /** The real crab it concerns: a subagent's id or a session's id. */
  realId?: string
  /** The other session in a message between sessions. */
  session?: string
  /** For a subagent, its type (Explore, Plan, ...). */
  agentType?: string
  /** Whether it went well, where that is known (tests, subagents, tools). */
  ok?: boolean
  /** A number some kinds carry: context used (0..1), dollars spent. */
  value?: number
}

type Row = { cat: string; name: string; how: string; act: string }

export const CATALOG: Record<EventKind, Row> = {
  prompt: { cat: 'You', name: 'You send a prompt', how: 'prompt.submit', act: 'a letter drops into the inbox; main reads it' },
  enhance: { cat: 'You', name: 'Enhance used', how: 'prompt.fill from prompt-enhancer', act: 'the librarian crab hurries up with a book' },
  typing: { cat: 'You', name: 'You are typing', how: 'prompt.change', act: 'main looks up, listening' },
  image: { cat: 'You', name: 'Image pasted', how: 'prompt.attachment', act: 'a picture frame appears on the wall' },
  mention: { cat: 'You', name: '@file mentioned', how: 'prompt.mention', act: 'a sticky note goes on the whiteboard' },
  expand: { cat: 'You', name: 'Slash command expanded', how: 'UserPromptExpansion', act: 'unrolls a scroll of instructions' },
  interrupt: { cat: 'You', name: 'Interrupted (Esc)', how: 'turn.complete (aborted)', act: 'freezes and holds up a stop sign' },
  turnStart: { cat: 'Turn', name: 'Turn starts', how: 'turn.start', act: 'hops up and gets to work' },
  thinking: { cat: 'Turn', name: 'Thinking', how: 'turn.step', act: 'paces with a thought cloud' },
  batch: { cat: 'Turn', name: 'Several tools at once', how: 'PostToolBatch', act: 'juggles' },
  turnDone: { cat: 'Turn', name: 'Turn done, waiting for you', how: 'turn.complete', act: 'waves "your turn!"' },
  turnFail: { cat: 'Turn', name: 'Turn failed', how: 'StopFailure / turn.complete (error)', act: 'red alarm, smoke, shakes' },
  read: { cat: 'Tools', name: 'Read a file', how: 'tool.call Read', act: 'pulls a book from the shelf' },
  grep: { cat: 'Tools', name: 'Grep / Glob', how: 'tool.call Grep, Glob', act: 'rifles the card catalogue with a magnifier' },
  edit: { cat: 'Tools', name: 'Edit / Write a file', how: 'tool.call Edit, Write', act: 'types at the desk' },
  notebook: { cat: 'Tools', name: 'Notebook edit', how: 'tool.call NotebookEdit', act: 'scribbles in a lab notebook' },
  lsp: { cat: 'Tools', name: 'Code intelligence', how: 'tool.call LSP', act: 'checks the big dictionary' },
  toolSearch: { cat: 'Tools', name: 'Tool search', how: 'tool.call ToolSearch', act: 'rummages in the toolbox' },
  toolFail: { cat: 'Tools', name: 'Tool failed', how: 'tool.call result isError', act: 'smoke puff, shakes it off' },
  bash: { cat: 'Shell', name: 'Bash command', how: 'tool.call Bash', act: 'works the console' },
  test: { cat: 'Shell', name: 'Tests run', how: 'Bash running tests; pass or fail from its result', act: 'confetti when green, red alarm when not' },
  build: { cat: 'Shell', name: 'Build', how: 'Bash running a build', act: 'hammers away' },
  install: { cat: 'Shell', name: 'Install packages', how: 'Bash installing packages', act: 'a delivery truck pulls up' },
  background: { cat: 'Shell', name: 'Background shell', how: 'Bash run_in_background', act: 'an hourglass on the console' },
  monitor: { cat: 'Shell', name: 'Watching output', how: 'tool.call Monitor', act: 'watches through binoculars' },
  commit: { cat: 'Git', name: 'git commit', how: 'Bash git commit', act: 'stamps a parcel' },
  push: { cat: 'Git', name: 'git push', how: 'Bash git push', act: 'drops the parcel down the mail chute' },
  pr: { cat: 'Git', name: 'Pull request opened', how: 'Bash gh pr create', act: 'hangs a green PR frame on the wall' },
  checkout: { cat: 'Git', name: 'Branch switch', how: 'Bash git checkout / switch', act: 'reads the map' },
  worktree: { cat: 'Git', name: 'Worktree created', how: 'WorktreeCreate / tool.call EnterWorktree', act: 'packs a box for the new desk' },
  webSearch: { cat: 'Web', name: 'Web search', how: 'tool.call WebSearch', act: 'looks through the telescope' },
  webFetch: { cat: 'Web', name: 'Fetch a page', how: 'tool.call WebFetch', act: 'a carrier pigeon brings a letter' },
  agentStart: { cat: 'Agents', name: 'Subagent starts', how: 'agent.spawn', act: 'main calls one out; a hatted crab rides up to the workshop' },
  agentDone: { cat: 'Agents', name: 'Subagent finishes or fails', how: 'SubagentStop / $.agent.list() status', act: 'rides up with a report (or a bandage), retires, later goes home' },
  skill: { cat: 'Agents', name: 'Skill used', how: 'tool.call Skill', act: 'opens a glowing spellbook' },
  taskCreated: { cat: 'Agents', name: 'Team task created', how: 'TaskCreated', act: 'stickies go up on the team kanban' },
  taskDone: { cat: 'Agents', name: 'Team task done', how: 'TaskCompleted', act: 'a sticky moves to Done' },
  teammateIdle: { cat: 'Agents', name: 'Teammate idle', how: 'TeammateIdle', act: 'a red-cap teammate waits in the team room' },
  peerLetter: { cat: 'Sessions', name: 'Session messages session', how: 'another session\'s shared event file', act: 'one session crab carries a letter to the other' },
  msgIn: { cat: 'Sessions', name: 'Message to main', how: 'session.receive', act: 'a capsule shoots up the tube; main reads it' },
  msgOut: { cat: 'Sessions', name: 'Main messages a session', how: 'session.send / tool.call SendMessage', act: 'main sends a capsule down the tube' },
  listAgents: { cat: 'Sessions', name: 'List other sessions', how: 'tool.call ListAgents', act: 'checks the staff directory' },
  sessionOpen: { cat: 'Sessions', name: 'Session opens', how: '~/.claude/sessions', act: 'a crab walks into Sessions' },
  sessionBusy: { cat: 'Sessions', name: 'Session busy', how: '~/.claude/sessions', act: 'its crab types' },
  sessionIdle: { cat: 'Sessions', name: 'Session idle', how: '~/.claude/sessions', act: 'its crab dozes' },
  sessionClose: { cat: 'Sessions', name: 'Session closes', how: '~/.claude/sessions', act: 'its crab heads home' },
  mcp: { cat: 'MCP', name: 'MCP tool call', how: 'tool.call mcp__*', act: 'makes a phone call' },
  elicitation: { cat: 'MCP', name: 'MCP asks for input', how: 'Elicitation', act: 'holds out a clipboard form' },
  permAsk: { cat: 'Permissions', name: 'Needs permission', how: 'PermissionRequest', act: 'rings a bell, claw raised' },
  permOk: { cat: 'Permissions', name: 'Permission granted', how: 'a tool that was asked about runs (partial)', act: 'a green stamp' },
  permDenied: { cat: 'Permissions', name: 'Permission denied', how: 'PermissionDenied', act: 'a red stamp, a sigh' },
  ask: { cat: 'Permissions', name: 'Asks you a question', how: 'tool.call AskUserQuestion', act: 'holds up a "?" sign' },
  plan: { cat: 'Permissions', name: 'Plan mode', how: 'tool.call ExitPlanMode / EnterPlanMode', act: 'unrolls a blueprint' },
  todo: { cat: 'Tasks', name: 'Todo list written or ticked', how: 'tool.call TodoWrite', act: 'writes or ticks items on the whiteboard' },
  cron: { cat: 'Tasks', name: 'Scheduled for later', how: 'tool.call CronCreate / ScheduleWakeup', act: 'sets an alarm clock' },
  notify: { cat: 'Tasks', name: 'Sends you a notification', how: 'tool.call PushNotification / Notification', act: 'shouts through a megaphone' },
  remote: { cat: 'Tasks', name: 'Remote trigger', how: 'tool.call RemoteTrigger', act: 'the rooftop dish blinks' },
  artifact: { cat: 'Tasks', name: 'Artifact published', how: 'tool.call Artifact', act: 'pins a poster on the wall' },
  context: { cat: 'Context', name: 'Context filling up', how: 'session.measure', act: 'the wall gauge rises; papers pile up near full' },
  compact: { cat: 'Context', name: 'Compacting', how: 'PreCompact / session.compact', act: 'sweeps the papers away' },
  instructions: { cat: 'Context', name: 'CLAUDE.md loaded', how: 'InstructionsLoaded', act: 'reads the red rulebook' },
  cost: { cat: 'Context', name: 'Cost milestone', how: 'session.measure cost (partial: where cost is reported)', act: 'coins pop out' },
  rateLimit: { cat: 'Context', name: 'Rate limited', how: 'StopFailure rate_limit', act: 'waits by the hourglass' },
  model: { cat: 'Settings', name: 'Model switched', how: 'PostModelSwitch', act: 'the crown changes colour' },
  fast: { cat: 'Settings', name: 'Fast mode', how: 'config.set (partial: where the setting is reported)', act: 'puts on running shoes, walks faster' },
  config: { cat: 'Settings', name: 'Settings changed', how: 'ConfigChange', act: 'tightens a bolt with a wrench' },
  cwd: { cat: 'Settings', name: 'Folder changed', how: 'CwdChanged / DirectoryAdded', act: 'carries a box to a new spot' },
  fileChanged: { cat: 'Settings', name: 'File changed outside', how: 'FileChanged', act: 'a newspaper arrives' },
  remoteControl: { cat: 'Settings', name: 'Remote control connected', how: 'session.attach', act: 'a phone on the desk lights up' },
  clear: { cat: 'Settings', name: '/clear', how: 'SessionStart (clear)', act: 'wipes the whiteboard' },
  resume: { cat: 'Settings', name: 'Session resumed', how: 'SessionStart (resume)', act: 'walks back in with a coffee' },
  idleLong: { cat: 'Settings', name: 'Idle a long time', how: 'no turn for 10 minutes', act: 'naps at the desk' },
  sessionEnd: { cat: 'Settings', name: 'Session ends', how: 'SessionEnd / session.end', act: 'turns the lights off' },
}

/** What a Bash command runs, told apart by its text. */
export function classifyBash(command: string): 'test' | 'build' | 'install' | 'commit' | 'push' | 'pr' | 'checkout' | 'bash' {
  const c = command.toLowerCase()
  if (/\bgh\s+pr\s+create\b/.test(c)) return 'pr'
  if (/\bgit\s+commit\b/.test(c)) return 'commit'
  if (/\bgit\s+push\b/.test(c)) return 'push'
  if (/\bgit\s+(checkout|switch)\b/.test(c)) return 'checkout'
  if (/\b(npm|pnpm|yarn|bun)\s+(i|install|add|ci)\b|\bpip3?\s+install\b|\bcargo\s+add\b|\bgo\s+get\b/.test(c)) return 'install'
  if (/\b(npm|pnpm|yarn|bun)\s+(run\s+)?test\b|\bpytest\b|\b(cargo|go|plugin)\s+test\b|\b(jest|vitest|mocha)\b/.test(c)) return 'test'
  if (/\b(npm|pnpm|yarn|bun)\s+(run\s+)?build\b|\btsc\b|\bmake\b|\b(cargo|go)\s+build\b|\bvite\s+build\b/.test(c)) return 'build'

  return 'bash'
}

const TOOLS: Record<string, EventKind | undefined> = {
  Read: 'read', Grep: 'grep', Glob: 'grep', Edit: 'edit', Write: 'edit', MultiEdit: 'edit', NotebookEdit: 'notebook',
  LSP: 'lsp', ToolSearch: 'toolSearch', WebSearch: 'webSearch', WebFetch: 'webFetch', Skill: 'skill',
  AskUserQuestion: 'ask', ExitPlanMode: 'plan', EnterPlanMode: 'plan', TodoWrite: 'todo', CronCreate: 'cron',
  ScheduleWakeup: 'cron', PushNotification: 'notify', RemoteTrigger: 'remote', Monitor: 'monitor', SendMessage: 'msgOut',
  ListAgents: 'listAgents', Artifact: 'artifact', EnterWorktree: 'worktree',
}

/**
 * The kinds a tool call shows as. The Agent tool shows none: its crab comes
 * from `agent.spawn`, so it is never counted twice.
 */
export function classifyTool(tool: string, input: Record<string, unknown>): EventKind[] {
  if (tool === 'Bash') {
    if (input.run_in_background === true) return ['background']

    return [classifyBash(typeof input.command === 'string' ? input.command : '')]
  }
  if (tool.startsWith('mcp__')) return ['mcp']
  const kind = TOOLS[tool]

  return kind ? [kind] : []
}

/** A short label for a tool call: a file's base name or an MCP server; never prompt or command text. */
export function labelFor(tool: string, input: Record<string, unknown>): string | undefined {
  if (tool.startsWith('mcp__')) return tool.split('__')[1]
  const path = input.file_path ?? input.notebook_path ?? input.path
  if (typeof path !== 'string' || path === '') return undefined
  const base = path.split(/[\\/]/).pop()

  return base ? base.slice(0, 40) : undefined
}
