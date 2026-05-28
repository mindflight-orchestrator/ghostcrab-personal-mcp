# Audit - CRM MindBrain Graph Generation

Date: 2026-05-28

## Executive summary

The graph generation problem was not caused by an empty CRM database. It was caused by a contract mismatch between three valid layers:

1. GhostCrab facet memory: CRM records existed in `facets`.
2. GhostCrab semantic model: CRM edges existed as `crm-mindbrain:semantic-edge` facet records.
3. Sigma/Graphology viewer: the app reads only native graph tables, `graph_entity` and `graph_relation`.

The original import validated the model and projections, but it did not require a native-graph materialization gate before handing the DB to the viewer. As a result, `ghostcrab_pack` could return useful CRM context while Sigma still displayed nothing.

Current fixed state:

- `facets`: 37 CRM rows
- sample entity facets: 14
- sample semantic-edge facets: 15
- `graph_entity`: 14
- `graph_relation`: 15
- projections: 5
- SQLite integrity: `ok`

Deterministic validator:

- `scripts/audit_crm_graph_pipeline.mjs`

Materialization script:

- `scripts/materialize_crm_graph.sql`

## What `ghostcrab-data-architect` proposed

The skill's correct modeling order is:

1. Facts with strong retrieval facets.
2. Graph nodes and edges where they improve decisions.
3. Projections for compact working context.

For ontology workspaces, it also states that:

- every record needs a stable `record_id`
- schemas should be namespaced with `<workspace-id>:<entity-type>`
- graph nodes/edges are required for traversal and structural decisions
- facet records hold rich searchable metadata
- graph records hold structural identity

The procedure followed the first and third parts:

- created a model contract
- imported facet records
- created projection scopes
- tested `ghostcrab_pack`

It did not initially enforce the second part for the viewer:

- no required check that `graph_entity` and `graph_relation` had been populated
- no required check that every `crm-mindbrain:semantic-edge` resolved to graph endpoints
- no consumer-level smoke test against `/api/graph/count`

## Failure chain

### 1. Model creation worked

Contract:

- `models/crm_mindbrain_ontology_contract.json`

Counts:

- 19 entity types
- 17 dimensions
- 21 edge types
- 5 projections

This was a valid conceptual model.

### 2. Sample import worked, but only as facets

Sample source:

- `data/crm_mindbrain_sample_data.json`

Sample content:

- 14 entity records
- 15 edges in `edges_as_records`

Imported records:

- normal CRM entities as `crm-mindbrain:*` facet records
- relations as `crm-mindbrain:semantic-edge` facet records

This was valid for GhostCrab search, count, and pack behavior.

### 3. Projection validation gave a partial false positive

The `crm-mindbrain/opportunity` projection returned useful facts because it reads matching facts from the memory layer. That proved that facets and projection context existed.

It did not prove that the graph viewer could render anything, because the viewer does not read `crm-mindbrain:semantic-edge` facet records as graph edges.

### 4. Clone cleanup preserved CRM facets but not graph materialization

The clone was correctly scoped to:

- `workspace_id = crm-mindbrain`

But at that stage the DB still had:

- `graph_entity = 0`
- `graph_relation = 0`

The clone was clean, but visually empty.

### 5. Viewer contract was different

The Sigma/Graphology app reads:

- nodes from `graph_entity`
- edges from `graph_relation`
- ontology filters from `graph_entity.entity_type`
- workspace counts from `graph_entity.workspace_id`

So a DB containing only `facets` can be valid for GhostCrab but invisible for Sigma.

## Current fix

The materialization script now translates:

- non-edge sample facets -> `graph_entity`
- `crm-mindbrain:semantic-edge` facets -> `graph_relation`

Mapping:

- `facets.facets_json.record_id` -> `graph_entity.name`
- `facets.facets_json.type` -> `graph_entity.entity_type`
- `source_record_id` / `target_record_id` -> relation endpoints
- `edge_label` -> `graph_relation.relation_type`

Post-fix HTTP validation from the Sigma app:

- `/api/graph/ontologies?db=crm-mindbrain&workspace=crm-mindbrain`
  - `entityCount = 14`
- `/api/graph/count?db=crm-mindbrain&workspace=crm-mindbrain&ontology=all&linkMode=all&topK=none`
  - `nodeCount = 14`
  - `edgeCount = 15`

## Endpoint/model export note

The GhostCrab tool catalog advertises:

- `ghostcrab_workspace_export_model`

Purpose:

- export a workspace semantic model as JSON for generators and validators

This should become the canonical model-read step when the runtime exposes it. In this session:

- the PERSO compact surface could discover the tool through `ghostcrab_tool_search`
- the default PERSO callable namespace did not expose it directly
- the PRO/mindBrain call attempted during audit failed because its transport closed

Therefore the current deterministic fallback is:

1. read the local contract artifact
2. verify that the same contract was imported as `crm-mindbrain:ontology-contract`
3. validate source data and graph tables against that contract

When `ghostcrab_workspace_export_model` is callable, it should replace or cross-check the local contract file.

## Deterministic procedure

### Gate 0 - Runtime and source DB identity

Goal:

- prove which SQLite file is active before importing or cloning

Required checks:

- `ghostcrab_status` reports SQLite mode
- active file path is identified from logs, config, or process environment
- `facets` count matches GhostCrab status

Failure condition:

- local repo DB differs from active MCP DB
- `facets = 0` while MCP reports existing rows

### Gate 1 - Model acquisition

Preferred:

- call `ghostcrab_workspace_export_model(workspace_id, depth = full)`

Fallback:

- load `models/crm_mindbrain_ontology_contract.json`
- exact-search imported `crm-mindbrain:ontology-contract`

Required checks:

- workspace id present
- entity schemas namespaced as `crm-mindbrain:*`
- required facets defined
- edge labels defined
- projection scopes defined

Failure condition:

- imported data references a schema or edge label not present in the model

### Gate 2 - Source data validation

Input:

- `data/crm_mindbrain_sample_data.json`

Required checks:

- every record has unique `record_id`
- every record's `schema_id` exists in the model
- every record has required facets
- every edge source exists
- every edge target exists
- every edge label exists in the model

Failure condition:

- missing source/target reference
- typo in `edge_label`
- missing required facet such as `status`, `owner`, `domain`, or `next_action`

### Gate 3 - Facet import validation

Required checks after `ghostcrab_upsert`:

- `sampleEntityFacetCount == source records`
- `sampleEdgeFacetCount == source edges`
- `workspace_id` equals `crm-mindbrain`
- `record_id` is preserved in `facets_json`

Failure condition:

- source JSON says 15 edges but DB has fewer semantic-edge facet records
- records imported into `default` or another workspace

### Gate 4 - Projection validation

Required checks:

- all five projection scopes exist
- `ghostcrab_pack` on `crm-mindbrain/opportunity` returns sample facts
- blocker query returns expected blocker edges

Important:

- this gate proves memory/projection usability
- it does not prove graph visualization readiness

### Gate 5 - Native graph materialization

Required action:

```bash
sqlite3 data/ghostcrab_crm_mindbrain.sqlite < scripts/materialize_crm_graph.sql
```

Required checks:

- `graph_entity == source records`
- `graph_relation == source edges`
- every semantic-edge facet resolves to a source and target `graph_entity`
- every `graph_relation.relation_type` exists in model edge labels

Failure condition:

- native graph count is zero
- semantic-edge exists but source/target cannot be resolved by `record_id`

### Gate 6 - Consumer API validation

Required checks against the Sigma app:

- `/api/graph/ontologies`
  - workspace appears with non-zero `entityCount`
  - expected `type:*` categories appear
- `/api/graph/count`
  - `nodeCount > 0`
  - `edgeCount > 0`
- `/api/graph`
  - returns non-empty `nodes`
  - returns non-empty `edges`

Failure condition:

- DB is valid for GhostCrab but empty for the viewer

### Gate 7 - Clone hygiene

Required checks:

- no row in workspace-scoped tables has `workspace_id <> crm-mindbrain`
- `integrity_check = ok`
- `VACUUM` run after deletion
- manifest updated with counts

Failure condition:

- stale rows from other workspaces remain
- search/facet posting indexes refer to deleted documents

## Deterministic command

Run:

```bash
node scripts/audit_crm_graph_pipeline.mjs
```

Expected current result:

```json
{
  "ok": true,
  "sampleEntityFacetCount": 14,
  "sampleEdgeFacetCount": 15,
  "graphEntityCount": 14,
  "graphRelationCount": 15,
  "projectionCount": 5
}
```

This command should be treated as the minimum gate before saying that a CRM DB is ready for Sigma/Graphology.

## Procedure changes to adopt

1. Never validate visualization readiness with `ghostcrab_pack` alone.
2. Always classify target consumers before import:
   - GhostCrab memory/projection consumer
   - native graph traversal consumer
   - Sigma/Graphology visual consumer
3. If the consumer is Sigma, native graph materialization is mandatory.
4. Add a model export/read step before generating sample data.
5. Validate every edge reference before import.
6. Validate every semantic-edge facet after import.
7. Validate native graph counts after materialization.
8. Validate app endpoints after DB selection.
9. Keep a manifest with source DB, clone DB, counts, and materialization script.

## Remaining improvement

The Sigma app profile note for `crm-mindbrain` still says:

- `facets/projections, no native graph rows`

That note is now stale after materialization. It should be updated to avoid misleading future debugging.
