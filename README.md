# GhostCrab

GhostCrab gives AI agents a structured domain model — not just memory.

Most agent memory tools store text. GhostCrab stores **what things are,
how they relate, and what is happening** — in native PostgreSQL, via MCP.

Built on three custom PostgreSQL extensions:
- `pg_facets` — faceted search, BM25, aggregated counts
- `pg_dgraph` — knowledge graph, multi-hop traversal, confidence scoring
- `pg_pragma` — working context, projections, operational snapshots

Exposed as 25 MCP tools (`ghostcrab_*`) to any MCP-compatible agent
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

- **GhostCrab MCP server**: the MCP-facing process. It registers the `ghostcrab_*` tools, validates requests, and dispatches to the right backend path.
- **Backend runtimes**:
  - PostgreSQL for the native extension stack (`pg_facets`, `pg_dgraph`, `pg_pragma`)
  - MindBrain HTTP for sqlite proxy mode, where MindBrain owns the sqlite file, schema init, and default workspace seed

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

## Model compatibility

GhostCrab MCP works with any model your client exposes, but **not all models follow the same intake and modeling discipline**. The table below is about **behavioral reliability**, not API support.

### Why lower-tier models are limited

Smaller or faster models often struggle with the full **mindBrain** workflow: they may skip the first-turn intake contract (clarifying questions, required closing lines), stop multi-step tool chains early, omit graph or projection steps, or drift toward ad hoc schema names instead of canonical recipes. That does not break the server—it produces **weaker or inconsistent** domain data and a worse first session for the user.

**Practical limits you may see outside Tier 1:**

- **Tier 2** — First turn can look fine, but follow-up turns may skip durable graph links (`learn`) or working views (`project`), or rely on search/pack instead of the intended sequence.
- **Tier 3** — Higher risk of incomplete replies (missing questions or closing lines), truncated execution in one turn, or non-canonical structures even when tools succeed.

These tiers are **informational**: nothing blocks a lower-tier model from calling tools; the risk is **quality and convention adherence**, not connectivity.

### Recommendation: use frontier models for onboarding

For **project onboarding** (first fuzzy GhostCrab request, workspace setup, and alignment with **mindBrain** conventions—read-before-write, canonical schemas, checkpoints, projections), prefer **frontier-class models** (e.g. Sonnet 4.5+, Opus 4.5+, Composer 2 Fast, or other Tier-1 options in the table). They are far more likely to respect server instructions, tool descriptions, and skill contracts in one coherent flow, which keeps your graph and facets consistent from day one.

Use lighter models for narrow, well-scoped tasks if you like; for **defining how the project lives in GhostCrab**, choose a model tier that matches the rigor you expect from the product.

### Tier summary

Tier classification reflects **first-turn fuzzy onboarding compliance** (intake-only discipline, closing lines, question count). All listed models can use GhostCrab MCP tools; the tier describes how reliably they follow that onboarding contract, not whether the integration is supported.

| Tier | Models | Notes |
|------|--------|--------|
| **1 — Full** | Composer 2 Fast, Kimi 2.5, Sonnet 4.5+, Opus 4.5+ | Pass all onboarding criteria including closing template and question count. |
| **2 — Compliant with caveats** | Haiku 4.5 | Strong first-turn compliance; later turns may omit graph edges (`learn`) and projections (`project`). |
| **3 — Partial** | Gemini 2.5 Flash | Turn 1 often misses required closing lines and questions; turn 2 may be incomplete or use non-canonical schemas. |

## Install from npm

The easiest way to run GhostCrab is directly from npm — no build step required. Pre-compiled binaries for all supported platforms ship inside the package.

```bash
# one-time install (global, recommended for MCP clients)
npm install -g @mindflight/ghostcrab
# or
pnpm add -g @mindflight/ghostcrab
```

Then add it to your MCP client config:

```json
{
  "mcpServers": {
    "ghostcrab": {
      "command": "ghostcrab"
    }
  }
}
```

Or without a global install:

```json
{
  "mcpServers": {
    "ghostcrab": {
      "command": "npx",
      "args": ["-y", "@mindflight/ghostcrab"]
    }
  }
}
```

**What happens at startup:** the launcher starts the Zig backend (which creates and migrates `./data/ghostcrab.sqlite` automatically), waits for it to be healthy, then starts the MCP server on stdio. No `postinstall` hook, no network calls at runtime.

**Supported platforms:** `linux-x64`, `linux-arm64`, `darwin-x64` (Intel Mac), `darwin-arm64` (Apple Silicon), `win32-x64`.

**Environment variables** (all optional):

| Variable | Default | Purpose |
|---|---|---|
| `GHOSTCRAB_SQLITE_PATH` | `./data/ghostcrab.sqlite` | SQLite file location |
| `GHOSTCRAB_BACKEND_ADDR` | `:8091` | Backend HTTP listen address |
| `GHOSTCRAB_MINDBRAIN_URL` | `http://127.0.0.1:8091` | MCP server → backend URL |
| `GHOSTCRAB_EMBEDDINGS_MODE` | `disabled` | `disabled` (BM25) or `openrouter` (hybrid) |

## Quick Start (from source)

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

### SQLite proxy mode

When `GHOSTCRAB_DATABASE_KIND=sqlite`, GhostCrab does not open SQLite directly. It proxies sqlite-backed tool calls through MindBrain, which owns the sqlite file, schema init, and default workspace seed.

1. Start the MindBrain HTTP backend.
2. Point GhostCrab at it:

   ```bash
   export GHOSTCRAB_DATABASE_KIND=sqlite
   export GHOSTCRAB_MINDBRAIN_URL=http://127.0.0.1:8091
   npm run build
   node dist/index.js
   ```

The sqlite file lives behind MindBrain, not inside GhostCrab.

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

Your agent now has access to 25 `ghostcrab_*` tools.

## MCP tool surface

| Group | Tools |
|---|---|
| Facets | `ghostcrab_search`, `ghostcrab_remember`, `ghostcrab_upsert`, `ghostcrab_count`, `ghostcrab_facet_tree`, `ghostcrab_query_geo` |
| Graph | `ghostcrab_learn`, `ghostcrab_traverse`, `ghostcrab_marketplace`, `ghostcrab_patch`, `ghostcrab_coverage` |
| Projections | `ghostcrab_project`, `ghostcrab_pack`, `ghostcrab_status` |
| Schema | `ghostcrab_schema_register`, `ghostcrab_schema_list`, `ghostcrab_schema_inspect` |
| Workspace | `ghostcrab_workspace_create`, `ghostcrab_workspace_list`, `ghostcrab_workspace_inspect`, `ghostcrab_workspace_export_model`, `ghostcrab_workspace_export_model_toon`, `ghostcrab_ddl_propose`, `ghostcrab_ddl_list_pending`, `ghostcrab_ddl_execute` |

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
