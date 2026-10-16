# Claude Office Implementation Plan

> **Execution:** native. Build every task directly in this session with superpowers:executing-plans. Do not dispatch subagents or parallel agents for any task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `claude-office` mod: a docked side panel showing a living 8-bit office of Claude crabs that act out real Claude Code events.

**Architecture:**
- **The engine side is the hooks module** (`hooks/register.ts`). Its hooks only observe events: they classify each one into an `OfficeEvent`, append it to a numbered feed, and keep a roster of the real crabs (subagents, sessions, teammates).
- **The pane** draws one `Client` surface module (`hooks/office/client.ts`), passing it the feed and the roster as props. Inside, a deterministic simulation (`sim.ts`) runs crabs, the elevator and actions, and `render.ts` turns the world into half-block cells.
- **Pure modules carry the logic** (events, layout, sim, render), so they unit-test without the engine.

**Tech Stack:** TypeScript, Claude Code Mods API 2.1.301 (`ui.render` Pane, `Client`, `$.ui.open`, `$.store`, `$.fs`, `$.agent.list`), `claude plugin test`.

**Spec:** `docs/claude-office-design.md`. The visual reference is `docs/mockup/crab-town-v5.html`. Port its sprite, accessory, furniture, `EVENTS`, `LINES`, elevator, spot and unclump logic, which is already tuned.

## Global Constraints

- **Location and name:** the mod lives in `<path-to>/claude-office`, plugin name `claude-office`. No code is shared with or imported from prompt-enhancer.
- **Hooks observe only:** every hook returns `next(e)` unchanged, never denies or alters anything, and never awaits slow I/O on `tool.call`.
- **Docking:** the office shows only when the Pane's `placement` is `'dock'`. When it is `'inline'`, it draws nothing, closes itself, and `/office` explains why (fullscreen layout and at least 110 columns).
- **Art:** half-block pixels. Crab body `#D97757`, 9×6 px, small 1-px eyes, no blush, no mouth.
- **Pace:** logic at 10 ticks a second, motion at 20 fps (fall back to 10 if heavy). Walking at most about 5 px/s (doubled in fast mode). Bubbles last about 3 s, and conversation lines are about 2.2 s apart.
- **Elevator:** at most 2 riders, an "n/2" counter, a FIFO queue, crabs waiting in spaced spots outside the shaft.
- **Standing room:** a spot gap of 11 px. The make-room pass ranks main, then librarian, then agent and teammate, then session, then background.
- **Population:** at most 6 background crabs. Retired subagents go home after 50–80 s. Real crabs that don't fit wait on the street behind a "+N" sign and are never dropped.
- **Events with no signal:** ship only rows backed by a real signal in 2.1.301, with no guessed proxies. The README lists every dropped or partial row and why.
- **Shared files:** `~/.claude/claude-office/<sessionId>.json` holds short labels only (event kind, tool name, file base name, agent type, session name), never prompt or message content. Writes at most about once a second, whole-file. Reads tolerate missing or garbled files.
- **Tree size:** under the Client limits (20,000 nodes, 100,000 characters).
- **No git repo:** "commit" steps are replaced by running the full checks.

## Review Focus

1. **A pane that resizes or flips between dock and inline mid-session:** the layout rebuilds without losing the real crabs, and inline closes the office cleanly. *Test in Task 5.*
2. **A burst of 10+ subagents, or 8 sessions:** desks fill, the rest queue behind "+N", and there are no overlaps and no drops. *Test in Task 3.*
3. **A subagent that never reports completion,** for example killed, or its status lost on hot reload: it is reconciled from `$.agent.list()` and leaves. *Test in Task 6.*
4. **Malformed or partial session files in `~/.claude/sessions` or `claude-office/`:** they are ignored without throwing. *Test in Task 6.*
5. **Events arriving before the pane is open, or while closed:** the feed is bounded (last 100), and nothing grows without limit. *Test in Task 5.*

---

### Task 1: Scaffold, sprites and half-block renderer

**Files:**
- Create:
  - `.claude-plugin/plugin.json` (name `claude-office`, version `0.1.0`)
  - `.claude-plugin/marketplace.json`
  - `hooks/hooks.json` (`{ "modules": ["./register.ts"] }`)
  - `tsconfig.json`
  - `hooks/office/sprites.ts`
  - `hooks/office/cells.ts`
  - `hooks/register.ts` (the session-start auto-open below; the rest of the wiring comes in Task 5)
- Test: `tests/sprites.test.ts`, `tests/autostart.test.ts`

**Auto-open on session start.** Mods register hooks through the hooks module that the manifest's `hooks/hooks.json` names, the same way prompt-enhancer registers `/enhance` in its `on('session.start')`. A classic settings-file SessionStart hook can't open a pane, so it isn't used.
- `on('session.start', hook)` calls `$.ui.open({ id: 'office', title: 'Claude Office' })` unless `$.store.get('enabled') === false`, then returns `next(e)`. The open isn't awaited for drawing, so it never delays session start.
- An unasked open only places from 144 columns; below that it waits undrawn until the window widens or the person types `/office` (Task 5).
- Until Task 5, the pane draws an empty placeholder.

**Interfaces:**
- Produces:
  - `type Pixels = (string|undefined)[][]`
  - `blank(w,h)`
  - `stamp(canvas, sprite, x, y)`
  - `drawCrab(pose: CrabPose): Pixels`, where `CrabPose = { legsPhase: 0|1|2|3; blink: boolean; dir: 1|-1; acc: Accessory[]; hop?: number }`
  - `type Accessory`: the mockup `ACC` keys
  - `drawFurniture(kind: FurnitureKind, t: number): Pixels`
  - `type Cell = { ch; fg?; bg?; bold? }`
  - `halfBlocks(px): Cell[][]`
  - `writeText(cells, row, col, text, fg, bold?)`
  - `runs(row): Cell[]`

- [ ] Test `crab body is 9x6 with one-pixel eyes and no blush or mouth`: assert dimensions, eye pixels `#1A1412` at the mockup positions, and no pink or brown mouth colours present.
- [ ] Test `every accessory draws without throwing and stays within 3 px of the body`.
- [ ] Test `halfBlocks pairs rows`: top+bottom gives `▀` with fg/bg, bottom only gives `▄`, same colour gives `█`. `runs` merges equal neighbours.
- [ ] Test `session start opens the office pane`: raise `$.session.start` and assert one `ui.open` with id `office`, with the result still `next(e)`'s.
- [ ] Test `a stored off skips the auto-open`: with `mock.store(on, { enabled: false })`, there is no `ui.open`.
- [ ] Implement by porting the mockup's `BODY`, `LEGS` (4 phases), `ACC` and furniture helpers into pure functions that return pixel grids. Add the `session.start` auto-open hook in `hooks/register.ts`.
- [ ] Run `claude plugin validate .`, `tsc` and `claude plugin test .`, and expect a pass.

### Task 2: Responsive layout

**Files:**
- Create: `hooks/office/layout.ts`
- Test: `tests/layout.test.ts`

**Interfaces:**
- Produces:
  - `chooseLayout(columns: number, rows: number): Layout`
  - `Layout = { size: 'large'|'medium'|'small'; width; height; floors: Floor[]; shaftW: 22; waitX; tube?: { x; floors: [number, number] }; street: { doorX } }`
  - `Floor = { y; rooms: Room[] }`
  - `Room = { name: RoomName; x0; x1; stations: Record<StationName, number>; desks: number[]; spots: number[] }`
  - `RoomName`: `'Main office'|'Agent workshop'|'Team room'|'Sessions'|'Library'|'Break room'|'Kitchen'`

- [ ] Tests:
  - `large at 100x38+`: 4 floors, the room order from spec §5, a tube present.
  - `medium`: 3 floors (Main office, Agent workshop, Break room), with the merged rooms keeping their stations.
  - `small`: a single strip with main plus workshop desks.
  - `never crowds`: in every room, `desks` and `spots` are at least 11 px apart.
- [ ] Implement with the mockup's coordinates as the large layout. Medium and small are derived by dropping rooms; the breakpoints are the builder's call.
- [ ] Run the full checks.

### Task 3: Simulation core (motion, elevator, crowd rules)

**Files:**
- Create:
  - `hooks/office/sim.ts`
  - `hooks/office/rng.ts`
- Test: `tests/sim.test.ts`

**Interfaces:**
- Consumes: `Layout` (Task 2).
- Produces:
  - `createWorld(layout: Layout, seed: number): World`
  - `frame(world: World): void` (one 50 ms frame; logic every 2nd frame)
  - `relayout(world, layout)`
  - `world.crabs: Crab[]`
  - `world.lift: { riders: Crab[]; queue: Crab[] }`
  - `world.street: { waiting: Crab[] }`
  - `Crab = { id; role: 'main'|'librarian'|'agent'|'teammate'|'session'|'decor'|'leaving'; floor; x; dir; acc; tag?; realId? }`
  - `spawnReal(world, { role, realId, tag, acc }): Crab`
  - `retireReal(world, realId, outcome: 'done'|'failed')`
  - `removeReal(world, realId)`
  - `say(world, crab, text)`

- [ ] Tests (seeded, run headless for 24,000 frames like the mockup harness):
  - `lift never holds more than 2`
  - `standing crabs overlap in under 0.1% of pair checks`
  - `background crabs never exceed 6`
  - `retired agents leave within 80 s`
  - `12 agents: desks fill, the rest wait on the street with a +N sign, none dropped, all eventually seated or retired`
  - `relayout keeps every real crab`
- [ ] Implement by porting the mockup's eased walking, `goTo`/`freeSpot`/`taken`, `stepLift` (2 riders), `unclump` (RANK), `idle` behaviours, `LINES`, `leave` and `keepTidy`. Add the street queue for real crabs when no desk is free. Replace `Math.random` with `rng.ts` (mulberry32) and `setTimeout` with tick-scheduled callbacks.
- [ ] Run the full checks.

### Task 4: Event catalogue and crab actions

**Files:**
- Create:
  - `hooks/events.ts`
  - `hooks/office/actions.ts`
  - `README.md` (install, `/office`, the event table, dropped and partial rows)
- Test: `tests/events.test.ts`

**Interfaces:**
- Produces:
  - `type EventKind`: one literal per spec §7 row that has a real 2.1.301 signal
  - `OfficeEvent = { seq: number; kind: EventKind; label?: string; realId?: string; session?: string; ok?: boolean }`
  - `CATALOG: Record<EventKind, { cat; name; how; act }>`
  - `classifyTool(tool: string, input: unknown): EventKind[]`
  - `classifyBash(command: string): 'test'|'build'|'install'|'commit'|'push'|'pr'|'checkout'|'bash'`
  - `classifyResult(kind, isError: boolean): OfficeEvent['ok']`
  - `applyEvent(world: World, ev: OfficeEvent): void`, which maps each kind to the mockup's action (station, accessories, fx, bubble)

- [ ] Tests:
  - `classifyBash` for `npm test`, `pnpm build`, `npm i`, `git commit -m x`, `git push`, `gh pr create`, `git checkout -b y`, `ls`
  - `classifyTool` for Read, Grep, Glob, Edit, Write, NotebookEdit, LSP, ToolSearch, WebSearch, WebFetch, Skill, Agent, AskUserQuestion, ExitPlanMode, TodoWrite, CronCreate, ScheduleWakeup, PushNotification, RemoteTrigger, Monitor, SendMessage, ListAgents, Artifact, `mcp__x__y`
  - `every CATALOG kind has an action that changes the world` (main's station, accessories, an fx or a bubble)
  - `merges: three Reads in a row keep main at the shelf`
- [ ] Implement by checking each spec §7 row against the hookable events, and dropping rows with no signal (rewind, plus any other the type file shows unraised). List them in the README under "Not shown, and why".
- [ ] Run the full checks.

### Task 5: Hooks wiring, feed, pane and `/office`

**Files:**
- Create:
  - `hooks/feed.ts`
  - `hooks/office/client.ts`
- Modify: `hooks/register.ts`
- Test: `tests/office.test.ts`

**Interfaces:**
- Consumes: `classify*` (Task 4), `chooseLayout` (Task 2), the sim and render (Tasks 1–4).
- Produces:
  - `Feed { push(ev: Omit<OfficeEvent,'seq'>): void; since(seq): OfficeEvent[] }`, bounded to the last 100
  - Client props `OfficeProps = { events: OfficeEvent[]; roster: Roster; columns: number; rows: number }`
  - `Roster = { agents: {id;type;description;status}[]; sessions: {id;name;busy:boolean;self:boolean}[]; teammates: {id;name}[] }`
  - Command `office` with `[on|off]`; store key `enabled`, default on, read by Task 1's auto-open

- [ ] Tests:
  - `/office toggles and persists`
  - `docked: the Pane draws a Client claude-office/office`
  - `inline: draws nothing, closes, and /office replies with the fullscreen ≥110 columns explanation`
  - `hooks pass every event through unchanged` (`tool.call` result equals `next`)
  - `feed stays ≤100 while closed`
  - `resize rebuilds layout with the same real crabs` (Review Focus 1)
- [ ] Implement:
  - Register observers: `tool.call` (classify, then `await next(e)` for ok or error), `turn.start`/`turn.step`/`turn.complete`, `prompt.submit`/`change` (throttled)/`attachment`/`mention`/`fill` (prompt-enhancer origin gives `enhance`), `agent.spawn`, `session.send`/`receive`/`measure`/`start`/`end`/`attach`, `config.set`, and `on('classic.<Event>')` for each name in spec §8.
  - In Task 1's `session.start` hook, also register the `/office` command. The auto-open itself is unchanged.
  - Pane render: `placement==='dock'` gives the `Client` with `rows = e.props.scroll.bodyRows`.
  - The Client consumes events with seq above its last-seen value.
- [ ] Run the full checks.

### Task 6: Sessions, messaging and the shared event files

**Files:**
- Create: `hooks/sessions.ts`
- Modify: `hooks/register.ts`
- Test: `tests/sessions.test.ts`

**Interfaces:**
- Produces:
  - `readOpenSessions($): Promise<SessionInfo[]>`, reading `~/.claude/sessions/*.json` → `{ sessionId, name, busy, updatedAt }`
  - `writeOwnFile($, sessionId, recent: OfficeEvent[])`
  - `readPeerFiles($): Promise<Record<sessionId, OfficeEvent[]>>`
  - `reconcileAgents(roster, list: AgentInfo[])`
  - A 2 s poll on `$.clock.every`

- [ ] Tests:
  - `sessions appear and leave with their files`
  - `busy/idle maps to typing or dozing`
  - `malformed JSON is ignored` (Review Focus 4)
  - `session.receive from a peer gives a tube capsule up to main`
  - `SendMessage gives a capsule down`
  - `peer file with a message between two other sessions gives a letter carried between their crabs`
  - `shared file holds no prompt text`
  - `an agent missing from list() and marked killed is retired` (Review Focus 3)
- [ ] Implement with `$.fs.list`/`read`/`write` under the home directory (resolved once at start). One writer per file, whole-file writes, pruned when the session file is gone.
- [ ] Run the full checks.

### Task 7: Performance guard, install, live check

**Files:**
- Modify: `hooks/office/client.ts`
- Test: `tests/perf.test.ts`

- [ ] Test `drawn tree within limits at 140x60 with 20 crabs`: count nodes and characters from `ui.drawn({ in: 'office' })`, under 20,000 and 100,000.
- [ ] Implement the fps fallback: if a frame's draw exceeds 25 ms on average over 2 s, switch to 10 fps.
- [ ] Run validate, tsc and all tests.
- [ ] Install (needs the person's OK, since it changes `~/.claude` plugin settings): `claude plugin marketplace add <path-to>/claude-office`, then `claude plugin install claude-office@claude-office`.
- [ ] Live check in Windows Terminal, fullscreen layout:
  - `/office` opens a docked panel.
  - Running a subagent shows its crab's lifecycle.
  - Another session shows on the Sessions floor.
  - A non-fullscreen window shows the explanation.
  - prompt-enhancer still works alongside.
- [ ] Desktop: check whether the Client renders; report the result.
