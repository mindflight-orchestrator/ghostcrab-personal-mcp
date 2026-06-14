# Gap rules design

**Phase 3 — design and import closed-world gap rules.**

## Tools

- `ghostcrab_graph_gap_rules_import`
- `ghostcrab_graph_gap_rules`
- Optional: `ghostcrab_graph_diagnostics` (smoke on empty graph)

## Agent prompt

```
Conçois les graph_gap_rules closed-world pour workspace immeuble, ontology immeuble::core.

Niveau 1 — Patrimoine (cf. examples/immeuble/gap-rules/L0-patrimoine.json) :
  - unit-one-cellar, unit-in-building, garage-at-most-one-unit

Niveau 2 — Syndic filtré (cf. `../gap-rules/L2-syndic-filtered.json`) :
  - unit-has-owner, occupied-unit-has-occupant, tenant-occupied-has-lease
  - entity_filter sur usage_status (exclure vacant / vacant_works)

Importe avec replace:true via ghostcrab_graph_gap_rules_import.
Liste les rules actives via ghostcrab_graph_gap_rules.
Explique chaque rule_id en langage métier (cf. `../gap-rules/closed-world-contract.md`).

Pédagogie optionnelle : importer d'abord L1-syndic-naive.json, diagnostiquer le FP sur
Érables Appartement A4 (vacant_works), puis passer à L2.
```

## Reference files

- `../gap-rules/demo.json` — patrimoine demo
- `../gap-rules/syndic.json` — syndic L2 for immeuble
- `../gap-rules/` — curriculum L0–L3
- `../checklists/gap-rules-checklist.md`

## Deliverable

JSON gap-rules imported; list of active rule_ids with business labels.

## Next

→ [`04-document-ingest.md`](04-document-ingest.md)
