# LinkML/OWL2 ontologies vs agent MCP schemas

Three layers often confused in conversation:

| Layer | What users say | What it is | Tooling |
|-------|----------------|------------|---------|
| **Formal ontology** | "the ontology" | LinkML/N-Triples → `ontology_*` | `ghostcrab_ontology_import`, `gcp brain ontology compile\|import` |
| **Agent schemas** | "schemas" / "types" | `ghostcrab:*` registry for facts | `ghostcrab_schema_register` |
| **Graph instances** | "the model in the graph" | `graph_entity` rows | `ghostcrab_learn`, structured-import `apply` |

---

## Agent schemas (`ghostcrab:*`)

- Stored for MCP validation and onboarding recipes.
- Rows land in **`agent_facts`** with `schema_id` + `facets` JSON.
- Do **not** replace LinkML taxonomies used by `document-qualify`.

Typical primitives: `ghostcrab:task`, `ghostcrab:note`, `ghostcrab:decision` (see [CAPABILITIES.md](../../../ghostcrab-skills/CAPABILITIES.md)).

---

## Formal ontology (LinkML)

- Defines **controlled vocabulary** for document qualification and graph typing at the knowledge layer.
- Tables: `ontology_dimensions`, taxonomies, etc. (see vendor mindbrain collections docs).
- Versioned as YAML in git; OWL2 is export/interchange.
- Import it with `ghostcrab_ontology_import` from MCP or `gcp brain ontology ...` from CLI. Do not store ontology source files with `ghostcrab_remember`, `ghostcrab_upsert`, `ghostcrab_learn`, `ghostcrab_schema_register`, or `ghostcrab_graph_gap_rules_import`.

---

## Choosing a modeling path (StarterKit B0)

| Path | When |
|------|------|
| **LinkML compile** | Stable domain, document qualification, shared vocab across imports |
| **MCP native import** | Agent workflow imports LinkML/N-Triples directly with `ghostcrab_ontology_import` |
| **MCP incremental modeling** (SOP2 §7A) | Fast iteration for memory/graph shape without a native LinkML ontology |
| **Structured-import only** | Tabular source already mapped; ontology may be minimal |

Recorded in `templates/import_path_choices.yaml`.
