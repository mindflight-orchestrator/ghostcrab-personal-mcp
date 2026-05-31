# 02 — Méthode StarterKit (précision)

Référence : [`starter-kit-ghostcrab-perso/starterkit/`](../../../../starter-kit-ghostcrab-perso/starterkit/).

Le StarterKit force un enchaînement **gates deterministes** (SOP5 §3) avant et après écriture. Ce document mappe ce flux sur le vocabulaire Personal.

---

## Phases QUICKSTART → SOP

Source : [`QUICKSTART.md`](../../../../starter-kit-ghostcrab-perso/starterkit/QUICKSTART.md)

| Phase | SOP | Objectif | Signal de succès StarterKit |
|-------|-----|----------|----------------------------|
| **A** | SOP4 | Env GhostCrab joignable | `ghostcrab_status` OK, outils visibles |
| **B** | SOP1 + SOP2 | Modèle / ontologie / workspace | `ghostcrab_workspace_inspect`, `ghostcrab_coverage` baseline |
| **C** | SOP2 §7 + SOP3 | Vault Obsidian → PostgreSQL COPY | `ghostcrab_coverage` ≥ 80 % schemas cœur |
| **C2** | SOP5 | CSV/API/JSON → compilation générique | manifest sans exceptions bloquantes + consumers OK |

**Adaptation Personal :** Phase A = backend SQLite sur `:8091`, pas Docker PostgreSQL. Phase C COPY → remplacer par `gcp brain document`, `backup-load`, ou écriture raw + reindex ([04](../04-reindexation-ghostcrab.md)).

---

## Pipeline SOP5 (9 gates)

Source : [`SOP5_source_import_compiler.md`](../../../../starter-kit-ghostcrab-perso/starterkit/SOP5_source_import_compiler.md) §3

```text
Gate 0  runtime / workspace autorisé
Gate 1  modèle cible (export ou mvp_core_contract.yaml)
Gate 2  source_profile.yaml
Gate 3  mapping_external_to_canonical.yaml
Gate 4  dry-run → normalized_*.jsonl + pending_*
Gate 5  import faits (MCP ou batch)
Gate 6  graphe si native_graph: true
Gate 7  projections (pack, scopes)
Gate 8  consumer_contract.yaml
Gate 9  import_manifest.yaml
```

### Traduction Personal par gate

| Gate | StarterKit | Personal SQLite |
|------|------------|-----------------|
| **0** | PostgreSQL ou « SQLite PERSO » (SOP5) | `ghostcrab_status`, workspace actif ; ** ignorer** la note QUICKSTART « PostgreSQL only » pour ce repo |
| **1** | `ghostcrab_workspace_export_model` | `ghostcrab_schema_inspect`, LinkML compile, ou `mvp_core_contract.yaml` local |
| **2–4** | scripts `profile_source`, `transform_source_to_jsonb`, `write_pending_files` | identique — sorties JSONL/JSON, pas d'écriture DB |
| **5** | `import_facets.mjs` → plan `ghostcrab_upsert` | écrit **`agent_facts`** (via upsert/remember), pas `facet_assignments_raw` |
| **6** | `materialize_graph_from_edges.mjs` + learn/SQL | `entities_raw`/`relations_raw` + **`ghostcrab_graph_reindex`**, ou `ghostcrab_learn` |
| **7** | `ghostcrab_pack`, scopes | Type A ; Type B = pipeline `ProjectionResult` séparé ([05](../05-projections-expliquees.md)) |
| **8** | `validate_consumer_contract.mjs` | checks MCP + HTTP graph viewer — **voir [05](05-ecarts-starterkit-personal.md)** pour limites |
| **9** | `audit_import_pipeline.mjs` | agrège les rapports JSON de chaque script |

---

## Scripts StarterKit (inventaire exact)

Répertoire : [`starterkit/scripts/`](../../../../starter-kit-ghostcrab-perso/starterkit/scripts/)

| Script | Rôle |
|--------|------|
| `profile_source.mjs` | Gate 2 — profile CSV/JSON/API |
| `validate_source_profile.mjs` | Valide le profil |
| `export_model_contract.mjs` | Gate 1 — export contrat modèle |
| `validate_mapping_contract.mjs` | Gate 3 |
| `transform_source_to_jsonb.mjs` | Gate 4 — records/edges normalisés |
| `write_pending_files.mjs` | Gate 4 — pending_review / pending_ddl |
| `import_facets.mjs` | Gate 5 — **dry-run** plan `ghostcrab_upsert` (pas d'écriture MCP native dans le script) |
| `materialize_graph_from_edges.mjs` | Gate 6 — staging graph_nodes/edges JSONL |
| `validate_graph_contract.mjs` | Gate 6 — counts, labels, endpoints |
| `validate_consumer_contract.mjs` | Gate 8 |
| `update_syncstate.mjs` | Incrémentalité |
| `audit_import_pipeline.mjs` | Gate 9 — synthèse |
| `generate_copy_migrations.mjs` | **Pro PostgreSQL** — non applicable Personal |

Point de précision : `import_facets.mjs` avec `--write` **lève une erreur** — le kit génère un plan JSONL à exécuter via l'hôte MCP, pas un import silencieux.

---

## Templates YAML

| Template | Gate | Question d'audit |
|----------|------|------------------|
| [`source_profile.yaml`](../../../../starter-kit-ghostcrab-perso/starterkit/templates/source_profile.yaml) | 2 | Forme, ids stables, enums, relations candidates |
| [`mapping_external_to_canonical.yaml`](../../../../starter-kit-ghostcrab-perso/starterkit/templates/mapping_external_to_canonical.yaml) | 3 | Champ source → `schema_id`, facet, edge, pending |
| [`consumer_contract.yaml`](../../../../starter-kit-ghostcrab-perso/starterkit/templates/consumer_contract.yaml) | 8 | Par consommateur : facets / projections / native_graph |
| [`import_manifest.yaml`](../../../../starter-kit-ghostcrab-perso/starterkit/templates/import_manifest.yaml) | 9 | Commandes, counts, exceptions |
| [`mvp_core_contract.yaml`](../../../../starter-kit-ghostcrab-perso/starterkit/templates/mvp_core_contract.yaml) | 1 | Types entité, arêtes, enums |

Règle [`consumer_contract.yaml`](../../../../starter-kit-ghostcrab-perso/starterkit/templates/consumer_contract.yaml) :

```yaml
readiness_rules:
  - "A successful ghostcrab_pack check does not prove graph-viewer readiness."
```

---

## Trois opérations à ne pas mélanger (SOP5 §1)

1. **Comprendre la source** — profile + mapping
2. **Décider le modèle cible** — ontologie / contrat
3. **Écrire dans GhostCrab** — gates 5–6 + reindex si raw

Confusion fréquente : Gate 5 « import facets » ≠ qualification documentaire (`facet_assignments_raw`) ≠ graphe métier.

---

## Matrice gates ↔ explications architecture

| Gate | Valide surtout | Doc architecture |
|------|----------------|------------------|
| 5 | `agent_facts`, search/pack | [03 § Faits agent](../03-memoire-mcp-facettes-graphe-projections.md) |
| 6 | `graph_entity`, traverse | [03 § Graphe](../03-memoire-mcp-facettes-graphe-projections.md), [04 § reindex](../04-reindexation-ghostcrab.md) |
| 7 | `projections`, pack | [05 § Type A](../05-projections-expliquees.md) |
| — | *(absent du StarterKit)* | Type B `ProjectionResult`, qualify → `collection_reindex` |
| 8 | consommateurs croisés | [05 decision guide](../05-projections-expliquees.md) |

Suite : [03 — Parcours import source](03-parcours-import-source.md)
