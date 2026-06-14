# Immeuble — parcours pas à pas

Analytical walkthrough from raw documents to importable workspace. Each step lists **filesystem artifacts**, **DB tables**, and **verification**.

Cross-reference: [méthode StarterKit](../../docs/explanation/methode-starterkit/README.md) · [CHECKLIST exécutable](CHECKLIST.md) · [ACCEPTANCE.yaml](ACCEPTANCE.yaml)

## Étape 0 — Runtime

| Filesystem | DB | Vérification |
|------------|-----|--------------|
| — | — | `ghostcrab_status` → backend OK, workspace routable |

## Étape 1 — Modèle métier

**Input:** [`sources/documents/`](sources/documents/) (corpus markdown syndic)

**Commande:**

```bash
npm run immeuble:build
```

| Filesystem | DB | Vérification |
|------------|-----|--------------|
| `model/immeuble_model.json` | — | 19+ entity types, `schema_id` prefix `immeuble:` |
| `reports/01-model.validation.json` | — | `ok: true`, zero prefix violations |
| `fake_data/*.csv` | — | one CSV per entity type |

## Étape 2 — Ontologie LinkML

**Source:** [`ontologies/immeuble/core.yaml`](../../ontologies/immeuble/core.yaml)

```bash
node bin/gcp.mjs brain ontology compile \
  --workspace-id immeuble \
  --ontology-id immeuble::core \
  --input ontologies/immeuble/core.yaml \
  --apply
```

| Filesystem | DB | Vérification |
|------------|-----|--------------|
| compile slice JSON (temp) | `ontologies`, `ontology_*` | `ghostcrab_coverage` |

## Étape 3 — Mapping + dry-run (gates 2–4)

| Filesystem | DB | Vérification |
|------------|-----|--------------|
| `contracts/mapping_external_to_canonical.json` | **aucune écriture** | taxonomies dans mapping |
| `reports/02-mapping.validation.json` | — | facet/edge row counts |
| `reports/graph_nodes.jsonl`, `graph_edges.jsonl` | — | parseable JSONL |
| `reports/pipeline_audit.json` | — | all gates `ok` |

```bash
node examples/immeuble/scripts/run-immeuble-import.mjs \
  --skip-preflight --skip-provenance-validation
```

## Étape 4 — Apply import (gates 5–6)

```bash
npm run immeuble:import
```

| Filesystem | DB | Vérification |
|------------|-----|--------------|
| `import_ready/mfo_facets_import.csv` | `agent_facts` | `schema_id` starts with `immeuble:` |
| `import_ready/graph_edges_import.csv` | `entities_raw`, `relations_raw` | counts > 0 |
| `reports/schema-id-prefix-check.json` | — | `ok: true` |
| `reports/immeuble-import-scenario.json` | — | full scenario evidence |

Expected counts (narrative Tilleuls/Érables): see [`success-criteria.yaml`](success-criteria.yaml).

## Étape 5 — Reindex

| Filesystem | DB | Vérification |
|------------|-----|--------------|
| `reports/reindex.json` | `graph_entity`, `graph_relation`, facet postings | `graph_projected > 0` |
| — | BM25 / facet indexes | `ghostcrab_graph_search` query `appartement` ≥ 13 |

## Étape 6 — Projections

| Filesystem | DB | Vérification |
|------------|-----|--------------|
| `contracts/projection_catalog.yaml` | — | 1 analysis_plan + 3 live_answer_view |
| `contracts/answer_artifacts.seed.jsonl` | `mindbrain_answer_artifacts` (after load) | artifact ids listed |
| `contracts/business_capabilities.seed.jsonl` | `agent_facts` (`ghostcrab:business-capability`) | router live routes (see below) |
| `reports/projection_audit_immeuble.json` | — | registry matches catalog + coverage facets/edges/schemas |

```bash
node examples/immeuble/scripts/starterkit/analyze-projection-candidates.mjs --db "$GHOSTCRAB_SQLITE_PATH" --workspace immeuble --projection-catalog contracts/projection_catalog.yaml --model-contract contracts/model_contract.json --output-dir reports --include-blind-spots --include-jtbd
node examples/immeuble/scripts/starterkit/audit-ghostcrab-projections.mjs --db "$GHOSTCRAB_SQLITE_PATH" --workspace immeuble --model contracts/model_contract.json --answer-artifacts-seed contracts/answer_artifacts.seed.jsonl --output-dir reports
gcp brain artifact list --workspace-id immeuble --kind live_answer_view
gcp brain artifact refresh live_answer_view__annuaire_coproprietes
```

### Business query router (Option A)

Load registered capabilities so `ghostcrab_business_query_answer` can route immeuble questions in SQLite-only mode (without relying on `mindbrain_answer_artifacts`):

```bash
node bin/gcp.mjs load examples/immeuble/contracts/business_capabilities.seed.jsonl --workspace immeuble
# or via reset / live lab:
node examples/immeuble/scripts/reset-immeuble-workspace.mjs --with-business-capabilities
examples/immeuble/scripts/run-immeuble-live-lab.sh --with-business-capabilities
pnpm test:integration -- tests/integration/immeuble-business-query.test.ts
```

Convention: each record requires `workspace_id`, `availability` (`live_answer_view`), and `activation_status` (`active`) in `facets`. Verification: `tests/integration/immeuble-business-query.test.ts`.

For a future `live_query` path (Option B — core router + model facets), see [plan détaillé](../../docs/plan/2026-06-14-plan-adaptation-demo-immeuble-business-query.md#4-plan-dimplémentation--option-b-suivi-pour-atteindre-live_query).

## Étape 7 — Bundle final

```bash
export GHOSTCRAB_SQLITE_PATH="$PWD/data/immeuble.sqlite"
node bin/gcp.mjs load examples/immeuble/bundle/immeuble.bundle.json \
  --workspace immeuble --reindex all
```

| Filesystem | DB | Vérification |
|------------|-----|--------------|
| `bundle/immeuble.bundle.json` | full workspace reload | same entity counts as step 4 |
| `reports/consumer_contract.validation.json` | — | consumer workspace = `immeuble` |

## Hybrid engine compare (CI)

```bash
node examples/immeuble/scripts/run-immeuble-import.mjs \
  --apply --engine both --skip-preflight --skip-provenance-validation \
  --compare-output examples/immeuble/reports/hybrid-compare.json
```

Expect `compare.deltas` = 0 on facet/edge counters.

## Agent path (optional)

Prompts for MCP-driven reconstruction: [`sources/agent-prompts/prompts/`](sources/agent-prompts/prompts/)

Same success thresholds: [`success-criteria.yaml`](success-criteria.yaml)
