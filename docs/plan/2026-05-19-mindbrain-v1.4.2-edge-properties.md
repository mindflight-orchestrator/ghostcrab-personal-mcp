# Adaptation GhostCrab pour MindBrain v1.4.2 Edge Properties

Date: 2026-05-19

## Summary

- Align `vendor/mindbrain` with `v1.4.2` (`a92c27a`), while the current submodule is still at `v1.4.1`.
- Expose the new typed edge-property layer without breaking the current GhostCrab MCP contract: `edge.properties` continues to populate `graph_relation.metadata_json`, and a new explicit field writes `relation_properties_raw` as the source of truth before refreshing the derived `graph_relation_property` projection.
- Project raw relation properties during graph reindexing and return typed properties from read paths that expose relations.

## Key Changes

- Add an optional `relation_properties` field to `ghostcrab_learn.edge`:

  ```ts
  relation_properties?: Array<{
    property_key: string;
    value_type:
      | "text"
      | "number"
      | "percentage_bp"
      | "money_minor"
      | "date_unix"
      | "doc_ref"
      | "uri";
    value_text?: string;
    value_number?: number;
    value_integer?: number;
    ref_doc_id?: number;
    currency?: string;
  }>;
  ```

- Keep typed properties explicit. Do not infer them automatically from `edge.properties`; `edge.properties` remains untyped relation metadata.
- Validate `value_type` and value columns against the MindBrain v1.4.2 schema rules, including `currency` only being valid for `money_minor`.

## Implementation Changes

- Update the `vendor/mindbrain` submodule to tag `v1.4.2`, then rebuild so the embedded SQL schema includes `relation_properties_raw` and `graph_relation_property`.
- **Fix `upsertGraphRelation`** (`src/db/graph.ts`): the existing path previously returned early without writing. Now issues `UPDATE graph_relation SET metadata_json = ?, confidence = ?` on the existing row so that repeated `ghostcrab_learn` calls correctly refresh both `metadata_json` and typed properties.
- Add `upsertGraphRelationProperties` helper (`src/db/graph.ts`) that ensures the raw graph workspace/ontology/entity/relation rows exist, upserts typed rows into `relation_properties_raw`, then refreshes the corresponding `graph_relation_property` projection after the relation ID is resolved, regardless of whether the relation was just created or updated.
- Extend `ghostcrab_learn` Zod schema (`src/tools/dgraph/learn.ts`):
  - Add optional `relation_properties: RelationPropertyInput[]` (max 50) to `LearnEdgeInput`.
  - Validate with `z.superRefine`: `currency` is only accepted when `value_type === "money_minor"`; each item must carry the value column that matches its `value_type` (`value_text` for `text`/`uri`, `value_number` for `number`/`percentage_bp`, `value_integer` for `date_unix`/`money_minor`, `ref_doc_id` for `doc_ref`); extraneous value columns are rejected.
  - Update MCP `inputSchema` to document the `relation_properties` array and `value_type` enum.
- Extend `ghostcrab_learn` handler to call `upsertGraphRelationProperties` when `relation_properties` is provided (both create and update paths). `relation_properties_raw` is canonical; `graph_relation_property` remains the indexed runtime projection and can be rebuilt by reindexing.
- Extend `ghostcrab_graph_reindex` (`src/tools/dgraph/graph-reindex.ts`):
  - Count `relation_properties_raw` rows for the workspace.
  - DELETE existing `graph_relation_property` rows for the workspace's relations, then `INSERT OR REPLACE` from `relation_properties_raw`.
  - Include `relation_property_count` in the result and add it to `projected_count`.
- Extend relation read output for `ghostcrab_graph_search(include_relations=true)` (`src/tools/dgraph/graph-search.ts`):
  - After loading `graph_relation` rows, issue a second query against `graph_relation_property` for the resolved relation IDs.
  - Merge into a `relation_properties: RelationPropertyResult[]` sibling field on each `GraphRelationResult` (alongside the existing `metadata` field, which is preserved for backward compatibility).
- **`ghostcrab_graph_subgraph` — Option A (MindBrain-native):** MindBrain v1.4.2 embeds typed properties inside `edge` event payloads natively. GhostCrab forwards the event stream unchanged, so no code change is needed in `graph-subgraph.ts`.
- Update MCP schema-contract tests so the new field is visible to clients.

## Test Plan

- `npx vitest run tests/tools/dgraph.test.ts tests/tools/mcp-schema-contract.test.ts tests/tools/loadouts.test.ts`
- `npm run typecheck`
- `npm run build`
- In `vendor/mindbrain`: `ZIG_LOCAL_CACHE_DIR=/tmp/zig-cache ZIG_GLOBAL_CACHE_DIR=/tmp/zig-global-cache zig build test-standalone`
- Build the GhostCrab backend after the vendor sync to verify `cmd/backend` compiles with MindBrain v1.4.2.

### New test cases to add

**`tests/tools/dgraph.test.ts`**

- `ghostcrab_learn` — creates edge with `relation_properties`: mock DB returns no existing relation; assert handler calls `INSERT INTO graph_relation_property` for each property and result includes `relation_properties_count`.
- `ghostcrab_learn` — updates existing edge with `relation_properties`: mock DB returns existing `relation_id`; assert handler issues `UPDATE graph_relation` (fix for pre-existing update bug) and `INSERT OR REPLACE INTO graph_relation_property`; result has `updated: true` and `relation_properties_count`.
- `ghostcrab_graph_reindex` — assert SQL includes `FROM relation_properties_raw` count query and `INSERT OR REPLACE INTO graph_relation_property` projection; result includes `relation_property_count`.
- `ghostcrab_graph_search` with `include_relations: true` — mock returns one relation row plus one `graph_relation_property` row; assert result `relations[0].relation_properties` contains the typed property.

**`tests/tools/mcp-schema-contract.test.ts`**

- `ghostcrab_learn` — assert MCP `inputSchema.properties.edge.properties.relation_properties` is defined as an array with `maxItems: 50` and that `items.properties.value_type.enum` includes `"money_minor"`.
- `ghostcrab_learn` — Zod accepts a valid `text` property (`{ property_key: "url", value_type: "text", value_text: "https://…" }`).
- `ghostcrab_learn` — Zod rejects `currency` on a non-`money_minor` property.
- `ghostcrab_learn` — Zod rejects a `money_minor` property missing `value_integer`.

## Assumptions

- Chosen contract: compatibility plus explicit typed properties.
- No npm version bump, prebuild refresh, release tag, or publication is included unless requested separately.
- The existing untracked file `docs/methodology/ghostcrab-query-layers.md` remains outside this work.
