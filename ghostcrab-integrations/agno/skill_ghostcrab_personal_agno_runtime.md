# skill_ghostcrab_personal_agno_runtime.md — Agno Orchestration Patterns with GhostCrab Personal

Use this skill when an Agno team already understands the basic GhostCrab Personal connection and wants practical runtime patterns: task state, dependency graph, recovery pack, and orchestrator heartbeat.

---

## Runtime Principle

Agno executes agents. GhostCrab Personal stores shared runtime memory.

The orchestrator should not invent custom projection tools. Use the public GhostCrab Personal tools:

- `ghostcrab_status`
- `ghostcrab_workspace_list`
- `ghostcrab_workspace_create`
- `ghostcrab_pack`
- `ghostcrab_search`
- `ghostcrab_remember`
- `ghostcrab_upsert`
- `ghostcrab_count`
- `ghostcrab_learn`
- `ghostcrab_traverse`
- `ghostcrab_project`

---

## Start Every Run

First-contact path: use no more than four startup tools before work begins.

Prompt pattern:

```text
Use workspace "agno-demo".

1. Call ghostcrab_status.
2. If unavailable, stop and tell me to run `gcp brain up`.
3. Call ghostcrab_workspace_list, then ensure the workspace exists with ghostcrab_workspace_create if needed.
4. Call ghostcrab_pack with:
   "What should the Agno orchestrator know before continuing?"
5. If the pack is empty, continue as a first run.
```

This prevents silent memory loss and gives the orchestrator a stable recovery routine.

---

## Pattern 1 — Task State With `ghostcrab_upsert`

Use `ghostcrab_upsert` for mutable task records.

Prompt:

```text
Use workspace "agno-demo".

Upsert task state:
- record_id: task:agno-community-review
- title: Review Agno GhostCrab community skills
- status: pending
- owner: OrchestratorAgent
- phase: review

Then update the same task:
- status: in_progress

Search for "Agno GhostCrab community skills" and report the current task state.
```

Expected behavior:

- one current task record
- updated status
- no duplicate state fragments

---

## Pattern 2 — Immutable Findings With `ghostcrab_remember`

Use `ghostcrab_remember` for facts that should remain true as evidence.

Prompt:

```text
Use workspace "agno-demo".

Remember this durable finding:
"The first Agno community demo should use MCPTools and GhostCrab Personal SQLite before proposing a native MemoryDb adapter."

Search for "native MemoryDb adapter" and return the finding.
```

This preserves evidence separately from mutable task state.

---

## Pattern 3 — Dependency Graph With `ghostcrab_learn`

Use `ghostcrab_learn` to store a relation between stable records.

Prompt:

```text
Use workspace "agno-demo".

Ensure these task records exist:
- task:run-shared-memory-demo
- task:write-community-invitation

Create a relation:
- source: task:write-community-invitation
- target: task:run-shared-memory-demo
- label: DEPENDS_ON

Traverse from task:write-community-invitation and explain the dependency.
```

Use `ghostcrab_traverse` when a later agent needs to understand why work is blocked.

---

## Pattern 4 — Recovery Pack With `ghostcrab_pack`

Use `ghostcrab_pack` to recover context at the start of each run.

Prompt:

```text
Use workspace "agno-demo".

Call ghostcrab_pack:
"Summarize active Agno demo tasks, durable decisions, blockers, and next steps."

If the pack is empty:
- say this looks like the first run
- continue without treating it as an error

If the pack has content:
- summarize the relevant context
- list the next best action for the orchestrator
```

This is the main recovery primitive for Agno teams.

---

## Pattern 5 — Orchestrator Heartbeat With `ghostcrab_project`

Use `ghostcrab_project` to keep active context visible between runs.

Prompt:

```text
Use workspace "agno-demo".

Create or refresh these projections:

GOAL:
"Invite Agno developers to test GhostCrab Personal SQLite through MCPTools."

STEP:
"Run the minimal shared-memory scenario with ghostcrab_status, ghostcrab_workspace_create, ghostcrab_remember, and ghostcrab_search."

CONSTRAINT:
"Do not require PostgreSQL for the first trial."
```

The next orchestrator run should recover these with `ghostcrab_pack`.

---

## Pattern 6 — Readiness Counts With `ghostcrab_count`

Use `ghostcrab_count` when an orchestrator needs a quick operational snapshot.

Prompt:

```text
Use workspace "agno-demo".
Count task records grouped by status.
Report pending, in_progress, blocked, and done counts.
```

This is the Personal SQLite replacement for older projection-style progress examples.

---

## Remember vs Upsert

This distinction is mandatory:

| Tool | Use for | Example |
| --- | --- | --- |
| `ghostcrab_remember` | immutable durable fact | "Agno MCPTools are the first-contact integration path." |
| `ghostcrab_upsert` | mutable current state | "Task: write-invitation, status: in_progress -> done." |

If the information should be revised in place, use `ghostcrab_upsert`.

If the information should remain as evidence, use `ghostcrab_remember`.

---

## Failure Modes

| Situation | Correct behavior |
| --- | --- |
| `ghostcrab_status` unavailable | Ask the user to run `gcp brain up`. |
| Workspace missing | Call `ghostcrab_workspace_list`, then `ghostcrab_workspace_create` before writing. |
| `ghostcrab_pack` returns empty | Treat as first run and continue. |
| Target record missing before `ghostcrab_learn` | Create or identify stable records first. |
| Search returns no result | Continue and optionally write new context. |
| Write fails | Report the failure instead of claiming persistence. |

---

## PRO Note

This runtime skill focuses on GhostCrab Personal SQLite. **MCP GhostCrab PRO - mindBrain Pro** is the PostgreSQL-based path for teams that later need centralized deployment.
