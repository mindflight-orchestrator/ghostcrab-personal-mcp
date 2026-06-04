# Pipeline LinkML → OWL2 (Personal)

Source files live under [`ontologies/`](../../../ontologies/). Operator commands run via `gcp brain ontology` (Zig engine).

---

## Workflow

```mermaid
flowchart LR
  YAML[core.yaml LinkML]
  Dry[compile dry-run]
  Review[utilisateur confirme]
  Import[compile --import-db]
  DB[(ontology_* tables)]
  YAML --> Dry --> Review --> Import --> DB
```

---

## Commands

Dry-run (no DB write):

```bash
gcp brain ontology compile \
  --workspace-id immeuble-demo \
  --ontology-id immeuble-demo::core \
  --input ontologies/immeuble-demo/core.yaml \
  --output output/ontology-slice.json
```

Import after explicit confirmation:

```bash
gcp brain ontology compile \
  --workspace-id immeuble-demo \
  --ontology-id immeuble-demo::core \
  --input ontologies/immeuble-demo/core.yaml \
  --import-db --force
```

**Stop MCP** before database-backed commands unless `--force` (SQLite lock).

---

## OWL2 interchange

| Command | Role |
|---------|------|
| `gcp brain ontology import` | Load preserved N-Triples into MindBrain |
| `gcp brain ontology export` | Export N-Triples from DB |
| `gcp brain ontology export-linkml` | Round-trip YAML from bundle or DB |

YAML under `ontologies/` remains the **authoring** source; OWL2 is interchange and audit artefact.

---

## Consumer: document qualification

After ontology tables exist:

1. `gcp brain document qualification-vocab-list` — list taxonomy and facet ids
2. `gcp brain document document-qualify` — write `facet_assignments_raw`

See [document-import.md](../../setup/document-import.md).
