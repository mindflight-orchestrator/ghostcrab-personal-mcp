# GhostCrab and Cursor (MCP)

This guide is only about **connecting the GhostCrab MCP server in [Cursor](https://cursor.com/docs/mcp)**. For what GhostCrab does and how the backend is built, see the [main README](README.md).

## What you are connecting

- **Transport:** `stdio` (a local process). Use the **CLI / stdio** style entry in `mcp.json`, not a remote URL, for the usual local package install.
- **Command:** the `gcp` CLI from this package — run **`gcp brain up`**, **`gcp up`**, or legacy **`gcp serve`** so the process starts the MindBrain backend and the MCP server on stdin/stdout.
- **NPM package name** (as in this repo’s `package.json`): `@mindflight/ghostcrab-personal-mcp`. Other guides may cite `@mindflight/ghostcrab-mcp`; use **`ghostcrab-personal-mcp`** for this SQLite distribution. Quick paths: [INSTALL.md](INSTALL.md).

You need **Node 20+** and a build of this package that includes a **prebuilt backend** for your OS under `prebuilds/`, *or* you must build the Zig backend yourself (see the main README and `Makefile`).

## Where to put configuration

| Scope | File |
|--------|------|
| **This repository only** | `.cursor/mcp.json` at the project root |
| **All your projects** | `~/.cursor/mcp.json` |

Project configuration applies to that workspace; global configuration applies everywhere. If the same server name exists in both, the usual expectation is that **project settings take precedence** over global ones—confirm in Cursor if you duplicate names.

You can also manage MCP servers from **Settings → Features → Model Context Protocol** (toggle servers on or off without deleting the file). See the [Cursor MCP documentation](https://cursor.com/docs/mcp).

## Example: `mcp.json` (stdio)

The **recommended** entry, and what `gcp brain setup cursor` writes from a project that has the package locally installed (since 0.2.10), uses **absolute paths for both the node binary and the CLI script**. This is the only form that survives Cursor's spawn environment unconditionally — Cursor uses its own bundled node when bare `"node"` is set as the command, which is not the same as the user's system node.

Create or edit `.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (global):

```json
{
  "mcpServers": {
    "ghostcrab-personal-mcp": {
      "type": "stdio",
      "command": "/absolute/path/to/your/node",
      "args": [
        "/absolute/path/to/node_modules/@mindflight/ghostcrab-personal-mcp/bin/gcp.mjs",
        "brain",
        "up"
      ],
      "env": {
        "GHOSTCRAB_DATABASE_KIND": "sqlite",
        "GHOSTCRAB_EMBEDDINGS_MODE": "disabled"
      }
    }
  }
}
```

The generator fills in both absolute paths automatically from `process.execPath` (your system node) and from the local `node_modules` it finds. Re-run setup after a Node.js version upgrade to refresh the node path. To generate:

```bash
npx gcp brain setup cursor              # auto: prefers absolute node + gcp.mjs
npx gcp brain setup cursor --force      # overwrite an existing entry
```

`gcp brain setup cursor` (since 0.2.10) also **auto-removes** any pre-0.2.10 `mcpServers.ghostcrab` block it previously wrote — that block is the source of `spawn gcp ENOENT` and `npm error could not determine executable to run` after upgrades.

If you have no local `node_modules` (e.g. a clean machine where you only want to run via npx), the generator falls back to:

```json
{
  "mcpServers": {
    "ghostcrab-personal-mcp": {
      "type": "stdio",
      "command": "npx",
      "args": [
        "-y",
        "--package=@mindflight/ghostcrab-personal-mcp@latest",
        "gcp",
        "brain",
        "up"
      ],
      "env": {
        "GHOSTCRAB_DATABASE_KIND": "sqlite",
        "GHOSTCRAB_EMBEDDINGS_MODE": "disabled"
      }
    }
  }
}
```

The `--package=<scoped>@latest` form is **required** for scoped packages whose name does not match the bin name (`@mindflight/ghostcrab-personal-mcp` vs `gcp`). The legacy form `npx -y @mindflight/ghostcrab-personal-mcp@latest gcp brain up` produces `npm error could not determine executable to run` on npm 10/11 — do not use it.

**Restart Cursor** (or reload the window) after changing `mcp.json` so the server is picked up.

### Optional: workspace, SQLite path, env file

- **Named workspace** — append to `args` after `up` (or `brain`, `up`), e.g. `"brain", "up", "--workspace", "my-project"`. Legacy: `"serve", "--workspace", "…"`.
- **Fixed SQLite file** — set `GHOSTCRAB_SQLITE_PATH` in `env` to an absolute path, or use interpolation (see below).
- **Extra variables from a file** — for stdio servers, Cursor supports `envFile` (for example `".env"` or `"${workspaceFolder}/.env"`). See [Cursor docs — STDIO server configuration](https://cursor.com/docs/mcp).

Example with `workspaceFolder` and an optional sqlite path under the project:

```json
{
  "mcpServers": {
    "ghostcrab-personal-mcp": {
      "type": "stdio",
      "command": "/absolute/path/to/your/node",
      "args": [
        "/absolute/path/to/node_modules/@mindflight/ghostcrab-personal-mcp/bin/gcp.mjs",
        "brain",
        "up",
        "--workspace",
        "my-project"
      ],
      "env": {
        "GHOSTCRAB_DATABASE_KIND": "sqlite",
        "GHOSTCRAB_EMBEDDINGS_MODE": "disabled",
        "GHOSTCRAB_SQLITE_PATH": "${workspaceFolder}/.ghostcrab/ghostcrab.sqlite"
      }
    }
  }
}
```

Interpolation such as `${workspaceFolder}` and `${env:VAR_NAME}` is supported in the fields Cursor documents (`command`, `args`, `env`, `url`, `headers`).

## Cursor: spawn gcp ENOENT / npm error could not determine executable to run

Two related symptoms in `~/.cursor/logs/.../anysphere.cursor-mcp.MCP …`:

- **`Connection failed: spawn gcp ENOENT`** — Cursor tried to spawn a `command` of `gcp`, but `gcp` is not on the PATH Cursor inherits when it launches MCP servers (this is *not* the same PATH as your shell, especially on macOS).
- **`npm error could not determine executable to run`** — Cursor tried to spawn `npx -y @mindflight/ghostcrab-personal-mcp@latest gcp brain up`, but on npm 10/11 that legacy form fails for scoped packages whose name does not match a bin name.

**Both symptoms are fixed by re-running setup on 0.2.10+:**

```bash
npx gcp brain setup cursor --force
```

This writes the canonical entry shown above (absolute `node` + `bin/gcp.mjs`) and removes any stale `mcpServers.ghostcrab` block from older versions.

If you cannot upgrade, hand-edit `~/.cursor/mcp.json`:

1. Replace the `mcpServers.ghostcrab` block with the absolute-`node` form from [Example: `mcp.json` (stdio)](#example-mcpjson-stdio).
2. Or, if you really want to use `npx`, switch the args to `["-y", "--package=@mindflight/ghostcrab-personal-mcp@latest", "gcp", "brain", "up"]` (note `--package=`).
3. Restart Cursor.

## Remote / HTTP (not the default for this package)

If you self-host a GhostCrab-compatible endpoint over **HTTP** or **SSE** later, the shape in `mcp.json` is the `url` + optional `headers` / `auth` form described in the [Cursor MCP guide](https://cursor.com/docs/mcp). The default distribution of this repository is **local stdio** via `gcp brain up` / `gcp up` (legacy: `gcp serve`). See [docs/GCP_COMMANDS.md](docs/GCP_COMMANDS.md).

## Check that it works

1. **Chat / Agent** — GhostCrab tools should appear under available MCP tools when relevant. You can ask the agent to use a specific `ghostcrab_*` tool by name (see the main README for the tool surface).
2. **Logs** — **Output** panel (e.g. **Cmd/Ctrl+Shift+U**), select **MCP Logs**, to see connection and runtime errors.
3. **Approval** — by default, Cursor asks before running MCP tools; you can adjust auto-run in Cursor settings and `permissions.json` if needed.

## Install from a local pack (development)

If you built a tarball (for example with `pnpm run pack:local` and a file under `dist-pack/`), install that package in a project, then set `command` to `pnpm` and `args` to `["exec", "gcp", "brain", "up", ...]`, or use `node` with an absolute path to `node_modules/@mindflight/ghostcrab-personal-mcp/bin/gcp.mjs` and `args` like `["brain", "up", "--workspace", "dev"]` (or legacy `serve`).

**Beta zip (`pnpm run beta:bundle`):** unzip, then run `node install-beta.mjs` in that folder. It installs the root `.tgz` and the correct platform prebuild for the current OS and CPU. Then point `mcp.json` at `node` + absolute path to `node_modules/@mindflight/ghostcrab-personal-mcp/bin/gcp.mjs` as above. See `docs/dev/beta_testers_readme.md`.

## Windows notes

- Prefer **Node / pnpm / npx** on `PATH` in `command` + `args`, as in the examples.
- If you see spurious “connection closed” behavior with `npx`, try invoking **Node** with the full path to the installed `gcp.mjs` instead, or a wrapper similar to `cmd /c` for your environment (analogous to other Windows MCP setups).

## Tool count

Cursor enforces a **limit on how many tools** can be active across all MCP servers (see current Cursor release notes or Settings). If you use many servers at once, you may need to disable others or rely on tool toggles so GhostCrab tools stay available.

## Agent rules and onboarding (separate from MCP)

For **Cursor rules** (always-on behavior, onboarding) and `CLAUDE.md` at the repo root, see [ghostcrab-skills/cursor/README.md](ghostcrab-skills/cursor/README.md) and the [ONBOARDING_CONTRACT](ghostcrab-skills/shared/ONBOARDING_CONTRACT.md). That is orthogonal to the MCP connection described here.

## Related documentation

- [README_CLAUDE_CODE_MCP.md](README_CLAUDE_CODE_MCP.md) — same server, **Claude Code** CLI setup (`claude mcp add`).
- [ghostcrab-skills/GHOSTCRAB_INTEGRATION.md](ghostcrab-skills/GHOSTCRAB_INTEGRATION.md) — how skills in this monorepo expect a GhostCrab connection.
- [Main README](README.md) — architecture, environment variables, and backend setup.
