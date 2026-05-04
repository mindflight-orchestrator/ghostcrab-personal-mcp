# GhostCrab — roadmap and audit follow-up

**What “V1” means** (goals, definition of done, where plans live): **[docs/dev/AUDIT_V1_TRACKING.md](docs/dev/AUDIT_V1_TRACKING.md)** — read that first; this file does not redefine V1.

This file is the **operational checklist** at repo root (`[x]` done, `[ ]` not done): post-audit implementation items, platform deferrals, the **V2** backlog, and **workspace** follow-ups (migrations 009+). Update checkboxes here when you ship or defer work.

**Product delivery phases** (architecture, PR graph, long-term plan): [docs/roadmap.md](docs/roadmap.md).

**V2 native dual-mode** (native Docker boot/seed by default, SQL-first fallback only when explicitly requested, `pg_facets` / `pg_dgraph` / `pg_pragma`, toolchain, DockerHub, CI matrix): **[docs/ROADMAP-V2.md](docs/ROADMAP-V2.md)** — Phases 5–8 and PR-by-PR execution. Extension upstream URLs and vendoring: [docs/setup/extension_sources.md](docs/setup/extension_sources.md).

**Workspace + Layer1 coupling** (typed relational tables, `mindbrain` control plane, triggers into `facets` / optional graph-geo, `workspace_id` isolation): operational detail in **[docs/v3/RUNBOOK_V3.md](docs/v3/RUNBOOK_V3.md)** and architecture summary in **[README_ARCHITECTURE.md](README_ARCHITECTURE.md)** (sections *MCP tool surface (24 tools)* and *Workspace isolation and DDL lifecycle*).

---

## Current status

**Current repository status:** **native pre-production / internal release-candidate**.

What this means operationally:

- The **reference validation path is now the native MindBrain PostgreSQL stack**, not the SQL-only fallback.
- `npm run lint`, `npm run build`, `npm run test`, native `npm run migrate`, and the main native MCP smoke scenarios are green on a fresh native database.
- Migration history is back to an **immutable shape**: `006_facets_materialized_pg_facets.sql` was restored and new native facet columns now live in **`014_facets_materialized_native_expansion.sql`**.
- `ghostcrab_traverse` has been hardened against malformed native graph payloads, and `ghostcrab_status` now reports **`runtime.native_readiness`** with capabilities derived from actual readiness instead of extension presence alone.

What this status does **not** mean:

- It is **not** a promise that every legacy integration assertion or every SQL-only parity assumption remains identical bit-for-bit.
- The SQL-only path still exists for explicit portability checks, but it is **not** the release gate and should not be used as the primary readiness signal.
- The repo should be treated as **native-first** until a broader stabilization pass is completed across every extended scenario pack and downstream consumer.

Recommended release command for this phase:

- `PG_PORT=55432 npm run verify:e2e`

This should always be interpreted as a **fresh native bootstrap validation** with the MindBrain extensions loaded.

---

## MCP surface — 24 tools (shipped)

GhostCrab exposes **24** MCP tools (`ghostcrab_*`), registered from [`src/tools/register-all.ts`](src/tools/register-all.ts). **User-facing name:** **workspace** for isolation, DDL, and export semantics (not a “V3” product label). Inventory by subsystem:

| Area | Tools |
|------|--------|
| Facets | `ghostcrab_search`, `ghostcrab_remember`, `ghostcrab_upsert`, `ghostcrab_count`, `ghostcrab_facet_tree`, `ghostcrab_schema_register`, `ghostcrab_schema_list`, `ghostcrab_schema_inspect` |
| Geo (optional) | `ghostcrab_query_geo` |
| Graph | `ghostcrab_learn`, `ghostcrab_traverse`, `ghostcrab_marketplace`, `ghostcrab_patch`, `ghostcrab_coverage` |
| Pragma | `ghostcrab_project`, `ghostcrab_pack`, `ghostcrab_status` |
| Workspace | `ghostcrab_workspace_create`, `ghostcrab_workspace_list`, `ghostcrab_workspace_inspect`, `ghostcrab_workspace_export_model`, `ghostcrab_ddl_propose`, `ghostcrab_ddl_list_pending`, `ghostcrab_ddl_execute` |

**Operational commands:** `ghostcrab tools list` (JSON list of tool definitions); [`scripts/mcp-smoke.mjs`](scripts/mcp-smoke.mjs) validates the expected public tool families on startup. **Export contract:** [docs/dev/workspace-model-export.schema.json](docs/dev/workspace-model-export.schema.json). **Agent scenarios:** [docs/mcp_agent_scenarios.md](docs/mcp_agent_scenarios.md) — includes `workspace_create` and `workspace_ddl_propose` alongside facets/graph/pragma baselines.

---

## Workspace + Layer1 coupling (checklist)

Cross-repo table usage audit (mindCLI, mindBot): **[docs/v3/cross_repo_table_usage_audit.md](docs/v3/cross_repo_table_usage_audit.md)**.

### Done (in `ghostcrab-mcp`)

- [x] **Native boot / seed contract** — root bootstrap path now uses the native PostgreSQL Docker image; `migrate` and server startup validate `pg_facets`, `pg_dgraph`, `pg_pragma`, plus native readiness before accepting `MINDBRAIN_NATIVE_EXTENSIONS=native`.
- [x] **Migrations 009–011** — `mindbrain` foundation, specialized Layer2, `source_ref` contract (see runbook migration list).
- [x] **Migrations 012–013** — workspace semantics (`semantic_spec`, `table_semantics` / column / relation), `domain_profile`, `rich_meta` (see [README_ARCHITECTURE.md](README_ARCHITECTURE.md) workspace-related migrations table).
- [x] **Migration immutability repair** — `006_facets_materialized_pg_facets.sql` restored to its historical shape; additive native facet materialization moved to `014_facets_materialized_native_expansion.sql`.
- [x] **24-tool MCP surface** — workspace tools (`create`, `list`, `inspect`, `export_model`, DDL ×3) + facet/graph/pragma tools; `ghostcrab_query_geo` for optional PostGIS; see [README_ARCHITECTURE.md](README_ARCHITECTURE.md) *MCP tool surface (24 tools)*.
- [x] **Workspace export semantics** — `ghostcrab_workspace_export_model` aligned with [docs/dev/workspace-model-export.schema.json](docs/dev/workspace-model-export.schema.json); examples under [docs/dev/examples/](docs/dev/examples/).
- [x] **Scenario pack** — baseline MCP scenarios including `workspace_create` and `workspace_ddl_propose` ([docs/mcp_agent_scenarios.md](docs/mcp_agent_scenarios.md), [`tests/helpers/mcp-scenarios.ts`](tests/helpers/mcp-scenarios.ts)).
- [x] **Validation split** — `npm run test` now covers unit/tool suites; `npm run test:integration` covers native integration and E2E suites; `verify:e2e` runs the native release chain.
- [x] **Traverse native hardening** — native `graph.entity_neighborhood` rows are normalized before path/gap processing so `ghostcrab_traverse` returns structured payloads instead of crashing.
- [x] **Status runtime contract** — `ghostcrab_status` now exposes `runtime.native_readiness` and derives `runtime.capabilities` from readiness probes, not just `pg_extension` presence.

### Follow-up (docs + other repos)

- [x] **RUNBOOK_V3** — feature matrix and migration sequence include **012** and **013** (parity with shipped SQL).
- [ ] **mindCLI** — verify batch / ingest paths set `workspace_id`, prefer **Layer 1** writes when DDL + `sync_spec` exist, and avoid duplicate or trigger-bypassing inserts into `facets` (confirm in the mindCLI repository; not vendored here).
- [ ] **mindBot** — run Phase A–C in [docs/v3/cross_repo_table_usage_audit.md](docs/v3/cross_repo_table_usage_audit.md) on a checkout of the mindBot repo (path TBD outside this workspace).

---

## V2 — Deferred backlog (traceability)

Items explicitly **postponed after V1** trace back to the same V1 narrative captured in [docs/dev/AUDIT_V1_TRACKING.md](docs/dev/AUDIT_V1_TRACKING.md) (*deferred after V1*, onboarding rails P1.3, P2.1–P2.5, P4.3). This section is a **backlog pointer only** — not a commitment order.

### Universal primitives and canonical schemas (seed / modeling)

- [ ] **`ghostcrab:asset`** — canonical schema for physical or logical entities tracked over time (devices, machines, vehicles, members, inventory, etc.); see onboarding plan P2.1.
- [ ] **`ghostcrab:event`** — canonical schema for discrete time-bound occurrences (alerts, transactions, follow-ups); see P2.2.
- [ ] **Temporal facets** — e.g. `due_date` / `next_action_date` on `ghostcrab:task`, filter semantics (exact / `YYYY-MM` prefix, not ranges); see P2.3 and CAPABILITIES-style limits.

### New-domain routing (seed)

- [ ] **Intent `model-new-domain`** (`intent:model-new-domain`) — when no activity family matches; see onboarding P1.3.
- [ ] **Signal `new-domain`** (`signal:new-domain`) — keyword routing toward custom modeling; see P1.3.

### Composite / multi-family workspaces (seed + behavior)

- [ ] **Modeling recipe `composite-workspace`** (`recipe:modeling:composite-workspace`); see onboarding P2.5 and V1 reduced plan *Composite workspaces*.
- [ ] **Projection recipe `composite-heartbeat`** (`recipe:projection:composite-heartbeat`); see P2.5.
- [ ] **Intent `manage-composite-project`** (`intent:manage-composite-project`); see onboarding P4.3 and V1 reduced plan.
- [ ] **Signal `composite-project`** (`signal:composite-project`); see P4.3.
- [ ] **Multi-family routing in intent/signal patterns** — skills and patterns that route across families, not a single family; see P4.3.

### Quality bar once V2 seed work lands (from onboarding plan validation)

- [ ] Extended **natural test pack** scenarios for strong out-of-domain cases (IoT, casino, gamification, etc.).
- [ ] **Agent without skill** MCP smoke: read-before-write, canonical-first, custom schema when nothing matches.

### Still assumed system limits (V1 “angles morts”; not automatically V2 scope)

Exotic domains, advanced multi-family modeling, TSDB / warehouse / analytics, permissions / multi-tenant, atomic or reactive operations — see the V1 reduced plan (*assumed V1 blind spots*) and the unified onboarding plan (*known blind spots*). V2 seed items above narrow some **modeling** gaps; they do not by themselves remove those platform limits.

---

## Audit implementation (MCP + ghostcrab-skills)

### Done

- [x] **MCP inputSchema drift tests** — `tests/tools/mcp-schema-contract.test.ts` guards JSON Schema / Zod shapes for selected high-traffic tools (not a full matrix of all 24); extend when adding tools or changing schemas.
- [x] **MCP integration tests** — `tests/integration/mcp/server-contract.test.ts` (stdio, `ghostcrab_status`, validation errors); `tests/integration/mcp/scenario-pack.test.ts` (scenario pack + representative runs); workspace DDL in `tests/integration/cli/`.
- [x] **Native release chain** — `verify:e2e` now runs `lint`, `build`, `test`, `verify:pack`, fresh native Docker bootstrap, `migrate`, `test:integration`, and native MCP smokes as the practical release gate.
- [x] **Canonical onboarding** — `ghostcrab-skills/shared/ONBOARDING_CONTRACT.md`; linked from skills and root `CLAUDE.md`; `claude-code/data-architect/CLAUDE.md` deduplicated.
- [x] **Claude Code self-memory** — `ghostcrab-skills/claude-code/self-memory/CLAUDE.md` slimmed; onboarding defers to the contract.
- [x] **Cursor** — `ghostcrab-skills/cursor/README.md` + `cursor/rules/ghostcrab-memory.mdc`; validator updated.
- [x] **Codex hard gate** — `codex/ghostcrab-memory/SKILL.md` references contract + explicit 5-question gate.
- [x] **Tool error classification** — `src/index.ts`: `validation_error`, `embedding_error`, `database_error`; `docs/mcp_tools_contract.md` and `docs/known_limits.md` updated.
- [x] **Embedding column vs config** — startup check via `src/db/embedding-dimension.ts`.
- [x] **Bootstrap projection dedup** — `ensureProjection` aligns with `ghostcrab_project` on `(agent_id, scope, proj_type, content)`.
- [x] **Claude Code entry pointer** — repo root `.claude.md`.
- [x] **Docs** — `docs/mcp_schema_audit.md` reflects MCP contract coverage; full tool inventory is **24** tools (see [README_ARCHITECTURE.md](README_ARCHITECTURE.md) and [docs/ROADMAP-V2.md](docs/ROADMAP-V2.md) for native vs SQL paths).

### Deferred (post-V1 or future PRs)

- [ ] **Semver or monotonic `surface_version`** — still a date string in `src/tools/registry.ts`.
- [ ] **`structuredContent` on MCP error payloads** — verify all host clients tolerate it.
- [ ] **Pool health in `ghostcrab_status`** — `pool.on('error')` today only logs to stderr.
- [ ] **Non-French onboarding closings** — per-locale skill bundles if needed beyond contract text.
- [ ] **Vitest + real PostgreSQL** — integration / testcontainers suite.
- [ ] **Prompt-evaluation harness** for first-turn onboarding compliance.
- [ ] **`ghostcrab_delete` / `ghostcrab_archive`**.
- [ ] **Pagination / cursor on `ghostcrab_search`** (beyond `limit` ≤ 100).
- [ ] **Default filter expired rows** in search when `valid_until` is set.
- [ ] **Rate limiting / write quotas** for runaway agents.
- [ ] **Human-via-chat** playbook without an AI intermediary.
- [ ] **Recovery from corrupted graph** / admin tooling.
- [ ] **Multi-agent isolation and conflict** patterns beyond `agent_id`.
- [ ] **Projection lifecycle** (`expires_at`) documented in skills.
- [ ] **Observability** — metrics, structured logs, tool-call histograms.
- [ ] **Schema versioning** on `ghostcrab_schema_register`.
- [ ] **Bootstrap transaction scale** threshold / chunking if seed grows large.
- [ ] **Migration path when `vector` extension missing** — clearer errors than raw DDL failure.
- [ ] **OpenClaw scenarios** `environment-delivery.md` / `integration-operations.md` in `validate-skills.mjs` if CI-gated.
- [ ] **Name alignment cleanup** — remove the remaining historical `docker-fallback` ids/labels in seeded records and graph nodes now that native Docker is the default boot/seed path.

---

## How to maintain

1. If V1 **intent or DoD** changes, update [docs/dev/AUDIT_V1_TRACKING.md](docs/dev/AUDIT_V1_TRACKING.md) (and any maintained planning notes under `docs/dev/`) when you edit the formal plan.
2. Move items from **Deferred** to **Done** in this file when shipped; update **workspace** checklist items when mindCLI/mindBot audits complete or deferrals are explicit.
3. Add new platform gaps as single-line bullets under **Deferred**.
4. Keep [docs/roadmap.md](docs/roadmap.md) for phased product delivery; keep **this file** for checkboxes only (no duplicate V1 essay).
