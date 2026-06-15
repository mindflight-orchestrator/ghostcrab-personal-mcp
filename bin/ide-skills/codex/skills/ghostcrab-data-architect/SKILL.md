---
name: ghostcrab-data-architect
description: Use when designing or extending a GhostCrab-backed domain model without freezing a canonical schema too early.
disable-model-invocation: true
---

# GhostCrab Data Architect

## Persona Rule

Speak in product language first.
Do not lead with schema ids, migrations, or graph edges unless the user explicitly asked for implementation detail.

## First-Turn Fuzzy Onboarding Protocol

If the user is still figuring out the domain:

- do not call `ghostcrab_status` or `ghostcrab_schema_list` by default
- do not write any GhostCrab record
- do not propose structure or setup yet
- do not propose local files or alternate storage

Reply with:

1. one short intent hypothesis
2. 2 to 4 family-shaped clarification questions
3. one likely compact-view recommendation
4. one explicit offer to draft the next GhostCrab prompt

## Discovery Flow

After clarification:

1. identify the closest activity family
2. inspect existing recipes and schema families
3. prefer canonical primitives before inventing a new family
4. define the smallest model that supports the retrieval jobs
5. keep the first design provisional until the naming and retrieval contract is stable

## Starterkit Resource

When the user wants concrete project files, import templates, source-to-canonical mappings, or consumer validation gates, use the GhostCrab Personal StarterKit as the canonical artifact source instead of inventing project-local templates from scratch.

**Resolve paths first:** [STARTERKIT_PATHS.md](../ghostcrab-shared/STARTERKIT_PATHS.md) — then load from `{starterkit}` and write domain files under `{project}/ontology/`.

Load only what is needed:

- `{starterkit}/QUICKSTART.md` for phase selection
- `{starterkit}/personal-mcp/SOP0_import_path_choices.md` for ontology and tabular path choices (before writes)
- `{starterkit}/personal-mcp/SOP2_obsidian_ontologie.md` for ontology modeling (§6 bis LinkML or §7 MCP)
- `{starterkit}/personal-mcp/SOP5_structured_import.md` for CSV/API/JSON/tabular imports (Personal CLI default)
- `{starterkit}/templates/source_profile.yaml`
- `{starterkit}/templates/mapping_external_to_canonical.yaml`
- `{starterkit}/templates/consumer_contract.yaml`
- `{starterkit}/templates/import_manifest.yaml`
- `{starterkit}/templates/import_path_choices.yaml`
- `{starterkit}/templates/linkml_ontology.stub.yaml`

## Import Path Discipline

Before ontology or tabular import writes, follow `{starterkit}/personal-mcp/SOP0_import_path_choices.md`:

1. Present two numbered options; do not remove the historical path.
2. **Ontology default (Personal):** LinkML — LLM generates `{project}/ontology/core.yaml` (or per-module `ontology/<module>.yaml`), validates with dry-run compile, imports native `ontology_*` via `ghostcrab_ontology_import` or CLI after user confirmation.
3. **Ontology alternative:** MCP incremental modeling — `ghostcrab_schema_register` / `remember` / `upsert` / `learn` sequence (SOP2 §7 Voie A), not a native ontology import.
4. **Tabular default (Personal SQLite):** `gcp brain structured-import` — see `{starterkit}/personal-mcp/SOP5_structured_import.md`.
5. **Tabular alternative:** SOP5 scripts + gates (Voie A).
6. Record choices in `{project}/<workspace-slug>/import_path_choices.yaml` or project root per SOP0.

MCP native import (default agent path, single module):

```json
{
  "workspace_id": "<ws>",
  "ontology_id": "<ws>::core",
  "input_path": "ontology/core.yaml",
  "source_format": "linkml"
}
```

LinkML validation loop (mandatory before CLI `--import-db`):

```bash
gcp brain ontology compile \
  --workspace-id <ws> --ontology-id <ws>::core \
  --input ontology/core.yaml \
  --output output/ontology-slice.json
```

After exit 0 and user confirmation for CLI import:

```bash
gcp brain ontology compile ... --import-db --force
```

Optional canonical LinkML examples when working inside the `ghostcrab-personal-mcp` monorepo: `ontologies/immeuble-demo/core.yaml`, `ontologies/ghostcrab/profile.yaml`.

Import native ontologies with `ghostcrab_ontology_import` or CLI — not `ghostcrab_schema_register` for LinkML source import.

## Enum facet layer (LinkML / multi-module)

After LinkML import per module, register the **business enum facet layer** automatically — see [ENUM_BUSINESS_FACETS.md](../ghostcrab-shared/ENUM_BUSINESS_FACETS.md).

**Mandatory naming:** `<module>.<slot_snake_case>` (e.g. `administrative.formule_service`, `comptabilite.statut_exercice`). Never use bare slot names.

Workflow (after user confirmation):

1. `ghostcrab_ontology_import` per module — `ontology_id: "<ws>::<module>"`, `input_path: "ontology/<module>.yaml"`
2. `ghostcrab_schema_register` with `target: "facets"` — one schema per module (`<ws>:<module>`) with `facet_keys`, `enum_facets`, `ontology_id`, `source_linkml`, `status: "provisional"`
3. `ghostcrab_facet_register` for each enum key in `enum_facets`
4. Validate: `ghostcrab_schema_list(domain="<ws>", target="facets")`, `ghostcrab_facet_inspect("<module>.<slot>")`

Empty `ghostcrab_workspace_inspect` or `ghostcrab_projections_list` **before structured-import / projections** is expected — not an error.

## Freeze Policy

- provisional model first
- confirmation before public schema freeze
- confirmation before cross-project naming conventions

## V1 Long-Running Discipline

- checkpoints are mandatory at meaningful session or phase boundaries
- preserve transition rationale before overwriting current-state records when recovery would otherwise suffer
- prefer compact recovery views such as `mini-heartbeat`, `phase-heartbeat`, `deployment-brief`, `integration-health-brief`, or `knowledge-snapshot`
