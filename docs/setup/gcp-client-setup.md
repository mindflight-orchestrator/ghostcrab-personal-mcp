# GhostCrab CLI (`gcp`) and MCP client setup

This document covers the **`gcp` / `ghostcrab` launchers** shipped with **`@mindflight/ghostcrab-mcp`**, how to wire them into **Cursor**, **Claude Code**, and **Codex-style** setups, and how that relates to **`ghostcrab-skills`** (and similar starter kits).

## Package and binaries

- **npm package:** `@mindflight/ghostcrab-mcp`
- **Binaries:**
  - **`gcp`** — full CLI (see [gcp-commands.md](../reference/gcp-commands.md))
  - **`ghostcrab`** — backward-compatible shim that runs the same path as **`gcp brain up`** / **`gcp serve`** (stdio MCP), so older client configs that invoke `ghostcrab` keep working.

Install globally (example):

```bash
pnpm add -g @mindflight/ghostcrab-mcp
# or: npm install -g @mindflight/ghostcrab-mcp
```

From a **local pack** (see `pnpm run pack:local` / `make local-pack`):

```bash
pnpm add file:/absolute/path/to/dist-pack/mindflight-ghostcrab-mcp-<version>.tgz
```

## `gcp` commands (summary)

Full JTBD-oriented reference: **[gcp-commands.md](../reference/gcp-commands.md)**.

| Job | Preferred command | Legacy (alias) |
|-----|-------------------|----------------|
| Start MindBrain + MCP on stdio | **`gcp brain up`** (shorthand: **`gcp up`**) | **`gcp serve`** |
| Create / list workspace | **`gcp brain workspace create`**, **`gcp brain workspace list`** | **`gcp init`**, (no `list` alias before) |
| Config file | **`gcp env` …** (`list`, `show`, `get`, `set`, `path`) | **`gcp config` …** |
| Ontologies (schema in DB) | **`gcp brain schema` …** | **`gcp ontologies` …** |
| Registry skills (agent capabilities) | **`gcp agent skills` …**; one-shot: **`gcp agent equip owner/name`** | **`gcp skills` …** |
| JSONL profile load | **`gcp brain load`** or **`gcp load`** | (same) |
| Corpus import / normalize / profile | **`gcp brain document <subcommand> …`** | (no legacy alias) |
| **`gcp --help`** | Full usage text. | |

**MCP clients should pass a start subcommand** (e.g. `brain`, `up`, or legacy `serve`), not bare `gcp` with no args, so the process stays on the MCP stdio contract.

### IDE integration (Cursor, Claude Code, Codex)

On **`gcp brain workspace create`** (alias **`gcp init`**) and **`gcp brain up`** (alias **`gcp serve`**), GhostCrab can **copy default files** from a **`ghostcrab-skills`** checkout into the current project when it can resolve that tree:

| Resolution | |
|------------|--|
| **`GHOSTCRAB_SKILLS_ROOT`** | Absolute path to the folder that contains `cursor/`, `claude-code/`, `codex/`, and `shared/` |
| **Beside the npm package** | `<install-dir>/ghostcrab-skills` (typical in a monorepo; not shipped in the published tarball by default) |

**Detection** (unless you override):

- **`GHOSTCRAB_IDE=cursor` \| `claude-code` \| `codex`**
- Or presence of **`.claude`**, **`.cursor`**, or **`.codex`** in the current working directory (and `CURSOR_*` env when spawned by Cursor)

**What gets installed**

| IDE | Files |
|-----|--------|
| **Cursor** | `cursor/rules/ghostcrab-memory.mdc` → `.cursor/rules/ghostcrab-memory.mdc` |
| **Claude Code** | `claude-code/self-memory/CLAUDE.md` → `.ghostcrab/claude-self-memory.md` (merge into your `CLAUDE.md` if needed) |
| **Codex** | `codex/ghostcrab-memory/` → `.codex/skills/ghostcrab-memory/`, `shared/` → `.codex/skills/ghostcrab-shared/`, with `SKILL.md` links rewritten to `../ghostcrab-shared/` |

**Opt out / refresh**

- **`--no-skills`** on `init` / `brain workspace create` or on `serve` / `brain up` — skip installation
- **`GHOSTCRAB_SKIP_IDE_SKILLS=1`** — same globally
- **`gcp init … --force-skills`** — overwrite existing stubs (`brain up` / `serve` do not take `--force-skills`; use `init` or delete files first)

Messages on **`gcp brain up`** / **`gcp serve`** go to **stderr** (one or two lines) so stdio MCP stays clean.

### Environment variables (common)

See the root [README.md](../../README.md) for the full table. Typical SQLite defaults:

- `GHOSTCRAB_SQLITE_PATH` — SQLite file (default: `./data/ghostcrab.sqlite` in the current working directory unless overridden).
- `GHOSTCRAB_BACKEND_ADDR` / `GHOSTCRAB_MINDBRAIN_URL` — backend HTTP address (defaults documented in README).
- `GHOSTCRAB_DOCUMENT_ENGINE` — optional explicit path to the `ghostcrab-document` binary (otherwise resolved from the platform package, `prebuilds/`, or a local `zig build document-tool` output).

### Document import (`gcp brain document`)

Use **`gcp brain document`** for PDF/HTML normalization, LLM document profiling, enqueue/worker, and related MindBrain CLI flows. **Quit MCP / stop `ghostcrab-backend` first** so the SQLite file is not locked; the command probes `/health` and refuses to run if the backend is up unless you pass **`--force`**.

Database commands automatically receive **`--db`** matching your **`GHOSTCRAB_SQLITE_PATH`** (and optional **`--workspace`** / `-w` for path resolution). Run **`gcp brain document --help`** for examples. Full flag reference for subcommands such as `document-profile-worker` lives in the vendored MindBrain docs (`vendor/mindbrain/docs/document-profile.md` in this repo).

## MCP configuration examples

Server name `ghostcrab` is conventional; keep it if you copy snippets from **`ghostcrab-skills`**.

### Global install: recommended shape

```json
{
  "mcpServers": {
    "ghostcrab": {
      "command": "gcp",
      "args": ["brain", "up", "--workspace", "my-project"]
    }
  }
}
```

### Without global install (`pnpm dlx` / `npx`)

```json
{
  "mcpServers": {
    "ghostcrab": {
      "command": "pnpm",
      "args": ["dlx", "@mindflight/ghostcrab-mcp", "gcp", "brain", "up", "--workspace", "my-project"]
    }
  }
}
```

(Equivalent with `npx`/`npm exec` if you prefer.)

### Cursor

1. Add the MCP server using the JSON above (Cursor’s MCP UI or project/global MCP config, depending on your version).
2. For **agent rules**, follow [ghostcrab-skills/cursor/README.md](../../ghostcrab-skills/cursor/README.md): copy or symlink `ghostcrab-skills/cursor/rules/ghostcrab-memory.mdc` into your project `.cursor/rules/` (or merge into an existing rule).

### Claude Code

1. Merge an **`mcpServers`** block like the examples above into your project **`.mcp.json`** (or the path Claude Code expects in your layout).
2. Optional: copy hooks / fragments from **`ghostcrab-skills/claude-code/`** (e.g. `self-memory/`, `data-architect/`) — see each folder’s `README.md`.

**Note:** Some checked-in **`ghostcrab-skills/claude-code/**/.mcp.json`** examples still reference older package names or PostgreSQL `DATABASE_URL`. This **SQLite** product uses **`gcp brain up`** (or legacy **`gcp serve`**) and the **`GHOSTCRAB_*`** variables from the root README; adjust env to match how you run MindBrain.

### Codex

Codex consumes **skills** from its own skill directories. Use the mirrors under **`ghostcrab-skills/codex/`** (`ghostcrab-memory`, `ghostcrab-prompt-guide`, `ghostcrab-data-architect`) as templates to install or sync into your Codex skill path. MCP wiring is the same JSON as above; place it where your Codex / IDE integration expects MCP servers.

**Dedicated guide:** [ghostcrab-skills/codex/README.md](../../ghostcrab-skills/codex/README.md).

### OpenClaw

OpenClaw uses the same **`mcpServers`** JSON shape; merge the block from **`ghostcrab-skills/openclaw/ghostcrab-memory/mcp.json`** (or the examples above) into the MCP config your OpenClaw build expects. Install **`ghostcrab-memory`** and optionally **`ghostcrab-epistemic-agent`** per OpenClaw’s skill/agent layout; use **`openclaw/scenarios/`** for rehearsal prompts.

**Dedicated guide:** [ghostcrab-skills/openclaw/README.md](../../ghostcrab-skills/openclaw/README.md).

---

## Are `ghostcrab-skills` (or a personal starter kit) inside the `.tgz` or the SQLite DB by default?

**Short answer:** the **npm tarball ships `ghostcrab-skills/`** so **`gcp brain up`** / **`gcp serve`** can install IDE stubs (Cursor / Claude Code / Codex) **by default**. That is separate from what gets loaded into the **SQLite database** (see below).

### What the **npm tarball** contains

The published package **`files`** list includes **`bin/`**, **`dist/`**, **`ghostcrab-skills/`**, operational **`docs/`** subsets, **`examples/`**, etc. It intentionally excludes generated blog-image resources and platform binaries from the root installer package. Override the skills tree with **`GHOSTCRAB_SKILLS_ROOT`**, or skip copying with **`GHOSTCRAB_SKIP_IDE_SKILLS=1`** or **`gcp brain up --no-skills`**.

### What **SQLite initialisation** loads

When the backend starts and initialises the database, it applies migrations and the **product bootstrap** (canonical facets, schemas, ontology seeds, product graph, agent bootstrap state, etc.) from the **runtime code** — **not** from the Markdown / SKILL.md / Cursor rule files under `ghostcrab-skills/`.

### What **`ghostcrab-skills`** is for

It is **client integration**: rules, prompts, demo profiles, and copies of Codex skills. **`gcp`** copies the right stubs into the **current project** when it detects the IDE (unless skipped). It is documented as **demo / onboarding** material; see **`ghostcrab-skills/README.md`** and **`ghostcrab-skills/GHOSTCRAB_INTEGRATION.md`** (product bootstrap vs demo seed ownership).

### Optional **demo profile** data in the DB

To load **scenario JSONL** into the MindBrain/PostgreSQL database GhostCrab uses, run the demo loader from a **checkout** of this repo (with dev deps):

```bash
# Profile id under ghostcrab-skills/shared/demo-profiles/<id>.jsonl
pnpm run demo:load -- --profile <profile-id>
```

By default it looks for a sibling **`../ghostcrab-skills`**; override with **`--skills-repo-root /path/to/ghostcrab-skills`**.

**Starter kit default seed** (aligned with **starter-kit-ghostcrab-perso** template layout, shipped in this repo under `examples/starterkit-perso/`):

```bash
pnpm run demo:load:starterkit
# same as: pnpm run demo:load -- --profile-file examples/starterkit-perso/starterkit-default.jsonl
```

You can also pass **`--profile-file /any/path/profile.jsonl`** for custom JSONL in the same format as other demo profiles.

### Registry skills / schema

The commands **`gcp agent skills` / `gcp skills`** and **`gcp brain schema` / `gcp ontologies`** manage **registry-backed** artifacts (pull/show/remove), not the static `ghostcrab-skills/` folder on disk. Treat registry content and the skills repo as **related but separate** paths.

---

## See also

- [gcp-commands.md](../reference/gcp-commands.md) — full JTBD command table
- Root [README.md](../../README.md) — install, env vars, SQLite vs PostgreSQL notes.
- [ghostcrab-skills/README.md](../../ghostcrab-skills/README.md) — integration layout and quick start.
- [ghostcrab-skills/GHOSTCRAB_INTEGRATION.md](../../ghostcrab-skills/GHOSTCRAB_INTEGRATION.md) — contract between product and skills repo.
- Local pack / install smoke: `pnpm run pack:local`, `pnpm run verify:local-install` (and Makefile targets `local-pack`, `verify-local-install`).
