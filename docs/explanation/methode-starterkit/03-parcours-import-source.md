# 03 — Parcours import source (SOP5 × Personal)

Scénario : importer une source externe et tracer l'effet sur **`agent_facts`**, qualification docs, graphe raw/runtime, projections Type A/B, et consommateurs.

Aligné sur [`SOP5_source_import_compiler.md`](../../../../starter-kit-ghostcrab-perso/starterkit/SOP5_source_import_compiler.md) et [05 — Réindexation](../04-reindexation-ghostcrab.md).

---

## Pipeline canonique

```text
source externe
  → Gate 0 : ghostcrab_status + workspace
  → Gate 1 : modèle cible (export / mvp_core_contract.yaml)
  → Gate 2 : source_profile.yaml
  → Gate 3 : mapping_external_to_canonical.yaml
  → Gate 4 : normalized_records.jsonl / normalized_edges.jsonl
             + pending_review.json + pending_ddl.json
  → Gate 5 : agent_facts (remember / upsert / plan import_facets.mjs)
  → Gate 6 : graph_entity / graph_relation (+ reindex si raw)
  → Gate 7 : projections Type A (project / pack)
  → Gate 8 : consumer_contract.yaml
  → Gate 9 : import_manifest.yaml + audit_import_pipeline.mjs
```

**Hors SOP5 mais Personal :** qualification documentaire (`document-qualify` → `facet_assignments_raw` → `ghostcrab_collection_reindex`) — voir [04 § Qualification](../03-memoire-mcp-facettes-graphe-projections.md).

---

## Étape par étape

### Gate 0 — Runtime

- `ghostcrab_status` : backend, workspace, catalog outils
- Personal : SQLite `:8091`, pas le smoke « 24 tools » du QUICKSTART Pro

### Gates 1–4 — Comprendre et mapper (sans écriture)

| Gate | Artefact | Scripts StarterKit |
|------|----------|-------------------|
| 1 | contrat modèle | `export_model_contract.mjs` |
| 2 | `source_profile.yaml` | `profile_source.mjs`, `validate_source_profile.mjs` |
| 3 | `mapping_external_to_canonical.yaml` | `validate_mapping_contract.mjs` |
| 4 | JSONL + pending | `transform_source_to_jsonb.mjs`, `write_pending_files.mjs` |

Décision par champ (mapping) :

| Destination | Table / outil |
|-------------|---------------|
| Fait textuel agent | **`agent_facts`** via upsert/remember |
| Label doc/chunk | **`facet_assignments_raw`** (CLI qualify) |
| Entité métier | **`entities_raw`** → reindex → `graph_entity` |
| Relation | **`relations_raw`** → reindex → `graph_relation` |
| Contexte agent | **`projections`** (Type A) |
| Snapshot analytique | pipeline → **`ProjectionResult`** (Type B) |
| Ambigu / gap modèle | `pending_review` / `pending_ddl` |

### Gate 5 — Faits agent

| Volume | Voie |
|--------|------|
| Petit | `ghostcrab_remember` / `ghostcrab_upsert` |
| Batch | plan JSONL de `import_facets.mjs` → exécution MCP manuelle |

Effet :

- **`agent_facts`** modifié ;
- FTS rattrapé au search/pack ([05 §6](../04-reindexation-ghostcrab.md)) ;
- graphe et projections **inchangés**.

### Gate 6 — Graphe

Si `consumer_contract` exige `native_graph: true` :

| Voie | Effet |
|------|-------|
| `ghostcrab_learn` | runtime + miroir raw immédiat ; adjacence partielle |
| raw SQL / import bundle | **`ghostcrab_graph_reindex`** requis |
| `materialize_graph_from_edges.mjs` | staging JSONL → puis learn ou reindex |

Scripts : `materialize_graph_from_edges.mjs`, `validate_graph_contract.mjs`.

`ghostcrab_pack` **ne voit toujours pas** le graphe.

### Gate 7 — Projections

| Besoin | Action |
|--------|--------|
| Contexte agent | `ghostcrab_project` → `ghostcrab_pack` |
| Snapshot Type B | pipeline opérateur → `ghostcrab_projection_get` |

Aucune sync auto si Gate 5 ou 6 change ensuite.

### Gates 8–9 — Consommateurs et manifest

[`validate_consumer_contract.mjs`](../../../../starter-kit-ghostcrab-perso/starterkit/scripts/validate_consumer_contract.mjs) :

| Consumer (template) | Prouve | Ne prouve pas |
|---------------------|--------|---------------|
| `ghostcrab-agent` + pack | Type A + faits searchables | Graphe complet |
| `ghostcrab_search` | **`agent_facts`** | `graph_entity` |
| `sigma-graphology` + HTTP | nodes/edges runtime | pack à jour |

[`audit_import_pipeline.mjs`](../../../../starter-kit-ghostcrab-perso/starterkit/scripts/audit_import_pipeline.mjs) agrège les rapports ; échoue si un rapport `ok: false` ou fichier manquant.

---

## Scénarios d'update (après import)

| Update | Tables touchées | Reindex / refresh |
|--------|-----------------|-------------------|
| `remember` / `upsert` | `agent_facts` | FTS auto ; Type A manuel si résumé stale |
| `document-qualify` | `facet_assignments_raw` | **`collection_reindex`** |
| raw `entities_*` / SQL | raw | **`graph_reindex`** |
| `learn` | raw + runtime | adjacence : graph_reindex si traverse faux |
| `project` | `projections` | — |
| changement métier après Type B | graphe OK | regénérer pipeline Type B |

Détail : [05 §5](../04-reindexation-ghostcrab.md).

---

## Avocat du diable — scénarios qui échouent silencieusement

1. **Gate 5 seul + consumer `native_graph: true`** — search OK, graphe vide, manifest pourtant « facets OK ».
2. **Runtime `graph_entity` édité à la main** — traverse OK, raw/export divergent, reindex écrase.
3. **Plan `import_facets.mjs` non exécuté** — rapport Gate 5 vert en dry-run, DB vide.
4. **Qualify sans `collection_reindex`** — raw assignments OK, filtres collection vides (StarterKit ne couvre pas cette gate).
5. **Type B après learn** — graphe live OK, `projection_get` renvoie un snapshot périmé.
6. **HTTP graph viewer (:5174)** — checks consumer template supposent une UI ; absente en headless Personal.

---

## Règle finale

Une source n'est « prête » que lorsque **chaque consommateur déclaré** dans `consumer_contract.yaml` passe — pas quand un seul outil (souvent `pack` ou `search`) répond.

Trois surfaces de lecture : **faits agent**, **graphe**, **projections**. Une seule verte ≠ les deux autres.

Suite : [05 — Écarts StarterKit ↔ Personal](05-ecarts-starterkit-personal.md)
