# Architecture

> **Published npm SKU:** [`@mindflight/ghostcrab-personal-mcp`](../../README.md) runs **SQLite** behind the **MindBrain** HTTP backend; the Node MCP server forwards tool work to MindBrain. Use the root README and [INSTALL.md](../../INSTALL.md) for that path.
> This page describes **repository** layers and the **maintainer / CI** stack on **native PostgreSQL**, where **facets**, **graph**, and **projections** can be accelerated by PostgreSQL extensions whose `CREATE EXTENSION` names are `pg_facets`, `pg_dgraph`, and `pg_pragma`.

## Layers

### Public MCP surface

- `src/index.ts`
- `src/tools/*`

This layer exposes only `ghostcrab_*` tools and owns the public contract returned to MCP clients.

### Storage model

- `facets`
- `graph.entity`
- `graph.relation`
- `projections`
- `agent_state`

The `mindbrain_*` naming remains internal. It is intentionally not mirrored into the public tool names.

### Bootstrap layer

- `src/bootstrap/seed.ts`

This module seeds:

- `mindbrain:system`
- `mindbrain:schema`
- `mindbrain:ontology`
- first GhostCrab product records
- the seeded product graph
- a ready-to-demo `agent:self` runtime state

### Runtime

- Node.js process
- database client or MindBrain HTTP proxy (depending on deployment)
- stdio transport via `@modelcontextprotocol/sdk`

### Maintainer / CI stack (PostgreSQL)

- `docker/Dockerfile.postgres`
- `docker/docker-compose.native.yml`

Boot and seed flows for **integration validation** are expected to run on the native PostgreSQL image with **facet, graph, and projection** extension stacks loaded (`pg_facets`, `pg_dgraph`, `pg_pragma`).

## Request Flow

1. MCP client connects to the stdio server.
2. The server validates database reachability (or MindBrain reachability in SQLite mode) and runs bootstrap as applicable.
3. The tool registry resolves the requested `ghostcrab_*` handler.
4. The handler runs queries through the configured backend.
5. The handler returns structured JSON with the stable public envelope.

## Design Constraints

- public branding is always `ghostcrab_*`
- internal storage stays `mindbrain_*`
- native Docker PostgreSQL is first-class for maintainer boot/seed and `verify:e2e`
- embeddings remain interface-ready but disabled by default
- SQL fallback remains available only as an explicit portability path
