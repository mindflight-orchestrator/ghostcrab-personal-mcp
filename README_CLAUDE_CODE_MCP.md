# GhostCrab and Claude Code (MCP)

This guide is only about **wiring the GhostCrab MCP server into [Claude Code](https://code.claude.com/docs/en/mcp)**. For what GhostCrab does and how the backend is built, see the [main README](README.md).

## What you are connecting

- **Transport:** `stdio` (a local process). GhostCrab is not registered here as a cloud HTTP endpoint.
- **Command:** the `gcp` CLI from this package — use **`gcp brain up`**, **`gcp up`**, or legacy **`gcp serve`** to start the MindBrain backend and the MCP server on stdin/stdout.
- **NPM package name** (as in this repo's `package.json`): `@mindflight/ghostcrab-personal-mcp`. Quick install: [INSTALL.md](INSTALL.md).

You need **Node 20+** and a build of this package that includes a **prebuilt backend** for your OS under `prebuilds/`, *or* you must build the Zig backend yourself (see the main README and `Makefile`).

## Quickest path: `gcp brain setup claude`

From a directory where the package is installed locally (or where `gcp` is on your PATH):

```bash
npx gcp brain setup claude              # auto: prefers local install → node + absolute path
npx gcp brain setup claude --scope project   # write to project-scoped .mcp.json
```

When a local `node_modules/@mindflight/ghostcrab-personal-mcp/bin/gcp.mjs` is reachable from the current directory, the generator uses `node` + the absolute path to avoid any PATH dependency. Otherwise it falls back to `npx -y --package=@mindflight/ghostcrab-personal-mcp@latest gcp brain up`.

## Quick add: `claude mcp add`

Options such as `--transport`, `--env`, and `--scope` go **before** the server name. After `--`, everything is the server command and its arguments. See the [Claude Code MCP documentation](https://code.claude.com/docs/en/mcp).

### User scope — with a local install (recommended — no PATH dependency)

```bash
claude mcp add --transport stdio \
  --env GHOSTCRAB_DATABASE_KIND=sqlite \
  --env GHOSTCRAB_EMBEDDINGS_MODE=disabled \
  ghostcrab-personal-mcp -- node /path/to/node_modules/@mindflight/ghostcrab-personal-mcp/bin/gcp.mjs brain up
```

Resolve the absolute path once with:

```bash
realpath node_modules/@mindflight/ghostcrab-personal-mcp/bin/gcp.mjs
```

### User scope — via npx (no local install)

```bash
claude mcp add --transport stdio \
  --env GHOSTCRAB_DATABASE_KIND=sqlite \
  --env GHOSTCRAB_EMBEDDINGS_MODE=disabled \
  ghostcrab-personal-mcp -- npx -y --package=@mindflight/ghostcrab-personal-mcp@latest gcp brain up
```

Note: the `--package=<scoped>@latest` form is **required** for scoped packages whose bin name (`gcp`) differs from the package name. The legacy form `npx -y @mindflight/ghostcrab-personal-mcp@latest gcp brain up` fails on npm 10/11 with `npm error could not determine executable to run`.

### Project scope (versioned `.mcp.json` in the repository)

```bash
claude mcp add --transport stdio --scope project \
  --env GHOSTCRAB_DATABASE_KIND=sqlite \
  --env GHOSTCRAB_EMBEDDINGS_MODE=disabled \
  ghostcrab-personal-mcp -- node /path/to/node_modules/@mindflight/ghostcrab-personal-mcp/bin/gcp.mjs brain up
```

### Optional flags and environment

- **Workspace name:** add `gcp` args after `up` (or `brain`, `up`), e.g. `gcp brain up --workspace my-project` (legacy: `gcp serve …`).
- **SQLite file path:** if you do not want the default file under the process working directory, set `GHOSTCRAB_SQLITE_PATH` to an absolute path.
- **Embeddings:** for hybrid search with an API, configure `GHOSTCRAB_EMBEDDINGS_MODE` and related settings as described in the main README.

Example with a fixed database file and a workspace:

```bash
claude mcp add --transport stdio \
  --env GHOSTCRAB_DATABASE_KIND=sqlite \
  --env GHOSTCRAB_SQLITE_PATH=/path/to/ghostcrab.sqlite \
  --env GHOSTCRAB_EMBEDDINGS_MODE=disabled \
  ghostcrab-personal-mcp -- node /path/to/node_modules/@mindflight/ghostcrab-personal-mcp/bin/gcp.mjs brain up --workspace my-project
```

## Add from JSON: `claude mcp add-json`

```bash
claude mcp add-json ghostcrab-personal-mcp '{
  "type": "stdio",
  "command": "node",
  "args": ["/path/to/node_modules/@mindflight/ghostcrab-personal-mcp/bin/gcp.mjs", "brain", "up"],
  "env": {
    "GHOSTCRAB_DATABASE_KIND": "sqlite",
    "GHOSTCRAB_EMBEDDINGS_MODE": "disabled"
  }
}'
```

Add `--scope user` or `--scope project` when the CLI offers it, to match how you want the entry stored.

## Check that it is registered

```bash
claude mcp list
claude mcp get ghostcrab-personal-mcp
```

In Claude Code, use **`/mcp`** to confirm tools and, when needed, OAuth for remote services (not used by the local GhostCrab stdio flow above).

## Install from a local pack (development)

If you built a tarball (for example with `pnpm run pack:local` and a file under `dist-pack/`), add the package to a test project, then point `claude mcp add` at `node /path/to/node_modules/.../bin/gcp.mjs` with args `brain`, `up` (or legacy `serve`) for that project.

## Windows (native, outside WSL)

If `npx` / `pnpm` over stdio misbehaves, the Claude Code docs suggest wrapping with `cmd /c` for local servers. Example pattern:

```bash
claude mcp add --transport stdio --env GHOSTCRAB_DATABASE_KIND=sqlite \
  ghostcrab-personal-mcp -- cmd /c node C:\path\to\node_modules\@mindflight\ghostcrab-personal-mcp\bin\gcp.mjs brain up
```

Adjust if your shell or path layout differs.

## Import from Claude Desktop (optional)

If you already use GhostCrab in Claude Desktop:

```bash
claude mcp add-from-claude-desktop
claude mcp list
```

(Supported on macOS and WSL per Claude Code documentation.)

## Related material in this repository

- [README_CURSOR_MCP.md](README_CURSOR_MCP.md) — Cursor `mcp.json` setup, absolute-path form, ENOENT troubleshooting.
- [README_CODEX_MCP.md](README_CODEX_MCP.md) — Codex `config.toml` setup.
- [ghostcrab-skills/GHOSTCRAB_INTEGRATION.md](ghostcrab-skills/GHOSTCRAB_INTEGRATION.md) — how skills in this monorepo expect a GhostCrab connection.
- [Main README](README.md) — architecture, environment variables, and backend setup.
