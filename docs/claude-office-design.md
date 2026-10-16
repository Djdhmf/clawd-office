# Claude Office: design

*Status: design, for review. Written 2026-10-16 from a brainstorming session with the person this is for. The approved visual reference is `docs/mockup/crab-town-v5.html`. Open it in a browser and it plays the whole town.*

## 1. Intent

A Claude Code mod that turns a side panel into a living pixel-art office building full of little Claude crabs. It's mostly for fun and atmosphere, but the important crabs are **real**: they stand for the main Claude session, its running subagents and the person's other open Claude Code sessions, and they act out what those are actually doing. Glancing at the panel should tell you what Claude is up to and make you smile: crabs working, chatting, napping, squabbling, riding the elevator.

It's inspired by [habblaud](https://claude-mods.com/habblaud/), which is a separate web app. This lives inside Claude Code itself.

## 2. Goals

- **A side panel** docked on the right of the conversation. The person chose the panel over the strip above the prompt.
- **Responsive.** The office fills whatever room the window gives the panel and adapts its layout to the size.
- **Real crabs act on real events.** The main crab, one crab per subagent and one crab per other open session follow real events (section 7) with clear intent.
- **Background crabs** live their own little lives: wandering room to room, riding the elevator, coffee, TV, library, napping on the couch, chatting in multi-line exchanges, occasional squabbles with a dust cloud.
- **Subagent lifecycle:**
  1. Arrives from the street when it starts.
  2. Rides the elevator to the Agent workshop and works at a desk.
  3. When it finishes, rides up to the main crab and hands over its report, or comes back bandaged if it failed.
  4. Retires to the break room as a background crab.
  5. After a while, walks home out of the street door.
- **Sessions message each other visibly:**
  - Between two other sessions: one crab carries a letter to the other's desk.
  - Between another session and main: a capsule travels the pneumatic tube between the Sessions floor and the Main office.
- **About 77 event-to-action mappings** covering every Claude Code feature a mod can observe (section 7).

## 3. Non-goals

- Not a replacement for the transcript, and no controls. Clicking a crab does nothing in v1; it is a view.
- No reading of conversation content into speech bubbles beyond short labels (tool name, file name, agent type and description, session name).
- No network use. Everything is local.

## 4. Anti-goals (this would be a failure even if it technically works)

- **Crowding and pile-ups.** The person rejected three iterations for crabs stacking or the population growing without bound.
- **Frantic motion.** Too fast to follow is a failure; the pace must be readable.
- **Breaking or slowing Claude Code.** The panel must never block a turn, lose events, or make the terminal sluggish.
- **Conflicting with the prompt-enhancer mod** (section 10).

## 5. The look (decided)

- **Art style:** 8-bit pixel art drawn with colored half-block characters (`▀ ▄ █`). One terminal cell is one pixel wide and two pixels tall.
- **Crab body:** the classic Claude Code crab. A square orange body (`#D97757`) with a shade colour, **small one-pixel eyes**, arms straight out and four legs. **No blush, no mouth.** Office crabs are mini: 9 px wide, 6 px tall plus accessories (see `BODY`/`LEGS` in the mockup).
- **Walking:** a 4-step leg cycle tied to the distance walked, and blinking.
- **Accessories** say who a crab is or what it is doing. The mockup's `ACC` table is the reference set:
  - **Main:** a crown whose colour follows the model.
  - **Subagents, by type:** miner helmet (Explore), green cap and waving flag (Plan), hard hat (general-purpose), detective hat (reviewer), wizard hat (skills).
  - **Others:** a red cap for teammates, and headphones, scarf or beanie for sessions.
  - **Props:** about 30 held items such as mug, book, letter, capsule, magnifier, toolbox, phone, spellbook, blueprint, "?" sign, bell, broom, parcel and alarm clock.
- **The building**, top to bottom:
  1. Main office
  2. Agent workshop | Team room
  3. Sessions | Library
  4. Break room | Kitchen
  5. The street, with a front door.

  An elevator shaft runs up the left side. Neighbouring rooms connect through doorways. A pneumatic tube links Sessions and the Main office. The roof has a satellite dish.
- **Office life:** windows with drifting clouds, ceiling lamps with soft light cones, plants, bookshelves, a whiteboard, a clock, a server rack, desks with screens that glow when someone works, a TV, a couch, ping-pong, a coffee machine with steam, a water cooler and a fridge.
- **Main office stations,** each tied to tools (section 7):
  - mail chute
  - telescope by the window
  - inbox tray
  - whiteboard
  - desk
  - console
  - phone table
  - bookshelf
  - card catalogue
  - tube outlet
  - wall context gauge and hook gears

## 6. Motion and crowd rules (decided; these fixed the person's complaints)

- **Pace:** logic runs at 10 ticks a second and motion at 20 frames a second. Walking eases in and out (max about 5 px/s; double in fast mode). Speech bubbles stay up about 3 seconds, and conversation lines are about 2.2 seconds apart.
- **Elevator:**
  - Holds **at most two crabs**, shown side by side with a "n/2" counter.
  - Doors slide, and the car eases between floors.
  - Waiting crabs queue in spaced spots beside the doors, never inside the shaft, and are served in arrival order.
- **Standing room:**
  - Every crab claims a standing spot at least 11 px from any other's spot or position, waiting spots included.
  - Walkers may pass each other.
  - A periodic "make room" pass moves the less important crab aside when two standing crabs end up too close. Importance order: main, then the enhancer's librarian, then subagents and teammates, then sessions, then background crabs.
- **Population:**
  - At most **6 background crabs**; when a new one would exceed that, the oldest heads home.
  - Retired subagents stay about 50–80 seconds, then go home.
  - Session crabs come and go with real sessions.
  - Measured on the mockup over 20 simulated minutes: the population stayed between 7 and 12 with essentially no overlaps.
  - **More real crabs than room** *(designer's call)*:
    - Subagents and sessions fill the desks their layout has.
    - Further ones wait in a small queue on the street by the front door, behind a "+N" sign, and take a desk as one frees up.
    - Real crabs are never dropped and never crowd a room.

## 7. Real events → crab actions (decided)

The person asked for every Claude Code feature to have an action. The mockup's `EVENTS` list is the authoritative table, with 77 rows in 13 groups. Each row gives the event, the hook the mod observes it through (`how`) and the action. The groups are:

- **You:** prompt sent, Enhance used, typing, image pasted, @mention, slash-command expansion, Esc interrupt.
- **Turn:** turn start, thinking, parallel tool batch, turn done, turn failure.
- **Tools:** Read, Grep/Glob, Edit/Write, NotebookEdit, LSP, ToolSearch, tool failure.
- **Shell:** Bash, tests passing or failing, build, package install, background shell, Monitor.
- **Git:** commit, push, pull request, branch switch, worktree.
- **Web:** WebSearch, WebFetch.
- **Agents:** subagent start, finish and fail, skills, team tasks, teammates.
- **Sessions:** session-to-session messages, messages to and from main, ListAgents, sessions opening, busy/idle, closing.
- **MCP:** tool calls, elicitation.
- **Permissions:** request, granted, denied, AskUserQuestion, plan mode.
- **Tasks:** todos, scheduling, notifications, remote trigger, artifact published.
- **Context:** context gauge, compaction, CLAUDE.md loaded, cost milestone, rate limit.
- **Settings:** model switch, fast mode, config change, hooks running, folder change, file changed outside, remote control, rewind, /clear, resume, long idle, session end.

Three rules for the real mapping:

- **Intent over replay.** Each action plays when its event happens. When several events arrive close together, the main crab finishes or interrupts gracefully rather than snapping between stations. Builder's call: a short queue with merging, for example consecutive Reads stay at the bookshelf.
- **Bash sub-kinds** (tests, build, install, git commit/push/checkout, `gh pr create`) come from the command text, and pass or fail from the tool result.
- **Rows marked "this mod" or depending on another plugin** must degrade silently when that signal is unavailable.
- **Rows with no real signal** *(designer's call)*: ship only rows backed by a signal this build actually raises (for example, rewind has none in 2.1.301). No guessed proxies. The builder lists every dropped or partial row, with the reason, in the mod's README.

## 8. Data sources (constraints from the Mods API, build 2.1.301)

- **This session:**
  - `tool.call` (await `next(e)` for results)
  - `turn.start`, `turn.step`, `turn.complete`
  - `prompt.submit`, `prompt.change`, `prompt.attachment`, `prompt.mention`, `prompt.fill`
  - `agent.spawn` plus polling `$.agent.list()` for status
  - `session.send`, `session.receive`
  - `session.measure`, `session.start`, `session.end`, `session.attach`, `session.detach`, `session.compact`
  - `config.set`
  - classic hook events through `on('classic.<Event>')`: PreCompact, PostCompact, PermissionRequest, PermissionDenied, Notification, StopFailure, PostToolUseFailure, PostToolBatch, SubagentStart, SubagentStop, TaskCreated, TaskCompleted, TeammateIdle, InstructionsLoaded, ConfigChange, CwdChanged, DirectoryAdded, FileChanged, WorktreeCreate, WorktreeRemove, Pre/PostModelSwitch, Elicitation, UserPromptExpansion, SessionStart, SessionEnd.
- **Other sessions:**
  - `~/.claude/sessions/*.json`, one per open session, with `name`, `cwd`, `status` (busy/idle), `kind`, `updatedAt`. Poll with `$.fs.list` and `$.fs.read` (every 2 s is plenty).
  - To show what other sessions are doing beyond busy/idle, including messages between two *other* sessions, each running Claude Office writes a small rolling event file `~/.claude/claude-office/<sessionId>.json` (last ~50 events plus status), and every instance reads the others'. One writer per file, so no contention. Prune files of closed sessions.
  - The mod is installed at user scope, so it runs in every session. A session without an event file (an older install, a `-p` run) still shows as a busy/idle crab.
  - *(Designer's call)* The files hold short labels only: event kind, tool name, file base name, agent type, session name. Never prompt or message content.
- **Enhance used:** detect the prompt-enhancer's `prompt.fill` (its `origin` names the plugin). No code dependency between the two mods.

## 9. Panel, sizes and responsiveness

- **Opening:** a Pane (`$.ui.open`) with id `office`.
  - `/office` toggles it, and `/office on|off` sets it. The choice persists in `$.store`.
  - Per the API, an unasked pane only places from 144 columns, and an asked one from 110. In fullscreen it docks beside the transcript; otherwise it sits inline above the prompt.
  - It auto-opens at session start when enabled and the terminal is wide enough; otherwise it waits, and `/office` opens it on demand.
  - **The person runs Claude Code in the fullscreen layout** (their answer), so the docked side panel is the everyday case and gets the effort. When the pane would be seated inline (not fullscreen), the office stays closed rather than taking the strip above the prompt the person turned down; `/office` says why.
- **Drawing:** a `Client` surface module draws the scene, since it needs a frame clock, local state and many crabs. Width and height come from the pane's body (`bodyColumns`, rows). The scene rebuilds its layout when the size changes.
- **Responsive layouts:**
  - **Large** (about 100+ columns and 30+ rows): the full building as in the mockup.
  - **Medium:** fewer rooms per floor (for example drop the Library, Kitchen or Team room into neighbours), or fewer floors (Main office, Agent workshop, Break room).
  - **Small** (narrow or short): a compact strip with the main crab and the subagent crabs only.
  - The exact breakpoints are the builder's call; the rule is never to crowd.
- **Desktop:** the Desktop app also has `Client`. Treat the terminal as primary. On Desktop, show the same half-block scene if it renders acceptably, otherwise a reduced view. The builder verifies and reports.

## 10. Coexistence with prompt-enhancer

- A separate mod folder, `<path-to>/claude-office`, with plugin name `claude-office`, installed the same way as prompt-enhancer (a local marketplace).
- It doesn't touch the `AbovePrompt` band, which the enhancer owns. It doesn't hook `prompt.fill` beyond observing, and it never edits the prompt.
- It shares no code with the enhancer. Its crabs are drawn by its own sprite code in the same 8-bit style. The office's "enhancer" librarian crab (maroon cap, book) mirrors the enhancer's mascot.

## 11. Performance and safety constraints

- Hooks only observe. They always pass events on (`return next(e)`) and never deny, alter or delay anything.
- Event handling is cheap and queues work for the Client. No awaits on slow I/O in hot paths such as `tool.call`.
- Client drawing:
  - Merge adjacent same-colour cells into runs.
  - Stay well inside the tree limits (20,000 nodes, 100,000 characters).
  - Keep each draw fast.
  - If 20 fps proves heavy in a real terminal, fall back to 10 fps.
- Cross-session files:
  - Writes are at most about once per second, small, and whole-file.
  - Reads tolerate missing or garbled files.

## 12. Testing expectations

- `claude plugin test` covers:
  - each event mapping producing its action
  - subagent lifecycle and population caps
  - elevator capacity
  - no standing overlaps after a simulated run (as the mockup run did)
  - session messaging
  - `/office` toggle and persistence
  - responsive layout selection
- Validation and type checks are clean.
- A live check in the person's terminal (Windows Terminal), plus a Desktop check where possible.

## 13. Left to the builder

- Internal architecture: module split, state shape, event-queue design.
- Exact sprite pixels for furniture and props, matching the mockup's look.
- Responsive breakpoints and which rooms merge at each size.
- How long each action plays, and how overlapping events merge.
- Background-crab conversation lines (the mockup's `LINES` are a starting set; more are welcome).
