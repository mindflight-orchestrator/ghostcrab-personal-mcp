# Google ADK Community Relevance Review

## 1. Purpose

This review evaluates the Google ADK GhostCrab drafts as community-facing material for inviting ADK developers to try **MCP GhostCrab Personal SQLite**.

The goal is to assess relevance and correctness against the current GhostCrab Personal frame, not to install ADK or run a live integration.

## 2. Documents Reviewed

- `skill_ghostcrab-architect-adk.md`
- `skill_ghostcrab-runtime-adk.md`
- `sop-google-adk-ghostcrab-mindbrain.md`

## 3. Executive Assessment

Google ADK is a strong target because it already has explicit agent, tool, runner, and memory concepts. The drafts correctly identify that GhostCrab can complement ADK by adding durable, local, structured memory.

The current folder is not yet ready as an English community invitation. Two skill files are still primarily in French, and the integration framing mixes real ADK concepts with older GhostCrab commands, custom tool names, PostgreSQL production language, and possible implementation paths that should be treated as future work.

Best community positioning:

> Google ADK gives agents tools and execution structure. GhostCrab Personal gives those agents a local SQLite memory exposed through MCP, so they can preserve facts, decisions, blockers, and workspace state across runs.

## 4. Target Shape

Google ADK should be treated as a **generic agent framework with native tool and memory extension points**.

The first community path should be MCP-first:

- ADK agent uses GhostCrab Personal as an MCP tool server.
- The agent retrieves context through `ghostcrab_pack` or `ghostcrab_search`.
- The agent stores durable facts through `ghostcrab_remember`.
- The agent updates current state through `ghostcrab_upsert`.

A deeper ADK `MemoryService` implementation can be mentioned as a future adapter, but it should not be required for the first trial.

## 5. Community Fit

ADK developers are likely to care about:

- repeatable agent runs
- durable memory across sessions
- tool integration quality
- local development workflows
- privacy-preserving state
- explicit memory services

GhostCrab Personal fits that audience if it is presented as a lightweight local MCP sidecar rather than a new backend architecture they must adopt wholesale.

## 6. Main Corrections Needed

### 6.1 Translate the skills to American English

The architect and runtime skills contain substantial French prose. For the ADK community, these should be rewritten in clear American English.

The English should be direct, developer-facing, and practical:

- what problem this solves
- how ADK connects
- which `ghostcrab_*` tools matter
- what a first demo looks like

### 6.2 Replace old commands

The drafts mention commands such as `ghostcrab-architect`, custom transports, or older server patterns.

Use the current GhostCrab Personal setup:

```bash
npm install -g @mindflight/ghostcrab-personal-mcp
gcp brain up
```

Then describe an ADK MCP tool connection to the local server.

### 6.3 Replace custom runtime tools

The runtime draft mentions tools such as:

- `get_my_task`
- `update_status`
- `log_progress`
- `flag_blocker`
- `complete_task`
- `get_project_snapshot`
- `get_pragma_projection`
- `list_blockers`
- `log_orchestrator_decision`

These are useful scenario names, but they are not the current public GhostCrab Personal MCP surface.

Map them to:

- `ghostcrab_pack`
- `ghostcrab_search`
- `ghostcrab_remember`
- `ghostcrab_upsert`
- `ghostcrab_learn`
- `ghostcrab_project`
- `ghostcrab_count`
- `ghostcrab_traverse`

### 6.4 Keep ADK MemoryService as advanced

The SOP describes integration through an ADK `BaseMemoryService` and `search_memory` style flow. That is a credible advanced adapter path, but it should not be the main community ask.

Recommended framing:

> Start with GhostCrab as an MCP tool server. If the community wants deeper ADK-native memory, a GhostCrab-backed MemoryService can become a later adapter.

## 7. Skill-by-Skill Review

### `skill_ghostcrab-architect-adk.md`

What works:

- understands that ADK agents need explicit context and tool contracts
- correctly points toward local SQLite and GhostCrab workspace modeling
- has a useful architect role for designing durable memory

What needs correction:

- translate to English
- replace old command examples
- replace schema/tool names with public `ghostcrab_*`
- avoid making ontology design the first step

Recommended rewrite:

> Use this skill when designing a GhostCrab workspace for a Google ADK project. Start with provisional memory records, then stabilize the model after repeated ADK runs reveal the actual entities and relations.

### `skill_ghostcrab-runtime-adk.md`

What works:

- focuses on run-time coordination
- identifies task state, blockers, progress, and project snapshots as important
- has good workflow instincts for agent continuity

What needs correction:

- translate to English
- replace custom runtime tools with actual `ghostcrab_*`
- remove `pg_pragma` and PostgreSQL-centered examples from the Personal guide
- make `ghostcrab_pack` the primary session-start tool

Recommended runtime loop:

1. At agent start, call `ghostcrab_pack`.
2. During execution, call `ghostcrab_search` for prior facts and decisions.
3. Store new durable findings with `ghostcrab_remember`.
4. Update current task state with `ghostcrab_upsert`.
5. Link blockers and dependencies with `ghostcrab_learn`.

### `sop-google-adk-ghostcrab-mindbrain.md`

What works:

- identifies ADK memory extension points
- gives useful architecture context
- can guide future deeper integration

What needs correction:

- keep as internal strategy, not first public content
- rewrite public sections around GhostCrab Personal SQLite
- reduce server/backend architecture detail

## 8. Tool Mapping

| ADK need | GhostCrab Personal tool |
| --- | --- |
| Start or select a project memory | `ghostcrab_workspace_create`, `ghostcrab_workspace_list` |
| Retrieve context for an agent run | `ghostcrab_pack` |
| Search prior decisions or facts | `ghostcrab_search` |
| Save durable observations | `ghostcrab_remember` |
| Update current state | `ghostcrab_upsert` |
| Track active goals or constraints | `ghostcrab_project` |
| Link blockers, tasks, and dependencies | `ghostcrab_learn` |
| Traverse dependency chains | `ghostcrab_traverse` |
| Count records by state or type | `ghostcrab_count` |
| Inspect model contracts | `ghostcrab_schema_list`, `ghostcrab_schema_inspect` |

## 9. Community Demo Scenarios

### Demo 1: ADK agent with local durable memory

An ADK agent starts by calling `ghostcrab_pack`, performs a task, and stores the result with `ghostcrab_remember`.

### Demo 2: Project state across runs

Run one ADK session that updates task state with `ghostcrab_upsert`, then start a second session that recovers that state through `ghostcrab_pack`.

### Demo 3: Advanced adapter teaser

Briefly show how a future ADK MemoryService could wrap GhostCrab calls, but keep the main demo MCP-first.

## 10. PRO Mention

Recommended wording:

> This guide focuses on GhostCrab Personal SQLite. PostgreSQL deployment belongs to MCP GhostCrab PRO - mindBrain Pro and is only relevant once teams need centralized infrastructure.

## JTBD Agent Analysis (Re-audit v2)

**Framework shape**: Generic agent framework with explicit memory extension points (`BaseMemoryService`, `search_memory`).

**JTBD**: "I am an ADK agent running inside a session. I need durable memory that outlives the session boundary, and I need a consistent way to map ADK session identity to GhostCrab workspace identity so I can resume state across sessions."

### Agent Lifecycle Mapping

| Moment | Agent question | Expected GhostCrab tool | Present in current review? |
|---|---|---|---|
| Before | Select or create a GhostCrab workspace for this ADK project, then load context | `ghostcrab_workspace_create`, `ghostcrab_pack` | `ghostcrab_pack` mentioned; workspace creation not sequenced |
| Read | Search prior session facts and decisions | `ghostcrab_search` | Yes |
| Write (durable) | Record an immutable ADK observation | `ghostcrab_remember` | Listed but not distinguished from upsert |
| Write (state) | Update the current ADK task or step state | `ghostcrab_upsert` | Listed but not distinguished from remember |
| After | Record active ADK agent goals | `ghostcrab_project` | Not explicitly covered |
| Recovery | Resume from prior session state | `ghostcrab_pack` | Demo 2 covers this |

### Critical Gap: ADK `session_id` → GhostCrab `workspace_id` Mapping

ADK has explicit `session_id` values that identify agent runs. The review never addresses how an ADK `session_id` maps to a GhostCrab workspace. This is the most important integration design question for ADK developers and it is entirely absent.

Recommended addition: a developer reading this review should see a clear statement such as:

> Map each ADK project (not each session) to one GhostCrab workspace. Individual ADK sessions write into the same workspace using `ghostcrab_upsert` for current state and `ghostcrab_remember` for immutable observations. Do not create a new workspace per session.

### Critical Gap: `remember` vs `upsert` Distinction

Not explained. For ADK:
- `ghostcrab_remember`: "Observed that entity type X appears in 80% of pipeline runs" — immutable
- `ghostcrab_upsert`: "Current ADK pipeline step: extraction, status: running" — mutable

### Minimal Viable Path

Demo 1 and Demo 2 together provide a ≤4-tool path, but no "start here" label exists. The review should mark: `ghostcrab_status → ghostcrab_pack → ghostcrab_remember → ghostcrab_upsert`.

### Tool Sequence Gaps

## 11. Post-Rewrite Quality Evaluation

Status: **Addressed by the May 2026 rewrite.**

| Criterion | Score | Notes |
| --- | ---: | --- |
| Community relevance | 5/5 | ADK is framed as an MCP-first generic agent framework. |
| Framework alignment | 5/5 | `session_id` is mapped to facets inside one project workspace. |
| GhostCrab Personal accuracy | 5/5 | Uses `@mindflight/ghostcrab-personal-mcp`, `gcp brain up`, SQLite, and stdio by default. |
| Tool-name accuracy | 5/5 | Public `ghostcrab_*` tools replace custom runtime labels. |
| Agent behavioral clarity | 5/5 | Lifecycle, remember/upsert, workspace creation, and empty-pack recovery are explicit. |
| Community readiness | 5/5 | Ready as a local-first community trial path. |

Overall readiness: **Publishable after normal editorial review.**

Missing: workspace selection before writes. Also missing: ADK developers need to know whether to call `ghostcrab_workspace_create` once per project or once per session.

### Failure Mode Coverage

Not addressed. Critical case: first ADK session for a new project — `ghostcrab_pack` will return empty, which is correct expected behavior, but the review never says so.

## 11. Readiness Score

| Criterion | Score | Notes |
| --- | ---: | --- |
| Community relevance | 4/5 | ADK memory and tool concepts are a good fit. |
| Framework alignment | 4/5 | MCP and MemoryService paths are both plausible. |
| GhostCrab Personal accuracy | 2/5 | SQLite is mentioned but mixed with PostgreSQL and older commands. |
| Tool-name accuracy | 2/5 | Many tools are scenario-specific rather than actual MCP tools. |
| Agent behavioral clarity | 1/5 | session_id → workspace_id mapping entirely absent; remember/upsert not distinguished; failure modes missing. |
| Community readiness | 2/5 | Needs English rewrite, session mapping, and API correction. |

Overall readiness: **Good target, needs a clean MCP-first rewrite.**

## 12. Recommended Next Step

Create a short English ADK community skill that demonstrates one agent run:

1. start GhostCrab Personal
2. connect ADK to the local MCP server
3. call `ghostcrab_pack`
4. store one durable result with `ghostcrab_remember`
5. update task state with `ghostcrab_upsert`

Keep the MemoryService adapter as a future section rather than the first promise.
