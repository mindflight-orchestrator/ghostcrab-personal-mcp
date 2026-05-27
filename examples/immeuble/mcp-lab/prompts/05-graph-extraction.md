# Graph extraction

**Phase 5 — extract business entities and relations from qualified documents.**

## Tools

- `ghostcrab_remember` / `ghostcrab_upsert`
- `ghostcrab_graph_search`
- Reindex: `gcp load` partial or workspace reindex CLI

## Agent prompt

```
À partir des documents qualifiés dans immeuble-demo-llm, extrais le graphe métier syndic :

Structure :
  - 2 immeubles (Tilleuls, Érables), 13 lots, personnes, ménages
  - 13 caves, garages sélectifs, jardins privatifs RDC
  - 5 contrats de bail, 3 écritures CODA

Relations minimales :
  contains, owns, occupies, household_member, leases, rented_to,
  assigned_cellar, assigned_garage, uses_exclusive, matched_to

Utilise ghostcrab_remember / ghostcrab_upsert ou l'extraction LLM documentée
dans scripts/import-immeuble-demo-llm.mjs.
Reindex le graphe après écriture.

Vérifie :
  ghostcrab_graph_search query "appartement" → ≥ 13 unités
  ghostcrab_graph_search query "Dupont" → résultats pertinents
```

## Success thresholds

See `success-criteria.yaml` → `entity_counts`, `relation_edges`.

## Deliverable

Populated `graph_entity` for workspace `immeuble-demo-llm`; counts near success criteria.

## Next

→ [`06-validate-and-compare.md`](06-validate-and-compare.md)
