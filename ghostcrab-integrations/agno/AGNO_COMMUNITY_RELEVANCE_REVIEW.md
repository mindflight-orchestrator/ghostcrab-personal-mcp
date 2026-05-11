# Agno Community Relevance Review

## Purpose

This review evaluates whether the current Agno skill drafts are well framed for inviting the Agno community to try **MCP GhostCrab Personal SQLite**.

The goal is not to test Agno live or install the Agno framework. The goal is to check whether the proposed skill descriptions are accurate, credible, and motivating for Agno developers who may want to connect their agents to a local-first shared memory layer through MCP.

Reviewed files:

- `skill_ghostcrab_agno.md`
- `skill_ghostcrab_runtime.md`
- `sop-agno-ghostcrab-mindbrain.md`

Repo reality used as reference:

- GhostCrab Personal package: `@mindflight/ghostcrab-personal-mcp`
- Runtime command: `gcp brain up`
- Storage: SQLite through the MindBrain Zig backend
- MCP transport: local `stdio` process by default
- Public MCP tools: `ghostcrab_*`

---

## Executive Assessment

The Agno skills have a strong conceptual pitch: Agno agents and teams can benefit from a shared, structured memory and coordination layer instead of relying only on per-agent/session storage.

However, the current drafts are not yet ready for community-facing use because they describe a PostgreSQL-oriented GhostCrab model and several tool names that do not match the current GhostCrab Personal SQLite MCP surface.

The right community message is:

> GhostCrab Personal is a local-first SQLite memory and ontology layer exposed through MCP. Agno users can try it as an external shared context tool surface before any native Agno memory integration exists.

PostgreSQL should remain anecdotal in these materials: mention it only as the PRO path for people who want a larger deployment later.

---

## Community Fit

Agno developers already understand:

- agents with tools
- teams / multi-agent coordination
- memory and storage backends
- local SQLite usage for lightweight persistence
- MCP as a way to connect external capabilities

GhostCrab Personal fits this audience if presented as:

- a local SQLite-backed memory engine for agents
- an MCP tool layer, not a replacement for Agno itself
- a shared state and context substrate across multiple agents
- a way to model facts, task state, graph relations, and recovery context
- something developers can test without provisioning PostgreSQL or cloud infra

The current skills are strongest when they talk about shared context, graph-backed coordination, and avoiding memory silos. They are weakest when they imply a PostgreSQL requirement or use non-existent tool names.

---

## Main Corrections Needed

| Current framing | Issue | Recommended framing |
|---|---|---|
| MindBrain PostgreSQL with `pg_dgraph`, `pg_facets`, `pg_pragma` | Not the default for GhostCrab Personal SQLite | MindBrain Zig backend owns SQLite; facets, graph, and projections are exposed through `ghostcrab_*` MCP tools |
| `http://localhost:8080/mcp` as primary path | The repo documents local stdio via `gcp brain up` as the standard path | Lead with `stdio`; mention HTTP only if a bridge/server mode is explicitly available |
| `ontology_type_create`, `entity_upsert`, `relation_create`, `pragma_project_progress` | These names do not match the current public MCP tools | Use `ghostcrab_schema_*`, `ghostcrab_workspace_*`, `ghostcrab_remember`, `ghostcrab_upsert`, `ghostcrab_learn`, `ghostcrab_project`, `ghostcrab_pack`, `ghostcrab_status` |
| Deep Agno `MemoryDb` replacement as a near-term path | Too heavy and not needed for a community first try | Keep as a future integration idea; first invite users to try GhostCrab through MCPTools |
| Runtime orchestration via custom `pragma_*` tools | Conceptually useful but mismatched to current GhostCrab Personal | Recast as demo patterns using real tools: current-state upserts, graph edges, projections, pack/status recovery |

---

## Recommended Positioning

### One-Line Pitch

GhostCrab Personal gives Agno agents a local SQLite-backed shared memory and ontology layer through MCP.

### Short Community Pitch

Agno already gives developers a clean way to build agents and teams. GhostCrab Personal adds a shared memory substrate those agents can all read and write through MCP: durable facts, current task state, graph relationships, and compact recovery context.

The first experiment is simple: connect Agno `MCPTools` to GhostCrab, let one agent write context, and let another agent retrieve and build on it.

### What To Avoid Saying

- Do not say PostgreSQL is required.
- Do not describe GhostCrab Personal as a vector store.
- Do not imply an official Agno plugin already exists.
- Do not lead with database internals.
- Do not use old or aspirational tool names as if they are the public surface.

### PRO Mention

Keep this as a short note only:

> For teams that later need PostgreSQL-native extensions, larger deployment topology, or PRO-grade MindBrain capabilities, the same ideas point toward MCP GhostCrab PRO / MindBrain PRO. The community trial should start with GhostCrab Personal SQLite.

---

## Tool Mapping For The Skills

| Skill concept | Current draft tool names | GhostCrab Personal SQLite tool direction |
|---|---|---|
| Store a durable fact | `context_push`, `entity_upsert` | `ghostcrab_remember` |
| Update current task / agent state | `entity_upsert` | `ghostcrab_upsert` |
| Search shared context | `entity_search`, `facet_search` | `ghostcrab_search` |
| Count / inspect state shape | not always explicit | `ghostcrab_count` |
| Create graph relationships | `relation_create` | `ghostcrab_learn` |
| Traverse dependencies | `graph_traverse` | `ghostcrab_traverse` |
| Build recovery context | custom runtime prompt | `ghostcrab_pack` |
| Record a working projection | `pragma_*` | `ghostcrab_project` |
| Check runtime readiness | not emphasized | `ghostcrab_status` |
| Workspace isolation | `namespace` | `workspace_id` / `gcp brain up --workspace <name>` |
| Domain schema inspection | `ontology_schema_get` | `ghostcrab_schema_list`, `ghostcrab_schema_inspect` |
| Workspace model export | not present | `ghostcrab_workspace_export_model` |

Recommendation: replace most `namespace` language with `workspace` for GhostCrab Personal, while noting that “namespace” may still appear in older integration sketches.

---

## Review Of `skill_ghostcrab_agno.md`

### What Works

- The central idea is strong: Agno agents can share one external registry instead of keeping memory in silos.
- `MCPTools` is the right first integration surface.
- The “idempotence” and “confirm persistence with a read-back call” rules are useful.
- The multi-agent example is directionally good: one agent writes, another reads.

### What Needs Correction

- The prerequisites should not require PostgreSQL or native Postgres extensions.
- `PostgresStorage` should not be central to the quick-start path.
- The tool table should be rewritten with real `ghostcrab_*` names.
- The bootstrap example should be reframed as “store and retrieve structured project context” rather than “create EntityTypes through old ontology tools.”
- Deep `MemoryDb` integration should move to a “future adapter idea” section.

### Suggested New Structure

1. Why Agno users should care
2. What GhostCrab Personal adds
3. Quick start with MCPTools and `gcp brain up`
4. Minimal shared-memory scenario
5. Multi-agent shared workspace scenario
6. Optional future: native Agno memory adapter
7. Short note: PRO path for PostgreSQL / MindBrain PRO

---

## Review Of `skill_ghostcrab_runtime.md`

### What Works

- The runtime ontology idea is useful for Agno teams.
- The project/task/agent/checkpoint/event model is easy for agent developers to understand.
- The invariant “consult state before acting” is very aligned with GhostCrab.
- The control-loop framing is attractive for orchestrator agents.

### What Needs Correction

- `pg_pragma` should not be the primary explanation for GhostCrab Personal SQLite.
- The `pragma_*` tools in the draft do not match the public MCP surface.
- The lifecycle examples should use `ghostcrab_upsert`, `ghostcrab_learn`, `ghostcrab_project`, and `ghostcrab_pack`.
- The skill should not imply a full Agno runtime integration already exists.

### Suggested New Structure

1. Runtime idea: Agno team state outside chat history
2. Minimal data model using GhostCrab records
3. Task state with `ghostcrab_upsert`
4. Dependency graph with `ghostcrab_learn`
5. Recovery and context briefing with `ghostcrab_pack`
6. Orchestrator heartbeat with `ghostcrab_project`
7. What developers can try in 30 minutes

---

## Community Demo Scenarios

These are the scenarios the skills should invite Agno developers to try.

### Scenario 1: Shared Memory Between Two Agents

Goal: prove that Agent B can retrieve something Agent A wrote.

Flow:

1. Agent A calls `ghostcrab_remember` with a project fact.
2. Agent B calls `ghostcrab_search` for that fact.
3. Agent B uses the returned context in its answer.

Why it matters:

This demonstrates the core GhostCrab value without asking Agno users to adopt a new storage backend.

### Scenario 2: Current Task State

Goal: prove that task state can be updated in place, not duplicated as chat memory.

Flow:

1. Create a task with `ghostcrab_upsert`.
2. Update `status` from `pending` to `in_progress`.
3. Update `status` from `in_progress` to `done`.
4. Retrieve the final state with `ghostcrab_search`.

Why it matters:

Agent memory should not be only append-only notes. Operational state needs current records.

### Scenario 3: Dependency Graph

Goal: prove that agents can record relations such as blockers or dependencies.

Flow:

1. Create or identify two task nodes.
2. Link them with `ghostcrab_learn` using a relation like `DEPENDS_ON` or `BLOCKS`.
3. Retrieve the path with `ghostcrab_traverse`.

Why it matters:

This shows why GhostCrab is more than search: agents can reason over relationships.

### Scenario 4: Orchestrator Recovery Brief

Goal: prove that an orchestrator can resume from shared state.

Flow:

1. Store task facts, graph links, and one projection.
2. Call `ghostcrab_pack` with a query such as “what should the Agno orchestrator do next?”
3. Use the pack text as the next-run briefing.

Why it matters:

This demonstrates continuity across sessions and agent restarts.

---

## Recommended Rewrite Principles

1. Lead with Agno developer experience, not GhostCrab internals.
2. Use SQLite and local-first language throughout.
3. Keep MCP as the integration boundary.
4. Replace old tool names with `ghostcrab_*`.
5. Treat native Agno memory replacement as future work.
6. Keep PostgreSQL / GhostCrab PRO as a one-paragraph note only.
7. Prefer “workspace” over “namespace” for current GhostCrab Personal docs.
8. Make every example understandable without installing Postgres.

---

## Proposed Community Invitation Text

Agno already makes it easy to build agents and teams. GhostCrab Personal adds a local-first shared memory layer those agents can use through MCP.

Instead of each agent keeping isolated session memory, a team can write durable facts, current task state, graph relationships, and recovery context into one SQLite-backed MindBrain workspace.

We are looking for Agno developers who want to try this MCP tool surface and tell us what a good native Agno adapter should look like.

Start small:

1. Run GhostCrab Personal locally.
2. Connect an Agno agent through MCPTools.
3. Let one agent write a fact.
4. Let another agent retrieve it.
5. Try a task state update or dependency graph next.

No PostgreSQL is required for the first trial.

---

## JTBD Agent Analysis (Re-audit v2)

**Framework shape**: Generic agent framework — few fixed roles, emergent team coordination.

**JTBD**: "I am an Agno agent or team member running a multi-step task. I need to share durable context across agent boundaries without passing it through prompt messages or duplicating it in each agent's session storage."

### Agent Lifecycle Mapping

| Moment | Agent question | Expected GhostCrab tool | Present in current review? |
|---|---|---|---|
| Before | Load shared team context for this run | `ghostcrab_pack`, `ghostcrab_workspace_create` | Partially — scenarios mention it but no explicit "start here" label |
| Read | Query what prior agents found or decided | `ghostcrab_search` | Yes |
| Write (durable) | Record an immutable finding other agents should see | `ghostcrab_remember` | Listed but not distinguished from upsert |
| Write (state) | Update a mutable task or agent status record | `ghostcrab_upsert` | Listed but not distinguished from remember |
| After | Record active goals for the next agent | `ghostcrab_project` | Not covered |
| Recovery | Resume a team run from shared persistent state | `ghostcrab_pack` | Scenario 4 covers this |

### Critical Gap: `remember` vs `upsert` Distinction

The current review lists both tools but never explains when an Agno agent should use `ghostcrab_remember` versus `ghostcrab_upsert`. This distinction is the core write model of GhostCrab:

- `ghostcrab_remember`: "Agent A discovered that the API rate limit is 100 req/min" — immutable fact, append-style
- `ghostcrab_upsert`: "Task: scrape-products, status: in_progress → done" — mutable current state, updated in place

Without this distinction, Agno developers will default to appending all writes as memories and miss the structured current-state model.

### Minimal Viable Path

The four Demo Scenarios implicitly provide a ≤4-tool path, but no section explicitly labels a "start here" entry point. The review should mark: `ghostcrab_status → ghostcrab_pack → ghostcrab_remember → ghostcrab_search` as the minimum first contact.

### Tool Sequence Gaps

Not validated. Missing: workspace must exist before any `ghostcrab_upsert` or `ghostcrab_remember` call. The review never tells the agent to call `ghostcrab_workspace_create` or verify workspace presence first.

### Failure Mode Coverage

Not addressed. Missing scenarios:
- `ghostcrab_pack` returns empty (first run, no prior context) — agent should proceed with an empty context rather than erroring
- workspace does not exist yet (first team run) — agent should call `ghostcrab_workspace_create`
- `ghostcrab_status` reports runtime unavailable — agent should fail gracefully rather than silently drop writes

## Readiness Score

| File | Product positioning | Framework alignment | GhostCrab Personal accuracy | Tool-name accuracy | Agent behavioral clarity | Community readiness |
|---|---:|---:|---:|---:|---:|---:|
| `skill_ghostcrab_agno.md` | 4/5 | 4/5 | 2/5 | 1/5 | 2/5 | 2/5 |
| `skill_ghostcrab_runtime.md` | 4/5 | 3/5 | 2/5 | 1/5 | 1/5 | 2/5 |
| `sop-agno-ghostcrab-mindbrain.md` | 4/5 | 4/5 | 2/5 | 2/5 | 2/5 | 3/5 |

**Agent behavioral clarity** scores low across all files because the lifecycle order is implicit, the `remember`/`upsert` distinction is absent, and failure modes are not addressed. The Demo Scenarios approach the right behavioral shape but are buried at the end rather than leading the skill.

Overall: the narrative is promising, but the public-facing skills should be rewritten before sharing with Agno users.

---

## Recommended Next Step

Create two revised community-facing skills:

1. `skill_ghostcrab_personal_agno.md`
   - first-contact guide for Agno users
   - local SQLite, MCPTools, shared memory demo

2. `skill_ghostcrab_personal_agno_runtime.md`
   - orchestration patterns using real GhostCrab tools
   - task state, graph dependencies, recovery packs

Keep the current files as historical drafts or mark them as PostgreSQL/PRO-oriented sketches after the new files exist.
