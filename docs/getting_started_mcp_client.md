# Getting Started With A GhostCrab MCP Client

This guide shows the standard GhostCrab bootstrap path for local Docker, the stdio MCP server, and a minimal client smoke test.

## Prerequisites

- Node.js 20+
- npm
- Docker

## 1. Install Dependencies

```bash
npm install
```

## 2. Start The Native Docker Database

```bash
PG_PORT=55432 docker compose -f docker/docker-compose.native.yml up -d --build postgres
```

Default Docker credentials:

- host: `localhost`
- port: `55432`
- database: `ghostcrab`
- user: `ghostcrab`
- password: `ghostcrab`

If you keep the defaults, the runtime DSN is:

```bash
postgres://ghostcrab:ghostcrab@localhost:55432/ghostcrab
```

## 3. Apply Migrations And Build

```bash
DATABASE_URL=postgres://ghostcrab:ghostcrab@localhost:55432/ghostcrab npm run migrate
DATABASE_URL=postgres://ghostcrab:ghostcrab@localhost:55432/ghostcrab npm run build
```

This applies the SQL migrations, validates the native extension stack, and lets the GhostCrab runtime seed its canonical bootstrap data on first startup.

## 4. Start The GhostCrab MCP Server

```bash
DATABASE_URL=postgres://ghostcrab:ghostcrab@localhost:55432/ghostcrab \
GHOSTCRAB_EMBEDDINGS_MODE=fake \
node dist/index.js
```

Expected startup behavior:

- GhostCrab logs its version and DB target on `stderr`
- bootstrap completes without fatal errors
- the server reports that it connected on stdio

## 5. Run The Example Node Client

In another terminal:

```bash
DATABASE_URL=postgres://ghostcrab:ghostcrab@localhost:55432/ghostcrab \
GHOSTCRAB_EMBEDDINGS_MODE=fake \
node examples/node-stdio-client/index.mjs
```

The example connects over stdio, lists tools, then calls:

- `ghostcrab_status`
- `ghostcrab_pack`

## 6. Expected Result

The example prints a single JSON object containing:

- the registered tool names
- the current `status.health`
- the suggested `next_actions`
- the `pack.recommended_next_step`

On a fresh native bootstrap, the output should typically show:

- `tool_count >= 13`
- `status.health = "YELLOW"`
- `pack.has_blocking_constraint = true`
- `pack.recommended_next_step = "resolve_constraints_first"`

## 7. Optional Full Validation

If you want the full deterministic local verification chain:

```bash
PG_PORT=55432 npm run verify:e2e
```

This builds the package, validates the tarball, starts the native Docker database with `pg_facets`, `pg_dgraph`, and `pg_pragma`, applies migrations, runs the MCP smoke scenarios, and tears Docker down again.

## 8. Minimal Integration Pattern

If you are integrating GhostCrab into another MCP host, the stable contract to rely on is:

- tools are named `ghostcrab_*`
- successful tool payloads include `ok`, `tool`, `surface_version`, `generated_at`
- errors are structured JSON, not plain text only

Tools alone are not enough for a good agent experience. A generic MCP client also needs usage context:

- when to prefer exact reads over `ghostcrab_status`
- when to use `ghostcrab_upsert` instead of appending new facts
- how to treat `ghostcrab:task` as current-state truth for living trackers
- how to summarize external evidence before storing it
- how to recover a long-running project after a pause

The seeded GhostCrab routing, autonomy, recipe, and KPI records are meant to provide this context directly through MCP.

## 9. Common Troubleshooting

- Connection refused:
  Start the Docker database first and make sure you are using the same port in both `PG_PORT` and `DATABASE_URL`.
- Authentication failed:
  Check that your DSN matches the Docker credentials.
- Server starts then closes:
  Run `npm run migrate` first, then retry.
- Client sees fewer tools than expected:
  Rebuild with `npm run build` and restart the stdio server.

For the detailed contract, see [docs/mcp_tools_contract.md](/Users/francois/Documents/mars2026/ghostcrab-mcp/docs/mcp_tools_contract.md). For Codex-specific setup, see [docs/codex_integration.md](/Users/francois/Documents/mars2026/ghostcrab-mcp/docs/codex_integration.md).
