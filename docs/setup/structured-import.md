# Structured Import Runbook

Operator guide for tabular data import (CSV, JSON, JSONL, YAML, XLSX, TOON) into
MindBrain SQLite via `gcp brain structured-import`.

For unstructured documents (PDF, HTML), use [document-import.md](./document-import.md).

## Stack contract (non-negotiable)

| Layer | Repo | Language | Responsibility |
|-------|------|----------|----------------|
| CLI / orchestration | `ghostcrab-personal-mcp` | **npm / Node** (`.mjs`) | `gcp brain structured-import`, SQLite path resolution, backend preflight, lab scripts |
| Engine | `vendor/mindbrain` | **Zig only** | Parse, validate, semantics register, project, write raw/facts, reindex |
| Domain reference | Private bundles (optional) | varies | Large customer-specific fixtures — not shipped in OSS |

Node wrappers spawn `ghostcrab-document` (MindBrain standalone tool). They do not parse
tabular payloads or write SQLite directly.

The OSS bundled demo lives under `examples/immeuble/structured-import/`. Larger domain
bundles may exist in private repos; they are not required to run the smoke tests.

## Prerequisites

Same as document import:

```bash
npm install
npm run build
node bin/gcp.mjs authorize
export GHOSTCRAB_SQLITE_PATH="$PWD/data/ghostcrab.sqlite"
```

Stop MCP / `ghostcrab-backend` before database-backed commands (or pass `--force`).

## Immeuble structured-import demo

Bundled example at `examples/immeuble/structured-import/`:

- `contracts/immeuble_structured_import_model.json` — entity types (copropriete, personne, lot)
- `contracts/mapping_external_to_canonical.json` — column → facet / edge rules (`data_plane: import_ready`)
- `contracts/mapping_external_to_canonical_ws.json` — same mapping with `data_plane: ws` for Phase D apply
- `contracts/mapping_external_to_canonical.yaml` — human-readable twin
- `contracts/source_profile.yaml` — source file inventory
- `contracts/consumer_contract.yaml` — expected MCP queries after import
- `fixtures/import_ready/` — pre-built facet and graph edge CSVs
- `fixtures/fake_data/` — per-entity CSV staging files

Workspace id: `immeuble-structured-import`.

## Phase 3 pipeline (forward-only)

Structured import is **one-way**: tabular source → semantics (control plane) → raw facts/entities/relations → reindex → graph + search. Edits via MCP (`ghostcrab_remember`, graph patches) do **not** write back to staging CSVs.

```
CSV/JSON/JSONL/TOON/XLSX  →  infer / register-semantics  →  table_semantics + source_mappings
import_ready   →  apply                       →  agent_facts + entities_raw + relations_raw + provenance
raw            →  reindex (--scope all)       →  graph_entity/graph_relation + agent_facts FTS
```

Physical workspace tables (`ws_*`) are optional Phase D staging; `apply` reads them when
`mapping.data_plane` is `"ws"`. Semantics + raw layers remain the source of truth.

## Commands

```bash
# Validate model + mapping + fixtures (no DB)
gcp brain structured-import validate \
  --model examples/immeuble/structured-import/contracts/immeuble_structured_import_model.json \
  --mapping examples/immeuble/structured-import/contracts/mapping_external_to_canonical.json \
  --input examples/immeuble/structured-import/fixtures

# Infer SemanticProposal JSON (no DB)
gcp brain structured-import infer \
  --model examples/immeuble/structured-import/contracts/immeuble_structured_import_model.json \
  --mapping examples/immeuble/structured-import/contracts/mapping_external_to_canonical.json \
  --output /tmp/infer.json

# Register semantics in SQLite (control plane)
gcp brain structured-import register-semantics \
  --workspace-id immeuble-structured-import \
  --model examples/immeuble/structured-import/contracts/immeuble_structured_import_model.json \
  --mapping examples/immeuble/structured-import/contracts/mapping_external_to_canonical.json

# Dry-run: report counts without writing
gcp brain structured-import dry-run \
  --facets examples/immeuble/structured-import/fixtures/import_ready/mfo_facets_import.csv \
  --edges examples/immeuble/structured-import/fixtures/import_ready/graph_edges_import.csv

# Apply import-ready CSVs to SQLite (reset | append | ignore-duplicates)
gcp brain structured-import apply \
  --workspace-id immeuble-structured-import \
  --mode append \
  --mapping examples/immeuble/structured-import/contracts/mapping_external_to_canonical.json \
  --facets examples/immeuble/structured-import/fixtures/import_ready/mfo_facets_import.csv \
  --edges examples/immeuble/structured-import/fixtures/import_ready/graph_edges_import.csv

# Project entity CSVs through mapping → facts + raw graph
gcp brain structured-import project \
  --workspace-id immeuble-structured-import \
  --model examples/immeuble/structured-import/contracts/immeuble_structured_import_model.json \
  --mapping examples/immeuble/structured-import/contracts/mapping_external_to_canonical.json \
  --input examples/immeuble/structured-import/fixtures/fake_data \
  --mode append

# Reindex derived graph and agent_facts FTS
gcp brain structured-import reindex \
  --workspace-id immeuble-structured-import \
  --scope all

# Validate provenance coherence after apply
gcp brain structured-import validate-provenance \
  --workspace-id immeuble-structured-import

# Infer column profile from a CSV (no DB)
gcp brain structured-import profile \
  --input examples/immeuble/structured-import/fixtures/fake_data/copropriete.csv \
  --output /tmp/copropriete.profile.json
```

### StarterKit bridge (`kit`)

`gcp brain structured-import kit` executes a StarterKit-compatible pipeline and can end
at CSV generation only or at full DB apply.

```bash
# 1) Préparation + audit (sans apply DB)
gcp brain structured-import kit \
  --workspace-id immeuble-structured-import \
  --input examples/immeuble/structured-import/fixtures/fake_data \
  --mapping examples/immeuble/structured-import/contracts/mapping_external_to_canonical.json \
  --starterkit-root /path/to/starter-kit-ghostcrab-perso/starterkit \
  --expect-taxonomy administrative:FormuleService,administrative:StatutMandatGestion

# 2) Préparation + register-semantics + apply + reindex
gcp brain structured-import kit \
  --workspace-id immeuble-structured-import \
  --input examples/immeuble/structured-import/fixtures/fake_data \
  --model examples/immeuble/structured-import/contracts/immeuble_structured_import_model.json \
  --mapping examples/immeuble/structured-import/contracts/mapping_external_to_canonical.json \
  --starterkit-root /path/to/starter-kit-ghostcrab-perso/starterkit \
  --apply
```

- `--input` peut être un dossier ou un fichier (`.csv`, `.json`, `.jsonl`).
- `--expect-taxonomy` fait échouer vite si le mapping ne contient pas ces préfixes attendus.
- `--output-dir` préserve les artefacts (`normalized_records.jsonl`, `pending_review.json`, `pipeline_audit.json`, ...).
- Sans `--apply`, le pipeline écrit uniquement les artefacts de préparation.
- Avec `--apply`, la commande lance `register-semantics`, `apply`, puis `reindex` (scope par défaut: `all`) et `validate-provenance`.

### Orchestration générique (manifestes de projet)

`scripts/run-structured-import-system.mjs` permet de piloter plusieurs projets avec un même flux.

```bash
node scripts/run-structured-import-system.mjs \
  --manifest docs/explanation/methode-starterkit/structured-import-system.example.yaml \
  --apply
```

- `--manifest` : manifeste YAML/JSON (source, mapping, ontologie, options `kit`)
- `--apply` : active l’écriture DB (sans flag, préparation seule)
- `--workspace-id` : override du manifeste
- `--db` : chemin SQLite explicite

Le runner exécute en série : validate (si possible) → kit (artefacts) → apply/reindex (si demandé).

## Import modes

| Mode | Behaviour |
|------|-----------|
| `reset` | Delete rows tagged `metadata_json.source = structured_import` (legacy `fake_data` and `serenity_structured_import` also purged), then insert |
| `append` | Upsert by `source_ref` (facts) and `external_id` (raw graph) |
| `ignore-duplicates` | Skip rows when `source_ref` / `external_id` already exists |

## Edges mode (mapping contract)

| Value | Behaviour |
|-------|-----------|
| `derived` | Relations from facet `ref` columns via `contract_relations` only |
| `provided` | Relations from `graph_edges_import.csv` only |
| `merge` | Both derived and provided |

## Raw-first pipeline

Structured import writes durable raw layers, then reindex builds derived tables:

1. `table_semantics` / `column_semantics` / `relation_semantics` / `source_mappings` — control plane (via `register-semantics`)
2. `agent_facts` — searchable facet records (MCP `ghostcrab_search`); FTS synced on `--scope facets|all`
3. `entities_raw` / `relations_raw` — graph source of truth (entities upserted from every facet row)
4. `structured_import_provenance` — links `source_ref` ↔ `fact_id` ↔ `entity_external_id`
5. `reindex` → `graph_entity` / `graph_relation` (+ adjacency)

See [04-reindexation-ghostcrab.md](../explanation/04-reindexation-ghostcrab.md).

## Smoke test

```bash
npm run structured-import:smoke
```

Runs: validate → infer → register-semantics → apply (with mapping) → reindex `--scope all` → validate-provenance → audit-orphans.

Optional Phase D (`ws_*` staging tables + apply from `data_plane=ws`):

```bash
STRUCTURED_IMPORT_PHASE_D=1 npm run structured-import:smoke
```

Runs additional steps: `ddl-propose` → `ddl-execute` → `load-ws` → `apply` (mapping with `data_plane=ws`) → reindex `--scope provenance`.

Golden semantic proposal check:

```bash
npm run verify:semantic-golden
```

## Single-writer runbook

- Run **one** structured-import writer per `workspace_id` at a time. Do not parallelize `register-semantics`, `apply`, `load-ws`, or `ddl-execute` against the same SQLite file.
- Required order: `register-semantics` → `apply` (or Phase D: `ddl-propose` → `ddl-execute` → `load-ws` → apply with `data_plane=ws`).
- Use `--require-semantics` on `apply` to fail fast when `table_semantics` is missing (provenance `table_id` would be null).
- Optional lock: set `GHOSTCRAB_IMPORT_LOCK=/path/to/pidfile` in operator scripts to serialize imports (convention only; not enforced by the engine yet).
- Stop MCP / backend before DB writes unless `--force` (preflight checks SQLite is not locked by the server).

## Related

- [document-import.md](./document-import.md) — PDF/HTML corpus pipeline
- [03 — Méthode StarterKit](../explanation/methode-starterkit/03-methode-starterkit.md) — SOP5 gates
- [07-kit-structured-import.md](../explanation/methode-starterkit/07-kit-structured-import.md) — full decomposition: mapping gates + JSON/JSONL flow
- `examples/immeuble/structured-import/README.md` — bundle layout
