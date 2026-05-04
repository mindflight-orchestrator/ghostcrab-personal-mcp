# GhostCrab + Codex

This guide is the dedicated entry point for running **GhostCrab** with **OpenAI Codex**: MCP server wiring, optional environment, and how to install the skill mirrors in this folder.

For how `ghostcrab-skills` relates to the product repo, see [GHOSTCRAB_INTEGRATION.md](../GHOSTCRAB_INTEGRATION.md). For launcher details (`gcp`, `ghostcrab`) and other clients, see the product doc [GCP_CLIENT_SETUP.md](../../docs/GCP_CLIENT_SETUP.md).

## Prerequisites

- **Node.js** 20+ and a package runner (`pnpm` or `npm`).
- **GhostCrab MCP** available as a global CLI **or** via `pnpm dlx` / `npx` (no global install).

Published package: `@mindflight/ghostcrab-mcp` (binaries: `gcp`, `ghostcrab`). MCP clients should invoke **`gcp brain up`** or **`gcp up`** (legacy: **`gcp serve`**), optionally with `--workspace <name>`. See the product [GCP_COMMANDS.md](../../docs/GCP_COMMANDS.md).

Initialize a workspace once if you use a named workspace:

```bash
gcp brain workspace create my-project
# legacy: gcp init my-project
```

## Part 1 — Register the MCP server in Codex

Codex can load MCP servers from the **CLI** or from **`config.toml`**. Official reference: [Model Context Protocol – Codex](https://developers.openai.com/codex/mcp) and [Configuration Reference](https://developers.openai.com/codex/config-reference).

### Option A — CLI

With `gcp` on your `PATH` (e.g. after `pnpm add -g @mindflight/ghostcrab-mcp`):

```bash
codex mcp add ghostcrab -- gcp brain up --workspace my-project
```

Without a global install:

```bash
codex mcp add ghostcrab -- pnpm dlx @mindflight/ghostcrab-mcp gcp brain up --workspace my-project
```

### Option B — `~/.codex/config.toml` or `.codex/config.toml`

Project-level `.codex/config.toml` is only honored for **trusted** projects (see Codex config docs).

**Global `gcp`:**

```toml
[mcp_servers.ghostcrab]
command = "gcp"
args = ["brain", "up", "--workspace", "my-project"]
```

**No global install:**

```toml
[mcp_servers.ghostcrab]
command = "pnpm"
args = ["dlx", "@mindflight/ghostcrab-mcp", "gcp", "brain", "up", "--workspace", "my-project"]
```

**Optional environment** (SQLite path, backend URL, embeddings mode, etc.):

```toml
[mcp_servers.ghostcrab.env]
GHOSTCRAB_SQLITE_PATH = "/absolute/path/to/your/ghostcrab.sqlite"
```

**Pass through shell variables:**

```toml
[mcp_servers.ghostcrab]
command = "gcp"
args = ["brain", "up", "--workspace", "my-project"]
env_vars = ["GHOSTCRAB_SQLITE_PATH", "OPENROUTER_API_KEY"]
```

**Working directory:** if you rely on defaults like `./data/ghostcrab.sqlite`, set `cwd` to the directory where that data should live.

```toml
[mcp_servers.ghostcrab]
command = "gcp"
args = ["brain", "up", "--workspace", "my-project"]
cwd = "/absolute/path/to/project"
```

Optional tuning (timeouts, enabled tools) matches Codex’s documented keys: `enabled`, `startup_timeout_sec`, `tool_timeout_sec`, `enabled_tools`, `disabled_tools`, etc.

### Verify

```bash
codex mcp --help
codex
```

In the Codex TUI, run:

```text
/mcp
```

You should see **`ghostcrab`** (or the server name you chose) listed.

## Part 2 — Install the Codex skill mirrors

This directory contains three skills:

| Folder | Role |
|--------|------|
| [ghostcrab-memory/](ghostcrab-memory/) | Durable working memory, onboarding, long-running work |
| [ghostcrab-prompt-guide/](ghostcrab-prompt-guide/) | Prompt and workflow guidance aligned with GhostCrab |
| [ghostcrab-data-architect/](ghostcrab-data-architect/) | Structured domain modeling patterns |

Each skill’s `SKILL.md` links to shared contracts under **`../shared/`** (for example [ONBOARDING_CONTRACT.md](../shared/ONBOARDING_CONTRACT.md)). Those paths assume this layout:

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

If your Codex version documents a single skills root directory, point it at the parent of `codex/` and `shared/`, or follow the vendor’s instructions for multi-folder skills.

## Part 3 — Shared rules of the road

- **First fuzzy onboarding** is **intake-only**: follow [ONBOARDING_CONTRACT.md](../shared/ONBOARDING_CONTRACT.md) in full.
- **Product language first** in skills; avoid leading with low-level mechanics unless the user asks.
- **Demo data** (optional): portable profiles live under [shared/demo-profiles/](../shared/demo-profiles/); loading them uses product-side tooling, not Codex itself.

## See also

- [GHOSTCRAB_INTEGRATION.md](../GHOSTCRAB_INTEGRATION.md) — repo split, validation, versioning
- [GCP_CLIENT_SETUP.md](../../docs/GCP_CLIENT_SETUP.md) — `gcp` commands, Cursor, Claude Code, local packs
- [openclaw/README.md](../openclaw/README.md) — same integration pattern for OpenClaw
- [ghostcrab-skills README.md](../README.md) — full layout and validation commands
