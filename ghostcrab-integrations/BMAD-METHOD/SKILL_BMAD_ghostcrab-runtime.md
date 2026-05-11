# SKILL.md - BMAD GhostCrab Personal Runtime

## Purpose

Use this skill when a BMAD project already has a GhostCrab Personal workspace and needs runtime coordination: dispatch, blockers, phase gates, role reporting, and recovery.

This file is the merged successor to the old runtime and MindBrain orchestrator drafts. It uses **GhostCrab Personal SQLite**, started with `gcp brain up`, over local MCP `stdio` by default.

## Core Runtime Loop

Run this sequence at the start of each BMAD session and after meaningful role handoffs:

```text
ghostcrab_pack -> ghostcrab_search -> ghostcrab_upsert -> ghostcrab_learn -> ghostcrab_project
```

Use additional reads when needed:

- `ghostcrab_count` for dashboards and gate checks
- `ghostcrab_traverse` for blocker and dependency chains
- `ghostcrab_workspace_export_model` when an external generator needs the workspace model

## First Contact Checks

1. Call `ghostcrab_status`.
2. Call `ghostcrab_workspace_list`.
3. If there is no workspace for the BMAD project, stop runtime dispatch and invoke `SKILL_BMAD_ghostcrab-architect.md`.
4. Call `ghostcrab_pack` for the project scope.

If `ghostcrab_pack` is empty, treat the project as unbootstrapped. Do not dispatch work until the Architect skill creates a workspace and seeds the first records.

## Write Model

| Runtime fact | Tool | Why |
| --- | --- | --- |
| Current story status, current owner, current blocker state, current phase gate | `ghostcrab_upsert` | Mutable state record updated in place. |
| Accepted decision, review approval, defect finding, postmortem note | `ghostcrab_remember` | Durable evidence that should not be overwritten. |
| `blocks`, `depends_on`, `validates`, `implements`, `documents`, `handoff_to` | `ghostcrab_learn` | Relationship the orchestrator can traverse. |
| Session summary, gate heartbeat, handoff note | `ghostcrab_project` | Compact working projection for future recovery. |

Never use a durable fact as the current task tracker. Never overwrite an accepted decision to change task status.

## Role Reporting Contract

### Analyst

On start, upsert the product discovery artifact as `in_progress`.

On completion, remember durable research findings and upsert the artifact state as `done`.

On blocker, upsert a blocker record and link it with `ghostcrab_learn` using `blocks`.

### PM / Product Owner

Remember validated requirements and constraints.

Upsert PRD, epic, and scope status.

Before creating a new epic, search for similar scope with `ghostcrab_search`.

### Architect

Remember accepted ADRs and architecture constraints.

Upsert architecture artifact status and component current state.

Link ADRs to components with `ghostcrab_learn` using `documents`.

### Scrum Master

Upsert sprint, story, and assignment state.

Link stories to epics and dependencies with `ghostcrab_learn`.

Before handing a story to Dev, call `ghostcrab_pack` and include relevant constraints in the story handoff.

### Developer

Before coding, call `ghostcrab_pack` for the story.

Upsert story status to `in_progress`, `blocked`, or `review`.

Remember implementation decisions that future roles must audit.

Link blockers or dependency discoveries with `ghostcrab_learn`.

### QA / Reviewer

Search requirements, ADRs, and acceptance criteria with `ghostcrab_search`.

Remember review findings and approval decisions.

Upsert story and test state. A story moves to `done` only after review evidence is remembered.

## Lifecycle JTBD by BMAD Role

| Role | Before | Read | Write | After | Recovery |
| --- | --- | --- | --- | --- | --- |
| Architect | Confirm workspace with `ghostcrab_workspace_list` | `ghostcrab_search` prior ADRs | `ghostcrab_remember` decisions, `ghostcrab_learn` dependencies | `ghostcrab_project` architecture handoff | `ghostcrab_pack` architecture state |
| Developer | `ghostcrab_pack` story briefing | `ghostcrab_search` constraints | `ghostcrab_upsert` task status, `ghostcrab_remember` decisions | `ghostcrab_project` implementation handoff | `ghostcrab_pack` story resume |
| Orchestrator | `ghostcrab_pack` phase snapshot | `ghostcrab_count` blockers, `ghostcrab_traverse` chains | `ghostcrab_upsert` gate state, `ghostcrab_learn` handoffs | `ghostcrab_project` gate summary | `ghostcrab_pack` dispatch briefing |
| Reviewer | `ghostcrab_pack` review scope | `ghostcrab_search` requirements and decisions | `ghostcrab_remember` approval/finding, `ghostcrab_upsert` review status | `ghostcrab_project` review result | `ghostcrab_pack` unresolved findings |

## Agent Performance Contract

1. Start with `ghostcrab_status`, `ghostcrab_workspace_list`, and `ghostcrab_pack`; do not ask the user to repeat BMAD context before these calls.
2. Classify every write: decisions and evidence go to `ghostcrab_remember`; live story, task, blocker, and gate state goes to `ghostcrab_upsert`.
3. Use stable `record_id` values such as `story:<id>`, `task:<id>`, `gate:<phase>`, and `blocker:<id>` so BMAD state does not fork.
4. Link blockers immediately with `ghostcrab_learn`; a blocker stored only as prose is invisible to phase-gate reasoning.
5. End each role turn with `ghostcrab_project`: next action, active constraint, or unresolved risk.

## Dispatch Logic

### Ready Work

Use `ghostcrab_search` for records with facets like:

```json
{
  "method": "BMAD",
  "kind": "story",
  "status": "ready"
}
```

Before dispatching a story, call `ghostcrab_traverse` from the story node for `depends_on` and `blocks` edges. Dispatch only if required predecessors are done and no active blocker remains.

### Blocker Watch

Use `ghostcrab_count` grouped by `status`, `kind`, `owner`, or `phase` to create a lightweight dashboard.

For each active blocker:

1. Traverse what it blocks.
2. Upsert its current owner and status.
3. Project a handoff note with `ghostcrab_project`.

### Phase Gate Review

A BMAD phase can advance only when evidence supports it.

Use:

```text
ghostcrab_count      # counts by phase/status/kind
ghostcrab_search     # missing required artifacts or reviews
ghostcrab_traverse   # blockers and dependency chains
ghostcrab_upsert     # current gate state
ghostcrab_project    # gate summary
```

Gate result rules:

- `passed`: all required artifacts are done, review evidence exists, no active blockers.
- `blocked`: one or more blockers or missing approvals remain.
- `incomplete`: data is insufficient to judge. Do not auto-advance.

The old custom phase-gate command is intentionally replaced by this explicit evidence review.

## Failure Modes

| Condition | Runtime behavior |
| --- | --- |
| `ghostcrab_status` unavailable | Ask the user to run `gcp brain up`; pause dispatch. |
| Workspace missing | Invoke the Architect skill; do not write into a guessed workspace. |
| `ghostcrab_pack` empty | Treat as first run; invoke the Architect skill for bootstrap. |
| Search returns no prior decisions | Continue, but remember the new decision once made. |
| Dependency chain incomplete | Mark gate `incomplete` with `ghostcrab_upsert`; ask the responsible role to seed missing state. |
| Concurrent role writes conflict | Prefer `ghostcrab_upsert` with stable `record_id`; preserve durable decisions with separate `ghostcrab_remember` calls. |

`ghostcrab_search` supports `mode="bm25"` for keyword search, `mode="semantic"` for vector search, and `mode="hybrid"` for the recommended combined mode. On GhostCrab Personal SQLite without embeddings configured, `semantic` and `hybrid` fall back to BM25 and the MCP response notes that fallback. To enable vector retrieval, configure `GHOSTCRAB_EMBEDDINGS_MODE=openrouter`, `GHOSTCRAB_EMBEDDINGS_MODEL`, and `GHOSTCRAB_EMBEDDINGS_API_KEY` in GhostCrab. BMAD orchestrators should use `mode="hybrid"` when embeddings are enabled so decisions from different roles can be matched semantically.

## Minimal BMAD Demo

For a lightweight community trial, use no more than four tools after workspace setup:

```text
ghostcrab_pack -> ghostcrab_search -> ghostcrab_upsert -> ghostcrab_learn
```

That is enough to resume a story, check prior decisions, update task state, and link a blocker.
