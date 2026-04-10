# Cross-repo PostgreSQL usage audit — mindCLI and mindBot vs GhostCrab workspace model

This document is the **executable checklist** for Phase A–C of the workspace alignment audit. Use it when reviewing **mindCLI** (Go, separate repository) and **mindBot** (repository path varies) against the invariants documented in [RUNBOOK_V3.md](RUNBOOK_V3.md) and [README_ARCHITECTURE.md](../../README_ARCHITECTURE.md).

## Workspace invariants (summary)

1. **Namespace:** Core Layer 2 rows scoped by workspace (`mfo_facets`, `graph.entity`, `graph.relation`, optional `geo_entities` / `embedding_vectors`) carry **`workspace_id`**; default `'default'` preserves V2 behavior. **`mfo_projections`** is not workspace-scoped by column today (use `agent_id` / `scope` as in V2).
2. **Bulk / ETL:** Prefer writes to **Layer 1** (tables in `mindbrain.workspaces.pg_schema`) when DDL and `sync_spec` exist; let **generated triggers** populate Layer 2.
3. **Idempotence:** Any direct or mirrored insert into `mfo_facets` that represents a Layer 1 row must respect **`source_ref`** and the partial unique index on `(source_ref, workspace_id)` where `source_ref IS NOT NULL` (migration `011`).
4. **Semantics:** DDL/export tooling may need to align with `mindbrain.table_semantics`, `column_semantics`, `relation_semantics`, and `rich_meta` (migrations `012`–`013`) and with [docs/contracts/workspace-model-export.schema.json](../contracts/workspace-model-export.schema.json) when producing consumer contracts.

---

## Phase A — Inventory (read-only)

### A.1 Locate artifacts

In each repository root:

```bash
# SQL and string literals (adjust paths)
rg -n "mfo_facets|mfo_projections|graph\\.entity|graph\\.relation|mindbrain\\.|workspace_id|source_ref" \
  --glob '!**/node_modules/**' --glob '!**/vendor/**'

# Go
rg -n "mfo_facets|mindbrain|workspace_id|source_ref|pq\\.Quote|Exec\\(|Query\\(" cmd internal pkg

# Common migration folders
find . -path '*/migrations/*.sql' -o -path '*/db/*.sql' 2>/dev/null | head -50
```

### A.2 Table / column matrix (copy per repo)

| Consumer (package or command) | Tables / schemas touched | Writes Layer 2 directly? | Sets `workspace_id`? | Assumes single global namespace? | Notes |
|--------------------------------|---------------------------|--------------------------|----------------------|----------------------------------|-------|
| | | | | | |

**Minimum trace set:** `mfo_facets`, `graph.entity`, `graph.relation`, `mfo_projections` (V2-style scope), `mindbrain.*`, `geo_entities`, `embedding_vectors`, any app `CREATE TABLE` targeting GhostCrab.

### A.3 Path classification

For each write path, label:

- **MCP-scale** — low volume, agent-driven.
- **Batch / ingest** — sync jobs, CSV, connectors.
- **Bypass** — direct `INSERT`/`UPDATE` into Layer 2 that could duplicate or fight **Layer 1 triggers**.

---

## Phase B — Compare to workspace invariants

| Check | Pass criteria |
|-------|----------------|
| B.1 Workspace | Batch code accepts or derives `workspace_id` and passes it on every Layer 2 write. |
| B.2 Layer 1 first | Ingest targets Layer 1 tables when the workspace has approved DDL + `sync_spec`; does not bulk-insert into `mfo_facets` for those rows. |
| B.3 `source_ref` | If writing synced-style facet rows, uses stable `source_ref` patterns compatible with triggers; no conflicting duplicates per workspace. |
| B.4 Semantics | If generating DDL or export JSON, fields align with `mindbrain.*_semantics` / export schema where applicable. |

Reference: RUNBOOK_V3 §7 (trigger generator assumptions and `facet_type` behavior).

---

## Phase C — Output template

### Gap list (prioritized)

| ID | Severity | Finding | Recommended action |
|----|----------|---------|-------------------|
| P0 | | Wrong workspace, duplicate keys, or trigger bypass | |
| P1 | | Missing `workspace_id` on new paths | |
| P2 | | Docs / CLI UX only | |

### Decision

- **mindCLI:** *Required before production workspace rollout* vs *optional alignment* — one sentence each with rationale.
- **mindBot:** same.

---

## Execution log — `ghostcrab-mcp` workspace (2026-03-31)

| Repository | Local path used | Phase A completed? |
|------------|-----------------|-------------------|
| **mindCLI** | Not present under `~/Documents/mars2026` (no `go.mod` found for `mindcli`) | No — run Phase A in the mindCLI checkout. |
| **mindBot** | Not present under `~/Documents/mars2026` | No — run Phase A in the mindBot checkout. |

**Note:** A sibling repo **`mfo-mcp-server`** exists under `mars2026` and references `mfo_facets` heavily in docs and SQL; it is **not** a substitute for mindCLI/mindBot but may be audited with the same matrix if legacy parity matters.

When Phase A–C are completed for mindCLI and mindBot, update [ROADMAP.md](../../ROADMAP.md) (workspace checklist) and extend this section with filled matrices and gap tables.
