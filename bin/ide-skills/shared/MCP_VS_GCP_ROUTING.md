# MCP vs `gcp` routing (Personal)

## MCP (`ghostcrab_*`) — agent session reads and unit writes

- `ghostcrab_status`, `ghostcrab_workspace_use`
- `ghostcrab_search`, `ghostcrab_count`, `ghostcrab_combined_search`
- `ghostcrab_remember`, `ghostcrab_upsert`, `ghostcrab_learn`, `ghostcrab_project`, `ghostcrab_pack`
- `ghostcrab_projection_get`, `ghostcrab_graph_search`, `ghostcrab_traverse`
- `ghostcrab_graph_diagnostics`, `ghostcrab_coverage`
- `ghostcrab_schema_register`, `ghostcrab_ontology_import` (agent-owned ontology source import)

## CLI (`gcp brain …`) — operator maintenance and bulk paths

- **`gcp brain structured-import`** — CSV/API/tabular bulk apply + reindex
- **`gcp brain document`** — document corpus import pipeline
- **`gcp brain ontology compile|import|export`** — LinkML/OWL maintenance
- **`gcp brain artifact list|get|refresh`** — answer artifact registry ops
- **`gcp smoke`**, **`gcp brain up`** — environment bootstrap

**Stop MCP** before database-backed `gcp` commands (or use `--force`).

## Forbidden on Personal

- Legacy Pro PostgreSQL CLI, `DATABASE_URL`, direct SQL
- mindCLI
- Legacy Postgres DDL tools (use `ghostcrab_schema_register` on SQLite)

## Modeling split

- **`ghostcrab:*` agent schemas** — `ghostcrab_schema_register` + facets table
- **LinkML formal ontology** — `ontology_*` tables via compile/import path (SOP2 §6 bis in starter-kit)
