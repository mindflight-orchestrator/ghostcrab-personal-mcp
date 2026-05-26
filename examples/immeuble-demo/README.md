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
