# GhostCrab + Codex

**Release:** `@mindflight/ghostcrab-personal-mcp@0.5.2` · MindBrain **1.7.1**

This guide is the dedicated entry point for running **GhostCrab** with **OpenAI Codex**: MCP server wiring, optional environment, and how to install the skill mirrors shipped in `bin/ide-skills/`.

For how `ghostcrab-skills` relates to the product repo, see [ghostcrab-skills/GHOSTCRAB_INTEGRATION.md](ghostcrab-skills/GHOSTCRAB_INTEGRATION.md). For launcher details (`gcp`) and other clients, see the main [README.md](README.md). Quick install: [INSTALL.md](INSTALL.md).

## Prerequisites

- **Node.js** 20+ and a package runner (`pnpm` or `npm`).
- **GhostCrab MCP** available as a local `node_modules` install **or** via `npx` / `pnpm dlx` (no global install).

The npm package for this SQLite distribution is **`@mindflight/ghostcrab-personal-mcp`**. Substitute that name in every `npx` / `pnpm dlx` / `codex mcp add` example below.

MCP clients should invoke **`gcp brain up`** (or legacy **`gcp serve`**), optionally with `--workspace <name>` — not a bare `gcp` with no subcommand. See [docs/reference/gcp-commands.md](docs/reference/gcp-commands.md).

Initialize a workspace once if you use a named workspace:

```bash
gcp brain workspace create my-project
# legacy: gcp init my-project
```

## Quickest path: `gcp brain setup codex`

From a directory where the package is installed locally (or where `gcp` is on your PATH):

```bash
npx gcp brain setup codex              # auto: prefers local install → node + absolute path
npx gcp brain setup codex --runner npx # force npx --package= form
npx gcp brain setup codex --force --name "ghostcrab-personal-mcp story2doc" \
  --db /absolute/path/to/data/ghostcrab-story2doc-codex.sqlite
```

When a local `node_modules/@mindflight/ghostcrab-personal-mcp/bin/gcp.mjs` is reachable from the current directory, the generator uses `node` + the absolute path to avoid any PATH dependency. Otherwise it falls back to `npx -y --package=@mindflight/ghostcrab-personal-mcp@latest gcp brain up`.

This runs `codex mcp add ghostcrab-personal-mcp -- <command> <args>` for you, then prints the TOML fallback if you need to paste it manually. Use `--name` / `--server-name` when you need a distinct Codex entry per project, and `--db` when the MCP launch must pin a specific SQLite file. `--force` replaces the existing Codex MCP entry before adding the new one.

## Part 1 — Register the MCP server in Codex manually

Codex CLI does **not** consume Cursor-style JSON `mcpServers` blocks. That JSON shape is for Cursor and other JSON-config MCP clients. For Codex CLI, use either:

- `codex mcp add ...`, which writes Codex's own MCP config.
- `~/.codex/config.toml` or a trusted project `.codex/config.toml` using `[mcp_servers.<name>]`.

Official reference: [Model Context Protocol – Codex](https://developers.openai.com/codex/mcp) and [Configuration Reference](https://developers.openai.com/codex/config-reference).

### Option A — CLI

**With a local install** (recommended — no PATH dependency):

```bash
codex mcp add ghostcrab-personal-mcp -- node /path/to/node_modules/@mindflight/ghostcrab-personal-mcp/bin/gcp.mjs brain up
```

Resolve the absolute path once with:

```bash
realpath node_modules/@mindflight/ghostcrab-personal-mcp/bin/gcp.mjs
```

**Without a local install** (via npx):

```bash
codex mcp add ghostcrab-personal-mcp -- npx -y --package=@mindflight/ghostcrab-personal-mcp@latest gcp brain up
```

Note: the `--package=<scoped>@latest` form is **required** for scoped packages whose bin name (`gcp`) differs from the package name. The legacy form `npx -y @mindflight/ghostcrab-personal-mcp@latest gcp brain up` fails on npm 10/11 with `npm error could not determine executable to run`.

**With a named workspace:**

```bash
codex mcp add ghostcrab-personal-mcp -- npx -y --package=@mindflight/ghostcrab-personal-mcp@latest gcp brain up --workspace my-project
```

**With a dedicated database and server name:**

```bash
codex mcp add --env GHOSTCRAB_EMBEDDINGS_MODE=disabled \
  "ghostcrab-personal-mcp story2doc" -- \
  node /path/to/node_modules/@mindflight/ghostcrab-personal-mcp/bin/gcp.mjs \
  brain up --db /absolute/path/to/data/ghostcrab-story2doc-codex.sqlite
```

### Option B — `~/.codex/config.toml` or `.codex/config.toml`

Project-level `.codex/config.toml` is only honored for **trusted** projects (see Codex config docs).

**Local install (absolute path — most reliable):**

```toml
[mcp_servers.ghostcrab-personal-mcp]
command = "node"
args = ["/absolute/path/to/node_modules/@mindflight/ghostcrab-personal-mcp/bin/gcp.mjs", "brain", "up"]
```

**Via npx (no local install):**

```toml
[mcp_servers.ghostcrab-personal-mcp]
command = "npx"
args = ["-y", "--package=@mindflight/ghostcrab-personal-mcp@latest", "gcp", "brain", "up"]
```

**Via pnpm dlx:**

```toml
[mcp_servers.ghostcrab-personal-mcp]
command = "pnpm"
args = ["dlx", "@mindflight/ghostcrab-personal-mcp@latest", "gcp", "brain", "up"]
```

**Optional environment** (SQLite path, embeddings mode, etc.):

```toml
[mcp_servers.ghostcrab-personal-mcp.env]
GHOSTCRAB_DATABASE_KIND = "sqlite"
GHOSTCRAB_EMBEDDINGS_MODE = "disabled"
GHOSTCRAB_SQLITE_PATH = "/absolute/path/to/your/ghostcrab.sqlite"
```

**Pass through shell variables:**

```toml
[mcp_servers.ghostcrab-personal-mcp]
command = "node"
args = ["/absolute/path/node_modules/@mindflight/ghostcrab-personal-mcp/bin/gcp.mjs", "brain", "up"]
env_vars = ["GHOSTCRAB_SQLITE_PATH", "OPENROUTER_API_KEY"]
```

**Working directory:** if you rely on defaults like `./data/ghostcrab.sqlite`, set `cwd` to the directory where that data should live.

```toml
[mcp_servers.ghostcrab-personal-mcp]
command = "node"
args = ["/absolute/path/node_modules/@mindflight/ghostcrab-personal-mcp/bin/gcp.mjs", "brain", "up"]
cwd = "/absolute/path/to/project"
```

Optional tuning (timeouts, enabled tools) matches Codex's documented keys: `enabled`, `startup_timeout_sec`, `tool_timeout_sec`, `enabled_tools`, `disabled_tools`, etc.

### Verify

```bash
codex mcp list
codex
```

In the Codex TUI, run:

```text
/mcp
```

You should see **`ghostcrab-personal-mcp`** listed.

If Codex lists the MCP server but the `ghostcrab_*` tools are not available in chat, check these points:

1. Restart Codex or open a new Codex session after changing MCP config. The active session does not reliably reload newly added MCP tools.
2. Make sure the entry was added through `codex mcp add` or TOML `mcp_servers`, not Cursor JSON `mcpServers`.
3. If you used project `.codex/config.toml`, make sure the project is trusted; otherwise Codex may ignore the project-level MCP config.
4. Run `/mcp` in the Codex TUI and inspect the server status. A listed server can still have zero tools if the stdio process fails during startup.
5. Prefer `--db <absolute path>` or `GHOSTCRAB_SQLITE_PATH` when Codex's working directory is not the project where `./data/ghostcrab.sqlite` should live.

Cursor JSON example, **not for Codex CLI**:

```json
{
  "mcpServers": {
    "ghostcrab-personal-mcp story2doc": {
      "type": "stdio",
      "command": "/usr/bin/node",
      "args": [
        "/absolute/path/node_modules/@mindflight/ghostcrab-personal-mcp/bin/gcp.mjs",
        "brain",
        "up",
        "--db",
        "/absolute/path/data/ghostcrab-story2doc-codex.sqlite"
      ],
      "env": {
        "GHOSTCRAB_EMBEDDINGS_MODE": "disabled"
      }
    }
  }
}
```

Equivalent Codex CLI form:

```bash
codex mcp add --env GHOSTCRAB_EMBEDDINGS_MODE=disabled \
  "ghostcrab-personal-mcp story2doc" -- \
  /usr/bin/node /absolute/path/node_modules/@mindflight/ghostcrab-personal-mcp/bin/gcp.mjs \
  brain up --db /absolute/path/data/ghostcrab-story2doc-codex.sqlite
```

## Part 2 — Install the Codex skill mirrors

**Canonical install** (same ten skills as Cursor and Claude Code):

```bash
gcp brain setup codex
# or: npx -y --package=@mindflight/ghostcrab-personal-mcp@0.5.2 gcp brain setup codex --force
```

This installs skills under `~/.codex/skills/<skill>/`, shared contracts under `~/.codex/skills/ghostcrab-shared/`, and records the install in `.ghostcrab/skills/installed.json`. Opt out with `--no-skills`.

| Folder | Role |
| ------ | ---- |
| [ghostcrab-memory/](ghostcrab-skills/codex/ghostcrab-memory/) | Durable working memory, onboarding, long-running work |
| [ghostcrab-prompt-guide/](ghostcrab-skills/codex/ghostcrab-prompt-guide/) | Prompt and workflow guidance aligned with GhostCrab |
| [ghostcrab-data-architect/](ghostcrab-skills/codex/ghostcrab-data-architect/) | Structured domain modeling patterns |
| [ghostcrab-integration-sop-editor/](ghostcrab-skills/codex/ghostcrab-integration-sop-editor/) | Cleanup and introduction rewrites for integration SOP exports |
| [mindbrain-comparison-writer/](ghostcrab-skills/codex/mindbrain-comparison-writer/) | Editorial workflow for MindBrain comparison articles |
| [ghostcrab-operator/](ghostcrab-skills/codex/ghostcrab-operator/) | Business questions → GhostCrab MCP workflows (Personal SQLite) |
| [ghostcrab-evidence-discovery/](ghostcrab-skills/codex/ghostcrab-evidence-discovery/) | Map business questions to facets, graph, projections via MCP |
| [ghostcrab-gap-auditor/](ghostcrab-skills/codex/ghostcrab-gap-auditor/) | Audit gaps between questions and available MCP evidence |
| [ghostcrab-json-answer-builder/](ghostcrab-skills/codex/ghostcrab-json-answer-builder/) | Stable JSON answers from MCP outputs (observed vs inferred vs missing) |
| [ghostcrab-projection-reviewer/](ghostcrab-skills/codex/ghostcrab-projection-reviewer/) | Review Type A/B projections and readiness via MCP |

Each skill's `SKILL.md` links to shared contracts under **`ghostcrab-shared/`** after install (for example `ONBOARDING_CONTRACT.md`, `RUNTIME_QUERY_PIPELINE.md`). Authoring source lives in [`ghostcrab-skills/`](ghostcrab-skills/) and is synced into [`bin/ide-skills/`](bin/ide-skills/) at build time.

**Manual install:** preserve `codex/skills/` and `ghostcrab-shared/` as siblings under your Codex skills root so relative links keep working. Prefer `gcp brain setup codex` over hand-copying.

## Part 3 — Shared rules of the road

- **First fuzzy onboarding** is **intake-only**: follow [ONBOARDING_CONTRACT.md](ghostcrab-skills/shared/ONBOARDING_CONTRACT.md) in full.
- **Product language first** in skills; avoid leading with low-level mechanics unless the user asks.
- **Demo data** (optional): portable profiles live under [ghostcrab-skills/shared/demo-profiles/](ghostcrab-skills/shared/demo-profiles/); loading them uses product-side tooling (`gcp brain load`), not Codex itself.

## See also

- [ghostcrab-skills/GHOSTCRAB_INTEGRATION.md](ghostcrab-skills/GHOSTCRAB_INTEGRATION.md) — repo split, validation, versioning
- [README_CURSOR_MCP.md](README_CURSOR_MCP.md) — Cursor `mcp.json` setup, absolute-path form, ENOENT troubleshooting
- [README_CLAUDE_CODE_MCP.md](README_CLAUDE_CODE_MCP.md) — Claude Code `claude mcp add` setup
- [ghostcrab-skills/README.md](ghostcrab-skills/README.md) — full layout and validation commands
- [ghostcrab-skills/codex/README.md](ghostcrab-skills/codex/README.md) — Codex-specific skill notes
