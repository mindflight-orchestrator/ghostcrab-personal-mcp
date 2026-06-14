# Immeuble — exemple canonique GhostCrab

Unique domain example for the GhostCrab Personal methodology. Structure mirrors [MVP_Serenity_2](https://github.com/mindflight-orchestrator/ghostcrab-personal-mcp) (model → CSV → import_ready → reports → bundle).

**Workspace:** `immeuble`  
**Ontology:** `immeuble::core` ([`ontologies/immeuble/core.yaml`](../../ontologies/immeuble/core.yaml))

## Quick start

```bash
# 1) Generate fake_data, import_ready, reports from bundle
npm run immeuble:build

# 2) Dry-run structured import
node examples/immeuble/scripts/run-immeuble-import.mjs --skip-preflight --skip-provenance-validation

# 3) Apply + reindex + prefix checks
npm run immeuble:import

# 4) Load full bundle (documents + graph + projections seed)
export GHOSTCRAB_SQLITE_PATH="$PWD/data/immeuble.sqlite"
node bin/gcp.mjs load examples/immeuble/bundle/immeuble.bundle.json \
  --workspace immeuble --reindex all

# 5) Audit projections registry
npm run immeuble:verify   # acceptance criteria (filesystem + optional --db)
npm run immeuble:reset -- --db /tmp/immeuble-test/immeuble.sqlite  # workspace propre
```

Pour le mode live (backend+snapshots), il existe un wrapper dédié :
```bash
npm run immeuble:backend:run -- \
  --db /tmp/immeuble-lab/immeuble.sqlite \
  --ready-timeout 40
```
Ou directement :
```bash
bash examples/immeuble/scripts/run-immeuble-backend.sh \
  --db /tmp/immeuble-lab/immeuble.sqlite \
  --ready-timeout 40
```
Il lance le binaire `ghostcrab-backend` en standalone HTTP (via `env GHOSTCRAB_*=...`),
retourne `BACKEND_PID`, `BACKEND_URL` et `BACKEND_LOG`, puis laisse le processus tourner.

Hybrid legacy/compare:

```bash
node examples/immeuble/scripts/run-immeuble-import.mjs \
  --apply --engine both --skip-preflight --skip-provenance-validation \
  --compare-output examples/immeuble/reports/hybrid-compare.json
```

### Orchestrer tout le pipeline avec DB fraîche + backups de progression

```bash
bash examples/immeuble/scripts/run-immeuble-live-lab.sh \
  --db /tmp/immeuble-lab/immeuble.sqlite \
  --engine both \
  --with-projection-plan \
  --projection-strict \
  --with-artifact-seed \
  --with-live-verify \
  --stop-after live_verify
```

Le script :
- démarre le backend local `ghostcrab-backend` en mode standalone HTTP (`:8091` par défaut),
- exécute les étapes `build → projection_plan → import → artifact_seed → audit (StarterKit) → verify → live_verify` (et `bundle` si demandé),
- fait un snapshot SQLite après chaque étape (`.sqlite`, `-.wal`, `-.shm` quand présents),
- permet d’évaluer la progression entre chaque snapshot.

C’est bien un pipeline via les outils **HTTP (gcp + scripts Immeuble)** contre un backend en marche, pas des appels standalone directs sur sqlite depuis les scripts.

Comparer deux snapshots :

```bash
npm run immeuble:compare:snapshots -- \
  --from data/immeuble-lab-backups/20260614-120101-00-start.sqlite \
  --to data/immeuble-lab-backups/20260614-120223-import.sqlite \
  --workspace immeuble \
  --label-a start --label-b import
```

Version JSON (utile pour rapporter l’évolution dans un script CI) :

```bash
npm run immeuble:compare:snapshots -- \
  --from data/immeuble-lab-backups/20260614-120101-00-start.sqlite \
  --to data/immeuble-lab-backups/20260614-120223-import.sqlite \
  --workspace immeuble \
  --json --out /tmp/immeuble-compare.json
```

## Layout

| Path | Role |
|------|------|
| [`sources/documents/`](sources/documents/) | Raw markdown corpus (Tilleuls / Érables narrative) |
| [`sources/agent-prompts/`](sources/agent-prompts/) | Optional agent reconstruction prompts |
| [`model/immeuble_model.json`](model/immeuble_model.json) | Global entity/edge contract |
| [`contracts/`](contracts/) | Mapping, consumer contract, projection catalog, answer seeds |
| [`fake_data/`](fake_data/) | One CSV per entity type (generated) |
| [`import_ready/`](import_ready/) | `mfo_facets_import.csv` + `graph_edges_import.csv` |
| [`reports/`](reports/) | Step checkpoints (JSON/JSONL) |
| [`bundle/immeuble.bundle.json`](bundle/immeuble.bundle.json) | Importable workspace snapshot |
| [`gap-rules/`](gap-rules/) | Gap diagnostics curriculum (optional) |
| [`scripts/`](scripts/) | Build, import, audit runners |

## Methodology

Step-by-step walkthrough: [`index.md`](index.md)  
Voir aussi : [`CHECKLIST.md`](CHECKLIST.md) · [`ACCEPTANCE.yaml`](ACCEPTANCE.yaml)

## Success criteria

Counts and graph checks: [`success-criteria.yaml`](success-criteria.yaml)
