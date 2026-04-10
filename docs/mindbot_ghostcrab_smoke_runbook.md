# MindBot -> mindCLI -> GhostCrab MCP Smoke Runbook

This runbook validates the first deterministic exchange layer:

`MindBot -> mindCLI -> GhostCrab MCP -> PostgreSQL`

It intentionally avoids MindBot-specific legacy schema assumptions and focuses on the GhostCrab demo DB as the first integration target.

## Target DB

Use the GhostCrab demo PostgreSQL instance:

```bash
export DATABASE_URL='postgres://ghostcrab:ghostcrab@localhost:55432/ghostcrab'
```

## Purpose

Validate:

1. `mindcli` can run against the GhostCrab demo DB
2. GhostCrab extensions are reachable through the target DB
3. a minimal GhostCrab operation chain can be triggered deterministically
4. created objects can be verified

## Step 1 — Runtime readiness

Run:

```bash
DATABASE_URL='postgres://ghostcrab:ghostcrab@localhost:55432/ghostcrab' \
  ./bin/mindcli doctor --json
```

Expected:

- `config_valid=true`
- `db_reachable=true`
- `pg_facets_ok=true`
- `pg_dgraph_ok=true`
- `pg_pragma_ok=true`

If this step fails, stop here and record:

- command
- stderr/stdout
- database URL used

## Step 2 — GhostCrab status

Goal:

Validate that the target DB is suitable for GhostCrab-oriented operations before attempting a write path.

Recommended check:

- a direct GhostCrab MCP client invocation, or
- a thin `mindcli` wrapper once available

Minimum evidence to collect:

- extensions detected
- native readiness / backend visibility
- any explicit failure around MCP transport or tool availability

## Step 3 — Workspace creation smoke

Create one dedicated test workspace:

- id: `mindbot-mcp-smoke`
- label: `MindBot MCP Smoke`

Rules:

- do not reuse a business workspace
- idempotent create is acceptable
- capture whether the call reports created vs already present

## Step 4 — Verification

Verify the created workspace through one of:

1. GhostCrab read/status tooling
2. direct SQL against the GhostCrab DB

Collect:

- workspace identifier
- creation result
- backend observed
- verification method used

## Step 5 — Failure taxonomy

For every failed run, classify the failure as one of:

- `mindcli_runtime`
- `db_connectivity`
- `ghostcrab_mcp_transport`
- `ghostcrab_tool_contract`
- `workspace_write`
- `workspace_verification`
- `user_rendering`

Always report:

- exact command
- exact stderr/stdout
- whether the failure is retryable

## Observed execution status — 2026-03-31

The following commands and checks were executed against the GhostCrab demo DB on `localhost:55432`.

### Pass — runtime readiness

Command:

```bash
DATABASE_URL='postgres://ghostcrab:ghostcrab@localhost:55432/ghostcrab' \
  ./bin/mindcli --json doctor
```

Observed result:

- `config_valid=true`
- `db_reachable=true`
- `pg_facets_ok=true`
- `pg_dgraph_ok=true`
- `pg_pragma_ok=true`

### Fail — direct `mindcli mcp invoke` path not yet usable on this DB

Command:

```bash
MINDCLI_CAPABILITY_V3=true \
DATABASE_URL='postgres://ghostcrab:ghostcrab@localhost:55432/ghostcrab' \
  ./bin/mindcli --json mcp invoke mcp:ghostcrab:ghostcrab_status --session-id mb1-smoke-001
```

Observed stderr/stdout:

```json
{"contract_version":"1.0","error":{"kind":"generic_error","message":"capability not found: mcp:ghostcrab:ghostcrab_status"}}
```

Classification:

- `ghostcrab_tool_contract`
- non-retryable until the capability bridge exists

### Fail — GhostCrab MCP tool indexing bridge missing

Command:

```bash
MINDCLI_CAPABILITY_V3=true \
DATABASE_URL='postgres://ghostcrab:ghostcrab@localhost:55432/ghostcrab' \
  ./bin/mindcli --json adapter load-mcp \
    --source ghostcrab \
    --tools-dir /Users/francois/Documents/fevrier2026/mindbot/testdata/fixtures/ghostcrab-mcp-tools
```

Observed stderr/stdout:

```json
{"contract_version":"1.0","error":{"kind":"generic_error","message":"delete previous mcp_tool facets: query: ERROR: relation \"public.facets\" does not exist (SQLSTATE 42P01)"}}
```

Interpretation:

- the GhostCrab demo DB exposes `public.mfo_facets` and `mindbrain.workspaces`
- but the current `mindcli` V3 discovery/indexing path expects `public.facets`

Classification:

- `ghostcrab_tool_contract`
- non-retryable until `public.facets` exists on the target DB or `mindcli` gains a direct external MCP routing path

### Pass — direct GhostCrab MCP status and workspace create/list

Validated through a repo-local MCP client invocation based on `scripts/mcp-smoke-shared.mjs`.

Observed result:

- `ghostcrab_status` returned `ok=true`
- `ghostcrab_workspace_create` created workspace `mindbot-smoke`
- `ghostcrab_workspace_list` returned the created workspace

### Pass — direct DB verification of created workspace

Verified through a local Node `pg` client because `psql` was not available in `PATH`.

Observed result:

- workspace `mindbot-smoke` exists in `mindbrain.workspaces`
- `pg_schema=ws_mindbot_smoke`
- PostgreSQL schema `ws_mindbot_smoke` exists

### Pass with compatibility gap — `mindcli workspace create-v3`

Command:

```bash
DATABASE_URL='postgres://ghostcrab:ghostcrab@localhost:55432/ghostcrab' \
  ./bin/mindcli --json workspace create-v3 --id mb1_v3_smoke --label 'MB1 V3 Smoke'
```

Observed result:

- command returns `status=ok`
- row is created in `mindbrain.workspaces`
- schema `ws_mb1_v3_smoke` exists
- but `mindbrain.workspaces.pg_schema` remains `public` on this GhostCrab DB

Classification:

- write path is usable for smoke
- but there is a contract mismatch to record before relying on `create-v3` as a strict GhostCrab equivalent

## Current recommended executable PR-MB1 path

Until the `mindcli` capability bridge is fixed, the practical deterministic smoke path is:

1. `mindcli doctor --json`
2. direct GhostCrab MCP `ghostcrab_status`
3. direct GhostCrab MCP `ghostcrab_workspace_create`
4. direct GhostCrab MCP `ghostcrab_workspace_list`
5. direct DB verification of the created workspace

## Current known constraint

On the local machine used to author this runbook:

- `mindcli doctor` succeeds against the GhostCrab demo DB
- but MindBot-specific commands such as `bootstrap status`, `memproj stats`, and `pg query stats` can still fail because they expect MindBot's own schema rather than a pure GhostCrab runtime

So this smoke runbook must stay focused on:

- runtime readiness
- GhostCrab-oriented exchange validation
- minimal object creation and verification

For a richer modeling flow with DDL approval, workspace metadata reads, and a Kanban example, see [docs/mindbot_ghostcrab_kanban_scenario.md](/Users/francois/Documents/mars2026/ghostcrab-mcp/docs/mindbot_ghostcrab_kanban_scenario.md).
