# GhostCrab Workspace Model Export Contract

## Overview

The **Workspace Model Export** is a machine-readable JSON document produced by the `ghostcrab_workspace_export_model` MCP tool. It describes the complete semantic model of a GhostCrab workspace: tables, columns, relations, and generation hints.

**Primary consumers:**
- Synthetic data generators (read the contract to know what to populate and how)
- Validation agents (verify that generated data matches the declared semantics)
- CI pipelines (assert that a workspace model is fully annotated before benchmarking)

**What this contract is NOT:**
- A replacement for the DDL (it is a semantic overlay, not the schema itself)
- A specification for the internal GhostCrab database structure (use `mindbrain.*` tables for that)
- A real-time view (it is a point-in-time snapshot)

---

## Contract Version

Current version: **1.0.0**

The `schema_version` field in every export follows [SemVer](https://semver.org/):

| Change type | Version bump | Example |
|---|---|---|
| Add optional field | Patch | 1.0.0 → 1.0.1 |
| Add required field | Minor | 1.0.0 → 1.1.0 |
| Remove or rename field | Major | 1.0.0 → 2.0.0 |
| Change field semantics | Major | 1.0.0 → 2.0.0 |

Consumers must check `schema_version` before processing and reject major versions they do not support.

---

## Document Structure

```
{
  schema_version,    // "1.0.0"
  exported_at,       // ISO 8601
  workspace,         // WorkspaceMeta
  tables,            // TableExport[]
  columns,           // ColumnExport[]   (optional, default [])
  relations,         // RelationExport[] (optional, default [])
  generation_hints,  // GenerationHints  (optional)
  validation_warnings // string[]        (optional, default [])
}
```

---

## Reference: `table_role` values

| Value | Meaning | Typical generation strategy |
|---|---|---|
| `actor` | A persistent entity that performs actions | `seed_table` |
| `event` | An immutable record of something that happened | `time_series` or `per_parent` |
| `transaction` | A financial or state-change record | `per_parent` |
| `stateful_item` | An entity that transitions through lifecycle states | `per_parent` or `seed_table` |
| `reference` | A small, stable lookup table | `static_ref` or `seed_table` |
| `hierarchy` | A self-referencing or tree-structured table | `seed_table` |
| `association` | A many-to-many join table with its own attributes | `per_parent` or `sparse_events` |

---

## Reference: `generation_strategy` values

| Value | Description | Typical `volume_driver` |
|---|---|---|
| `seed_table` | Generate N independent root records | `medium` to `high` for actors, `tiny` for reference |
| `per_parent` | Generate X records per parent row | `high` (events, transactions) |
| `time_series` | Distribute records across a time window | `high` (telemetry, logs) |
| `sparse_events` | Low-frequency events; not every parent has one | `medium` or `low` |
| `static_ref` | Small static reference data, typically < 50 rows | `tiny` |

---

## Reference: `column_role` values

| Value | Meaning | Generation hint |
|---|---|---|
| `id` | Primary key or unique identifier | UUID or auto-increment |
| `fk` | Foreign key reference to another table | Random pick from parent table |
| `status` | Lifecycle state enum | Weighted random from `distribution_hint.values` |
| `timestamp` | Temporal column | Date within `time_window_days` |
| `amount` | Numeric monetary or quantity value | Distribution from `distribution_hint` |
| `score` | Numeric ranking or probability | Float in range |
| `category` | Discrete classification | Weighted enum |
| `owner` | User or actor reference | FK to actor table |
| `parent_ref` | Self-referential FK for hierarchy | FK to same table (nullable) |
| `text_content` | Free text, description, note | Lorem ipsum or domain phrases |
| `geo` | Geographic coordinates or region code | Random within bounds |
| `embedding_source` | Source text for vector embedding | Same as `text_content` |
| `label` | Human-readable name or title | Faker name/title |
| `flag` | Boolean indicator | Random boolean |

---

## Reference: `semantic_type` values

| Value | Description |
|---|---|
| `identifier` | Unique ID, URL, reference code |
| `state` | Lifecycle state (maps to `column_role: status`) |
| `measure` | Numeric quantity (amount, count, score) |
| `enum` | Bounded set of string values |
| `free_text` | Unbounded text content |
| `temporal` | Date, time, or datetime |
| `spatial` | Geographic data |
| `vector` | Float array for embeddings |
| `boolean` | True/false flag |

---

## Reference: `emit_*` flags

These flags on `TableExport` declare which GhostCrab Layer 2/3 surfaces should receive data derived from this table:

| Flag | Layer | Target |
|---|---|---|
| `emit_facets` | Layer 2 | `mfo_facets` (via sync trigger) |
| `emit_graph_entities` | Layer 2 | `graph.entity` |
| `emit_graph_relations` | Layer 2 | `graph.relation` |
| `emit_projections` | Layer 3 | `mfo_projections` |

A synthetic generator should trigger derivation (or verify trigger activation) after populating a table with one or more of these flags set to `true`.

---

## How to Read This Export as a Generator

### Step 1: Read workspace metadata

```json
{ "workspace": { "id": "casino-benchmark", "domain_profile": "casino" } }
```

Use `domain_profile` to load domain-specific generation recipes (value distributions, realistic names, etc.).

### Step 2: Determine insertion order

```json
{ "generation_hints": { "table_order": ["casino.game_types", "casino.players", "casino.visits", ...] } }
```

Always follow `table_order` to respect FK constraints. Parents must be inserted before children.

### Step 3: For each table, select a generation strategy

```json
{
  "table_role": "actor",
  "generation_strategy": "seed_table",
  "volume_driver": "medium"
}
```

Use `volume_driver` with `seed_multipliers` to decide row count:

```json
{ "generation_hints": { "seed_multipliers": { "medium": 2000 } } }
```

→ Generate 2000 rows for this table.

### Step 4: For each column, generate realistic values

```json
{
  "column_role": "status",
  "semantic_type": "enum",
  "distribution_hint": {
    "values": ["active", "inactive", "churned"],
    "weights": [0.65, 0.25, 0.10]
  }
}
```

Use `column_role` to select a generator, `distribution_hint` to configure it.

### Step 5: Respect FK relations

```json
{
  "source_table": "visits",
  "source_column": "player_id",
  "target_table": "players",
  "target_column": "id",
  "cardinality": "1:n"
}
```

For `1:n` relations: pick a random existing `target_column` value for each `source_column`.

### Step 6: Trigger Layer 2 derivation

After inserting into a table where `emit_facets: true` or `emit_graph_entities: true`, verify that:
- `mfo_facets WHERE workspace_id = '<workspace_id>'` count increases
- `graph.entity WHERE workspace_id = '<workspace_id>'` count increases (if applicable)

If sync triggers are active (via `ghostcrab_ddl_execute` + `sync_spec`), this happens automatically. Otherwise, insert manually using `source_ref` and `workspace_id`.

### Step 7: Validate counts

Check `validation_warnings` in the export. An empty array means the semantic model is self-consistent. Non-empty means the export was produced from a partially annotated workspace—investigate before generating.

---

## Available Examples

| File | Domain | Tables | Rows (est.) |
|---|---|---|---|
| [`casino-benchmark.export.json`](examples/casino-benchmark.export.json) | Casino | 9 | ~35,000 |
| [`crm-pipeline.export.json`](examples/crm-pipeline.export.json) | CRM | 5 | ~18,000 |
| [`kanban-board.export.json`](examples/kanban-board.export.json) | Kanban | 5 | ~5,000 |
| [`project-delivery.export.json`](examples/project-delivery.export.json) | Project delivery | 8 | ~12,000 |

---

## JSON Schema

The formal JSON Schema for this contract is at [`workspace-model-export.schema.json`](workspace-model-export.schema.json).

It can be used to validate any export document before processing:

```bash
# Using ajv-cli (example)
npx ajv validate -s docs/contracts/workspace-model-export.schema.json -d docs/contracts/examples/casino-benchmark.export.json
```

Or via the conformance test suite:

```bash
npx vitest run tests/unit/workspace-model-contract.test.ts
```

---

## Validation Warnings

The `validation_warnings` array contains strings describing semantic inconsistencies detected at export time. Examples:

- `"Table casino.players has no table_semantics annotation"` — the DDL table exists but was never annotated
- `"Column casino.players.email referenced in column_semantics but not found in information_schema"` — annotation references a column that does not exist in the live DDL
- `"Table casino.visits has emit_facets=true but no sync_spec defined"` — facets derivation is declared but no trigger will fire

A generator receiving a non-empty `validation_warnings` should log warnings and may choose to skip unannotated tables (safe default) or proceed with best-effort generation.
