# Microsoft AutoGen Community Relevance Review

## 1. Purpose

This review evaluates the Microsoft AutoGen GhostCrab drafts as community-facing material for inviting AutoGen developers to try **MCP GhostCrab Personal SQLite**.

The review checks whether the proposed skills match the real GhostCrab Personal frame without installing AutoGen or running live tests.

## 2. Documents Reviewed

- `SKILLS_autogen_ghostcrab_mindbrain.md`
- `SKILL_autogen_ghostcrab-runtime_.md`
- `SKILL_ghostcrab-architect_autogen.md`
- `sop_autogen_ghostcrab_mindbrain.md`

## 3. Executive Assessment

AutoGen is one of the strongest communities for this integration because it already centers multi-agent collaboration, memory, tools, and workbenches. The drafts correctly identify the pain point: AutoGen teams need shared state that is more durable and structured than per-agent context windows.

The current drafts are promising but not yet ready for a GhostCrab Personal SQLite community invitation. They mix good AutoGen concepts with old GhostCrab tool names, custom `mindbrain_*` APIs, PostgreSQL-oriented architecture, and advanced orchestration claims that should be simplified.

Best community positioning:

> AutoGen coordinates agents. GhostCrab Personal gives those agents a local SQLite memory they can share through MCP: facts, decisions, task state, blockers, and graph links across runs.

## 4. Target Shape

AutoGen should be treated as a **generic multi-agent framework with strong MCP/workbench compatibility**.

The first public path should be:

- AutoGen connects to GhostCrab Personal as a local MCP server.
- Agents read prior context through `ghostcrab_pack` or `ghostcrab_search`.
- Agents write durable memory through `ghostcrab_remember`.
- Agents update task or project state through `ghostcrab_upsert`.
- Agents link dependencies through `ghostcrab_learn`.

AutoGen-native memory adapters can be discussed later, but the first invitation should be MCP-first.

## 5. Community Fit

AutoGen users are likely to understand the value quickly because they routinely build:

- planner/executor/reviewer teams
- long-running research workflows
- coding teams
- task-oriented multi-agent systems
- stateful collaboration loops

GhostCrab Personal should be positioned as the missing local shared memory layer, not as a replacement for AutoGen's orchestration model.

## 6. Main Corrections Needed

### 6.1 Replace `mindbrain_*` and custom tools

The drafts mention tools such as:

- `mindbrain_add`
- `mindbrain_query`
- `mindbrain_graph_query`
- `ghostcrab_task_*`
- `ghostcrab_phase_transition`
- `ghostcrab_agent_signal`

These names should be replaced or clearly translated into real public GhostCrab Personal tools:

- `ghostcrab_remember`
- `ghostcrab_search`
- `ghostcrab_upsert`
- `ghostcrab_learn`
- `ghostcrab_traverse`
- `ghostcrab_project`
- `ghostcrab_pack`
- `ghostcrab_count`

### 6.2 Keep PostgreSQL as a PRO footnote

The current drafts still contain PostgreSQL and production backend language. For community outreach, that should become a brief PRO note only.

Preferred wording:

> This guide uses GhostCrab Personal SQLite. PostgreSQL belongs to MCP GhostCrab PRO - mindBrain Pro for teams that later need centralized deployment.

### 6.3 Update setup language

Use the current local setup:

```bash
npm install -g @mindflight/ghostcrab-personal-mcp
gcp brain up
```

Then show AutoGen connecting to the local MCP server through its MCP workbench/tooling path.

### 6.4 Reduce orchestration claims

The runtime skill sometimes makes GhostCrab sound like the orchestrator. In the public version:

- AutoGen orchestrates agents.
- GhostCrab stores and retrieves durable shared memory.
- GhostCrab can represent blockers and dependencies, but should not be presented as the AutoGen scheduler.

## 7. Skill-by-Skill Review

### `SKILLS_autogen_ghostcrab_mindbrain.md`

What works:

- good multi-agent memory framing
- understands AutoGen Memory and MCP Workbench concepts
- identifies cross-agent context as the primary pain point

What needs correction:

- replace `mindbrain_*` tools
- make GhostCrab Personal SQLite the first path
- reduce package/backend assumptions
- add one concrete local demo

Recommended rewrite:

> Use this skill when AutoGen agents need durable shared context across runs. Connect AutoGen to GhostCrab Personal through MCP, retrieve context with `ghostcrab_pack`, and persist useful facts or state with `ghostcrab_remember` and `ghostcrab_upsert`.

### `SKILL_autogen_ghostcrab-runtime_.md`

What works:

- addresses real runtime needs: status, phase transitions, coordination, and signals
- can support planner/executor/reviewer workflows

What needs correction:

- translate runtime concepts into `ghostcrab_project`, `ghostcrab_upsert`, and `ghostcrab_learn`
- avoid creating a parallel task orchestration API
- keep phase transitions as remembered/projected state, not as a hidden scheduler

### `SKILL_ghostcrab-architect_autogen.md`

What works:

- useful for designing domain-specific AutoGen memory
- can help advanced teams model tasks, actors, and artifacts

What needs correction:

- avoid starting with hard schema registration
- use provisional workspace modeling
- show schema inspection/export only after a pattern stabilizes

### `sop_autogen_ghostcrab_mindbrain.md`

The SOP is useful as internal strategy and product thinking.

Recommended use:

- keep it as maintainer material
- extract a short community demo
- remove PostgreSQL-first and custom tool references from public sections

## 8. Tool Mapping

| AutoGen need | GhostCrab Personal tool |
| --- | --- |
| Initialize shared agent memory | `ghostcrab_workspace_create` |
| Store durable agent findings | `ghostcrab_remember` |
| Retrieve prior memory | `ghostcrab_search` |
| Update current task or agent state | `ghostcrab_upsert` |
| Represent dependencies and blockers | `ghostcrab_learn` |
| Follow dependency chains | `ghostcrab_traverse` |
| Maintain current goals or phase context | `ghostcrab_project` |
| Load compact context at run start | `ghostcrab_pack` |
| Count open work by state | `ghostcrab_count` |
| Inspect model contracts | `ghostcrab_schema_list`, `ghostcrab_schema_inspect` |

## 9. Community Demo Scenarios

### Demo 1: Planner and executor share memory

A planner stores a task plan with `ghostcrab_remember`. An executor retrieves it with `ghostcrab_pack` and updates current state with `ghostcrab_upsert`.

### Demo 2: Reviewer sees prior decisions

A reviewer searches previous decisions with `ghostcrab_search` before approving a result.

### Demo 3: Blocker chain

An agent stores a blocker, links it to a task with `ghostcrab_learn`, and another agent traverses the relation with `ghostcrab_traverse`.

## 10. PRO Mention

Keep it short:

> This guide focuses on GhostCrab Personal SQLite. MCP GhostCrab PRO - mindBrain Pro is the PostgreSQL-based path for centralized team deployments.

## JTBD Agent Analysis (Re-audit v2)

**Framework shape**: Generic multi-agent framework with strong MCP and workbench compatibility.

**JTBD**: "I am an AutoGen agent (planner, executor, critic, reviewer) in a multi-agent workflow. I need to share state with other agents without relying only on conversation history, which grows unbounded and gets truncated."

### Agent Lifecycle Mapping

| Moment | Agent question | Expected GhostCrab tool | Present in current review? |
|---|---|---|---|
| Before | Load shared group context at the start of my turn | `ghostcrab_pack` | Demo 1 — good |
| Read | What did prior agents find or decide? | `ghostcrab_search` | Demo 2 — good |
| Write (durable) | Record a finding other agents should use | `ghostcrab_remember` | Demo 1 and 3 — good |
| Write (state) | Update the current task or agent state | `ghostcrab_upsert` | Demo 1 — good |
| After | Record active group goals or phase context | `ghostcrab_project` | Tool mapping only, no demo |
| Recovery | Resume from prior group state | `ghostcrab_pack` | Demo 1 — good |

### Orchestration Boundary — Partially Addressed

The review correctly flags that "GhostCrab should not be presented as the AutoGen scheduler." But it does not give the agent a concrete rule about what GhostCrab IS to the AutoGen orchestrator. The missing statement is:

> GhostCrab is a queryable shared state store. AutoGen orchestrates agent turns and message flow. GhostCrab does not dispatch agents, set agent priorities, or decide who speaks next.

### `remember` vs `upsert` Distinction

Not explained. For AutoGen:
- `ghostcrab_remember`: "Critic finding: code coverage is below threshold" — immutable observation
- `ghostcrab_upsert`: "Task: refactor-auth-module, assignee: executor, status: in_progress" — mutable state

### AutoGen MCP Connection Path Not Specified

The review says "AutoGen connects to GhostCrab Personal as a local MCP server" but does not specify which AutoGen MCP path to use (workbench, tool registration, MCPTool wrapper). A developer needs this to proceed.

### Minimal Viable Path

The Recommended Next Step (section 12) gives a 5-step sequence. One step should be removed to reach ≤4 tools: `ghostcrab_pack → ghostcrab_remember → ghostcrab_pack (second agent) → ghostcrab_upsert`.

### Failure Mode Coverage

Not addressed. Missing:
- `ghostcrab_pack` returns empty for an agent joining an existing run — agent should call `ghostcrab_search` as fallback
- AutoGen group chat ends before all writes commit — partial state is not discussed

## 11. Readiness Score

Historical pre-rewrite score:

| Criterion | Score | Notes |
| --- | ---: | --- |
| Community relevance | 5/5 | AutoGen has a clear shared-memory need. |
| Framework alignment | 5/5 | MCP/workbench and multi-agent patterns fit well. |
| GhostCrab Personal accuracy | 2/5 | Current drafts need Personal-first cleanup. |
| Tool-name accuracy | 2/5 | Several tools are old or custom. |
| Agent behavioral clarity | 2/5 | Demos cover most lifecycle moments but remember/upsert absent, MCP connection path missing, failure modes not addressed. |
| Community readiness | 3/5 | Strong after tool and setup rewrite. |

Overall readiness: **High-potential, needs API alignment before publication.**

## 12. Post-Rewrite QA Update

Worker 3 rewrite completed the requested corrections in:

- `SKILLS_autogen_ghostcrab_mindbrain.md`
- `SKILL_autogen_ghostcrab-runtime_.md`
- `SKILL_ghostcrab-architect_autogen.md`
- `sop_autogen_ghostcrab_mindbrain.md`

Updated readiness:

| Criterion | Score | Notes |
| --- | ---: | --- |
| Community relevance | 5/5 | AutoGen has a clear shared-state need across planner, executor, and reviewer agents. |
| Framework alignment | 5/5 | Uses `McpWorkbench` with `StdioServerParams` for the concrete AutoGen MCP path. |
| GhostCrab Personal accuracy | 5/5 | Personal path is `@mindflight/ghostcrab-personal-mcp`, `gcp brain up`, stdio, local SQLite. |
| Tool-name accuracy | 5/5 | Public `ghostcrab_*` tools replace custom draft tools. |
| Agent behavioral clarity | 5/5 | Orchestration boundary, lifecycle, remember/upsert, and failure modes are explicit. |
| Community readiness | 5/5 | Ready as a Personal-first community skill. |

Overall readiness: **Ready after Personal SQLite rewrite.**

## 12. Recommended Next Step

Create one concise AutoGen community example:

1. start GhostCrab Personal
2. connect AutoGen through MCP
3. have one agent call `ghostcrab_remember`
4. have another agent call `ghostcrab_pack`
5. update shared task state with `ghostcrab_upsert`

This will make the value obvious without requiring a new backend or custom AutoGen package.
