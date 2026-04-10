# Node Stdio Client Example

This example launches the built GhostCrab MCP server from `dist/index.js`, connects over stdio, lists the available tools, then calls `ghostcrab_status` and `ghostcrab_pack`.

Run it after the package has been built and PostgreSQL is reachable:

```bash
npm run build
DATABASE_URL=postgres://ghostcrab:ghostcrab@localhost:5432/ghostcrab node examples/node-stdio-client/index.mjs
```

The script prints one JSON object to stdout so it is easy to inspect directly or pipe into `jq`.
