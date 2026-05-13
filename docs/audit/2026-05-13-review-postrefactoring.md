# Post-refactor SQLite-only audit

Date: 2026-05-13

Scope: review the last GhostCrab refactor that removes PostgreSQL/native-extension runtime paths, with a specific check of the SQLite migration source in this repo, `vendor/mindbrain`, and sibling `../mindbrain`.

Reviewed state:

- Current repo `HEAD`: `f845628 refactor(sqlite-only): remove extensions/nativeExtensionsMode and PG-only geo tool (Phase 4)`.
- Current branch: `ghostcrab_integration`.
- Vendored `vendor/mindbrain`: `bab0adb Add SQLite graph grounding projection`.
- Sibling `../mindbrain`: `bab0adb Add SQLite graph grounding projection`.
- `vendor/mindbrain/sql/sqlite_mindbrain--1.0.0.sql` and `../mindbrain/sql/sqlite_mindbrain--1.0.0.sql` are byte-identical in the current checkout.

Audit rule: runtime first. Executable code, tests, package scripts, environment variables, migrations, install/run docs, and agent-facing runtime guidance are findings. Narrative product posts, seed/demo content, and historical docs are cleanup debt unless they affect active setup or behavior.

## Summary

The core Phase 4 deletion removed the old `NativeExtensionsMode`, `ExtensionCapabilities`, `src/db/extension-probe.ts`, `src/tools/facets/geo.ts`, `src/tools/facets/hierarchy.ts`, and the native parity test. The registry and main server path now look SQLite/MindBrain-only.

The refactor is not complete. The biggest issue is the migration loader: the checked-in baseline marker names the SQLite SQL file, but `src/db/migrate.ts` still tries to expand that marker from a missing PostgreSQL baseline path and still uses Postgres-only advisory-lock and migration-table SQL. There are also stale release/e2e scripts, test expectations, DDL geo generation, and agent-facing guidance that still assume removed PostgreSQL/native-extension surfaces.

## P0 - Migration path still references removed Postgres baseline

Finding: `src/db/migrate.ts` is inconsistent with the current SQLite baseline.

Evidence:

- `src/db/migrations/001_mindbrain_baseline.sql` is a marker file that says the canonical DDL is `vendor/mindbrain/sql/sqlite_mindbrain--1.0.0.sql`.
- `scripts/copy-sql.mjs` expands the marker correctly during build by reading `vendor/mindbrain/sql/sqlite_mindbrain--1.0.0.sql`.
- `src/db/migrate.ts` still defines `BASELINE_VENDOR_REL` as `vendor/mindbrain/sql/pg_layer2_mindbrain_baseline.sql`.
- `vendor/mindbrain/sql/pg_layer2_mindbrain_baseline.sql` does not exist in the current checkout.
- `vendor/mindbrain/sql/sqlite_mindbrain--1.0.0.sql` does exist.

Impact:

- Any path that calls `loadMigrationFiles()` against the source migrations and expands `001_mindbrain_baseline.sql` will try to read a missing PostgreSQL baseline file.
- `scripts/run-mcp-scenario-baseline.ts` still imports and calls `runMigrations(database)`, so this is not purely dead code.

Related issue: `runMigrations()` still uses Postgres-only SQL:

- `SELECT pg_advisory_lock(hashtext($1))`
- `SELECT pg_advisory_unlock(hashtext($1))`
- `TIMESTAMPTZ NOT NULL DEFAULT now()`
- numbered placeholders like `$1`, `$2`

These are not valid SQLite migration mechanics. If SQLite bootstrap is now owned by the MindBrain backend, `runMigrations()` should either become an explicit no-op/removed path for this package or be rewritten to use the standalone MindBrain SQL API and SQLite-compatible migration bookkeeping.

Remediation:

- Replace `BASELINE_VENDOR_REL` with `vendor/mindbrain/sql/sqlite_mindbrain--1.0.0.sql` if this loader remains.
- Remove or gate Postgres-only advisory-lock logic from the SQLite path.
- Add a test that loads the real `001_mindbrain_baseline.sql` from `src/db/migrations` and proves the expanded SQL contains the vendored SQLite DDL, not a missing PG baseline.
- Decide whether `scripts/run-mcp-scenario-baseline.ts` should still run migrations or rely on backend bootstrap like `src/cli/migrate.ts` already does.

## P1 - Release and e2e scripts still assume a Postgres stack

Finding: `scripts/verify-e2e.mjs` remains a Postgres/Docker verification runner.

Evidence:

- It derives `DATABASE_URL` from `postgres://ghostcrab:ghostcrab@localhost:${pgPort}/ghostcrab`.
- It selects `docker/docker-compose.yml` or `docker/docker-compose.native.yml`.
- It waits for `ghostcrab_postgres` or `ghostcrab_postgres_native`.
- The current repo has no top-level `docker/` directory.
- `package.json` still exposes `"verify:e2e": "node scripts/verify-e2e.mjs"`.

Impact:

- The advertised e2e release gate is not testing the current SQLite/MindBrain backend shape.
- Running `npm run verify:e2e` will fail before validating the refactored product path.

Related runtime smoke debt:

- `scripts/mcp-smoke-shared.mjs` still injects a default Postgres `DATABASE_URL`.
- `scripts/example-client-smoke.mjs` still injects a default Postgres `DATABASE_URL`.
- `scripts/setup_pg17_submodule.sh`, `scripts/fetch_pg17_headers.sh`, `scripts/pg_config_wrapper.sh`, and `scripts/smoke-create-extension.sh` are still present and target the old extension build world. They may be intentionally historical, but they should not be presented as active GhostCrab Personal runtime paths after this refactor.

Remediation:

- Replace `verify:e2e` with a SQLite/MindBrain backend verification flow: build, start `ghostcrab-backend`, wait on `/health`, run integration/smoke tests against `GHOSTCRAB_MINDBRAIN_URL`.
- Remove `DATABASE_URL` injection from MCP smoke scripts unless a script is explicitly for external-source demo data.
- Move old PostgreSQL extension helper scripts under an archive/historical folder or clearly mark them unsupported for the SQLite package.

## P1 - Integration tests are not aligned with removed native runtime fields

Finding: `npm test` is green, but the full integration suite is not green for the refactored shape.

Evidence from this audit run:

- `npm run typecheck`: passed.
- `npm test`: passed, 34 files and 409 tests.
- `npm run build`: passed.
- `npm run test:integration`: failed with 11 failed files, 5 failed tests, and 52 skipped tests.

The first failure group is environmental: the CLI integration suites require a reachable MindBrain backend at `http://127.0.0.1:8091`.

The second failure group is contract drift:

- `tests/integration/mcp/server-contract.test.ts` still expects `payload.runtime.native_extensions_mode`.
- It still expects `payload.runtime.extensions_detected`.
- Those fields were removed by the refactor.

Impact:

- The commit message reports "Tests: 34 files, 409 tests passing", but that is only the unit/tool suite.
- Integration tests no longer establish that the stdio server contract matches the post-refactor runtime payload.

Remediation:

- Update the MCP server contract test to assert SQLite/MindBrain runtime fields only.
- Add a degraded-mode stdio test that does not require a live backend and verifies the server stays connectable when `GHOSTCRAB_MINDBRAIN_URL` is unreachable.
- Keep backend-required integration tests explicit and document the backend start command used for them.

## P1 - PG-only geo remains reachable through DDL sync generation

Finding: the deleted `ghostcrab_geo` tool is gone, but PG-only geo SQL is still generated through the workspace DDL path.

Evidence:

- `src/types/facet-types.ts` still declares `"geo"` as a facet type.
- `src/types/facets.ts` still accepts `facet_type: "geo"` in `SyncFieldSpecSchema`.
- `src/tools/workspace/ddl.ts` accepts `sync_spec.fields` using `SyncFieldSpecSchema`.
- `src/db/trigger-generator.ts` still documents geo as requiring `geo_entities` and PostGIS.
- `buildGeoInsert()` still emits SQL against `geo_entities`.
- `tests/unit/trigger-generator.test.ts` explicitly asserts `geo_entities`, `to_regclass('public.geo_entities')`, and `DELETE FROM geo_entities`.

Impact:

- Agents can still propose a DDL sync spec that stores a PostgreSQL/PostGIS-only concept in a supposedly SQLite-only package.
- This contradicts the Phase 4 goal if "remove any reference to PostgreSQL" includes executable feature surfaces, not just registered MCP tools.

Remediation:

- Remove `"geo"` from the active `SyncFieldSpecSchema` for this package, or make it return a clear structured "not supported in SQLite Personal" error before trigger generation.
- Remove or quarantine `buildGeoInsert()` and its tests from the active SQLite package.
- If geo remains a future professional feature, document it outside the active runtime contract.

## P2 - Agent-facing guidance still advertises removed or stale surfaces

Finding: active guidance still names removed or stale surfaces.

Evidence:

- `src/mcp/agent-brief.ts` tells agents to use `ghostcrab_tool_search` for hidden specialized tools including "geo".
- `src/tools/pragma/status.ts` still exposes native-readiness-style capability names such as `facets_native_count`, `facets_native_bm25`, `graph_native_traversal`, and `pragma_native_pack`.
- `docs/reference/openapi.yaml` still describes `pg_dgraph` and `pg_pragma` responses.
- `docs/architecture/ontology-naming-migration.md` still maps `MFO_NATIVE_EXTENSIONS` to `MINDBRAIN_NATIVE_EXTENSIONS`.
- `docs/setup/gcp-client-setup.md` still says some examples reference PostgreSQL `DATABASE_URL` and describes loading scenario JSONL into a MindBrain/PostgreSQL database.

Impact:

- Agents and operators can still be routed toward removed geo/native/Postgres concepts.
- The default MCP product framing is not yet cleanly SQLite-only.

Remediation:

- Remove "geo" from active agent brief discovery text.
- Rename status fields away from `native_*` where they now mean SQLite/MindBrain backend capability.
- Regenerate or rewrite OpenAPI/setup docs to describe `GHOSTCRAB_MINDBRAIN_URL` and the backend HTTP/SQLite path.

## Content cleanup debt

These references are not immediate runtime blockers under the runtime-first audit rule, but they should be cleaned or clearly marked historical:

- `src/bootstrap/seed.ts` still contains many records about PostgreSQL core, native extension build, pg_facets, pg_dgraph, pg_pragma, and external ERP PostgreSQL examples.
- Several `docs/posts/*.md` product comparison posts still describe GhostCrab as PostgreSQL-backed or SQLite/PostgreSQL dual-mode.
- `docs/dev/v3/*` and `docs/to-be-deleted/*` contain large historical PostgreSQL and pg_mindbrain migration plans.

Recommended handling:

- Keep external PostgreSQL source examples only where they mean a customer/source database, not GhostCrab's own storage.
- Move obsolete implementation docs under an archive path or add a clear stale/historical header.
- Update public setup docs before release; stale internal brainstorm docs can be lower priority.

## SQLite migration review

Current repo:

- `src/db/migrations/001_mindbrain_baseline.sql` no longer contains a migration body. It delegates to the vendored MindBrain SQLite SQL.
- `scripts/copy-sql.mjs` correctly expands that marker into `dist/db/migrations/001_mindbrain_baseline.sql` during build.
- `src/db/migrate.ts` does not match this new source-of-truth model and still references the removed/missing PG baseline path.

Vendored and sibling MindBrain:

- `vendor/mindbrain/sql/sqlite_mindbrain--1.0.0.sql` and `../mindbrain/sql/sqlite_mindbrain--1.0.0.sql` are identical at `bab0adb`.
- The SQLite SQL starts with an explicit SQLite-only note and includes the core active tables for workspaces, semantics, graph, facets, projections, queue, memory, search, collections, ontology, and raw graph/document import data.
- The SQL includes FTS5 through `CREATE VIRTUAL TABLE IF NOT EXISTS search_fts USING fts5(content)`.
- The SQL still contains compatibility naming such as `pg_schema TEXT NOT NULL DEFAULT 'main'` and comments saying logical PostgreSQL schemas are represented as SQLite table names. Those are compatibility labels inside the SQLite schema, not evidence that the runtime uses PostgreSQL.

Migration conclusion:

- The canonical SQLite schema source is present and synchronized between this repo's vendor and sibling `../mindbrain`.
- The current repo's runtime migration loader is not synchronized with that source. That is the highest-risk defect from this review.

## Verification commands run

```text
git show --stat --oneline --decorate --no-renames HEAD
git submodule status --recursive
git -C vendor/mindbrain log --oneline --decorate --max-count=5
git -C ../mindbrain log --oneline --decorate --max-count=5
test -f vendor/mindbrain/sql/pg_layer2_mindbrain_baseline.sql && echo exists || echo missing
test -f vendor/mindbrain/sql/sqlite_mindbrain--1.0.0.sql && echo exists || echo missing
cmp -s vendor/mindbrain/sql/sqlite_mindbrain--1.0.0.sql ../mindbrain/sql/sqlite_mindbrain--1.0.0.sql && echo same || echo differs
rg -n "PostgreSQL|postgres|Postgres|pg_|DATABASE_URL|GHOSTCRAB_DATABASE_KIND|MINDBRAIN_NATIVE_EXTENSIONS|nativeExtensions|geo_entities|PostGIS|pg_facets|pg_dgraph|pg_mindbrain" src cmd scripts tests package.json .env.example README.md INSTALL.md docs --glob '!docs/to-be-deleted/**' --glob '!docs/dev/SOP_start/**'
rg -n "runMigrations|migrate|sqlite_mindbrain|001_mindbrain_baseline|copy-sql|schema bootstrap" src scripts tests cmd/backend vendor/mindbrain ../mindbrain/src/standalone ../mindbrain/docs/sqlite-parity.md
npm run typecheck
npm test
npm run build
npm run test:integration
```

Results:

- `npm run typecheck`: passed.
- `npm test`: passed, 34 files and 409 tests.
- `npm run build`: passed.
- `npm run test:integration`: failed, with backend-unreachable failures and stale native-extension contract assertions.

## Remediation checklist

- [x] Fix `src/db/migrate.ts` to stop resolving `pg_layer2_mindbrain_baseline.sql`.
- [x] Decide whether `runMigrations()` is still active; it is now a source-migration discovery/no-op for this MCP client path, while backend bootstrap remains the schema owner.
- [x] Replace `verify:e2e` with a backend/SQLite verification path.
- [x] Remove Postgres `DATABASE_URL` defaults from active MCP smoke scripts.
- [x] Update MCP integration contract tests for post-refactor runtime payloads.
- [x] Remove or explicitly reject active `facet_type: "geo"` in SQLite Personal.
- [x] Remove "geo" from active agent discovery text.
- [x] Rewrite active setup/reference docs away from PostgreSQL/native-extension runtime language.
- [ ] Triage seed/demo/blog references separately as content cleanup debt.

## Correction pass - 2026-05-13

Implemented corrections:

- `src/db/migrate.ts` now expands the baseline marker from `vendor/mindbrain/sql/sqlite_mindbrain--1.0.0.sql` and no longer runs Postgres advisory-lock or migration-table SQL through the MCP client path.
- `scripts/verify-e2e.mjs` now targets `GHOSTCRAB_MINDBRAIN_URL`, checks `/health`, and runs the SQLite/MindBrain smoke path instead of a removed Docker/Postgres stack.
- Active smoke scripts no longer inject a default Postgres `DATABASE_URL`.
- `ghostcrab_ddl_propose` rejects legacy `sync_spec` trigger previews with `sync_spec_not_supported`; the old trigger generator was reduced to SQLite DDL validation.
- Active facet schemas no longer accept `facet_type: "geo"` in this package.
- MCP runtime status and integration contract expectations now use SQLite/MindBrain wording and no longer assert removed native-extension fields.
- MCP client setup defaults no longer emit `GHOSTCRAB_DATABASE_KIND=sqlite`; legacy detection still recognizes that key only so old client blocks can be pruned safely.
- Active OpenAPI/setup/demo-loader wording was updated away from `pg_dgraph`, `pg_pragma`, `DATABASE_URL`, and GhostCrab-as-Postgres-runtime language.

Verification after corrections:

```text
npm run typecheck
npm test -- tests/unit/migrate.test.ts tests/unit/trigger-generator.test.ts tests/tools/ddl.test.ts tests/unit/facet-types.test.ts tests/unit/mcp-global-setup.test.ts tests/tools/pragma.test.ts tests/integration/mcp/server-contract.test.ts tests/unit/server.test.ts
npm test
npm run build
npm run test:integration
npm run lint
```

Results:

- `npm run typecheck`: passed.
- Focused changed-surface tests: passed, 7 files and 57 tests.
- `npm test`: passed, 34 files and 362 tests.
- `npm run build`: passed.
- `npm run test:integration`: failed because no MindBrain backend was reachable at `http://127.0.0.1:8091`; suites that start the MCP server close after backend reachability fails. No integration failure was traced to a remaining Postgres baseline path.
- `npm run lint`: failed on pre-existing non-vendor lint issues plus a `vendor/mindbrain/examples/javascript/graph/app.js` browser-globals issue. The vendor issue is tracked separately in `docs/audit/2026-05-13-ticket-vendor-mindbrain-lint.md` and was not patched here.

Remaining cleanup debt:

- `src/bootstrap/seed.ts` still contains historical product seed records about the old Postgres/native-extension architecture and external PostgreSQL demo sources. This should be handled as a separate content/data migration so existing seeded records are deprecated or rewritten intentionally rather than partially edited in code only.
- Old Postgres extension helper scripts still exist in `scripts/`. They are not part of the corrected smoke/e2e path, but should be archived or marked unsupported before release if the product policy is literally zero checked-in Postgres helper references.
