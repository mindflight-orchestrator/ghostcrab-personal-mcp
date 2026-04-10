# Architecture

GhostCrab is a public MCP-facing memory product built on PostgreSQL. The current architecture keeps the public API and the storage internals clearly separated.

## Layers

### Public MCP surface

- `src/index.ts`
- `src/tools/*`

This layer exposes only `ghostcrab_*` tools and owns the public contract returned to MCP clients.

### Storage model

- `mfo_facets`
- `mfo_nodes`
- `mfo_edges`
- `mfo_projections`
- `mfo_agent_state`

The `mfo_*` naming remains internal. It is intentionally not mirrored into the public tool names.

### Bootstrap layer

- `src/bootstrap/seed.ts`

This module seeds:

- `mfo:system`
- `mfo:schema`
- `mfo:ontology`
- first GhostCrab product records
- the seeded product graph
- a ready-to-demo `agent:self` runtime state

### Runtime

- Node.js process
- `pg` connection pool
- stdio transport via `@modelcontextprotocol/sdk`

### Local distribution

- `docker/Dockerfile.postgres`
- `docker/docker-compose.native.yml`

Boot and seed flows are expected to run on the native PostgreSQL image with `pg_facets`, `pg_dgraph`, and `pg_pragma` loaded.

## Request Flow

1. MCP client connects to the stdio server.
2. The server validates database reachability and runs bootstrap.
3. The tool registry resolves the requested `ghostcrab_*` handler.
4. The handler runs SQL against PostgreSQL.
5. The handler returns structured JSON with the stable public envelope.

## Design Constraints

- public branding is always `ghostcrab_*`
- internal storage stays `mfo_*`
- native Docker PostgreSQL is first-class for boot/seed
- embeddings remain interface-ready but disabled by default
- SQL fallback remains available only as an explicit portability path
