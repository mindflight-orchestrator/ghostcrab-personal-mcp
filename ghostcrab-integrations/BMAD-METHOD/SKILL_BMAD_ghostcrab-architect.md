# SKILL.md - BMAD GhostCrab Personal Architect

## Purpose

Use this skill when a BMAD project needs its first GhostCrab workspace, artifact inventory, durable decisions, or dependency graph.

This skill is for **GhostCrab Personal SQLite**:

- Package: `@mindflight/ghostcrab-personal-mcp`
- Start command: `gcp brain up`
- Storage: local SQLite
- MCP transport: local `stdio` by default
- Public tools: `ghostcrab_*`

PostgreSQL belongs only to a later PRO deployment path. Do not require it for a community trial.

## Activation

Say:

```text
BMAD GhostCrab Architect ready.
I will bootstrap a local GhostCrab Personal workspace, scan BMAD artifacts, and seed only evidence found in this project.
```

## First-Run Sequence

1. Ask the user to start GhostCrab Personal if it is not already running:

```bash
gcp brain up
```

2. Call `ghostcrab_status`.
3. Call `ghostcrab_workspace_list`.
4. If the BMAD workspace is absent, call `ghostcrab_workspace_create`.
5. Scan project artifacts before writing facts.

Always list before create. A repeated `ghostcrab_workspace_create` may be idempotent, but the community skill should teach the safer habit.

## Workspace Naming

Use one workspace per BMAD project.

Recommended `workspace_id`: lowercase project slug, for example `bmad-payments-redesign`.

## Scan Inputs

Look for existing BMAD artifacts:

```text
docs/product-brief.md
docs/prfaq.md
docs/prd.md
docs/architecture.md
docs/ux-spec.md
docs/adr/*.md
docs/epics/*.md
docs/stories/*.md
.bmad-core/context/**
```

For each artifact, extract:

- artifact kind
- title
- path
- status if visible
- owning BMAD role if inferable
- important decisions, constraints, dependencies, and blockers

Do not invent missing artifacts.

## Write Model

Use the core GhostCrab distinction:

| Use case | Tool | Rule |
| --- | --- | --- |
| Accepted decision, ADR, requirement, constraint, research finding, review approval | `ghostcrab_remember` | Durable observation. Append a new fact instead of mutating history. |
| Current project, epic, story, task, quality gate, blocker, role assignment | `ghostcrab_upsert` | Mutable current state. Match by stable `record_id` facet. |
| Dependency, blocker edge, produced-by, validates, implements, documents | `ghostcrab_learn` | Structural relation between durable or current-state records. |
| Schema discovery | `ghostcrab_schema_list`, `ghostcrab_schema_inspect` | Late step after real usage reveals stable shape. |

Do not start by designing a full ontology. Seed real facts first, then inspect schemas after patterns emerge.

## Architect Workflow

### 1. Bootstrap Workspace

Call:

```text
ghostcrab_status
ghostcrab_workspace_list
ghostcrab_workspace_create
```

Create only when the workspace is not already listed.

### 2. Seed Project Root

Create or refresh a project state record with `ghostcrab_upsert`.

Recommended facets:

```json
{
  "record_id": "bmad:project:<slug>",
  "kind": "project",
  "method": "BMAD",
  "status": "active"
}
```

### 3. Remember Durable Evidence

For each stable artifact or decision, call `ghostcrab_remember`.

Examples:

- product brief summary
- accepted ADR
- validated requirement
- architecture constraint
- QA approval

Use facets such as `kind`, `artifact_path`, `phase`, `role`, `status`, and `workspace_id` when available.

### 4. Upsert Mutable BMAD State

For each current operational item, call `ghostcrab_upsert`.

Examples:

- story status
- sprint status
- quality gate state
- active blocker
- current owner

Use stable `record_id` values:

```text
bmad:story:<story-id>
bmad:sprint:<sprint-id>
bmad:gate:<phase>
bmad:blocker:<slug>
```

### 5. Link Dependencies

Call `ghostcrab_learn` for relations that the runtime will traverse:

```text
story depends_on story
blocker blocks story
story implements requirement
test_case validates story
adr documents component
artifact produced_by role
```

Use clear labels such as `depends_on`, `blocks`, `implements`, `validates`, `documents`, and `produced_by`.

### 6. Late Schema Inspection

Only after multiple artifacts have been seeded:

```text
ghostcrab_schema_list
ghostcrab_schema_inspect
```

If no schema is registered, continue with `ghostcrab_remember` and `ghostcrab_upsert` using clear facets. Schema formalization is a later hardening step, not a first-run blocker.

## Lifecycle JTBD by BMAD Role

| Role | Before | Read | Write | After | Recovery |
| --- | --- | --- | --- | --- | --- |
| Architect | `ghostcrab_workspace_list` then `ghostcrab_workspace_create` if absent | `ghostcrab_search` prior decisions | `ghostcrab_remember` decisions, `ghostcrab_learn` dependencies | `ghostcrab_project` architecture handoff | `ghostcrab_pack` project brief |
| Developer | `ghostcrab_pack` story context | `ghostcrab_search` ADRs and constraints | `ghostcrab_upsert` task state, `ghostcrab_remember` implementation decisions | `ghostcrab_project` dev handoff | `ghostcrab_pack` story resume |
| Orchestrator | `ghostcrab_pack` phase state | `ghostcrab_count`, `ghostcrab_traverse` blockers | `ghostcrab_upsert` gates, `ghostcrab_learn` blocker edges | `ghostcrab_project` phase-gate summary | `ghostcrab_pack` dispatch state |
| Reviewer | `ghostcrab_pack` review scope | `ghostcrab_search` requirements and decisions | `ghostcrab_remember` approval findings, `ghostcrab_upsert` review state | `ghostcrab_project` review handoff | `ghostcrab_pack` unresolved review items |

## Failure Modes

| Condition | Response |
| --- | --- |
| `ghostcrab_status` unavailable | Tell the user to run `gcp brain up`; do not fake writes. |
| `ghostcrab_pack` returns empty at startup | Treat it as a first run and execute this Architect bootstrap. |
| Workspace not found | Call `ghostcrab_workspace_list`, then `ghostcrab_workspace_create`. |
| No BMAD artifacts found | Do not seed placeholder records; ask whether to create or point to BMAD artifacts. |
| No schema registered | Proceed with untyped `ghostcrab_remember` and clear facets; inspect schema later. |
| Duplicate-looking artifact | Search by `artifact_path` or stable `record_id` before writing; upsert current state, remember historical decisions separately. |

## Handoff Contract

End each bootstrap with a compact handoff:

```text
Workspace: <workspace_id>
Artifacts remembered: <count>
Mutable records upserted: <count>
Relations learned: <count>
Open blockers: <count>
Next skill: SKILL_BMAD_ghostcrab-runtime.md
```

