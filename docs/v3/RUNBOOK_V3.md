# GhostCrab — Workspace operational runbook

User-facing concept: **workspace** (isolation scope, DDL lifecycle, semantics). The `docs/v3/` path is historical; shipped behavior is what matters, not a version label.

**Status legend used throughout this document:**

| Badge | Meaning |
|-------|---------|
| ✅ Implemented & integration-proven | Code + migration exists, 17+ real-DB integration tests pass |
| 🔧 Implemented, unit-proven only | Code + migration exists, tested with mocks; not yet proven end-to-end on a live DB |
| ⚠️ Optional | Requires extra infra (PostGIS). Works correctly when absent (structured error). |
| 🗺 Planned | On the roadmap, not yet implemented |

---

## 1. Feature status matrix

| Feature | Status | Migration | MCP tool(s) |
|---------|--------|-----------|-------------|
| Workspace isolation (`workspace_id` on all Layer 2 tables) | ✅ | 009 | `ghostcrab_workspace_create`, `ghostcrab_workspace_list` |
| `mindbrain` control schema | ✅ | 009 | — (internal) |
| DDL lifecycle (propose / approve / execute) | ✅ | 009 | `ghostcrab_ddl_propose`, `ghostcrab_ddl_list_pending`, `ghostcrab_ddl_execute` |
| Layer 1→Layer 2 sync trigger generator | ✅ | 009 + 011 | `ghostcrab_ddl_propose` (sync_spec) |
| `mfo_facets.source_ref` partial-unique contract | ✅ | 011 | internal |
| `workspace_id` filter on search / count / facet_tree | ✅ | 009 | `ghostcrab_search`, `ghostcrab_count`, `ghostcrab_facet_tree` |
| Geo entities (PostGIS) | ⚠️ Optional | 010 | `ghostcrab_query_geo` |
| Embedding vectors (pgvector) | 🔧 | 010 | — (mindCLI pipeline) |
| Query templates | 🗺 | — | — |
| Source mappings | 🗺 | — | — |
| Workspace semantics (`semantic_spec` on pending DDL; `table_semantics` / `column_semantics` / `relation_semantics`) | ✅ | 012 | `ghostcrab_ddl_propose` (optional), `ghostcrab_ddl_execute`, `ghostcrab_workspace_inspect`, `ghostcrab_workspace_export_model` |
| Rich semantics (`domain_profile` on workspaces; `rich_meta` on column/relation semantics) | ✅ | 013 | `ghostcrab_workspace_export_model` (contract enrichment) |

---

## 2. Migration sequence

Migrations run automatically on server startup via `runMigrations()`.  
They are **idempotent** — safe to re-run at any time.

```
001_facets_schema.sql             V1: mfo_facets, indexes, BM25
002_dgraph_schema.sql             V1: mfo_nodes, mfo_edges
003_pragma_schema.sql             V1: mfo_agent_state, mfo_projections
004_bootstrap_data.sql            V1: seed ontology
005_graph_pg_schema.sql           V2: graph.entity, graph.relation (pg_dgraph-aligned)
006_facets_materialized_pg_facets V2: materialized columns for pg_facets
007_pragma_extension_alignment    V2: pragma alignment
008_facets_surrogate_doc_id       V2: doc_id surrogate key for pg_facets bitmap
009_mindbrain_foundation          Workspace: mindbrain schema, workspace_id on Layer 2, default workspace
010_specialized_layer2            Workspace: geo_entities (PostGIS optional), embedding_vectors (pgvector)
011_facets_sync_contract          Workspace: mfo_facets.source_ref + partial unique index
012_workspace_semantics           Workspace: semantic_spec on pending_migrations; mindbrain.*_semantics tables
013_rich_semantics                Workspace: domain_profile; rich_meta on column/relation semantics
```

---

## 3. Bootstrap sequence for a new deployment

```bash
# 1. Run all migrations (includes 009–013)
ghostcrab migrate          # or: the server auto-migrates on first connection

# 2. Verify the mindbrain schema is present
psql $DATABASE_URL -c "SELECT id, status FROM mindbrain.workspaces;"
# Expected: at least one row with id='default'

# 3. (Optional) Register native extensions if using GhostCrab postgres image
ghostcrab maintenance bootstrap-native

# 4. Create additional workspaces as needed
ghostcrab workspace create --id my-workspace --label "My Workspace"
# Or via MCP: ghostcrab_workspace_create
```

---

## 4. DDL lifecycle — step-by-step

The DDL lifecycle implements a **human-in-the-loop** guardrail for schema changes proposed by agents.

### 4.1 Propose a migration (agent or human)

```bash
ghostcrab ddl propose \
  --workspace-id my-workspace \
  --sql "CREATE TABLE my_documents (id SERIAL PRIMARY KEY, title TEXT, category ltree)" \
  --rationale "Layer 1 table for document ingestion"
```

Via MCP tool:
```json
{
  "tool": "ghostcrab_ddl_propose",
  "args": {
    "workspace_id": "my-workspace",
    "sql": "CREATE TABLE my_documents (id SERIAL PRIMARY KEY, title TEXT, category ltree)",
    "rationale": "Layer 1 table for document ingestion",
    "sync_spec": {
      "source_table": "public.my_documents",
      "fields": [
        { "column_name": "title", "facet_key": "title", "index_in_bm25": true, "facet_type": "term" },
        { "column_name": "category", "facet_key": "category", "index_in_bm25": false, "facet_type": "ltree" }
      ]
    }
  }
}
```

The tool returns a `migration_id` (UUID) and a `trigger_summary` describing what the auto-generated trigger will do.

### 4.2 Review the pending migration

```bash
ghostcrab maintenance ddl-list  # or: ghostcrab_ddl_list_pending
```

You can inspect `preview_trigger` in `mindbrain.pending_migrations` to see the exact trigger SQL that will be applied.

### 4.3 Approve (human step — CLI only, not MCP-accessible)

```bash
ghostcrab maintenance ddl-approve --id <uuid> --by "your-name"
```

This transitions `status: pending → approved`. Only an approved migration can be executed.

### 4.4 Execute

```bash
ghostcrab maintenance ddl-execute --id <uuid>
```

Or via MCP (for automated pipelines after human approval is confirmed):
```json
{ "tool": "ghostcrab_ddl_execute", "args": { "migration_id": "<uuid>" } }
```

The execute step runs DDL + trigger atomically in a single transaction. If anything fails, the entire operation rolls back and the migration remains `approved` (retryable).

### 4.5 Verify

```sql
-- Table created?
SELECT to_regclass('public.my_documents');

-- Trigger created?
SELECT trigger_name FROM information_schema.triggers
WHERE event_object_table = 'my_documents';

-- Migration status?
SELECT status, executed_at FROM mindbrain.pending_migrations WHERE id = '<uuid>';
```

---

## 5. Workspace isolation

Every Layer 2 row (`mfo_facets`, `graph.entity`, `graph.relation`) now carries a `workspace_id` column (migration 009, default: `'default'`).

- Existing V2 data automatically belongs to `workspace_id = 'default'`.
- All MCP query tools (`ghostcrab_search`, `ghostcrab_count`, `ghostcrab_facet_tree`) accept an optional `workspace_id` parameter.
- When omitted, tools behave exactly as in V2 (no workspace filter).

### Creating a workspace

```json
{
  "tool": "ghostcrab_workspace_create",
  "args": {
    "id": "prod-eu",
    "label": "Production EU",
    "description": "EU region workspace"
  }
}
```

Workspace `id` rules: lowercase alphanum + hyphens, 2–64 chars, must start with a letter.

---

## 6. `mfo_facets.source_ref` contract (migration 011)

Two row categories coexist in `mfo_facets`:

| Category | `source_ref` | Written by | Uniqueness |
|----------|-------------|------------|-----------|
| Historical (V2 compat) | `NULL` | `remember`, `upsert` MCP tools | No uniqueness constraint |
| Synced (Layer 1→2) | `"<pk>[:<field>:<index>]"` | Generated sync triggers | Unique per `(source_ref, workspace_id)` |

The partial unique index `mfo_facets_source_ref_workspace_uniq` enforces uniqueness **only for synced rows** (`WHERE source_ref IS NOT NULL`), so historical rows are never affected.

---

## 7. Trigger generator — assumptions and type semantics

The trigger generator (`src/db/trigger-generator.ts`) makes the following assumptions about the source table:

- Has a primary key column (default: `id`, configurable via `sourcePrimaryKeyColumn`) castable to TEXT.
- `"array"` fields: column must be a PostgreSQL array type (e.g. `TEXT[]`).
- `"ltree"` fields: column must be `ltree` type (requires `pg_ltree` extension).
- `"geo"` fields: `geo_entities` table must exist (migration 010 + PostGIS). If absent, insert is silently skipped.
- `"embedding"` fields: skipped entirely (handled by mindCLI external pipeline).

| `facet_type` | mfo_facets rows produced | `source_ref` pattern |
|---|---|---|
| `term`, `boolean`, `integer`, `float`, `temporal`, `temporal_range`, `computed`, `jsonpath` | 1 row per source row per field (merged via upsert) | `"<pk>"` |
| `array` | N rows per source row (one per array element) | `"<pk>:<facet_key>:<ordinal>"` |
| `ltree` | N rows per source row (one per ancestor level) | `"<pk>:<facet_key>:<level>"` |
| `geo` | 0 rows in mfo_facets; 1 row in `geo_entities` | — |
| `embedding` | 0 rows (mindCLI handles externally) | — |

---

## 8. Geo/PostGIS — optional feature

`ghostcrab_query_geo` and `geo_entities` (migration 010) are **optional** and require PostGIS.

**Standard deployments (postgres:17 without PostGIS):**
- Migration 010 runs silently without creating `geo_entities` (guarded by `IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis')`).
- `ghostcrab_query_geo` returns a structured error with code `geo_feature_not_available` and setup instructions.

**To enable Geo:**
1. Install PostGIS: `CREATE EXTENSION IF NOT EXISTS postgis;`
2. Re-run migrations: `ghostcrab migrate` (migration 010 will create `geo_entities`).
3. `ghostcrab_query_geo` will work normally.

---

## 9. Invariants and limits

| Invariant | Value |
|-----------|-------|
| Workspace id max length | 64 chars |
| Workspace id pattern | `^[a-z][a-z0-9-]{1,62}[a-z0-9]$` |
| DDL allowed patterns | `CREATE TABLE`, `ALTER TABLE ADD COLUMN`, `CREATE INDEX`, `CREATE TYPE`, `CREATE SEQUENCE` |
| DDL blocked patterns | `DROP`, `TRUNCATE`, `DELETE FROM`, `GRANT`, `REVOKE`, `ALTER TABLE ... DROP` |
| Trigger generator: source table assumption | Must have a column named `id` (or explicit `sourcePrimaryKeyColumn`) castable to TEXT |
| workspace_id default | `'default'` — backward compatible with all V2 data |
| source_ref uniqueness | Partial: only for rows where `source_ref IS NOT NULL` |

---

## 10. What is NOT yet implemented

- `mindbrain.query_templates` — table exists, no MCP tool yet
- `mindbrain.source_mappings` — table exists, no MCP tool yet
- Embedding vector search via `embedding_vectors` — table created (if pgvector present), trigger skips (mindCLI handles)
- Geo trigger execution on real PostGIS instance — trigger SQL is generated correctly, but E2E proof requires PostGIS
- Native pg_facets registration for `workspace_id` column — `workspace_id` is a new column not yet registered with `add_faceting_to_table`; the `ghostcrab_facet_tree` bitmap filter for workspace uses best-effort (column may not be in bitmap index until re-registered)
