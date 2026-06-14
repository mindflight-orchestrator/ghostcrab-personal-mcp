# Immeuble — checklist exécutable

Prérequis : backend MindBrain joignable (`ghostcrab_status` OK), Node ≥ 20, `sqlite3` CLI optionnel (checks DB).

Variables :

```bash
export GHOSTCRAB_SQLITE_PATH="$PWD/data/immeuble.sqlite"
export GHOSTCRAB_MINDBRAIN_URL="${GHOSTCRAB_MINDBRAIN_URL:-http://127.0.0.1:8091}"
```

Critères chiffrés : [`ACCEPTANCE.yaml`](ACCEPTANCE.yaml)  
Vérification auto : `npm run immeuble:verify`

---

## Phase 0 — Préconditions

| # | Action | Post-condition OK | KO si |
|---|--------|-------------------|-------|
| 0.1 | `ghostcrab_status` | `ok: true`, tools visibles | backend down |
| 0.2 | Branche + submodule | `vendor/mindbrain` ≥ 549c39f | mismatch binaire |

---

## Phase 1 — Build (filesystem only)

| # | Commande | Artefacts | Post-condition |
|---|----------|-----------|----------------|
| 1.1 | `npm run immeuble:build` | `fake_data/*.csv` (≥19), `import_ready/*`, `reports/01-model.validation.json` | `pipeline_audit.ok=true`, facet_rows=131, edge_rows=265 |
| 1.2 | `npm run immeuble:verify` | `reports/acceptance.validation.json` | all checks ok (sans DB) |

**Tables DB touchées :** aucune

---

## Phase 2 — Dry-run import

| # | Commande | Post-condition |
|---|----------|----------------|
| 2.1 | `node examples/immeuble/scripts/run-immeuble-import.mjs --skip-preflight --skip-provenance-validation` | plan summary facet_rows>0, edge_rows>0 |

**Tables DB :** aucune écriture

---

## Phase 3 — Reset + apply (workspace propre)

| # | Commande | Post-condition |
|---|----------|----------------|
| 3.1 | `npm run immeuble:reset -- --db /tmp/immeuble-test/immeuble.sqlite` | DB fraîche isolée (recommandé si backend actif) |
| 3.1b | `npm run immeuble:reset` | DB `data/immeuble.sqlite` (requiert `--force` si backend sur même fichier) |

**Post-conditions DB (`ACCEPTANCE.yaml`) :**

- `agent_facts` ≥ 131, tous `schema_id` préfixés `immeuble:`
- `relations_raw` ≥ 265
- `graph_entity` > 0 après reindex

---

## Phase 4 — Hybrid compare (optionnel CI)

```bash
node examples/immeuble/scripts/run-immeuble-import.mjs \
  --apply --engine both --skip-preflight --skip-provenance-validation \
  --db /tmp/immeuble-hybrid.sqlite \
  --compare-output examples/immeuble/reports/hybrid-compare.json
npm run immeuble:verify -- --require-hybrid
```

**OK si :** deltas legacy/hybrid = 0 sur facets/edges/entities

---

## Phase 5 — Projections (surface minimale garantie)

Surface documentée dans `ACCEPTANCE.yaml` → section `projections` :

| artifact_id | kind |
|-------------|------|
| `analysis_plan__immeuble_competency_questions` | analysis_plan |
| `live_answer_view__annuaire_coproprietes` | live_answer_view |
| `live_answer_view__baux_actifs` | live_answer_view |
| `live_answer_view__quotites_par_immeuble` | live_answer_view |

| # | Commande | Post-condition |
|---|----------|----------------|
| 5.1 | `npm run immeuble:reset -- --with-artifact-seed` | seeds chargés |
| 5.2 | `gcp brain artifact list --workspace-id immeuble --kind live_answer_view` | ≥3 ids listés |
| 5.3 | `gcp brain artifact refresh live_answer_view__annuaire_coproprietes` | POST 200, lifecycle mis à jour |
| 5.4 | `npm run immeuble:audit` | consumer_contract workspace = immeuble |

---

## Phase 6 — Bundle reload

```bash
npm run immeuble:reset -- --with-bundle-load --keep-db
# ou
node bin/gcp.mjs load examples/immeuble/bundle/immeuble.bundle.json \
  --workspace immeuble --reindex all
npm run immeuble:verify -- --require-bundle
```

**OK si :** counts bundle = counts post-import (entities ≥131, documents=7)

---

## Rollback local

```bash
git restore --worktree --source=HEAD .
# artefacts : reports/*.json datés, DB : rm data/immeuble.sqlite
```

Legacy fallback : `--engine legacy` (défaut) ; hybrid via `--engine both` sans supprimer legacy.

---

## Definition of Done (résumé)

- [x] `npm run immeuble:build && npm run immeuble:verify` → ok
- [x] `npm run immeuble:reset` → ok
- [x] `--engine both` → hybrid deltas 0 (CI)
- [x] 3 live_answer_view + 1 analysis_plan seedés/listés + refresh live (`immeuble:verify:live`)
- [ ] bundle reload → counts stables
