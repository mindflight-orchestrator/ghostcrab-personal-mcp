# GhostCrab

GhostCrab gives AI agents a structured domain model — not just memory.

Most agent memory tools store text. GhostCrab stores **what things are,
how they relate, and what is happening** — in native PostgreSQL, via MCP.

Built on three custom PostgreSQL extensions:
- `pg_facets` — faceted search, BM25, aggregated counts
- `pg_dgraph` — knowledge graph, multi-hop traversal, confidence scoring
- `pg_pragma` — working context, projections, operational snapshots

Exposed as 24 MCP tools (`ghostcrab_*`) to any MCP-compatible agent
(Claude Code, Cursor, Codex, OpenClaw).

## Why not a vector store or a plain memory tool?

Vector stores answer "what is similar to X?"  
GhostCrab answers:
- "What are all the entities of type X, filtered by Y, grouped by Z?" (facets)
- "What does X depend on, 3 hops away?" (graph)
- "What was the agent working on and where did it stop?" (projections)

All three simultaneously, in a single PostgreSQL transaction.

## Concrete use cases

**Web agency — multi-source audit consolidation**  
An agent consolidates Google Analytics, PageSpeed, Search Console
into a single domain model. Facets aggregate KPIs. Graph maps
page dependencies. Projections track audit state across sessions.

**SaaS documentation — automated user story generation**  
A crawler maps a SaaS product's data model as an ontology.
Agents traverse the graph to generate user stories, detect
missing flows, and propose automation opportunities.

## Core Architecture

AI agents require structured state to operate beyond single-turn conversations. GhostCrab fulfills this through two primary components:

- **mindBrain**: A dedicated PostgreSQL memory stack designed for MCP-compatible agents. It runs PostgreSQL alongside three custom native extensions: `pg_facets`, `pg_dgraph`, and `pg_pragma`.
- **Ontology**: At startup, GhostCrab helps an agent define an ontology to model the target environment — organizing the domain into entities and rules, whether mapping an application's data model, specialized domain knowledge, or distinct business procedures.

## Multi-Dimensional Capabilities

GhostCrab consolidates three dimensions of data into a single database, each backed by a native PostgreSQL extension:

| Dimension | Extension | Agent Capability | Example Use Case |
| :--- | :--- | :--- | :--- |
| **Facets** | `pg_facets` | Filter records, track state changes, calculate aggregated metrics | Tracking compliance requirements |
| **Graphs** | `pg_dgraph` | Map dependencies, visualize entity relations, execute multi-hop pathfinding | Identifying blockers in a CRM pipeline |
| **Projections** | `pg_pragma` | Store active working context and capture operational snapshots | Maintaining context during employee onboarding |

## Supported Agent Environments

GhostCrab integrates natively with standard agent environments without requiring migration to a closed platform:

- Claude Code
- Codex
- Cursor
- OpenClaw
- mindBot

## Quick Start

1. Copy `.env.example` to `.env` and adjust values if needed.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Run the full validation chain:

   ```bash
   PG_PORT=55432 npm run verify:e2e
   ```

   This starts the native PostgreSQL image, runs migrations, seeds the database, and exercises all MCP smoke scenarios. Set `GHOSTCRAB_POSTGRES_STACK=fallback` if you explicitly want the SQL-first stack.

4. Start the server manually once PostgreSQL is available:

   ```bash
   docker compose -f docker/docker-compose.native.yml up -d --build postgres
   DATABASE_URL=postgres://ghostcrab:ghostcrab@localhost:5432/ghostcrab npm run migrate
   DATABASE_URL=postgres://ghostcrab:ghostcrab@localhost:5432/ghostcrab npm run build
   DATABASE_URL=postgres://ghostcrab:ghostcrab@localhost:5432/ghostcrab node dist/index.js
   ```

## Quick start

```bash
docker compose -f docker/docker-compose.native.yml up -d --build postgres
npm install
npm run migrate
npm run build
node dist/index.js
```

Add to your MCP client config:
```json
{
  "mcpServers": {
    "ghostcrab": {
      "command": "node",
      "args": ["/path/to/ghostcrab/dist/index.js"]
    }
  }
}
```

Your agent now has access to 24 `ghostcrab_*` tools.

## MCP tool surface

| Group | Tools |
|---|---|
| Facets | `ghostcrab_search`, `ghostcrab_remember`, `ghostcrab_upsert`, `ghostcrab_count`, `ghostcrab_facet_tree`, `ghostcrab_query_geo` |
| Graph | `ghostcrab_learn`, `ghostcrab_traverse`, `ghostcrab_marketplace`, `ghostcrab_patch`, `ghostcrab_coverage` |
| Projections | `ghostcrab_project`, `ghostcrab_pack`, `ghostcrab_status` |
| Schema | `ghostcrab_schema_register`, `ghostcrab_schema_list`, `ghostcrab_schema_inspect` |
| Workspace | `ghostcrab_workspace_create`, `ghostcrab_workspace_list`, `ghostcrab_workspace_inspect`, `ghostcrab_workspace_export_model`, `ghostcrab_ddl_propose`, `ghostcrab_ddl_list_pending`, `ghostcrab_ddl_execute` |

The stable tool contract is documented in [docs/mcp_tools_contract.md](docs/mcp_tools_contract.md).

## Telemetry

Telemetry is **opt-in** and disabled by default. Nothing is sent unless you set `MCP_TELEMETRY=1` and a `GHOSTCRAB_TELEMETRY_ENDPOINT` (`https://` required). When enabled, only anonymous runtime metadata is sent — no prompts, no database contents, no identifiers. Pass `--no-telemetry` to force it off for a single process.

Full details and the collected-field list are in [docs/INTERNALS.md](docs/INTERNALS.md#telemetry).

## Going Further

For contributors, maintainers, and advanced integrators, the full technical reference is in [docs/INTERNALS.md](docs/INTERNALS.md). It covers:

- repository layout and PostgreSQL extension sources
- native boot / seed contract and Docker stack reset
- migration runner and checksum enforcement
- seeded product graph and coverage model
- autonomy, recipes, and KPI layer
- all validation scripts and smoke scenarios
- packaging and client integration guides
