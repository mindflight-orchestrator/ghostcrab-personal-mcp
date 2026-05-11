# BMAD-METHOD Community Relevance Review

## 1. Purpose

This review evaluates the BMAD-METHOD GhostCrab skill drafts as community-facing material meant to invite BMAD users to try **MCP GhostCrab Personal SQLite**.

The goal is not to run BMAD or GhostCrab live. The goal is to check whether the proposed descriptions, prompts, roles, and workflow claims match the actual GhostCrab Personal frame:

- local-first MCP server
- SQLite-backed MindBrain Personal runtime
- `stdio` as the default MCP integration path
- public `ghostcrab_*` tools exposed to agent clients
- PostgreSQL mentioned only as a short pointer to **MCP GhostCrab PRO - mindBrain Pro**

## 2. Documents Reviewed

- `SKILL_BMAD_ghostcrab-architect.md`
- `SKILL_BMAD_ghostcrab-runtime.md`
- `SKILL_BMAD_mindbrain_orchestrator.md`
- `sop-bmad-method-ghostcrab-mindbrain.md`

Important observation: `SKILL_BMAD_ghostcrab-runtime.md` and `SKILL_BMAD_mindbrain_orchestrator.md` were duplicate or near-duplicate role definitions. The duplication has now been resolved by merging orchestrator logic into the runtime skill and leaving the orchestrator file as a deprecated compatibility pointer.

## 3. Executive Assessment

The BMAD-METHOD folder is one of the strongest conceptual matches for GhostCrab because BMAD is not a generic agent framework. It is a structured delivery method with clear roles, artifacts, phase gates, decisions, blockers, and handoffs. That makes it a natural candidate for a persistent local project memory.

Rewrite status: the skill drafts have now been updated for GhostCrab Personal SQLite. The architect skill bootstraps with `ghostcrab_workspace_list` before `ghostcrab_workspace_create`, the runtime skill replaces the duplicate orchestrator draft, and both skills use the public `ghostcrab_*` tool surface.

The best community positioning is:

> BMAD gives teams a disciplined project method. GhostCrab Personal gives each local BMAD workspace a durable SQLite memory for artifacts, decisions, blockers, handoffs, and phase state that agents can read and update through MCP.

## 4. Target Shape

BMAD-METHOD should be treated as a **single-process, role-based delivery method**, not as a general-purpose agent runtime.

The review target is therefore different from Agno, CrewAI, AutoGen, or smolagents:

- BMAD has defined roles and lifecycle stages.
- The integration should map GhostCrab to BMAD artifacts and transitions.
- The primary value is continuity across the BMAD process.
- The community demo should be a BMAD project memory, not a generic multi-agent memory benchmark.

Recommended community-facing skill split:

- `SKILL_BMAD_ghostcrab-architect.md`: defines the BMAD project ontology and workspace model.
- `SKILL_BMAD_ghostcrab-runtime.md`: lets BMAD agents read and update the shared project state.
- Optional third skill: `SKILL_BMAD_ghostcrab-reviewer.md` or `SKILL_BMAD_ghostcrab-community-demo.md` for showing the community how to evaluate a BMAD project with GhostCrab.

The current duplicated runtime/orchestrator files should be merged into one clearer runtime skill.

## 5. Community Fit

BMAD users are a good audience for GhostCrab Personal because they already care about:

- repeatable process
- explicit artifacts
- traceable decisions
- role accountability
- phase progression
- blockers and dependencies
- handoffs between agents or human contributors

GhostCrab should be presented as a local memory layer for the BMAD method, not as a replacement for BMAD.

Strong invitation angle:

> Try GhostCrab Personal as a local SQLite sidecar for BMAD projects. Use it to preserve decisions, blockers, artifacts, and role handoffs across sessions without sending project state to a hosted memory service.

## 6. Main Corrections Needed

### 6.1 Replace old GhostCrab tool names

The BMAD skills refer to many non-current or custom tools, including:

- `gc_register_entity_type`
- `gc_register_relation_type`
- `gc_register_agent_role`
- `gc_register_entity`
- `gc_update_entity`
- `gc_register_relation`
- `gc_register_facet`
- `gc_register_decision`
- `gc_schema_status`
- `mb_agent_workload`
- `mb_blocked_entities`
- `mb_ready_to_start`
- `mb_phase_gate_status`
- `mb_critical_path`
- `mb_register_entity`
- `mb_update_status`
- `mb_register_blocker`

These should be rewritten around the real public MCP tools:

- `ghostcrab_status`
- `ghostcrab_workspace_create`
- `ghostcrab_workspace_list`
- `ghostcrab_remember`
- `ghostcrab_search`
- `ghostcrab_upsert`
- `ghostcrab_count`
- `ghostcrab_learn`
- `ghostcrab_traverse`
- `ghostcrab_project`
- `ghostcrab_pack`
- `ghostcrab_schema_list`
- `ghostcrab_schema_inspect`
- `ghostcrab_workspace_export_model`

### 6.2 Stop presenting PostgreSQL as the default

The BMAD drafts still present PostgreSQL as a production or canonical backend. For this community push, the default should be GhostCrab Personal SQLite.

Acceptable wording:

> GhostCrab Personal runs locally with SQLite. A PostgreSQL-based PRO edition, MCP GhostCrab PRO - mindBrain Pro, exists for teams that later need server-grade deployment.

That should remain anecdotal and short.

### 6.3 Replace old command examples

Older references such as `ghostcrab-mcp` or custom bootstrap commands should be replaced with the current package and local runtime framing:

```bash
npm install -g @mindflight/ghostcrab-personal-mcp
gcp brain up
```

The skills should explain that agent frameworks connect to the local MCP server, typically over `stdio`.

### 6.4 Reduce ontology freeze language

The architect skill is useful, but it risks making schema registration sound like the first step. GhostCrab Personal should be framed as exploratory first:

- create or select a workspace
- remember artifacts and decisions
- upsert current state
- add graph links for blockers and dependencies
- inspect or export model shape when the workflow stabilizes

The skill should avoid forcing canonical schema design before the BMAD project has generated real evidence.

## 7. Skill-by-Skill Review

### `SKILL_BMAD_ghostcrab-architect.md`

This is the strongest of the three skills. It understands that BMAD needs an architect role to translate process artifacts into a durable model.

What works:

- role-specific framing is appropriate for BMAD
- project artifacts, tasks, decisions, blockers, and phase gates are the right entities
- it treats GhostCrab as a structural memory rather than a chat transcript store
- it can become a strong onboarding path for BMAD users

What needs correction:

- replace `gc_*` ontology tools with public `ghostcrab_*` tools
- make SQLite Personal the default
- make PostgreSQL a short PRO note
- avoid implying schema registration must happen before practical use
- add a small BMAD demo flow based on `ghostcrab_remember`, `ghostcrab_upsert`, `ghostcrab_learn`, and `ghostcrab_pack`

Recommended rewrite direction:

> Use the architect role to define a provisional BMAD workspace memory, not to hard-freeze a database schema. Start by capturing project artifacts, role decisions, blockers, and active phase state in GhostCrab Personal SQLite.

### `SKILL_BMAD_ghostcrab-runtime.md`

This should become the primary runtime skill.

What works:

- focuses on operational project state
- identifies blockers, ready work, and phase gates as useful queries
- fits the daily BMAD execution loop

What needs correction:

- remove duplicated content from `SKILL_BMAD_mindbrain_orchestrator.md`
- replace `mb_*` tools with actual `ghostcrab_*` calls
- avoid direct SQL examples unless clearly marked as internal implementation detail
- describe BMAD agents as MCP clients, not as custom database clients

Recommended runtime loop:

1. Call `ghostcrab_pack` to load the current BMAD project context.
2. Use `ghostcrab_search` to retrieve relevant artifacts or decisions.
3. Use `ghostcrab_upsert` to update task, phase, or blocker state.
4. Use `ghostcrab_learn` to connect blockers, dependencies, and ownership links.
5. Use `ghostcrab_project` for active goals, constraints, and current phase projections.

### `SKILL_BMAD_mindbrain_orchestrator.md`

This file should not remain a separate duplicate.

Options:

- delete it after merging unique content into the runtime skill
- rename it only if it becomes a clearly distinct orchestration role
- turn it into a short “BMAD phase gate reviewer” skill

If kept, it should answer a different question from the runtime skill:

> Is the BMAD project ready to move from one phase to the next based on remembered evidence, open blockers, and role decisions?

### `sop-bmad-method-ghostcrab-mindbrain.md`

The SOP is strategically useful but too implementation-heavy for a first community invitation.

What works:

- explains why BMAD needs persistent project memory
- maps method concepts to durable memory concepts
- gives useful pitch language for a BMAD audience

What needs correction:

- reduce PostgreSQL and internal ontology implementation details
- make the first demo local and SQLite-based
- keep the SOP as maintainer documentation, not the first public artifact

## 8. Tool Mapping

Recommended mapping for BMAD:

| BMAD need | GhostCrab Personal tool |
| --- | --- |
| Initialize local BMAD memory | `ghostcrab_workspace_create` |
| Store artifact summaries | `ghostcrab_remember` |
| Retrieve prior context | `ghostcrab_search` |
| Maintain task or phase state | `ghostcrab_upsert` |
| Count blockers by phase or owner | `ghostcrab_count` |
| Link task dependencies | `ghostcrab_learn` |
| Trace blocker chains | `ghostcrab_traverse` |
| Maintain active phase context | `ghostcrab_project` |
| Load a role-specific context pack | `ghostcrab_pack` |
| Inspect available schemas | `ghostcrab_schema_list`, `ghostcrab_schema_inspect` |
| Export stabilized model | `ghostcrab_workspace_export_model` |

## 9. Community Demo Scenarios

### Demo 1: Local BMAD project continuity

Show a BMAD agent starting a session, loading context from `ghostcrab_pack`, and recovering:

- current phase
- active story or epic
- open blockers
- last architecture decision
- next recommended action

### Demo 2: Blocker and dependency memory

Show a task blocked by an architectural decision. Store the blocker with `ghostcrab_upsert`, link it with `ghostcrab_learn`, then retrieve the chain with `ghostcrab_traverse`.

### Demo 3: Phase gate review

Show a BMAD project before a phase transition. Use GhostCrab to list unresolved blockers, missing artifacts, and key decisions that justify whether the phase can advance.

## 10. PRO Mention

Keep this short:

> This review focuses on GhostCrab Personal SQLite. Teams that later need centralized PostgreSQL deployment can look at MCP GhostCrab PRO - mindBrain Pro.

No PostgreSQL-first examples should appear in the community-facing BMAD skills.

## JTBD Agent Analysis (Re-audit v2)

**Framework shape**: Role-based single-process method — fixed roles, explicit phases, artifacts, gates, blockers, and handoffs.

**JTBD per role**:

- **Architect**: "I need to model project artifacts and decisions so future role agents can query them without asking me again."
- **Developer/Implementer**: "I need to record task state and blockers so the orchestrator knows what is blocked, in progress, or done."
- **PM/Orchestrator**: "I need to check whether the current phase can advance by querying evidence, open blockers, and decisions across all roles."
- **Reviewer/QA**: "I need to search prior decisions before approving a deliverable."

### Agent Lifecycle Mapping

| Moment | Agent question | Expected GhostCrab tool | Present in current review? |
|---|---|---|---|
| Before | Load role-specific BMAD project context | `ghostcrab_pack` | Recommended runtime loop step 1 — good |
| Read | Query artifacts, decisions, and open blockers | `ghostcrab_search`, `ghostcrab_count`, `ghostcrab_traverse` | Partially — count and traverse mentioned in demos |
| Write (durable) | Record an architectural decision or artifact summary | `ghostcrab_remember` | Listed but not distinguished from upsert |
| Write (state) | Update task status, phase state, or blocker status | `ghostcrab_upsert` | Listed but not distinguished from remember |
| After | Record the current phase gate state | `ghostcrab_project` | Mentioned in runtime loop — good |
| Recovery | Resume a BMAD session from the last phase state | `ghostcrab_pack` | Mentioned in Demo 1 — good |

### Critical Gap: `remember` vs `upsert` Distinction

The review never explains:

- `ghostcrab_remember` for BMAD: "Architecture decision: chose event-sourcing over direct DB writes" — immutable record, auditable
- `ghostcrab_upsert` for BMAD: "Task: implement-auth, status: in_progress, owner: dev-agent" — mutable current state

BMAD's audit trail value depends entirely on making immutable decisions durable (remember) while keeping current operational state updatable (upsert). This is not explained.

### Minimal Viable Path

The recommended runtime loop (section 7) gives a 5-step sequence that maps to 5 tools. That is one too many for first contact. The review should mark a ≤4-tool entry: `ghostcrab_pack → ghostcrab_search → ghostcrab_upsert → ghostcrab_learn`.

### Tool Sequence Gaps

Missing: workspace must exist before any write. For a BMAD project starting fresh, the first call should be `ghostcrab_workspace_create`. The Architect skill is the right entry point for this, but the review doesn't connect workspace creation to the first BMAD session.

### Failure Mode Coverage

Not addressed. Critical BMAD cases:
- `ghostcrab_pack` returns empty on first session — the Architect skill should be invoked to bootstrap the workspace
- No registered artifact types — the agent should proceed with untyped `ghostcrab_remember` calls and inspect schema later
- Phase gate query returns incomplete data — the Orchestrator should flag this rather than auto-advancing

## 11. Readiness Score

| Criterion | Score | Notes |
| --- | ---: | --- |
| Community relevance | 5/5 | BMAD has a strong natural need for durable project memory. |
| Framework alignment | 5/5 | The role/process structure maps cleanly to GhostCrab. |
| GhostCrab Personal accuracy | 5/5 | Skills now default to `@mindflight/ghostcrab-personal-mcp`, `gcp brain up`, SQLite, and local MCP `stdio`. |
| Tool-name accuracy | 5/5 | Runtime and architect skills now use the real public `ghostcrab_*` tools. |
| Agent behavioral clarity | 5/5 | Lifecycle tables, remember/upsert rules, workspace bootstrap, and failure modes are explicit. |
| Community readiness | 4/5 | Ready as a local-first skill pack; still benefits from a small runnable demo in future docs. |

Overall readiness: **Community-ready after rewrite.**

## 12. Recommended Next Step

Merge the duplicate runtime/orchestrator skills, then rewrite the BMAD pack around a single local SQLite demo:

1. create a BMAD workspace
2. remember two artifacts and one decision
3. upsert one active task and one blocker
4. link the blocker to the task
5. load the next session with `ghostcrab_pack`

That demo will make the BMAD community invitation concrete, lightweight, and faithful to GhostCrab Personal.
