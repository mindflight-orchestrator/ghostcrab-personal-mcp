# GhostCrab + Codex

This guide is the dedicated entry point for running **GhostCrab** with **OpenAI Codex**: MCP server wiring, optional environment, and how to install the skill mirrors in this folder.

For how `ghostcrab-skills` relates to the product repo, see [GHOSTCRAB_INTEGRATION.md](../GHOSTCRAB_INTEGRATION.md). For launcher details (`gcp`) and other clients, see the main [README.md](README.md). Quick install: [INSTALL.md](INSTALL.md).

## Prerequisites

- **Node.js** 20+ and a package runner (`pnpm` or `npm`).
- **GhostCrab MCP** available as a local `node_modules` install **or** via `npx` / `pnpm dlx` (no global install).

The npm package for this SQLite distribution is **`@mindflight/ghostcrab-personal-mcp`**. Substitute that name in every `npx` / `pnpm dlx` / `codex mcp add` example below.

MCP clients should invoke **`gcp brain up`** (or legacy **`gcp serve`**), optionally with `--workspace <name>` — not a bare `gcp` with no subcommand. See [docs/GCP_COMMANDS.md](docs/GCP_COMMANDS.md).

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
```

When a local `node_modules/@mindflight/ghostcrab-personal-mcp/bin/gcp.mjs` is reachable from the current directory, the generator uses `node` + the absolute path to avoid any PATH dependency. Otherwise it falls back to `npx -y --package=@mindflight/ghostcrab-personal-mcp@latest gcp brain up`.

This runs `codex mcp add ghostcrab-personal-mcp -- <command> <args>` for you, then prints the TOML fallback if you need to paste it manually.

## Part 1 — Register the MCP server in Codex manually

Codex can load MCP servers from the **CLI** or from **`config.toml`**. Official reference: [Model Context Protocol – Codex](https://developers.openai.com/codex/mcp) and [Configuration Reference](https://developers.openai.com/codex/config-reference).

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
codex mcp --help
codex
```

In the Codex TUI, run:

```text
/mcp
```

You should see **`ghostcrab-personal-mcp`** listed.

## Part 2 — Install the Codex skill mirrors

This directory contains three skills:

| Folder | Role |
|--------|------|
| [ghostcrab-memory/](ghostcrab-memory/) | Durable working memory, onboarding, long-running work |
| [ghostcrab-prompt-guide/](ghostcrab-prompt-guide/) | Prompt and workflow guidance aligned with GhostCrab |
| [ghostcrab-data-architect/](ghostcrab-data-architect/) | Structured domain modeling patterns |

Each skill's `SKILL.md` links to shared contracts under **`../shared/`** (for example [ONBOARDING_CONTRACT.md](../shared/ONBOARDING_CONTRACT.md)). Those paths assume this layout:

```text
ghostcrab-skills/
├── codex/
│   ├── ghostcrab-memory/
│   ├── ghostcrab-prompt-guide/
│   └── ghostcrab-data-architect/
└── shared/
    ├── ONBOARDING_CONTRACT.md
    └── …
```

**Recommended:** symlink or clone the whole **`ghostcrab-skills`** tree into the place where Codex loads skills, preserving `codex/` and `shared/` as siblings—so relative links in `SKILL.md` keep working.

If your Codex version documents a single skills root directory, point it at the parent of `codex/` and `shared/`, or follow the vendor's instructions for multi-folder skills.

## Part 3 — Shared rules of the road

- **First fuzzy onboarding** is **intake-only**: follow [ONBOARDING_CONTRACT.md](../shared/ONBOARDING_CONTRACT.md) in full.
- **Product language first** in skills; avoid leading with low-level mechanics unless the user asks.
- **Demo data** (optional): portable profiles live under [shared/demo-profiles/](../shared/demo-profiles/); loading them uses product-side tooling, not Codex itself.

## See also

- [GHOSTCRAB_INTEGRATION.md](../GHOSTCRAB_INTEGRATION.md) — repo split, validation, versioning
- [README_CURSOR_MCP.md](README_CURSOR_MCP.md) — Cursor `mcp.json` setup, absolute-path form, ENOENT troubleshooting
- [README_CLAUDE_CODE_MCP.md](README_CLAUDE_CODE_MCP.md) — Claude Code `claude mcp add` setup
- [ghostcrab-skills README.md](../README.md) — full layout and validation commands
