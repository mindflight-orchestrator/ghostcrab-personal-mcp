# GhostCrab → `casino_synthetic_data` Consumer Guide

This document describes how `casino_synthetic_data` (or any external synthetic generator) should consume the GhostCrab workspace model export to produce realistic, layer-complete casino data.

## Prerequisites

- GhostCrab MCP server running with `DATABASE_URL` pointing to the shared Postgres instance
- A `casino-pilot` workspace created and annotated (see [Setup](#1-setup-workspace))
- The workspace model contract at version `1.0.0` (see `docs/contracts/workspace-model-export.schema.json`)

---

## Sequence Overview

```
1. Create workspace
2. Propose + execute casino DDL (with semantic annotations)
3. Export workspace model (schema_version: "1.0.0")
4. Generate Layer 1 data using the export as spec
5. Verify / trigger Layer 2 derivation (mfo_facets, graph.entity, graph.relation)
6. Validate counts
```

---

## 1. Setup Workspace

Call `ghostcrab_workspace_create` once per environment:

```json
{
  "tool": "ghostcrab_workspace_create",
  "args": {
    "id": "casino-pilot",
    "label": "Casino Pilot",
    "description": "Casino domain workspace for synthetic data generation"
  }
}
```

---

## 2. Propose and Execute Casino DDL

Use the DDL fixture at `tests/fixtures/casino-pilot/ddl.sql` and the semantic annotations at `tests/fixtures/casino-pilot/semantics.json`.

Call `ghostcrab_ddl_propose` for the full DDL, including the `table_semantics` block from `semantics.json`:

```json
{
  "tool": "ghostcrab_ddl_propose",
  "args": {
    "workspace_id": "casino-pilot",
    "sql": "<contents of tests/fixtures/casino-pilot/ddl.sql>",
    "table_semantics": [
      {
        "table_schema": "casino",
        "table_name": "players",
        "business_role": "actor",
        "generation_strategy": "unknown",
        "emit_facets": true,
        "emit_graph_entity": true,
        "emit_graph_relation": false
      }
    ]
  }
}
```

Then call `ghostcrab_ddl_execute` with the `pending_id` returned by `ddl_propose`.

---

## 3. Export Workspace Model

Call `ghostcrab_workspace_export_model` to get the machine-readable spec:

```json
{
  "tool": "ghostcrab_workspace_export_model",
  "args": {
    "workspace_id": "casino-pilot",
    "depth": "full"
  }
}
```

**Expected response shape (contract 1.0.0):**

```json
{
  "ok": true,
  "schema_version": "1.0.0",
  "exported_at": "2026-03-31T00:00:00Z",
  "workspace": {
    "id": "casino-pilot",
    "label": "Casino Pilot",
    "domain_profile": "casino",
    "pg_schema": "ws_casino_pilot"
  },
  "tables": [
    {
      "schema_name": "casino",
      "table_name": "players",
      "table_role": null,
      "emit_facets": true,
      "emit_graph_entities": true,
      "emit_graph_relations": false,
      "emit_projections": false
    }
  ],
  "columns": [...],
  "relations": [...],
  "generation_hints": {
    "table_order": ["casino.game_types", "casino.players", "casino.visits", ...],
    "seed_multipliers": { "tiny": 20, "low": 200, "medium": 2000, "high": 10000 },
    "domain_profile": "casino",
    "time_window_days": 90
  },
  "validation_warnings": []
}
```

**Critical check:** `validation_warnings` should be empty. Non-empty warnings indicate missing semantic annotations — fix them before generating.

Save this export to a local file:

```bash
# Using the MCP CLI (if available)
ghostcrab workspace export-model --workspace-id casino-pilot --out ./casino-pilot.export.json

# Or via the MCP server directly (jq + curl pattern depends on your MCP adapter)
```

---

## 4. Generate Layer 1 Data

The generator script `scripts/synth-gen-casino-pilot.ts` reads the export and generates data for all 9 casino tables.

```bash
DATABASE_URL=postgresql://... tsx scripts/synth-gen-casino-pilot.ts casino-pilot
```

The script reads `docs/contracts/examples/casino-benchmark.export.json` as its generation spec. To use the live export instead:

```bash
CASINO_EXPORT_PATH=./casino-pilot.export.json DATABASE_URL=... tsx scripts/synth-gen-casino-pilot.ts casino-pilot
```

**Generation order** from `generation_hints.table_order`:

```
casino.game_types    → static_ref (tiny: ~15 rows)
casino.players       → seed_table (medium: ~2000 rows)
casino.visits        → per_parent (~15 per player: ~30 000 rows)
casino.game_sessions → per_parent (~5 per visit)
casino.transactions  → per_parent (~30 per player)
casino.hotel_stays   → sparse_events (~3 per player)
casino.event_registrations → sparse_events
casino.campaigns     → seed_table (tiny)
casino.app_events    → time_series (high)
```

---

## 5. Verify Layer 2 Derivation

After Layer 1 is populated, run the derivation verifier:

```bash
DATABASE_URL=postgresql://... tsx scripts/synth-derive-casino.ts casino-pilot
```

This script:
1. Checks if GhostCrab sync triggers are active (`ghostcrab%` triggers on `casino` schema)
2. If no triggers: seeds `mfo_facets` and `graph.entity` directly from Layer 1
3. Reports counts for all Layer 1 tables and Layer 2 surfaces

**Expected Layer 2 minimums** (from `tests/fixtures/casino-pilot/expected-counts.json`):

| Surface | Minimum rows |
|---|---|
| `mfo_facets` | > 2000 |
| `graph.entity` | > 20 |
| `graph.relation` | 0 (relations seeded on trigger only) |

---

## 6. Layer 2 Surfaces Reference

| GhostCrab surface | Table | Populated by |
|---|---|---|
| Facets | `mfo_facets` | Sync trigger (from `casino.players`, `casino.visits` when `emit_facets=true`) |
| Graph nodes | `graph.entity` | Direct insert or trigger (from `casino.players`, `casino.game_types` when `emit_graph_entities=true`) |
| Graph edges | `graph.relation` | Direct insert or trigger (from `casino.visits` when `emit_graph_relations=true`) |
| Projections | `mfo_projections` | Not automatically populated — requires explicit projection recipe |

---

## 7. Schema Compatibility Notes

### `graph.entity` columns (migration 005 + 009)

```sql
graph.entity (
  id           bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  type         text NOT NULL,   -- entity type, e.g. 'player', 'game_type'
  name         text NOT NULL,   -- unique identifier within type, e.g. player UUID
  metadata     jsonb,           -- arbitrary entity attributes
  workspace_id text,            -- added by migration 009
  confidence   real DEFAULT 1.0,
  created_at   timestamptz DEFAULT now()
)
```

**Unique index:** `(type, name)` — use `ON CONFLICT (type, name) DO NOTHING` for idempotent inserts.

### `mfo_facets` columns

```sql
mfo_facets (
  id           bigint PRIMARY KEY,
  content      text,            -- full-text search content
  facets       jsonb,           -- structured facet values
  schema_id    text,            -- logical schema identifier
  source_ref   text,            -- e.g. 'casino.players:uuid'
  workspace_id text
)
```

Unique constraint: `(source_ref, workspace_id)` when `source_ref IS NOT NULL`.

---

## 8. Validation Checklist

Before marking a generation run as successful:

- [ ] `validation_warnings` from export is empty
- [ ] All 9 Layer 1 tables have row counts within the ranges in `expected-counts.json`
- [ ] `mfo_facets WHERE workspace_id = 'casino-pilot'` count ≥ 2000
- [ ] `graph.entity WHERE workspace_id = 'casino-pilot'` count ≥ 20
- [ ] BM25 search on `mfo_facets` returns results for terms like `vip`, `player`, `casino`

---

## 9. Troubleshooting

**`validation_warnings` is non-empty**

The workspace has tables in `information_schema` that have no annotation in `mindbrain.table_semantics`, or vice versa. Re-run `ghostcrab_ddl_propose` with `table_semantics` blocks, then `ghostcrab_ddl_execute`.

**Layer 2 counts are 0 after generation**

Sync triggers are not active (DDL was not executed via GhostCrab, or `sync_spec` was not provided). Run `synth-derive-casino.ts` — it seeds Layer 2 directly as a fallback.

**`graph.entity` insert fails with column error**

Ensure you use `(type, name, metadata, workspace_id)` — not `(name, kind, properties, workspace_id)`. The correct schema is migration `005_graph_pg_schema.sql`.

**`ghostcrab_workspace_export_model` returns `workspace_not_found`**

The workspace was not created. Run step 1 (Setup Workspace) first.
