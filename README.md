# Clawd Office

A Claude Code mod that turns a side panel into a living 8-bit office of Claude crabs. The crabs act out what is really happening:
- **main:** the crab with the crown, standing for this session.
- **subagents:** one hatted crab each, in the Agent workshop.
- **your other sessions:** one crab each, in the Sessions room.

Background crabs wander, chat, nap and squabble between the rooms, riding a two-crab elevator.

The plugin is named `clawd-office`, because Claude Code reserves names starting with `claude-`. The design is in [docs/claude-office-design.md](docs/claude-office-design.md); open [docs/mockup/crab-town-v5.html](docs/mockup/crab-town-v5.html) in a browser to see the approved look.

## Install

At the prompt of a Claude Code session:

```
/plugin install clawd-office --marketplace Djdhmf/clawd-office
```

Answer `y` to add the marketplace, then pick a scope. From a shell:

```
claude plugin install clawd-office --marketplace Djdhmf/clawd-office
```

Then run `/reload-plugins`, or start a new session.

## Use

- **Auto-open:** the office opens by itself when a session starts.
- **`/office`** toggles it. **`/office on`** and **`/office off`** set it, and the choice is kept across sessions.
- **When it shows:** only docked beside the conversation. That needs Claude Code's fullscreen layout and a window at least 110 columns wide; an office the mod opens by itself waits for 144 columns.
- **When it can't dock:** the office stays closed and `/office` says why.
- **Sizes:** a large window gets the full building, a medium one three floors, and a small one a single strip with main and the subagents.

## What the crabs act out

Each row is a real event, the way the mod sees it, and what happens in the office. The list in `hooks/events.ts` (`CATALOG`) is the source of truth.

| Group | Events |
| --- | --- |
| You | prompt sent, Enhance used (prompt-enhancer), typing, image pasted, @mention, slash command expanded, Esc |
| Turn | turn starts, thinking, parallel tools, turn done, turn failed |
| Tools | Read, Grep/Glob, Edit/Write, NotebookEdit, LSP, ToolSearch, tool failed |
| Shell | Bash, tests (pass / fail), build, install, background shell, Monitor |
| Git | commit, push, pull request, branch switch, worktree |
| Web | WebSearch, WebFetch |
| Agents | subagent starts, finishes or fails, Skill, team task created / done, teammate idle |
| Sessions | a message between two other sessions, a message to and from main, ListAgents, sessions opening, busy, idle, closing |
| MCP | MCP tool call, MCP asks for input |
| Permissions | needs permission, granted, denied, AskUserQuestion, plan mode |
| Tasks | todos, scheduling, notifications, remote trigger, artifact published |
| Context | context filling, compaction, CLAUDE.md loaded, cost milestone, rate limited |
| Settings | model switch, fast mode, settings changed, folder changed, file changed outside, remote control, /clear, resume, long idle, session end |

### Not shown, and why

The design listed a few rows that Claude Code 2.1.301 gives a mod no signal for. They are left out rather than guessed:

- **Rewind:** no event is raised when a conversation is rewound.
- **Hooks run** (the wall gears): a mod cannot see your settings-file hooks run. The gears stay as decoration.

### Partly shown

- **Permission granted:** inferred when a tool that just asked for permission goes on to run. No event says "granted".
- **Fast mode:** shown where the setting change is reported to mods through `config.set`.
- **Cost milestone:** shown where the session reports a cost.
- **Messages between two *other* sessions:** shown only when both sessions run this mod, since each writes its events to `~/.claude/claude-office/<session>.json`.

## Privacy

The shared files in `~/.claude/claude-office/` hold short labels only: event kind, tool name, file base name, agent type and session name. They never hold prompt, message or command text, and they stay on this machine.

## License

MIT
