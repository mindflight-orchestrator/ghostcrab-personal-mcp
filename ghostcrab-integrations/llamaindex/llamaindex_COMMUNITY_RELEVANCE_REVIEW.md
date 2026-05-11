# LlamaIndex Community Relevance Review

## 1. Purpose

This review evaluates the LlamaIndex GhostCrab drafts as community-facing material for inviting LlamaIndex developers to try **MCP GhostCrab Personal SQLite**.

The goal is to verify whether the skills describe a relevant and accurate integration path without installing LlamaIndex or running live tests.

## 2. Documents Reviewed

- `SKILL_ghostcrab_runtime.md`
- `SKILL_llamaindex_ghostcrab.md`
- `sop-llamaindex-ghostcrab-mindbrain.md`

## 3. Executive Assessment

LlamaIndex is a strong audience for GhostCrab, but the message must be precise. LlamaIndex already has excellent indexing, retrieval, workflow, and agent abstractions. GhostCrab should not be pitched as a replacement for LlamaIndex retrieval. It should be positioned as a local structured memory and project-state sidecar.

The current drafts understand the need for shared agent context and workflow memory, but they mix GhostCrab Personal with older PostgreSQL/pragma language and custom tool names. They should be rewritten around the real `ghostcrab_*` MCP tools and a clear distinction:

> LlamaIndex retrieves and reasons over data. GhostCrab Personal preserves durable local working memory, decisions, tasks, blockers, and graph links across LlamaIndex runs.

## 4. Target Shape

LlamaIndex should be treated as a **data and agent workflow framework**.

The best GhostCrab integration shape is:

- use LlamaIndex for RAG, documents, workflows, and agents
- use GhostCrab Personal for durable local state
- call GhostCrab through MCP tools
- keep the first demo about workflow continuity, not vector search replacement

## 5. Community Fit

LlamaIndex developers are likely to be receptive if the integration solves a distinct problem:

- remembering workflow decisions
- storing agent state across runs
- linking tasks, documents, and blockers
- maintaining project memory outside chat logs
- separating durable operating memory from document indexes

The community pitch should avoid claiming that GhostCrab replaces LlamaIndex memory, indexing, or storage. The stronger claim is that it complements them.

## 6. Main Corrections Needed

### 6.1 Clarify complementary roles

The drafts should say:

- LlamaIndex remains the retrieval and workflow engine.
- GhostCrab Personal is the durable local memory layer.
- The integration is useful when agents need structured continuity across runs.

### 6.2 Replace old GhostCrab tools

The drafts appear to use custom memory or runtime names such as:

- `write_fact`
- `query_context`
- `broadcast_context_update`
- task and projection methods not matching the public MCP surface

Replace them with:

- `ghostcrab_remember`
- `ghostcrab_search`
- `ghostcrab_upsert`
- `ghostcrab_learn`
- `ghostcrab_project`
- `ghostcrab_pack`
- `ghostcrab_count`
- `ghostcrab_traverse`

### 6.3 Remove PostgreSQL-centered runtime language

References to `pg_pragma`, PostgreSQL projections, or server-side production architecture should not be central to the Personal SQLite community guide.

Use:

> GhostCrab Personal stores local memory in SQLite. PostgreSQL appears only in the PRO note.

### 6.4 Make MCP the concrete path

The community guide should show LlamaIndex calling a local MCP server, not relying on internal database APIs.

## 7. Skill-by-Skill Review

### `SKILL_llamaindex_ghostcrab.md`

This should become the main public skill.

What works:

- recognizes LlamaIndex as a framework for agents and knowledge workflows
- points toward shared memory and structured context
- can speak to a technically sophisticated community

What needs correction:

- clarify that GhostCrab is not a vector index replacement
- use real `ghostcrab_*` tool names
- make SQLite Personal the default setup
- show a small MCP demo

Recommended rewrite:

> Use GhostCrab Personal when a LlamaIndex workflow needs durable local operating memory: decisions, task state, blockers, graph links, and session context that should survive beyond one run.

### `SKILL_ghostcrab_runtime.md`

This is useful as the operational companion skill.

What works:

- focuses on runtime continuity
- identifies workflow state as a real problem
- can map well to AgentWorkflow-style execution

What needs correction:

- remove `pg_pragma` from the Personal path
- map runtime actions to `ghostcrab_upsert`, `ghostcrab_project`, and `ghostcrab_pack`
- avoid custom event bus language unless implemented by LlamaIndex itself

### `sop-llamaindex-ghostcrab-mindbrain.md`

The SOP is useful as internal design material.

Recommended use:

- keep architecture comparisons
- extract one public demo
- remove or shorten backend details in community-facing content

## 8. Tool Mapping

| LlamaIndex need | GhostCrab Personal tool |
| --- | --- |
| Create a project memory workspace | `ghostcrab_workspace_create` |
| Save workflow decisions | `ghostcrab_remember` |
| Search prior state | `ghostcrab_search` |
| Update workflow/task state | `ghostcrab_upsert` |
| Represent links between tasks and documents | `ghostcrab_learn` |
| Traverse dependency or evidence chains | `ghostcrab_traverse` |
| Track active goals or constraints | `ghostcrab_project` |
| Load compact context before a workflow run | `ghostcrab_pack` |
| Count open blockers or states | `ghostcrab_count` |
| Inspect/export model shape | `ghostcrab_schema_list`, `ghostcrab_schema_inspect`, `ghostcrab_workspace_export_model` |

## 9. Community Demo Scenarios

### Demo 1: Workflow memory across runs

A LlamaIndex workflow stores a decision with `ghostcrab_remember`. A later run retrieves it with `ghostcrab_pack`.

### Demo 2: Task state sidecar

A workflow updates current task state with `ghostcrab_upsert`, while LlamaIndex continues to handle retrieval and reasoning.

### Demo 3: Evidence graph

Link a decision to a source document and a task using `ghostcrab_learn`, then retrieve the chain with `ghostcrab_traverse`.

## 10. PRO Mention

Suggested wording:

> This guide focuses on GhostCrab Personal SQLite. MCP GhostCrab PRO - mindBrain Pro is the PostgreSQL-based option for teams that later need centralized deployment.

## JTBD Agent Analysis (Re-audit v2)

**Framework shape**: Data and agent workflow framework — LlamaIndex already handles document retrieval and RAG. GhostCrab's role is strictly operational state, not document search.

**JTBD**: "I am a LlamaIndex workflow or agent. I already have RAG and retrieval. I need a separate durable memory layer for operational state: task status, workflow decisions, blockers, and run-to-run continuity — none of which my vector index tracks."

### Agent Lifecycle Mapping

| Moment | Agent question | Expected GhostCrab tool | Present in current review? |
|---|---|---|---|
| Before | Load prior workflow operational context (not documents) | `ghostcrab_pack` | Mentioned in Demo 1 — good |
| Read | Search prior OPERATIONAL decisions and task states | `ghostcrab_search` | Listed — but must be marked as NOT a document retrieval replacement |
| Write (durable) | Record a workflow decision that should not change | `ghostcrab_remember` | Listed but not distinguished from upsert |
| Write (state) | Update the current workflow step or task status | `ghostcrab_upsert` | Listed but not distinguished from remember |
| After | Record the active workflow goal or constraint | `ghostcrab_project` | Not covered |
| Recovery | Resume a workflow from prior state | `ghostcrab_pack` | Demo 1 — good |

### Critical Gap: The Operational/Retrieval Boundary

The review names this distinction in the Target Shape section but does not enforce it in the skill recommendations. A LlamaIndex developer reading the skill could easily use `ghostcrab_search` as a vector search alternative, which defeats the integration purpose.

Every mention of `ghostcrab_search` in the LlamaIndex context should be prefixed with: "for operational state, not for document retrieval."

The review should explicitly say:

> LlamaIndex retrieves documents. GhostCrab retrieves operational facts. Never call `ghostcrab_search` for content that belongs in a LlamaIndex index.

### Critical Gap: How LlamaIndex Calls GhostCrab

The review recommends using GhostCrab through MCP, but never shows HOW a LlamaIndex workflow connects to a local MCP server. LlamaIndex is Python-native. The review should point to:

- a Python MCP client library
- or a function-tool wrapper around `gcp brain up` stdio
- or explicitly state "this requires an MCP client bridge"

### `remember` vs `upsert` Distinction

Not explained. For LlamaIndex:
- `ghostcrab_remember`: "Workflow decision: use ReAct pattern over CoT for this agent type" — immutable
- `ghostcrab_upsert`: "Workflow step: data-extraction, status: complete, output: 847 records" — mutable

### Minimal Viable Path

Demo 1 and Demo 2 together provide a 3-tool path. The review should label it: "`ghostcrab_pack → ghostcrab_remember → ghostcrab_upsert`."

### Failure Mode Coverage

Not addressed. Also unaddressed: LlamaIndex workflows may run in parallel — concurrent writes to `ghostcrab_upsert` for the same record are not discussed.

## 11. Readiness Score

Historical pre-rewrite score:

| Criterion | Score | Notes |
| --- | ---: | --- |
| Community relevance | 4/5 | LlamaIndex users understand memory and retrieval problems. |
| Framework alignment | 4/5 | Strong fit if positioned as complementary state memory. |
| GhostCrab Personal accuracy | 2/5 | Needs less PostgreSQL and pragma language. |
| Tool-name accuracy | 2/5 | Custom tool names must be replaced. |
| Agent behavioral clarity | 1/5 | Operational/retrieval boundary named but not enforced; Python MCP connection not shown; remember/upsert absent; failure modes missing. |
| Community readiness | 2/5 | Needs sharper complementary framing and connection path. |

Overall readiness: **Conceptually good, needs clearer boundaries and API correction.**

## 12. Recommended Next Step

Rewrite the public LlamaIndex skill around one sentence:

> Use LlamaIndex for retrieval and workflows; use GhostCrab Personal for durable local workflow memory.

Then build one small demo around `ghostcrab_pack`, `ghostcrab_remember`, and `ghostcrab_upsert`.

## 13. Post-Rewrite QA Update

Worker 3 rewrite completed the requested corrections in:

- `SKILL_llamaindex_ghostcrab.md`
- `SKILL_ghostcrab_runtime.md`
- `sop-llamaindex-ghostcrab-mindbrain.md`

Updated readiness:

| Criterion | Score | Notes |
| --- | ---: | --- |
| Community relevance | 4/5 | Still a strong complementary-memory pitch for LlamaIndex users. |
| Framework alignment | 5/5 | Uses LlamaIndex MCP client tooling and preserves LlamaIndex retrieval ownership. |
| GhostCrab Personal accuracy | 5/5 | Personal path is `@mindflight/ghostcrab-personal-mcp`, `gcp brain up`, stdio, local SQLite. |
| Tool-name accuracy | 5/5 | Public `ghostcrab_*` tools replace custom draft tools. |
| Agent behavioral clarity | 5/5 | Operational/retrieval boundary, lifecycle, remember/upsert, and failure modes are explicit. |
| Community readiness | 5/5 | Ready as a Personal-first community skill. |

Overall readiness: **Ready after Personal SQLite rewrite.**
