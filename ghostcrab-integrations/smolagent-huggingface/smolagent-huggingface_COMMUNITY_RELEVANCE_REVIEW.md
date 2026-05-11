# smolagents Community Relevance Review

## 1. Purpose

This review evaluates the Hugging Face smolagents GhostCrab drafts as community-facing material for inviting smolagents developers to try **MCP GhostCrab Personal SQLite**.

The review checks whether the skills are relevant and accurate without installing smolagents or running a live demo.

## 2. Documents Reviewed

- `SKILL_mindbrain_smolagents.md`
- `SKILL_smolagent_ghostcrab_runtime.md`
- `sop-smolagent-huggingface-ghostcrab-mindbrain.md`

## 3. Executive Assessment

smolagents is a strong conceptual fit because it emphasizes compact agents, code-oriented actions, managed agents, and step-by-step execution. Those patterns benefit from durable memory when work spans multiple runs or multiple agents.

The current drafts are already in English after translation, but they remain too PostgreSQL-oriented and still use custom tool names that do not match GhostCrab Personal. They should be rewritten around a lighter message:

> smolagents keeps agent execution simple. GhostCrab Personal gives those agents local SQLite memory through MCP so they can persist useful context across steps, runs, and managed-agent handoffs.

## 4. Target Shape

smolagents should be treated as a **lightweight agent framework with step memory and managed-agent patterns**.

The GhostCrab integration should not try to replace smolagents internals. It should complement them:

- smolagents handles agent execution
- GhostCrab stores durable memory
- MCP provides the tool bridge
- SQLite keeps the first trial local

The first public skill should be simple and practical.

## 5. Community Fit

The smolagents audience may appreciate:

- lightweight local tools
- small examples
- code-first demos
- minimal infrastructure
- durable memory without a hosted service

That means the community invitation should be short and concrete. Avoid overloading it with architecture diagrams, PostgreSQL deployment, or custom Go tool registries.

## 6. Main Corrections Needed

### 6.1 Replace custom tool names

The drafts include tools or concepts such as:

- `context_store`
- `context_retrieve`
- `entity_link`
- `facet_query`
- `task_status_update`
- `heartbeat`
- `phase_progress`

These should become real GhostCrab Personal calls:

- `ghostcrab_remember`
- `ghostcrab_search`
- `ghostcrab_upsert`
- `ghostcrab_learn`
- `ghostcrab_project`
- `ghostcrab_pack`
- `ghostcrab_count`
- `ghostcrab_traverse`

### 6.2 Remove PostgreSQL-first framing

The drafts still mention PostgreSQL and production database assumptions. For this community push, the guide should start with:

```bash
npm install -g @mindflight/ghostcrab-personal-mcp
gcp brain up
```

Then explain the local SQLite MCP server.

### 6.3 Clarify the MCP transport path

If smolagents examples use HTTP or streamable HTTP, the guide should be explicit about whether GhostCrab Personal supports that path or whether a bridge is required.

Default public wording should be:

> GhostCrab Personal exposes MCP tools locally, with `stdio` as the default path.

### 6.4 Keep the demo small

smolagents community examples should be minimal:

- one CodeAgent
- one memory write
- one memory retrieval
- one managed-agent handoff if needed

## 7. Skill-by-Skill Review

### `SKILL_mindbrain_smolagents.md`

What works:

- explains the memory value proposition
- fits smolagents' lightweight nature
- can become a good public entry point

What needs correction:

- replace custom tool names
- make SQLite Personal the first setup
- shorten PostgreSQL references
- focus on one small agent example

Recommended rewrite:

> Use this skill when a smolagents project needs durable local memory. Connect to GhostCrab Personal through MCP, retrieve context with `ghostcrab_pack`, and write durable findings with `ghostcrab_remember`.

### `SKILL_smolagent_ghostcrab_runtime.md`

What works:

- recognizes step memory, callbacks, and managed-agent handoffs as important
- good fit for runtime continuity

What needs correction:

- map step updates to `ghostcrab_upsert` or `ghostcrab_project`
- map durable findings to `ghostcrab_remember`
- map retrieval to `ghostcrab_pack` and `ghostcrab_search`
- avoid custom runtime API names

### `sop-smolagent-huggingface-ghostcrab-mindbrain.md`

The SOP is useful for design thinking but too broad for first community publication.

Recommended use:

- extract a minimal demo
- remove PostgreSQL-first content
- keep advanced architecture as maintainer notes

## 8. Tool Mapping

| smolagents need | GhostCrab Personal tool |
| --- | --- |
| Load context before a run | `ghostcrab_pack` |
| Search prior memory | `ghostcrab_search` |
| Save durable step findings | `ghostcrab_remember` |
| Update task or run state | `ghostcrab_upsert` |
| Link managed-agent handoffs | `ghostcrab_learn` |
| Traverse linked dependencies | `ghostcrab_traverse` |
| Track active goals | `ghostcrab_project` |
| Count open items | `ghostcrab_count` |
| Inspect schema contracts | `ghostcrab_schema_list`, `ghostcrab_schema_inspect` |

## 9. Community Demo Scenarios

### Demo 1: CodeAgent durable memory

A CodeAgent completes a step and stores the useful result with `ghostcrab_remember`. A later run retrieves it with `ghostcrab_pack`.

### Demo 2: Managed-agent handoff

One managed agent stores task state with `ghostcrab_upsert`. Another managed agent retrieves the current state before continuing.

### Demo 3: Lightweight project continuity

Use `ghostcrab_project` to keep the active goal visible across multiple smolagents runs.

## 10. PRO Mention

Suggested wording:

> This guide focuses on GhostCrab Personal SQLite. MCP GhostCrab PRO - mindBrain Pro is the PostgreSQL-based option for centralized team deployment.

Keep it as one short note.

## JTBD Agent Analysis (Re-audit v2)

**Framework shape**: Lightweight agent framework with step memory and managed-agent patterns. CodeAgent executes Python code steps; managed agents delegate sub-tasks.

**JTBD**: "I am a smolagents CodeAgent executing a multi-step task. After each valuable step, I need to persist my observation so that a later run — or a managed sub-agent — can pick up from where I left off without reprocessing from scratch."

### Agent Lifecycle Mapping

| Moment | Agent question | Expected GhostCrab tool | Present in current review? |
|---|---|---|---|
| Before | Load prior step observations into memory | `ghostcrab_pack` | Demo 1 and Recommended Next Step — good |
| Read | Search prior step context for a managed agent | `ghostcrab_search` | Tool mapping — listed |
| Write (durable) | Persist a valuable step observation | `ghostcrab_remember` | Demo 1 — good |
| Write (state) | Update current run or task state | `ghostcrab_upsert` | Demo 2 and Recommended Next Step — good |
| After | Record active task goal across runs | `ghostcrab_project` | Demo 3 — good |
| Recovery | Resume from prior step state | `ghostcrab_pack` | Demo 1 — good |

### Critical Gap: `SKILL_mindbrain_smolagents.md` — Most Technically Wrong Skill in the Set

The source skill file (which was reviewed) uses:
- `streamable-http` transport over `localhost:8000/mcp` — not the GhostCrab Personal default
- `context_store`, `context_retrieve`, `entity_link`, `facet_query` — none of these exist in the public MCP surface
- PostgreSQL/MindBrain PRO architecture as the implementation layer
- `step_callbacks` pattern — conceptually valid, but wired to wrong tools

The `step_callbacks` idea is the best behavioral insight in this review set. It maps well to GhostCrab's write model:

> After each non-error step, the callback should call `ghostcrab_remember` for the step observation, and `ghostcrab_upsert` to update the current run state.

But the review only partially surfaces this and never restates it using correct tool names.

### `remember` vs `upsert` in step_callbacks

Not explained. For smolagents:
- `ghostcrab_remember`: observation from step N — immutable ("Found 3 duplicate records in dataset at step 7")
- `ghostcrab_upsert`: current run state — mutable (`{"run_id": "xyz", "current_step": 7, "status": "running"}`)

### Transport Clarification Gap

smolagents' `MCPClient` supports streamable-http. The review notes that GhostCrab Personal's default is stdio. This tension is mentioned but not resolved: does GhostCrab Personal support streamable-http? If not, the review should say a bridge is required.

### Minimal Viable Path

The Recommended Next Step gives 5 steps (5 tools). Should be reduced to ≤4: `ghostcrab_pack → ghostcrab_remember → ghostcrab_upsert → ghostcrab_search`.

### Failure Mode Coverage

Not addressed. Critical for step_callbacks:
- What does the callback do when GhostCrab returns an error mid-run? Should the agent abort or continue?
- What if `ghostcrab_pack` returns empty (first run)? Should the agent start with an empty `agent.memory.steps`?

## 11. Readiness Score

| Criterion | Score | Notes |
| --- | ---: | --- |
| Community relevance | 4/5 | Lightweight durable memory is a good fit. |
| Framework alignment | 4/5 | Step memory and managed agents map well to GhostCrab. |
| GhostCrab Personal accuracy | 2/5 | Needs PostgreSQL cleanup. |
| Tool-name accuracy | 2/5 | Custom tools need replacement. |
| Agent behavioral clarity | 2/5 | step_callbacks insight is valuable but wired to wrong tools; remember/upsert rule absent; transport tension unresolved; failure modes missing. |
| Community readiness | 3/5 | Good after simplifying the demo and fixing transport. |

Overall readiness: **Good fit, needs a smaller and more accurate public version.**

## 12. Recommended Next Step

Create one short smolagents community example:

1. start GhostCrab Personal
2. connect a CodeAgent through MCP
3. call `ghostcrab_pack`
4. store a result with `ghostcrab_remember`
5. update run state with `ghostcrab_upsert`

The community will understand the value faster from a small local example than from a full architecture proposal.
