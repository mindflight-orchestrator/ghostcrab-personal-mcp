# Validation MECE — tranches `ghostcrab-docs`

Checklist exécutable pour les ontologies LinkML épistémiques dérivées de [docs/explanation](../README.md) et [docs/methodology](../../methodology/universal_methodology.md).

Références : [term-slice-matrix.md](term-slice-matrix.md) · [diagrams/](diagrams/) · skill [ghostcrab-data-architect](../../../ghostcrab-skills/codex/ghostcrab-data-architect/SKILL.md).

---

## Partition MECE (résumé)

| Tranche | Fichier | Périmètre exclusif |
|---------|---------|-------------------|
| memory-model | `linkml/ghostcrab-docs/memory-model.yaml` | Sens A/B/C facets, couches mémoire, tables stockage |
| query-layers | `linkml/ghostcrab-docs/query-layers.yaml` | Couches lecture MCP facets / graph / pragma + outils cross-layer |
| methodology-loop | `linkml/ghostcrab-docs/methodology-loop.yaml` | Boucle 4 phases, questions de compétence, ateliers |
| import-paths | `linkml/ghostcrab-docs/import-paths.yaml` | Voies B0/C2, opérateurs `gcp`, édition Personal, interdits Pro |

---

## Tests MECE

| ID | Type | Méthode | Critère vert | Statut |
|----|------|---------|--------------|--------|
| M1 | Mutuel | [term-slice-matrix.md](term-slice-matrix.md) | Aucun terme glossaire dans ≥2 tranches sans `bridgesToSlice` | pass |
| M2 | Mutuel | `CrossLayerReadTool` uniquement dans query-layers | `pack` / `combined_search` pas modélisés comme MemoryLayer | pass |
| M3 | Mutuel | Projections Type A/B définies dans memory-model seulement | query-layers référence pragma reads, pas définition stockage | pass |
| E1 | Exhaustif | Glossaire § ontologie, facets, couches, projections, réindex, **gaps, answer artifacts** | Chaque ligne mappée dans term-slice-matrix | pending |
| E2 | Exhaustif | explanation 03→05 + methodology query-layers + universal §2 | ≥1 classe par chapitre dans une tranche | pass |
| E3 | Exhaustif | Questions de compétence (32 total) | Répondables via doc ou slice JSON | pass |
| H1 | Hiérarchie | Sous-classes `FacetSense*`, `MethodologyPhase*`, `OntologyPath*` | Spécialisation sémantique via `is_a` | pass |
| C1 | Compile | `gcp brain ontology compile` ×4 | exit 0, slices sous `compiled-slices/` | pass |
| P1 | Personal | `rg -i mindcli docs/explanation/ontology/linkml/ghostcrab-docs` | 0 occurrence | pass |

---

## Écarts MECE

| ID | Sévérité | Tranche | Action |
|----|----------|---------|--------|
| — | — | — | Mettre à jour après ajout taxonomie gaps/artifacts au glossaire (2026-06) | pending |

| E4 | Exhaustif | Glossaire § gaps (graph_data_gap, coverage_gap, answerability_gap, mece_gap) | Chaque sens gap mappé ; aucun ⊂ artifact_kind | pending |
| E5 | Exhaustif | Glossaire § answer artifacts (analysis_plan, live_answer_view, answer_snapshot, evidence_pack) | Distinct de event_kind answer_update_event | pending |

---

## Commandes de vérification

```bash
# Graphes Mermaid à jour
node scripts/render-linkml-ontology-graph.mjs --check

# Compile dry-run (×4)
node bin/gcp.mjs brain ontology compile \
  --workspace-id ghostcrab-docs \
  --ontology-id ghostcrab-docs::memory-model \
  --input docs/explanation/ontology/linkml/ghostcrab-docs/memory-model.yaml \
  --output docs/explanation/ontology/compiled-slices/memory-model.json

# Personal track guard
rg -i mindcli docs/explanation/ontology/linkml/ghostcrab-docs || true
```

---

## Import workspace (après MECE vert)

1. `node bin/gcp.mjs brain workspace create ghostcrab-docs` (si absent)
2. Arrêter le serveur MCP (lock SQLite)
3. Importer dans l’ordre : memory-model → query-layers → methodology-loop → import-paths

```bash
node bin/gcp.mjs brain ontology compile \
  --workspace-id ghostcrab-docs \
  --ontology-id ghostcrab-docs::memory-model \
  --input docs/explanation/ontology/linkml/ghostcrab-docs/memory-model.yaml \
  --import-db --force
```

Répéter pour chaque tranche avec le bon `--ontology-id` et `--input`.

---

## Ponts inter-tranches

Les slots `bridgesToSlice` / annotations `ghostcrab.bridges_to_slice` relient une notion stockage (memory-model) aux opérateurs (import-paths) ou à la lecture (query-layers) **sans redéfinir** la notion dans la tranche cible.
