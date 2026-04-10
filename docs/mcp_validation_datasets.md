# MCP Validation Datasets

This document defines the canonical datasets used to validate the GhostCrab MCP
server and to compare agent clients such as Codex, Claude Code, and OpenClaw.

The goal is to keep one shared vocabulary for:

- server-contract smoke tests
- native vs fallback runtime checks
- multi-agent scenario packs

## Dataset catalog

### `empty_runtime`

Bootstrap/system data only after database cleanup.

Use it for:

- MCP startup and `tools/list`
- `ghostcrab_status`
- structured error-path validation
- minimal runtime awareness scenarios

Loader:

- `loadMcpDataset(database, "empty_runtime")`

### `bootstrap_minimal`

Very small domain fixture with:

- one demo schema
- one concept node
- one projection

Use it for:

- schema discovery
- basic graph traversal
- minimal pack/status scenarios

Loader:

- `loadMcpDataset(database, "bootstrap_minimal")`

### `active_project`

Canonical MCP smoke dataset with:

- active task facts in `demo:test:task`
- blocker projection in `mfo_projections`
- agent state in `mfo_agent_state`
- BM25-friendly repeated task content

Use it for:

- `ghostcrab_search --mode bm25`
- `ghostcrab_count`
- `ghostcrab_pack`
- `ghostcrab_status`
- trace capture baselines

Loader:

- `loadMcpDataset(database, "active_project")`

### `edge_cases`

Extends `active_project` with graph gap/coverage edge cases.

Use it for:

- `ghostcrab_traverse`
- graph-related recovery/fallback scenarios
- coverage/gap reasoning exercises

Loader:

- `loadMcpDataset(database, "edge_cases")`

## Selection rules

- Use `empty_runtime` to qualify the server before testing business behavior.
- Use `active_project` as the default scenario pack base.
- Use `edge_cases` only when graph reasoning is part of the scenario.
- Introduce larger or more domain-specific corpora only after these datasets are stable.

## Runtime fixtures

Datasets are orthogonal to runtime mode. The same dataset may be replayed in:

- `sql-only`
- `auto`
- native Docker image

This separation is important: business truth comes from the dataset, while
backend differences come from runtime mode.

## Related helpers

- [tests/helpers/mcp-datasets.ts](/Users/francois/Documents/mars2026/ghostcrab-mcp/tests/helpers/mcp-datasets.ts)
- [tests/helpers/mcp-stdio.ts](/Users/francois/Documents/mars2026/ghostcrab-mcp/tests/helpers/mcp-stdio.ts)
