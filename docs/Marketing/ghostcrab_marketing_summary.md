# GhostCrab — Marketing structure summary

Copywriter-oriented digest derived from [ghostcrab_marketing_structure.json](./ghostcrab_marketing_structure.json). All claims trace to repository files cited there.

## Hero (Bloc 1)

**Headline options (max 12 words each)**

1. PostgreSQL memory stack for MCP agents  
2. GhostCrab: facets, graph, and typed projections in Postgres  
3. Stable ghostcrab_* tools on a SQL-first Postgres runtime  

**Subheadline**  
MCP stdio server with 13 public tools on PostgreSQL, optional native extensions, documented JSON envelope.

**Problem**  
Agents need durable memory and graph context; GhostCrab backs a single MCP tool surface with facts (`mfo_facets`), graph (`mfo_nodes` / `mfo_edges`), and typed projections (`mfo_projections`).

**Primary CTA**  
Docker Postgres → migrate → build → run stdio server (see `README.md`).

**Sources**  
`README.md`, `docs/architecture.md`, `docs/mcp_tools_contract.md`

---

## Value pillars (Bloc 2) — one per extension + app schema

| Pillar | Extension | Headline | Proof (repo) |
|--------|-----------|----------|--------------|
| facets | pg_facets | Faceted facts + BM25 + vector hooks | `001_facets_schema.sql` (GIN facets, bm25, ivfflat); `extensions/pg_facets/README.md` (BM25, Roaring Bitmaps, hybrid) |
| graph | pg_dgraph | SQL entity graph + traversal extension | `002_dgraph_schema.sql`; `extensions/pg_dgraph/README.md` (BFS, filtered traversal) |
| memory | pg_pragma | **Proposition DSL** + typed projections | `003_pragma_schema.sql` (FACT, GOAL, STEP, CONSTRAINT); `extensions/pg_pragma/README.md`; `extensions/pg_pragma/docs/DSL_RULES.md` |

---

## Agent skills matrix (Bloc 3)

Packaged `skills/*/SKILL.md` files are **not in this repository**. The matrix below records integration documentation only; skill names and example prompts for OpenClaw-packaged skills remain **[MISSING — to be written]**.

| Agent | Skill name (product) | Core capability (from repo docs) | Example prompt | Differentiator (sourced) |
|-------|----------------------|----------------------------------|----------------|----------------------------|
| OpenClaw | [MISSING] | JSONB-oriented patterns in `docs/SOP_start/openclaw.md` (not a shippable skill file here) | [MISSING] | Persistent agent memory model vs session-based clients (`docs/SOP_start/claude-code.md` comparison) |
| Codex | [MISSING] | `~/.codex/config.toml` `[mcp_servers.ghostcrab]` with `node` + absolute `dist/index.js` | “List available GhostCrab tools.” (`docs/codex_integration.md`) | `rmcp_client`, deterministic `GHOSTCRAB_EMBEDDINGS_MODE=fake` for local tests |
| Claude Code | [MISSING] | `CLAUDE.md` fragment: session-start `ghostcrab_search` + write-back emphasis | Session-start search example in `docs/SOP_start/claude-code.md` | For session-reset clients, facet-backed memory is positioned as the durable project memory (`docs/SOP_start/claude-code.md`) |

---

## How it works (Bloc 4)

1. **Connect** — MCP client uses stdio to the Node server (`docs/architecture.md`).  
2. **Bootstrap** — Migrations + checksum tracking + `src/bootstrap/seed.ts` (`README.md`, `docs/architecture.md`).  
3. **Call tools** — Registry resolves `ghostcrab_*`; responses use stable envelope (`docs/mcp_tools_contract.md`, `src/tools/registry.ts`).

---

## Trust signals (Bloc 5)

| Signal | Value | Note |
|--------|-------|------|
| Public MCP tools | 13 | `docs/mcp_tools_contract.md` + `src/tools/` |
| Packaged agent skills in `skills/` | 0 | No `skills/openclaw` etc. |
| GitHub stars | — | Not in repo; not fetched |
| Contributors | — | Not in repo; not fetched |

---

## Technical differentiators — “Why GhostCrab” (Bloc 6)

- **Branded MCP surface** (`ghostcrab_*`) over internal `mfo_*` storage (`docs/architecture.md`).  
- **SQL-first Docker path** default; native Zig extensions optional (`README.md`, `docs/architecture.md`).  
- **Proposition DSL** named in extension docs and aligned with SQL projection types (`extensions/pg_pragma/docs/DSL_RULES.md`, `003_pragma_schema.sql`).  
- **Honest phase-4 limits** on semantic search and graph completeness (`docs/known_limits.md`, `README.md`).

---

## FAQ candidates (Bloc 7)

See JSON for full list. Short answers:

- **Tool count?** 13 — `docs/mcp_tools_contract.md`.  
- **Response envelope?** `ok`, `tool`, `surface_version`, `generated_at` + fields — `docs/mcp_tools_contract.md`.  
- **Semantic search ready?** Not fully; deferred / not active — `README.md`, `docs/known_limits.md`.  
- **Local verify?** `PG_PORT=55432 npm run verify:e2e` — `README.md`.  
- **Example client?** Lists tools, calls `ghostcrab_status` and `ghostcrab_pack` — `examples/node-stdio-client/README.md`.

---

## Full machine-readable structure

[ghostcrab_marketing_structure.json](./ghostcrab_marketing_structure.json)

Gaps and follow-ups: [ghostcrab_gaps_report.md](./ghostcrab_gaps_report.md)
