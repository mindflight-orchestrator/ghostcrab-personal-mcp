# Claude Code Starter: Self Memory

This starter gives Claude Code a persistent memory pattern through GhostCrab.

It follows the same core philosophy as the OpenClaw profile, but with lighter rails for stronger models:

- use GhostCrab whenever the task implies durable memory, repeated follow-up, blockers, KPIs, or structured reuse
- prefer exact structured reads before broad retrieval
- keep local ingest answers local
- create provisional projections before freezing schemas
- keep first-turn GhostCrab onboarding intake-only when the request is still fuzzy
- close long-running sessions with checkpoints

Use it when you want Claude Code to remember:

- architecture decisions
- conventions
- bug root causes
- recurring blockers
- domain facts about a project

## Files

- `CLAUDE.md` = fragment to append to a project's `CLAUDE.md`
- `.mcp.json` = project-scoped MCP server config
- `.claude/settings.json` = project-scoped hooks

## Notes

- the hooks are intentionally lightweight
- the server name is `ghostcrab`
- the config expects a running GhostCrab server and a reachable PostgreSQL-backed runtime
- for local ingest flows, prefer `intent-pattern` -> `ingest-pattern` -> `signal-pattern` before any global status read
- for fuzzy onboarding, prefer intent hypothesis + 2 to 4 questions + compact-view recommendation + prompt-help offer before any implementation
