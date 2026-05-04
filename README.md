# GhostCrab

**`@mindflight/ghostcrab-personal-mcp`** — SQLite storage, **MindBrain** (Zig) HTTP backend, **`gcp`** CLI, and MCP tools for agents.

GhostCrab exposes a structured domain model (**facets**, **graph**, **projections**) through **12+** `ghostcrab_*` MCP tools. This package implements that model on **SQLite** via MindBrain — not a generic text blob store.

Other GhostCrab distributions may use different database stacks; match the package name to what you installed.

---

## Install from npm (recommended)

1. **Prerequisites:** Node.js **20+** and network access for dependencies.
2. **Install the package** (pick one):
   - Global: `npm install -g @mindflight/ghostcrab-personal-mcp@latest`
   - Smoke check without global: `npx -y @mindflight/ghostcrab-personal-mcp@latest gcp --help`

   npm pulls a **platform-specific optional dependency** (`linux-x64`, `linux-arm64`, `darwin-x64`, `darwin-arm64`, `win32-x64`). If that fails, add a platform tarball from a local build or beta zip — see [INSTALL.md](INSTALL.md).

   **Local dependency install:** If you `npm install @mindflight/ghostcrab-personal-mcp` inside a project that already has its own `package.json`, `postinstall` creates **`./data/`**, copies **`.env`** from the package’s `.env.example` when `.env` is missing, and adds **symlinks** at the project root to `README.md`, `INSTALL.md`, `Licence.md`, and the IDE-specific READMEs shipped in the package (so you are not left with only `node_modules`). Opt out: `GHOSTCRAB_SKIP_HOST_BOOTSTRAP=1`.

   **pnpm users:** pnpm 10+ ignores `postinstall` scripts by default and prints **`Ignored build scripts: @mindflight/ghostcrab-personal-mcp`**. To get `.env`/`data/`/doc symlinks (and the native backend chmod), run **`pnpm approve-builds`** once and pick `@mindflight/ghostcrab-personal-mcp`, or install with **`pnpm add --allow-build=@mindflight/ghostcrab-personal-mcp @mindflight/ghostcrab-personal-mcp@latest`**. With **npm** there is nothing extra to do.

3. **Native binary permissions:** If `postinstall` suggested it, run **`npx gcp authorize`**.

4. **Verify before the IDE:** Cursor and other MCP hosts spawn a process from `mcp.json`. Confirm the CLI and backend load from your project directory first:

   ```bash
   npx gcp brain up --help
   ```

   Optional deeper check (prints the resolved SQLite path, then waits on stdio for MCP — stop with Ctrl+C):

   ```bash
   timeout 8 npx gcp brain up
   ```

   If that fails, fix `PATH`, prebuilds, or permissions before running `brain setup`. If the IDE shows **`spawn gcp ENOENT`** or **`npm error could not determine executable to run`**, re-run `npx gcp brain setup cursor --force` — it writes an absolute-path entry under **`ghostcrab-personal-mcp`** and removes the stale `ghostcrab` block (see [README_CURSOR_MCP.md](README_CURSOR_MCP.md#cursor-spawn-gcp-enoent--npm-error-could-not-determine-executable-to-run)).

5. **Wire your IDE:** from the same project, run **one** of:

   ```bash
   npx gcp brain setup cursor --force
   npx gcp brain setup codex
   npx gcp brain setup claude
   ```

   The generator auto-selects the most reliable launch form: **absolute `node` + `bin/gcp.mjs`** when the package is locally installed, global `gcp` absolute path when available, or `npx -y --package=@mindflight/ghostcrab-personal-mcp@latest gcp brain up` as fallback. No PATH dependency. The legacy `ghostcrab` entry is auto-removed.

   These register the MCP entry and install client-specific rules/skills stubs. Exact `mcp.json` / env flags: [README_CURSOR_MCP.md](README_CURSOR_MCP.md), [README_CODEX_MCP.md](README_CODEX_MCP.md), [README_CLAUDE_CODE_MCP.md](README_CLAUDE_CODE_MCP.md).

6. **Optional `.env` tweaks:** A starter `.env` may already exist after step 2. For hybrid embeddings or overrides, edit it or copy [.env.example](.env.example) — copy paths for local vs global install are in [INSTALL.md](INSTALL.md).

7. **Runtime:** MCP clients should start **`gcp brain up`** (or legacy **`gcp serve`**): that launches MindBrain, creates **`./data/ghostcrab.sqlite`** by default (cwd-dependent), and keeps **stdio** for MCP.

**More install channels** (beta zip, Git, document import, `gcp brain document …`): [INSTALL.md](INSTALL.md). CLI reference: [docs/GCP_CLIENT_SETUP.md](docs/GCP_CLIENT_SETUP.md).

---

## Why not a vector store or a plain memory tool?

Vector stores answer “what is similar to X?” GhostCrab answers:

- “What entities match these filters and aggregations?” (**facets**)
- “What does X depend on several hops away?” (**graph**)
- “What was the agent working on and where did it stop?” (**projections**)

Those work together behind MindBrain instead of a flat document pile.

## Concrete use cases

**Web agency — multi-source audit consolidation**  
Facets aggregate KPIs, the graph maps dependencies, projections track audit state across sessions.

**SaaS documentation — automated user story generation**  
Ontology + graph traversal to surface stories, gaps, and automation ideas.

## Core architecture

- **GhostCrab MCP server** (Node): `ghostcrab_*` tools, validation, HTTP to MindBrain — it does **not** open the SQLite file directly.
- **MindBrain backend** (Zig): listens on `GHOSTCRAB_BACKEND_ADDR` (default `:8091`), owns `GHOSTCRAB_SQLITE_PATH` (default `./data/ghostcrab.sqlite`), schema bootstrap, workspace seed.

Environment reference: [.env.example](.env.example).

## Multi-dimensional capabilities

| Dimension | Agent capability | Example use case |
| :--- | :--- | :--- |
| **Facets** | Filter, track state, aggregate | Compliance tracking |
| **Graph** | Dependencies, multi-hop reasoning | CRM blockers |
| **Projections** | Working context, snapshots | Onboarding continuity |

## Supported agent environments

- [README_CLAUDE_CODE_MCP.md](README_CLAUDE_CODE_MCP.md) — Claude Code  
- [README_CODEX_MCP.md](README_CODEX_MCP.md) — Codex  
- [README_CURSOR_MCP.md](README_CURSOR_MCP.md) — Cursor  
- OpenClaw, mindBot (see skills / product docs)

## Model compatibility

GhostCrab works with **any model** exposed by your client; the tiers below describe **behavioral reliability** with MindBrain conventions (intake questions, projections, graph), not API support.

### Why lower-tier models are limited

Smaller models may skip first-turn intake, truncate tool chains, or use non-canonical schemas. The server keeps working; data quality suffers.

### Practical limits outside Tier 1

- **Tier 2** — Later turns may skip graph (`learn`) or projections (`project`).
- **Tier 3** — Often misses required onboarding lines/questions or leaves flows incomplete.

### Recommendation

Use frontier-class models for **first workspace / fuzzy onboarding**. Use lighter models for narrow tasks once conventions are stable.

### Tier summary

| Tier | Models | Notes |
|------|--------|-------|
| **1 — Full** | Composer 2 Fast, Kimi 2.5, Sonnet 4.5+, Opus 4.5+ | Strong onboarding adherence |
| **2 — With caveats** | Haiku 4.5 | Good first turn; may drop graph/projections later |
| **3 — Partial** | Gemini 2.5 Flash | Weak template adherence |

## MCP tool surface

| Group | Tools |
|---|---|
| Facets | `ghostcrab_search`, `ghostcrab_remember`, `ghostcrab_upsert`, `ghostcrab_count`, `ghostcrab_facet_tree`, `ghostcrab_query_geo` |
| Graph | `ghostcrab_learn`, `ghostcrab_traverse`, `ghostcrab_marketplace`, `ghostcrab_patch`, `ghostcrab_coverage` |
| Projections | `ghostcrab_project`, `ghostcrab_pack`, `ghostcrab_status` |
| Schema | `ghostcrab_schema_register`, `ghostcrab_schema_list`, `ghostcrab_schema_inspect` |
| Workspace | `ghostcrab_workspace_create`, `ghostcrab_workspace_list`, `ghostcrab_workspace_inspect`, `ghostcrab_workspace_export_model`, `ghostcrab_workspace_export_model_toon`, `ghostcrab_ddl_propose`, `ghostcrab_ddl_list_pending`, `ghostcrab_ddl_execute` |

Contract: [docs/dev/mcp_tools_contract.md](docs/dev/mcp_tools_contract.md).

## Contributors (Git checkout)

MindBrain ships as a submodule (`vendor/mindbrain`). Clone recursively:

```bash
git clone --recurse-submodules https://github.com/OWNER/ghostcrab-personal-mcp.git
cd ghostcrab-personal-mcp
git submodule update --init --recursive   # if you cloned without --recurse-submodules
```

Upstream MindBrain: [github.com/mindflight-orchestrator/mindbrain](https://github.com/mindflight-orchestrator/mindbrain).

Then:

```bash
cp .env.example .env   # optional
npm install && npm run build
npx gcp brain up        # needs prebuilds/ or Makefile backend build
```

Tests / pack smoke: `npm run test`, `npm run verify:pack`. Maintainer integration (Docker database stack): see [docs/dev/INTERNALS.md](docs/dev/INTERNALS.md).

## Telemetry

Opt-in, off by default. Enable with `MCP_TELEMETRY=1` and `GHOSTCRAB_TELEMETRY_ENDPOINT` (`https://` only). Anonymous metadata only — no prompts or DB payloads. **`--no-telemetry`** disables for one process.

- Policy: [https://telemetry.ghostcrab.be](https://telemetry.ghostcrab.be)  
- Fields / implementation: [docs/dev/INTERNALS.md](docs/dev/INTERNALS.md#telemetry)

## Going further

Repository layout, validation, parity notes, packaging: [docs/dev/INTERNALS.md](docs/dev/INTERNALS.md).
