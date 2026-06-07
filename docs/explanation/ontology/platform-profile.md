# Profil plateforme LinkML (`ghostcrab/profile.yaml`)

File: [`ontologies/ghostcrab/profile.yaml`](../../../ontologies/ghostcrab/profile.yaml)

---

## Role

Layer-1 reusable patterns for GhostCrab Personal:

- lifecycle statuses (confirmed, pending verification, …)
- PROV-style provenance hooks
- time and document-backed knowledge patterns
- SKOS / SHACL alignment via LinkML generators

Import or compile this profile **before** domain slices when the domain ontology `imports` or extends platform enums.

---

## When to compile

| Situation | Action |
|-----------|--------|
| New workspace with domain-only YAML | Check if `core.yaml` imports profile symbols |
| Cross-domain labs (immeuble, CRM) | Reuse profile; do not duplicate enums in each `core.yaml` |
| Personal SQLite only | Same `ghostcrab_ontology_import` or `gcp brain ontology compile` path as domain slices |

---

## Not covered here

- `ghostcrab:task` and other MCP agent schemas → [vs-agent-schemas.md](vs-agent-schemas.md)
- Tabular entity types in structured-import JSON models → [structured-import.md](../../setup/structured-import.md)
