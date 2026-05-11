# CrewAI Community Relevance Review

## 1. Purpose

This review evaluates the CrewAI GhostCrab drafts as community-facing material for inviting CrewAI developers to try **MCP GhostCrab Personal SQLite**.

The review checks whether the proposed skills describe a relevant integration without requiring a live test, framework installation, or a custom package implementation.

## 2. Documents Reviewed

- `skill-crewai-ghostcrab-architect.md`
- `skill-crewai-ghostcrab-runtime.md`
- `skill-crewai-ghostcrab.md`
- `sop-crewai-ghostcrab-mindbrain.md`

## 3. Executive Assessment

The CrewAI folder has a strong conceptual premise: CrewAI agents often need shared memory beyond isolated task context, especially when multiple agents collaborate over planning, research, execution, and review. GhostCrab Personal can give a local CrewAI crew a durable SQLite memory that survives runs and lets agents share structured facts, decisions, blockers, and project state.

Rewrite status: the skill drafts now lead with the simplest community ask. The main skill is MCP-first, the runtime and architect skills use GhostCrab Personal SQLite, and a new community quickstart gives a four-tool first-contact path:

> Connect a CrewAI project to GhostCrab Personal through MCP and let agents share durable local memory.

## 4. Target Shape

CrewAI should be treated as a **generic multi-agent framework** with strong role/task/process primitives.

The right GhostCrab positioning is:

- GhostCrab is a local MCP memory sidecar.
- CrewAI remains responsible for agents, tasks, tools, and crew orchestration.
- GhostCrab stores durable cross-agent context.
- The first demo should not require writing or installing a new `ghostcrab-crewai` package.

The skills should be simplified into:

- one integration skill for connecting CrewAI agents to GhostCrab MCP
- one runtime skill for shared crew memory patterns
- optionally one architect skill for mapping a specific crew process into a GhostCrab workspace

## 5. Community Fit

CrewAI developers are a good audience because CrewAI encourages role-specialized agents, and role-specialized agents quickly need shared state.

Useful community message:

> CrewAI gives you collaborating agents. GhostCrab Personal gives those agents a local SQLite memory they can all read and update through MCP.

This is especially relevant for:

- research crews
- product planning crews
- code review crews
- content operations crews
- CRM or prospecting crews
- long-running project crews

## 6. Main Corrections Needed

### 6.1 Move away from package-first positioning

The drafts propose a dedicated `ghostcrab-crewai` integration package. That is a credible future path, but it is not the best first community invitation.

Recommended first step:

- show MCP connection
- show two or three real `ghostcrab_*` tools
- show one durable memory use case
- then mention that a deeper CrewAI storage backend could come later

### 6.2 Replace PostgreSQL-first language

The drafts repeatedly describe GhostCrab as a PostgreSQL ontology graph or PostgreSQL-backed memory. For this community review, that should be rewritten.

Preferred framing:

> GhostCrab Personal runs locally with SQLite and exposes memory tools over MCP. PostgreSQL belongs only in a short note about MCP GhostCrab PRO - mindBrain Pro.

### 6.3 Replace old commands and transports

References such as `ghostcrab serve --mode mcp --stdio`, HTTP/SSE defaults, or service URLs like `localhost:8765/mcp` should not be the main path.

Use the Personal SQLite framing:

```bash
npm install -g @mindflight/ghostcrab-personal-mcp
gcp brain up
```

Then explain that CrewAI connects to the local MCP server, preferably over `stdio` unless a documented bridge is available.

### 6.4 Replace custom tool names

The drafts use names such as:

- `memory.save`
- `memory.search`
- `ontology.*`
- entity creation and graph methods that do not match the public MCP surface

The community skills should use:

- `ghostcrab_remember`
- `ghostcrab_search`
- `ghostcrab_upsert`
- `ghostcrab_learn`
- `ghostcrab_project`
- `ghostcrab_pack`
- `ghostcrab_count`
- `ghostcrab_traverse`

## 7. Skill-by-Skill Review

### `skill-crewai-ghostcrab.md`

This is the most likely candidate for a public CrewAI community skill.

What works:

- explains the memory gap in multi-agent crews
- understands that GhostCrab should complement CrewAI rather than replace it
- gives a clear conceptual hook for shared state

What needs correction:

- remove package-first complexity from the main path
- replace custom memory APIs with `ghostcrab_*`
- make SQLite Personal the default
- avoid implying HTTP/SSE availability unless explicitly documented

Recommended rewrite:

> Use this skill when a CrewAI crew needs durable local memory across agents, tasks, and runs. Connect to GhostCrab Personal through MCP, retrieve context with `ghostcrab_pack` or `ghostcrab_search`, and write durable facts with `ghostcrab_remember` or `ghostcrab_upsert`.

### `skill-crewai-ghostcrab-runtime.md`

This draft is useful but too broad.

What works:

- identifies runtime collaboration problems
- points toward shared memory, task state, and agent coordination
- could become a strong “crew execution” guide

What needs correction:

- reduce the custom orchestration layer
- use GhostCrab for memory, not as a hidden CrewAI runtime replacement
- map agent updates to `ghostcrab_upsert`
- map durable findings to `ghostcrab_remember`
- map dependencies to `ghostcrab_learn`

### `skill-crewai-ghostcrab-architect.md`

This belongs as an advanced skill rather than the first community entry point.

What works:

- useful for designing domain-specific crew memory
- can help with CRM, delivery, research, and planning crews

What needs correction:

- avoid leading with ontology design
- begin with provisional workspace setup
- show how schema emerges from repeated crew usage

### `sop-crewai-ghostcrab-mindbrain.md`

The SOP is useful as maintainer strategy, but it is too heavy for community onboarding.

Recommended use:

- keep it as internal architecture thinking
- extract a small public demo from it
- remove PostgreSQL-first setup from public-facing sections

## 8. Tool Mapping

| CrewAI need | GhostCrab Personal tool |
| --- | --- |
| Create a crew memory workspace | `ghostcrab_workspace_create` |
| Save durable research findings | `ghostcrab_remember` |
| Retrieve prior crew context | `ghostcrab_search` |
| Update task status or shared state | `ghostcrab_upsert` |
| Track role workload or state counts | `ghostcrab_count` |
| Link tasks, blockers, and decisions | `ghostcrab_learn` |
| Follow dependency chains | `ghostcrab_traverse` |
| Maintain active crew goals | `ghostcrab_project` |
| Load a task-specific memory pack | `ghostcrab_pack` |
| Inspect available schema contracts | `ghostcrab_schema_list`, `ghostcrab_schema_inspect` |

## 9. Community Demo Scenarios

### Demo 1: Shared research crew memory

One CrewAI agent stores a finding with `ghostcrab_remember`. A second agent retrieves it with `ghostcrab_search` and uses it to complete a different task.

### Demo 2: Durable task status

A planner agent creates a task state with `ghostcrab_upsert`. A reviewer agent later checks the current state and adds a blocker.

### Demo 3: Cross-agent handoff

An analyst agent writes a project summary. A writer agent starts a later run and calls `ghostcrab_pack` to recover the relevant context.

## 10. PRO Mention

Suggested wording:

> This CrewAI guide focuses on GhostCrab Personal SQLite. Teams that need centralized PostgreSQL deployment can later explore MCP GhostCrab PRO - mindBrain Pro.

Keep this as a single short note.

## JTBD Agent Analysis (Re-audit v2)

**Framework shape**: Generic multi-agent framework — role-specialized agents, strong task/process primitives.

**JTBD**: "I am a specialized CrewAI agent (researcher, writer, analyst, reviewer). My job is to complete my task and leave my findings in a place the next agent can use — without reprocessing everything from the beginning."

### Agent Lifecycle Mapping

| Moment | Agent question | Expected GhostCrab tool | Present in current review? |
|---|---|---|---|
| Before | Load current crew context before starting my task | `ghostcrab_pack` | Mentioned in Demo 3 but not as a standard starting step |
| Read | What did prior agents find or decide? | `ghostcrab_search` | Yes, in demos |
| Write (durable) | Record a research finding that other agents should use | `ghostcrab_remember` | Listed but not distinguished from upsert |
| Write (state) | Update the status of my assigned task | `ghostcrab_upsert` | Listed but not distinguished from remember |
| After | Record the active crew goal or handoff constraint | `ghostcrab_project` | Not covered |
| Recovery | Resume a crew run from the last shared state | `ghostcrab_pack` | Demo 3 covers this |

### Critical Gap: `remember` vs `upsert` Distinction

Not explained in the current review. For CrewAI this is especially important:

- `ghostcrab_remember`: "Research finding: Company X raised $20M in Series A" — immutable fact, written once by the researcher
- `ghostcrab_upsert`: "Task: write-blog-post, assigned_to: writer-agent, status: pending → in_progress" — mutable task record

### Unmapped Gap: CrewAI's 4 Native Memory Types

CrewAI has Long-term memory, Short-term memory, Entity memory, and Contextual memory. The review never maps which GhostCrab tool complements or replaces which. A developer reading this review will immediately ask "which of my crew's memory types does GhostCrab replace?" — and the review has no answer.

Suggested mapping for the review:
- Long-term memory → `ghostcrab_remember` (durable facts across runs)
- Entity memory → `ghostcrab_upsert` (current state of tracked entities)
- GhostCrab does NOT replace Short-term or Contextual memory (those stay in CrewAI)

### Minimal Viable Path

The three Demo Scenarios form a reasonable ≤4-tool path, but there is no explicit "start here" label. The review should mark: `ghostcrab_pack → ghostcrab_remember → ghostcrab_search → ghostcrab_upsert` as the first contact sequence.

### Tool Sequence Gaps

Missing: workspace creation before first crew write. The review never tells the crew agent to call `ghostcrab_workspace_create` before its first `ghostcrab_remember`.

### Failure Mode Coverage

Not addressed. Missing:
- `ghostcrab_pack` returns empty on first crew run — agents should proceed with empty context, not error
- Researcher writes a fact; writer searches and gets no results — timing issue in concurrent crews not addressed

## 11. Readiness Score

| Criterion | Score | Notes |
| --- | ---: | --- |
| Community relevance | 5/5 | CrewAI users have a clear shared-memory pain point. |
| Framework alignment | 4/5 | The role/task model maps well to GhostCrab. |
| GhostCrab Personal accuracy | 5/5 | Skills now default to `@mindflight/ghostcrab-personal-mcp`, `gcp brain up`, SQLite, and local MCP `stdio`. |
| Tool-name accuracy | 5/5 | Skills now use real `ghostcrab_*` tools instead of package-first or custom memory APIs. |
| Agent behavioral clarity | 5/5 | Lifecycle JTBD, remember/upsert rules, native CrewAI memory mapping, first-write workspace setup, and failure modes are explicit. |
| Community readiness | 4/5 | A new MCP-first quickstart skill provides a ≤4-tool first-contact path. |

Overall readiness: **Community-ready after rewrite.**

## 12. Recommended Next Step

Create a short CrewAI community demo skill focused on one local workflow:

1. start GhostCrab Personal
2. connect a CrewAI agent to MCP
3. store a research finding with `ghostcrab_remember`
4. retrieve it from another agent with `ghostcrab_search`
5. use `ghostcrab_pack` at the start of a later run

That will make the invitation concrete without forcing the community to adopt a new package before they understand the value.
