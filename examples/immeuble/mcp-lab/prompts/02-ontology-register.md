# Ontology register

**Phase 2 — create workspace and register ontology.**

## Tools

- `ghostcrab_workspace_create`
- `ghostcrab_schema_register` or `ghostcrab_schema_inspect` / `ghostcrab_schema_list`
- CLI (documented): `gcp brain ontology compile …`

## Agent prompt

```
Crée le workspace immeuble-demo-llm (domain_profile: syndic).
Enregistre l'ontology immeuble-demo::core alignée sur le Model Proposal validé :

Option A — LinkML :
  gcp brain ontology compile \
    --workspace-id immeuble-demo-llm \
    --ontology-id immeuble-demo::core \
    --input ontologies/immeuble-demo/core.yaml \
    --profile syndic \
    --import-db --force

Option B — MCP schema :
  ghostcrab_schema_register avec facet dimensions du Model Proposal

Vérifie avec ghostcrab_schema_list / ghostcrab_schema_inspect sur immeuble-demo-llm.
Ne charge pas examples/immeuble/reference/bundle.json dans ce workspace.
```

## Reference (read-only)

Canonical LinkML: `ontologies/immeuble-demo/core.yaml`  
Checklist: `reference/ontology-checklist.md`

## Deliverable

- Workspace `immeuble-demo-llm` exists
- Ontology `immeuble-demo::core` visible in workspace

## Next

→ [`03-gap-rules-design.md`](03-gap-rules-design.md)
