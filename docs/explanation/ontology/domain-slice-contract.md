# Contrat tranche domaine (`<workspace>::core`)

---

## Naming

| Field | Convention | Example |
|-------|------------|---------|
| Workspace id | slug, stable | `immeuble-demo` |
| Ontology id | `<workspace>::core` | `immeuble-demo::core` |
| Source file | `ontologies/<workspace>/core.yaml` | `ontologies/immeuble-demo/core.yaml` |
| Collection id (docs) | often `<workspace>::docs` | paired in document-import runbooks |

---

## Lifecycle

1. Author LinkML in repo (LLM-assisted or hand-edited).
2. `gcp brain ontology compile` **without** `--import-db` → slice JSON for review.
3. User confirms in thread (StarterKit modeling gate).
4. `compile --import-db --force` after MCP stopped.
5. Verify with `ghostcrab_schema_inspect` / `ghostcrab_coverage` (MCP) — shapes for agent facts are separate.

---

## StarterKit artefacts

- `templates/linkml_ontology.stub.yaml` — starting skeleton
- `templates/mvp_core_contract.yaml` — parallel business contract (not OWL; maps to import mapping)
- SOP2 § LinkML path — canonical procedure in [starter-kit-ghostcrab-perso](https://gitlab.com/webigniter/starter-kit-ghostcrab-perso)

---

## Example in repo

[`ontologies/immeuble-demo/core.yaml`](../../../ontologies/immeuble-demo/core.yaml) — syndic / copropriété lab domain.
