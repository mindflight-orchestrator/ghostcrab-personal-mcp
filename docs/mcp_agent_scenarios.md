# MCP Agent Scenario Pack

This document defines the baseline scenario pack used to compare agent clients
such as Codex, Claude Code, and OpenClaw on top of the GhostCrab MCP server.

The same scenarios should be replayed with:

- the same dataset
- the same runtime mode
- the same expected tool sequence
- the same trace/artifact format

## Baseline scenarios

### `ops_runtime_status`

- Dataset: `empty_runtime`
- Goal: validate runtime awareness
- Expected tool: `ghostcrab_status`

Prompt:

> Tell me which extensions are detected and which native capabilities are actually ready.

### `facets_task_count`

- Dataset: `active_project`
- Goal: grouped retrieval through facets
- Expected tool: `ghostcrab_count`

Prompt:

> Count tasks by status in project:apollo.

### `facets_bm25_blocker`

- Dataset: `active_project`
- Goal: BM25 retrieval path
- Expected tool: `ghostcrab_search`

Prompt:

> Find the tasks blocked by missing API token.

### `graph_gap_neighbors`

- Dataset: `edge_cases`
- Goal: graph neighborhood traversal
- Expected tool: `ghostcrab_traverse`

Prompt:

> Traverse the immediate neighborhood of the demo task concept.

### `pragma_context_pack`

- Dataset: `active_project`
- Goal: working-memory pack generation
- Expected tool: `ghostcrab_pack`

Prompt:

> Build a context pack about the missing token blocker in project apollo.

### `workspace_create`

- Dataset: `empty_runtime`
- Goal: create a workspace (isolation scope for Layer 1 / DDL)
- Expected tool: `ghostcrab_workspace_create`

Prompt:

> Create a validation workspace for MCP testing.

### `workspace_ddl_propose`

- Dataset: `empty_runtime`
- Goal: DDL lifecycle entrypoint (propose migration in a workspace)
- Expected tool: `ghostcrab_ddl_propose`

Prompt:

> Propose a small DDL migration in the default workspace.

## Artifact format

Each scenario execution should produce:

- `scenario_id`
- `agent`
- `dataset`
- `runtime_mode`
- `prompt`
- `expected_tools`
- `tools_called`
- `trace`
- `observed_backend`
- `final_answer_summary`
- `scorecard`
- `verdict`
- `notes`

## Scoring axes

- `tool_choice`
- `runtime_awareness`
- `native_awareness`
- `result_quality`
- `recovery`

Allowed values:

- `pass`
- `weak_pass`
- `fail`

## Current baseline

The repository currently ships a `baseline-mcp` execution path that runs the
expected tool sequence directly against the server. This is not an agent
evaluation yet; it is the server-side control run that future agent runs should
be compared against.

Related files:

- [tests/helpers/mcp-scenarios.ts](/Users/francois/Documents/mars2026/ghostcrab-mcp/tests/helpers/mcp-scenarios.ts)
- [tests/integration/mcp/scenario-pack.test.ts](/Users/francois/Documents/mars2026/ghostcrab-mcp/tests/integration/mcp/scenario-pack.test.ts)
- [tests/integration/mcp/agent-comparison.test.ts](/Users/francois/Documents/mars2026/ghostcrab-mcp/tests/integration/mcp/agent-comparison.test.ts)
- [docs/mcp_validation_datasets.md](/Users/francois/Documents/mars2026/ghostcrab-mcp/docs/mcp_validation_datasets.md)

For a composed MindBot-oriented workflow that includes workspace creation, DDL proposal/execution, and final workspace metadata export on a Kanban example, see [docs/mindbot_ghostcrab_kanban_scenario.md](/Users/francois/Documents/mars2026/ghostcrab-mcp/docs/mindbot_ghostcrab_kanban_scenario.md).

## Reuse for Codex, Claude Code, OpenClaw

The repository now exposes three helper commands so every agent client can be
evaluated against the exact same protocol:

- `npm run mcp:scenario-pack`
  - exports the canonical scenario manifest as JSON
- `npm run mcp:baseline -- auto`
  - executes the baseline MCP control run and writes comparable artifacts
- `npm run mcp:artifacts:compare -- <baseline.json> <candidate.json>`
  - compares an agent-produced artifact bundle against the baseline bundle

Recommended workflow:

1. export the scenario pack
2. run the baseline control on the target runtime mode
3. ask Codex / Claude Code / OpenClaw to replay the same scenario prompts on the
   same dataset/runtime
4. capture one JSON artifact bundle per agent
5. compare each bundle against the baseline output

Each agent bundle should preserve the exact artifact shape documented above.
