# Immeuble demo syndic bundle

Reference workspace for validating import → reindex → query coherence on a
syndic domain model.

The demo now covers:

- `Résidence Les Tilleuls`: 1 block, 5 apartments.
- `Résidence Les Érables`: 2 blocks, 4 apartments per block.
- 13 identified apartments with building, block, floor, lot, door label,
  bedrooms, usage status, and `tantiemes` on a `quota_basis` of 1000 per
  building.
- Rich people and household data: owners, occupants, tenants, children,
  landlord organizations, billing groups, and lease contracts.
- Annexes and shared spaces: one cellar per apartment, selected garages,
  private gardens for ground-floor units, laundry rooms, washing machines,
  shared gardens, and technical rooms.
- CODA matching cases: complete payment, partial payment, manual review.
- Qualified synthetic documents under `documents/`.

Companion files:

- `bundle.json`: importable `ghostcrab_backup_bundle`.
- `documents/*.md`: source documents mirrored in `documents_raw` / `chunks_raw`.
- `scenarios.yaml`: competency-question scenarios.
- `gap-rules.demo.json`: closed-world graph gap rules for MindBrain diagnostics demo.
- `projections.seed.jsonl`: projection rows to create with `ghostcrab_project`
  after import; projections are intentionally not part of the backup bundle.
- `../../scripts/generate-immeuble-demo.mjs`: deterministic generator for the
  bundle, documents, scenarios, and projection seed.

## Regenerate

```bash
node scripts/generate-immeuble-demo.mjs
pnpm run test -- tests/examples/immeuble-demo.test.ts tests/unit/ontology-interchange.test.ts
node bin/gcp.mjs load examples/immeuble-demo/bundle.json --dry-run
```

The generator is the source of truth for the large JSON bundle. Edit the
generator first, then regenerate `bundle.json` and companion files.

## Import complet

Run these commands from the `ghostcrab-personal-mcp` repository root.

Choose an explicit SQLite path so GhostCrab and Studio read the same database.
The examples below use the dedicated demo database:

```bash
export GHOSTCRAB_SQLITE_PATH="$PWD/data/immeuble-demo.sqlite"
mkdir -p "$(dirname "$GHOSTCRAB_SQLITE_PATH")"
```

Validate the bundle without writing:

```bash
node bin/gcp.mjs load examples/immeuble-demo/bundle.json --dry-run
```

Load the data and build all derived indexes:

```bash
node bin/gcp.mjs load examples/immeuble-demo/bundle.json \
  --workspace immeuble-demo \
  --reindex all
```

Notes:

- `--reindex all` materializes graph, BM25, and facet indexes. Use it before
  opening the data in Studio. The bundle declares one collection facet/search
  table: `table_id = 77001`, `collection_id = immeuble-demo::docs`.
- The loader can infer that `table_id` from `facet_tables`; passing
  `--table-id 77001` is only needed when you want to be explicit.
- `documents/*.md` are already mirrored into `documents_raw` / `chunks_raw` in
  the bundle. You do not need a separate document import for this demo.
- `scenarios.yaml` is a human-readable scenario catalog.
- `projections.seed.jsonl` is not part of the backup bundle. It is an optional
  MCP seed to replay later with `ghostcrab_project` when you want agent working
  projections; it is not required for graph/data visualization.

## Vérifier l'import

The dry-run should report one workspace, one collection, seven documents, seven
chunks, one facet table, and relation properties:

```bash
node bin/gcp.mjs load examples/immeuble-demo/bundle.json --dry-run
```

After the real import, confirm the derived indexes exist:

```bash
sqlite3 "$GHOSTCRAB_SQLITE_PATH" \
  "SELECT 'facet_tables', COUNT(*) FROM facet_tables WHERE table_id = 77001;
   SELECT 'facet_definitions', COUNT(*) FROM facet_definitions WHERE table_id = 77001;
   SELECT 'search_documents', COUNT(*) FROM search_documents WHERE table_id = 77001;
   SELECT 'facet_postings', COUNT(*) FROM facet_postings WHERE table_id = 77001;
   SELECT 'graph_entity', COUNT(*) FROM graph_entity WHERE workspace_id = 'immeuble-demo';"
```

Use the Studio checks below as the primary visual smoke. For MCP-level checks,
use:

| Layer        | Expected result                                                                                                                          |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Graph search | query `appartement` returns at least 13 units                                                                                            |
| Traverse     | from `Résidence Les Tilleuls`, outbound `contains` reaches blocks, lots, common spaces                                                   |
| Facets       | collection facet search can filter qualified documents, e.g. `table_id=77001`, namespace `source`, dimension `document_type`, value `PV` |
| Agent facts  | `ghostcrab_search` may stay empty after bundle import; that tool reads the agent `facets` table, not `facet_assignments_raw`             |

## Visualiser dans `mindbrain-personal-studio`

First import the bundle as described above, then open the sibling Studio on the
same SQLite file:

```bash
cd ../mindbrain-personal-studio
GHOSTCRAB_SQLITE_PATH="../ghostcrab-personal-mcp/data/immeuble-demo.sqlite" pnpm dev
```

If Studio is configured to use the MindBrain HTTP backend instead of direct
SQLite, start the backend against the same database and run Studio in brain
mode:

```bash
# terminal 1, from ghostcrab-personal-mcp
export GHOSTCRAB_SQLITE_PATH="$PWD/data/immeuble-demo.sqlite"
pnpm run backend:dev

# terminal 2, from mindbrain-personal-studio
MINDBRAIN_HTTP_URL=http://127.0.0.1:8091 DATA_SOURCE=brain pnpm dev
```

First visualization goals:

- **Modèle / taxonomies / ontologies**: inspect `immeuble-demo::core`, entity
  types, edge types, and controlled facet dimensions.
- **Données**: search for `appartement`, `Dupont`, `bail`, `jardin`, `CODA`.
- **Node inspector**: select a unit such as `Tilleuls Appartement A1` and verify
  its building, block, floor, quotités, cave, private garden, owners, occupants,
  and household relations.
- **Relation inspector**: select `owns`, `occupies`, `leases`, `assigned_cellar`,
  or `uses_exclusive` edges and verify typed relation properties when present.

This is the first step for Studio usage: load and visualize the model/data. If
you need to edit taxonomies or ontology definitions from Studio, use the Studio
write/editing surfaces once they are enabled against the same database; the
import bundle itself is the seed state, not the editing workflow.

Operational fixes: [`docs/plan/2026-05-23-fix-reserves-operationnelles.md`](../../docs/plan/2026-05-23-fix-reserves-operationnelles.md)

## Bundle schema notes

The native `backup-load` parser (Zig `std.json`) requires optional struct fields to appear explicitly in JSON:

- `scope.collection_id`: `null`
- `workspaces[].domain_profile`: `null` when absent
- `relations_raw[]`: `valid_from` and `valid_to` as `null`
- `ontology_edge_types[]`: `source_entity_type` and `target_entity_type` as `null` when absent
- Boolean fields (`directed`, `frozen`) must be JSON `true`/`false`, not `0`/`1`

See [`docs/audit/2026-05-23-mcp-import-storage-coherence-audit-post-fix.md`](../../docs/audit/2026-05-23-mcp-import-storage-coherence-audit-post-fix.md) §5.

## Smoke checklist

| Step                        | Check                                                                                   |
| --------------------------- | --------------------------------------------------------------------------------------- |
| After load (no reindex)     | `entities_raw` > 0, `graph_entity` = 0 for workspace                                    |
| After reindex               | `graph_entity` ≈ `entities_raw` count                                                   |
| `ghostcrab_graph_search`    | query `appartement` → ≥ 13 units                                                        |
| `ghostcrab_traverse`        | from `Résidence Les Tilleuls` → paths via `contains`                                    |
| Collection facets           | document qualifications available from `facet_assignments_raw` after collection reindex |
| `ghostcrab_search`          | empty after import-only (expected — no agent `facets`)                                  |
| `ghostcrab_learn` + reindex | learn nodes preserved via raw mirror                                                    |

See [`docs/audit/2026-05-23-mcp-import-storage-coherence-audit-post-fix.md`](../../docs/audit/2026-05-23-mcp-import-storage-coherence-audit-post-fix.md) §5.

## Graph gap diagnostics (roadmap §9 / §9b)

Closed-world business rules and MindBrain graph diagnostics on this workspace.
Use after `gcp load … --reindex all` so `graph_entity` is populated.

**Full guide (tools, findings, remediation):**
[`mindbrain/docs/methodology/graphing/immeuble-gap-diagnostics-demo.md`](../../../mindbrain/docs/methodology/graphing/immeuble-gap-diagnostics-demo.md)
and Studio copy
[`mindbrain-personal-studio/docs/methodology/graphing/immeuble-gap-diagnostics-demo.md`](../../../mindbrain-personal-studio/docs/methodology/graphing/immeuble-gap-diagnostics-demo.md).

### Files

- [`gap-rules.demo.json`](gap-rules.demo.json) — ad hoc `graph_gap_rules` aligned with
  [`scenarios.yaml`](scenarios.yaml) (annexes, structure, garages).
- MindBrain script: `mindbrain/scripts/demo-immeuble-gaps.sh` (sibling checkout).

### Quick demo

```bash
# From mindbrain-personal-studio (or mindbrain repo with data/immeuble-demo.sqlite)
pnpm load:immeuble
pnpm backend:immeuble   # terminal 1 — http://127.0.0.1:8092

# terminal 2
bash ../mindbrain/scripts/demo-immeuble-gaps.sh
# or with load + simulated anomaly (act 3):
bash ../mindbrain/scripts/demo-immeuble-gaps.sh --load --simulate-anomaly
```

Without a running backend, use CLI-only (build once: `zig build standalone-tool` in mindbrain):

```bash
bash ../mindbrain/scripts/demo-immeuble-gaps.sh --cli-only
```

### Import rules manually

HTTP (backend on 8092):

```bash
curl -sf -X POST 'http://127.0.0.1:8092/api/mindbrain/graph/gap-rules/import' \
  -H 'Content-Type: application/json' \
  -d @examples/immeuble-demo/gap-rules.demo.json
```

MCP: `ghostcrab_graph_gap_rules_import` with the same JSON body.

### Run diagnostics

```bash
curl -sf 'http://127.0.0.1:8092/api/mindbrain/graph/diagnostics?workspace_id=immeuble-demo' | jq .summary
```

MCP: `ghostcrab_graph_diagnostics` with `workspace_id: immeuble-demo`.

On golden data after import, expect `rules_evaluated >= 3`,
`missing_required_relations: 0`, `cardinality_violations: 0`.

### Act 3 — simulate a syndic anomaly

Remove the `assigned_cellar` link for **Tilleuls Appartement A3**, then re-run diagnostics.
Expect `missing_required_relation` with `rule_id: unit-one-cellar`.

One-liner (soft-deprecate via `deprecated_at`):

```bash
export GHOSTCRAB_SQLITE_PATH="$PWD/data/immeuble-demo.sqlite"

sqlite3 "$GHOSTCRAB_SQLITE_PATH" <<'SQL'
UPDATE graph_relation
SET deprecated_at = datetime('now')
WHERE relation_id = (
  SELECT r.relation_id
  FROM graph_relation r
  JOIN graph_entity src ON src.entity_id = r.source_id
  JOIN graph_entity tgt ON tgt.entity_id = r.target_id
  WHERE r.workspace_id = 'immeuble-demo'
    AND r.relation_type = 'assigned_cellar'
    AND r.deprecated_at IS NULL
    AND src.name = 'Tilleuls Appartement A3'
    AND tgt.entity_type = 'cellar'
  LIMIT 1
);
SELECT changes() AS deprecated_edges;
SQL
```

Or use the demo script:

```bash
bash ../mindbrain/scripts/demo-immeuble-gaps.sh --simulate-anomaly
```

Restore: reload the bundle with `--force` on `gcp load`, or re-insert the relation from backup.

### Scenario mapping

| Rule ID | `scenarios.yaml` | Check |
| -------- | ----------------- | ----- |
| `unit-one-cellar` | `scenario:annexes` | each unit → exactly one cellar |
| `unit-in-building` | `scenario:quota-check` (structure) | each unit → ≥1 inbound `contains` from building/block |
| `garage-at-most-one-unit` | `scenario:annexes` | parking not shared across units |
| `leased-unit-has-lease` | `scenario:tenant-lease` | disabled by default (enable when filtering rented units) |

### MCP tools (no new tools for §9b)

| Tool | Role |
| ---- | ---- |
| `ghostcrab_graph_gap_rules_import` | write — import rules |
| `ghostcrab_graph_gap_rules` | read — list rules |
| `ghostcrab_graph_diagnostics` | read — full gap report |
| `ghostcrab_traverse` / `ghostcrab_graph_search` | drill-down after an issue |

Set `MINDBRAIN_HTTP_URL=http://127.0.0.1:8092` when using the immeuble backend port.
