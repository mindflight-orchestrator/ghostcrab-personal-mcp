# Discovery and model proposal

**Phase 1 — read corpus, propose model (no writes yet).**

## Tools

- File reads: `corpus/*.md`, `corpus/manifest.json`
- Optional: `ghostcrab_tool_search` if you need specialized tools

## Agent prompt

```
Lis les 8 fichiers listés dans examples/immeuble/mcp-lab/corpus/manifest.json.

Produis une table avec :
1. Entity types (building, block, unit, person, household, lease_contract, cellar, parking_space, …)
2. Edge types (contains, owns, occupies, leases, assigned_cellar, assigned_garage, …)
3. Facet dimensions documentaires (source.document_type, domain.building, domain.unit, domain.role, …)
4. Mapping doc_id → document_type → entités/relations attendues
5. Competency questions couvertes (réf. examples/immeuble/reference/scenarios.yaml)

Compare à reference/ontology-checklist.md. Si tu t'écartes, explique pourquoi.
Ne crée rien dans GhostCrab tant que le Model Proposal n'est pas validé.
```

## Deliverable

| Column | Content |
|--------|---------|
| Entity types | List with brief definition |
| Edge types | List with source/target |
| Facet dimensions | Namespace.dimension + value examples |
| Doc mapping | 8 rows from manifest |
| Scenarios | Which scenario IDs each doc supports |

## Gate

Human validation of Model Proposal before `02-ontology-register.md`.

## Next

→ [`02-ontology-register.md`](02-ontology-register.md)
