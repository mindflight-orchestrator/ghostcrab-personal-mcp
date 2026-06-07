# Compiled ontology slices (build artefacts)

These JSON files are **not** human documentation. They are the machine output of:

```bash
node bin/gcp.mjs brain ontology compile \
  --workspace-id ghostcrab-docs \
  --ontology-id ghostcrab-docs::<slice> \
  --input docs/explanation/ontology/linkml/ghostcrab-docs/<slice>.yaml \
  --output docs/explanation/ontology/compiled-slices/<slice>.json
```

## What is inside each file?

Each `*.json` is a **`ghostcrab_backup_bundle`** slice: the same structure MindBrain would load into SQLite `ontology_*` tables on `--import-db`.
For agent-driven imports, use `ghostcrab_ontology_import` directly on the LinkML source instead of importing these JSON audit artefacts.

| Block | Meaning for doc ontologies |
|-------|----------------------------|
| `ontology_dimensions` / `ontology_values` | LinkML **enums** (e.g. `FacetSenseCode`, `MemoryLayerCode`) |
| `ontology_entity_types` | LinkML **classes** (e.g. `AgentFactsStore`, `FacetsQueryLayer`) |
| `ontology_edge_types` | LinkML **slots** between classes (often empty here) |
| `ontology_triples` | RDF triples (labels, `subClassOf`, SKOS definitions) |
| Empty `entities_raw`, `documents_raw`, … | No business **instances** — only schema/taxonomy |

So the JSON is a **compiler audit trail**: useful to diff before import, or for tooling — not to read instead of [../diagrams/](../diagrams/) or [../../03-memoire-mcp-facettes-graphe-projections.md](../../03-memoire-mcp-facettes-graphe-projections.md).

## What to read instead (explanation)

| You want | Open |
|----------|------|
| Prose architecture | [03 — Mémoire MCP](../../03-memoire-mcp-facettes-graphe-projections.md), [glossary](../../glossary.md) |
| Class diagrams | [diagrams/memory-model.md](../diagrams/memory-model.md) (and siblings) |
| MECE partition | [term-slice-matrix.md](../term-slice-matrix.md), [mece-validation.md](../mece-validation.md) |
| LinkML source | [linkml/ghostcrab-docs/](../linkml/ghostcrab-docs/) |
| Runtime after import | SQLite workspace `ghostcrab-docs` (`ontology_*` tables), not these files |

Regenerate slices after editing YAML:

```bash
node scripts/render-linkml-ontology-graph.mjs
# then compile each slice to refresh JSON here
```
