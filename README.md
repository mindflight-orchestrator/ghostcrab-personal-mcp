[GhostCrab official website](https://www.ghostcrab.be) | [mindBrain official website](https://www.mindbrain.be)

# GhostCrab Personal MCP

### The MCP interface to mindBrain — SQLite edition

**This is the personal, local distribution of GhostCrab MCP.** It runs on SQLite, installs inside your project in seconds, and requires zero infrastructure.

> Looking for the team or enterprise version? **GhostCrab Pro** runs on PostgreSQL and is built for multi-tenant, multi-agent deployments. → [mindflight-orchestrator/ghostcrab-pro-mcp](#)

---

### What is mindBrain?

**mindBrain** is a structured knowledge engine for AI agents. Instead of storing memory as text blobs or vector embeddings, mindBrain gives agents a queryable, multi-dimensional knowledge base built around three primitives:

- **Facets** — filter, aggregate, and track state across entities
- **Graph** — map dependencies and traverse relationships across multiple hops
- **Projections** — snapshot working context so agents resume exactly where they stopped

mindBrain runs on **SQLite** in this personal distribution, and on **PostgreSQL** in the Pro/Enterprise distribution. You can also store embeddings and enable a BM25 search. It offers a full solution but powered by a deterministic engine that enables agents to navigate quickly on the content before searching for it.

### What is GhostCrab MCP?

**GhostCrab MCP is the agent-facing interface to mindBrain.** It exposes mindBrain through the full `ghostcrab_*` `tools/list` catalog (memory, graph, workspace, ontology, loadout, artifact, and maintenance workflows), with a curated subset flagged as recommended defaults. Use `gcp tools verify` for the current generated counts. Any MCP-compatible agent (Cursor, Claude Code, Codex, OpenClaw, and others) can query structured knowledge, update durable memory, and navigate relationships natively, without custom integration code.

GhostCrab MCP does not own the data. mindBrain does. GhostCrab MCP is the door.

> **New here?** Start with [What is GhostCrab?](#what-is-ghostcrab) — then jump to [Install](#install).

---

## What is GhostCrab?

Most AI agent setups persist memory as text blobs or vector embeddings. That works for "find something similar." It breaks down when an agent needs to:

- Filter hundreds of entities by multiple criteria simultaneously
- Understand that Entity A blocks Entity B which depends on Entity C (multi-hop reasoning)
- Pick up a complex task mid-workflow without re-reading everything from scratch

GhostCrab solves all three through three interlocking primitives:

| Primitive       | What it does                                       | Example                                                            |
| --------------- | -------------------------------------------------- | ------------------------------------------------------------------ |
| **Facets**      | Filter, aggregate, and track state across entities | "Show all compliance items flagged this week, grouped by severity" |
| **Graph**       | Map dependencies and traverse relationships        | "What does this feature block, two levels deep?"                   |
| **Projections** | Snapshot working context so agents can resume      | "What was I doing in this workspace yesterday?"                    |

These work together inside mindBrain. There is no flat document pile — the data has structure your agents can reason against.

### How GhostCrab+mindBrain compares to alternatives

> _(See the `/docs/comparisons/` folder for 10 detailed side-by-side breakdowns.)_

The short version:

- **vs. vector stores (Pinecone, Weaviate, Chroma):** Those answer "what is similar to X?" GhostCrab answers "what matches these filters, has these relationships, and was last touched in this state?" Complementary tools, not substitutes.
- **vs. plain memory tools (mem0, basic MCP memory servers):** Those store and retrieve text. GhostCrab stores structured ontologies with typed relationships and multi-dimensional queries into mindBrain.
- **vs. graph databases (Neo4j, FalkorDB):** Full graph DBs are powerful but heavy. GhostCrab embeds a graph model directly in SQLite via mindBrain — zero infrastructure, same project directory, MCP-native. In the Pro version it manage 4,3 billions objects per table.

---

## Architecture in 60 seconds

```
Your IDE / Agent
      │  MCP stdio
      ▼
GhostCrab MCP Server (Node.js)
  ghostcrab_* tools — validates requests, routes to backend
      │  HTTP
      ▼
mindBrain Backend (Zig)
  Listens on :8091 — owns the SQLite file, schema bootstrap, workspace logic
      │
      ▼
~/.ghostcrab/databases/ghostcrab.sqlite   ← your structured knowledge base
```

The MCP server never touches the SQLite file directly. mindBrain owns it. This separation means you can run multiple agent clients pointing at the same backend.

---

## Install

### Prerequisites

- Node.js 20+
- Network access (to pull the platform-specific native binary on first install)

### Step 1 — Install the package

From your project directory:

```bash
npm install @mindflight/ghostcrab-personal-mcp@latest
```

Or globally if you prefer:

```bash
npm install -g @mindflight/ghostcrab-personal-mcp@latest
```

> **pnpm users:** pnpm 10+ blocks postinstall scripts by default.
> Run this once:

````bash
> pnpm add --allow-build=@mindflight/ghostcrab-personal-mcp @mindflight/ghostcrab-personal-mcp@latest
```

After install, postinstall creates a `./data/` directory, copies `.env.example` → `.env` if no `.env` exists, and adds symlinks to key docs at your project root.

### Step 2 — Verify the CLI works

```bash
npx gcp brain up --help
````

Then a quick smoke check (stops itself after 8 seconds):

```bash
timeout 8 npx gcp brain up
```

You should see mindBrain start and a SQLite path printed. If this fails, fix it before wiring your IDE — the IDE just runs this same command.

If you see `spawn gcp ENOENT`, run:

```bash
npx gcp brain setup cursor --force
```

### Step 3 — Wire your IDE or agent

Run the setup command for your environment:

```bash
# Cursor
npx gcp brain setup cursor --force

# Claude Code
npx gcp brain setup claude

# Codex
npx gcp brain setup codex

# Generic MCP client / portable agent skills
npx gcp brain setup generic
```

This writes the correct MCP entry using absolute paths where the client supports it, installs the complete GhostCrab skill bundle for that host, and removes any stale legacy `ghostcrab` entries for Cursor. `generic` prints MCP JSON/TOML snippets and installs portable `.agents/skills`.

Detailed config files: `README_CURSOR_MCP.md`, `README_CLAUDE_CODE_MCP.md`, `README_CODEX_MCP.md`.

### Step 4 — Start using it

Your agent client starts GhostCrab automatically via:

```bash
gcp brain up
```

This launches mindBrain, creates `~/.ghostcrab/databases/ghostcrab.sqlite`, and holds stdio open for MCP traffic. You do not need to run this manually — your MCP host handles it.

---

## Supported environments

| Environment                                | Setup command                    | Reference                   |
| ------------------------------------------ | -------------------------------- | --------------------------- |
| Cursor                                     | `gcp brain setup cursor --force` | `README_CURSOR_MCP.md`      |
| Claude Code                                | `gcp brain setup claude`         | `README_CLAUDE_CODE_MCP.md` |
| Codex                                      | `gcp brain setup codex`          | `README_CODEX_MCP.md`       |
| OpenClaw, Gemini CLI, Hermes-style, custom | `gcp brain setup generic`        | `installations/`            |
| mindBot (orchestration)                    | —                                | `ghostcrab-skills/`         |

---

## CLI — bulk import and reference

**MCP** is the ontology, memory, graph, and query surface (`ghostcrab_search`, `ghostcrab_remember`, `ghostcrab_ontology_import`, …). **High-throughput tabular/document import** still runs through `gcp brain` wrappers around the native MindBrain engine — not MCP streaming. Stop MCP / `ghostcrab-backend` before database-backed CLI import commands (or pass `--force`).

### Discover commands

```bash
gcp --help
gcp brain --help
gcp brain docs --list
gcp brain docs structured    # full tabular runbook (Markdown)
gcp brain docs document      # full document runbook (Markdown)
gcp brain docs import        # both runbooks
gcp brain structured-import --help
gcp brain document --help
gcp brain ontology --help
```

### Import pipelines

| Pipeline | CLI | Full runbook (installed package) |
| -------- | --- | -------------------------------- |
| **Ontology** (LinkML YAML, OWL/RDF N-Triples) | `ghostcrab_ontology_import` (MCP) or `gcp brain ontology` (CLI) | `docs/explanation/ontology/` |
| **Tabular** (CSV, JSON, YAML, XLSX, TOON) | `gcp brain structured-import` | `gcp brain docs structured` |
| **Documents** (PDF, HTML, MD corpus) | `gcp brain document` | `gcp brain docs document` |

Typical tabular order: `register-semantics` → `apply` (or Phase D: `ddl-propose` → `ddl-execute` → `load-ws` → `apply` with mapping `data_plane=ws`) → `reindex --scope all`.

Document flow (thin slice): `document-normalize` → `document-ingest` → `qualification-vocab-list` → optional `document-profile` / `document-qualify`. See `gcp brain docs document` for no-LLM and LLM paths.

For ontology source files, use `ghostcrab_ontology_import` from MCP when the agent owns the workflow. Use `gcp brain ontology compile|import|export` for operator scripts, dry-run artefacts, or offline maintenance. Do not import LinkML with `ghostcrab_remember`, `ghostcrab_upsert`, `ghostcrab_learn`, `ghostcrab_schema_register`, or `ghostcrab_graph_gap_rules_import`; those write memory, graph instances, agent schemas, or diagnostics rules rather than native `ontology_*` tables.

After import, agents query via MCP (`ghostcrab_search`, `ghostcrab_graph_search`, `ghostcrab_graph_reindex`, …).

### In-package reference files

- `docs/reference/gcp-commands.md` — JTBD command table
- `docs/setup/structured-import.md` — tabular operator guide
- `docs/setup/document-import.md` — document operator guide
- `docs/architecture/universal_methodology.md` — facets → projections → import → reports

Backup / ontology (same SQLite file):

```bash
npx gcp brain backup --workspace-id my_ws --output ./my_ws.backup.json
npx gcp brain ontology import --workspace-id my_ws --ontology-id my_ws::owl --input ./ontology.nt --materialize-graph
npx gcp brain load ./my_ws.backup.json --dry-run
```

---

## Model compatibility

GhostCrab works with any model your client exposes. Reliability varies by how well the model follows mindBrain conventions (intake questions, structured projections, graph usage).

| Tier                 | Models                                            | Behavior                                                      |
| -------------------- | ------------------------------------------------- | ------------------------------------------------------------- |
| **1 — Full**         | Composer 2 Fast, Kimi 2.5, Sonnet 4.5+, Opus 4.5+ | Consistent onboarding, graph, and projection adherence        |
| **2 — With caveats** | Haiku 4.5                                         | Good first turn; may drop graph or projections in later turns |
| **3 — Partial**      | Gemini 2.5 Flash                                  | Weak template adherence; data quality degrades                |

Use Tier 1 models for first workspace setup or fuzzy onboarding. Lighter models work fine for narrow, well-scoped tasks once conventions are established.

---

## MCP tool surface

The MCP `tools/list` surface exposes the full tool catalog so every tool is directly callable on any MCP client (Cursor, Codex, Claude Code, generic). A curated subset is flagged as recommended defaults (status, search/count, combined search, remember/upsert, schema read, pack/project, modeling guidance, tool discovery). Inspect the catalog and recommended subset through:

```bash
gcp tools list
gcp tools verify
```

Agents can also discover extended tools at runtime with `ghostcrab_tool_search`.

| Group | Examples |
| ----- | -------- |
| **Facets / Search** | `ghostcrab_search`, `ghostcrab_combined_search`, `ghostcrab_remember`, `ghostcrab_upsert`, `ghostcrab_facet_catalog`, `ghostcrab_collection_facet_search` |
| **Graph** | `ghostcrab_graph_search`, `ghostcrab_graph_subgraph`, `ghostcrab_graph_path`, `ghostcrab_traverse`, `ghostcrab_graph_reindex`, `ghostcrab_graph_gap_rules_import` |
| **Projections / Artifacts** | `ghostcrab_project`, `ghostcrab_pack`, `ghostcrab_projection_get`, `ghostcrab_artifact_get`, `ghostcrab_live_refresh` |
| **Schema / Workspace** | `ghostcrab_schema_list`, `ghostcrab_schema_inspect`, `ghostcrab_schema_register`, `ghostcrab_workspace_list`, `ghostcrab_workspace_create`, `ghostcrab_workspace_reset` |
| **Discovery / Loadout / Ontology** | `ghostcrab_tool_search`, `ghostcrab_loadout_apply`, `ghostcrab_onboarding_schemas`, `ghostcrab_ontology_import` |

Full references: `docs/reference/mcp-tools.md` and `docs/reference/operator-catalog.md`.

---

## For AI agents handling installation

> This section is written for autonomous agents executing setup tasks, not for human readers.

### Canonical install sequence

```bash
# 1. Install package (local preferred over global)
npm install @mindflight/ghostcrab-personal-mcp@latest

# 2. Authorize native binary if prompted
npx gcp authorize

# 3. Smoke-check the backend (expect SQLite path + MCP ready on stdout)
timeout 8 npx gcp brain up

# 4. Register MCP entry for your host
npx gcp brain setup <cursor|claude|codex|generic> --force

# 5. Confirm entry written
npx gcp brain up --help
```

### Environment variables (`.env`)

`.env` is created from `.env.example` during postinstall. Key overrides:

| Variable                 | Default                   | Purpose                         |
| ------------------------ | ------------------------- | ------------------------------- |
| `GHOSTCRAB_SQLITE_PATH`  | `~/.ghostcrab/databases/ghostcrab.sqlite` | SQLite file location            |
| `GHOSTCRAB_BACKEND_ADDR` | `:8091`                   | mindBrain HTTP listen address   |
| `MCP_TELEMETRY`          | `1`                       | Set to `0` to disable telemetry |

### Error recovery

| Error                                      | Cause                                 | Fix                                                                                                   |
| ------------------------------------------ | ------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `spawn gcp ENOENT`                         | Stale or relative-path mcp.json entry | `npx gcp brain setup <host> --force`                                                                  |
| `npm error could not determine executable` | Missing postinstall run               | `npx gcp brain setup <host> --force`                                                                  |
| `Ignored build scripts` (pnpm)             | pnpm 10+ security default             | `pnpm add --allow-build=@mindflight/ghostcrab-personal-mcp @mindflight/ghostcrab-personal-mcp@latest` |
| Native binary missing                      | Platform prebuild not pulled          | Add tarball from local build or beta zip — see `INSTALL.md`                                           |

### Native binary

postinstall installs a platform-specific optional dependency automatically (`linux-x64`, `linux-arm64`, `darwin-x64`, `darwin-arm64`, `win32-x64`, `win32-arm64`). If the platform package is absent, mindBrain will not start — add the tarball manually per `INSTALL.md`.

### Telemetry

Enabled by default. Sends anonymous pings to `https://telemetry.ghostcrab.be/v1/ping`. No prompts, no DB payloads. Disable with `MCP_TELEMETRY=0` or `--no-telemetry`. Policy: `https://telemetry.ghostcrab.be`.

### Submodule note (contributors only)

mindBrain ships as a Git submodule at `vendor/mindBrain`. Clone with:

```bash
git clone --recurse-submodules https://github.com/mindflight-orchestrator/ghostcrab-personal-mcp.git
cd ghostcrab-personal-mcp
npm install && npm run build
npx gcp brain up
```

Upstream: `github.com/mindflight-orchestrator/mindBrain`.

---

## Going further

- `INSTALL.md` — Beta zip, Git install, document import, `gcp brain document`
- `docs/GCP_CLIENT_SETUP.md` — Full CLI reference
- `installations/` — Agent setup templates
- `docs/dev/INTERNALS.md` — Repository layout, packaging, Docker dev stack

***

## A starter Kit

To start a full project to create your first ontology, you could add this starter kit skills :

[https://github.com/mindflight-orchestrator/starter-kit-ghostcrab-perso](https://github.com/mindflight-orchestrator/starter-kit-ghostcrab-perso)
