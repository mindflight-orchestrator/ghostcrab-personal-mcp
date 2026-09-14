# Personal write integrity audit — 2026-09-14

## Scope and meaning of the evidence

This audit covers the 30 MCP tools classified `write` or `model` by the current
catalog, plus the separate Personal memory service. Two `model` entries are reads
(`ghostcrab_ddl_list_pending`, `ghostcrab_projection_get`) and are identified below.
The catalog classification is a discovery aid, not proof of actual side effects.
CLI-only imports, migrations, native engine internals and other repositories are
not exhaustively qualified by this audit.

Evidence levels:

- **SQLite:** actual canonical vendored DDL, foreign keys and stored-state checks.
- **Native MCP:** a disposable native backend and real MCP stdio client; no live
  user database, simulated HTTP response or pre-existing application server.
- **Mock:** useful routing/input/response checks; not evidence of persisted data.
- **Source:** implementation was inspected; the stated failure scenario remains
  unverified. A gap is not automatically a confirmed defect.

## Findings and changes

1. **Confirmed and fixed: learn overwrote endpoint metadata.** The original eight
   SQLite cases had seven failures before the endpoint-preservation guard.
2. **Confirmed and fixed: workspace cleanup was not atomic.** Injected failures
   during graph cleanup and the final workspace deletion/archive left earlier
   deletions committed. Five new tests failed before wrapping reset, hard delete
   and soft delete in transactions. The successful and failure cases now check
   target data, other workspaces and the workspace lifecycle state.
3. **Confirmed test weakness: silent SQLite test success.** Several archive/FTS
   tests returned without assertions if SQLite/FTS was unavailable. SQLite absence
   now produces an explicit skip in ordinary unsupported environments and an
   error in the required integrity job. Missing FTS is a failed assertion.
4. **Confirmed CI weakness: execution coverage was optional and unbounded.** The
   dedicated Node 22 job now requires real SQLite/FTS, full-source coverage,
   integrity tests and mutation detection. Publication depends on this job and a
   separate native MCP check using the built Linux x64 release backend.

## Operation → guarantees → tests → remaining evidence

Paths below are relative to the repository root. “Remaining” identifies work
that this delivery does not claim to have completed.

| Operation(s)                                                                                                       | Storage / required guarantee                                                                                                | Evidence inspected or added                                                                                                                                                                | Remaining                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ghostcrab_learn`                                                                                                  | `graph_entity`, relations and canonical raw rows; links preserve endpoint data, exact workspace, rollback, typed properties | **SQLite:** `tests/tools/learn-sqlite.test.ts`, `graph-storage-sqlite.test.ts`; **Native MCP:** `tests/integration/mcp/write-integrity.test.ts`                                            | Concurrent competing explicit node replacements; general SQL mutations beyond Stryker's JS operators                                                        |
| `ghostcrab_upsert`                                                                                                 | Current fact identity, archive history, untouched facets/vector, closed-history exclusion                                   | **SQLite:** `tests/tools/facets-archive-sqlite.test.ts`; **Mock:** `tests/tools/facets.test.ts`                                                                                            | Simultaneous identical creates, business ambiguity with multiple open selector matches, injected index failures through this MCP tool                       |
| `ghostcrab_remember`                                                                                               | Native fact write and indexing; workspace/provenance identity                                                               | **Mock:** `tests/tools/facets.test.ts`; source delegates to native `runStandaloneFactWrite`                                                                                                | Direct MCP replay of identical provenance retries, concurrent calls and native indexing failure                                                             |
| `ghostcrab_workspace_reset`, `ghostcrab_workspace_delete`                                                          | Entire scoped cleanup and final lifecycle transition are atomic; preserve other workspaces; protect default                 | **SQLite:** `tests/tools/workspace-integrity-sqlite.test.ts`; **Native MCP:** reset failure replay; existing `workspace-lifecycle.test.ts` checks FK cleanup                               | Native MCP failure replay for both delete modes; broader optional native tables                                                                             |
| `ghostcrab_workspace_create`                                                                                       | Stable identity; repeat creation does not replace existing metadata                                                         | **Mock:** `tests/tools/workspace.test.ts`; **Source:** `src/tools/workspace/create.ts`                                                                                                     | Two simultaneous creates; create followed by full lifecycle on native backend                                                                               |
| `ghostcrab_graph_reindex`                                                                                          | Raw data remains authoritative; repeated projection preserves semantic data and workspace boundaries                        | **SQLite:** repeated SQL reindex in `learn-sqlite.test.ts`; **Native MCP:** reindex + search; **Mock:** fallback routing in `dgraph.test.ts`                                               | Stale derived-row removal, all document/chunk links, cross-workspace malformed raw edges, native rebuild interruption                                       |
| `ghostcrab_collection_reindex`, `ghostcrab_reindex_all`                                                            | Native derived indexes preserve canonical sources and unrelated collections                                                 | **Mock:** `dgraph.test.ts`; **Native:** collection lifecycle in `tests/unit/collection-facets-native.test.ts`, now executed by the required native gate                                    | Repeated rebuild + fault injection over the full corpus                                                                                                     |
| `ghostcrab_facet_register`                                                                                         | Scoped facet definition identity and validation                                                                             | **Mock:** `tests/tools/facet-vocabulary.test.ts`; **Source:** catalog/store helpers                                                                                                        | Native persistence and same-name definitions in different workspaces                                                                                        |
| `ghostcrab_schema_register`, `ghostcrab_schema_sync_apply`                                                         | Registry identity, explicit sync direction, user definitions preserved                                                      | **Mock:** `tests/tools/facets.test.ts`; **Source:** `src/tools/facets/schema.ts`                                                                                                           | **P1:** registry-to-ontology creation issues multiple writes without an enclosing transaction; inject a mid-sync failure before promising atomicity         |
| `ghostcrab_ontology_import`                                                                                        | Native ontology ownership, writer coordination, source fidelity                                                             | **Mock:** `tests/tools/ontology-import-http.test.ts`; **Source:** HTTP/native CLI fallback                                                                                                 | Partial input failure, concurrent import and source round-trip against native storage                                                                       |
| `ghostcrab_ontology_reconcile_apply`                                                                               | Only safe registry projections change; custom definitions retained by default                                               | **Mock:** `tests/unit/ontology-interchange.test.ts`; **Source:** reconciliation handler                                                                                                    | **P1:** multiple registry writes are not enclosed in one handler transaction; determine/document atomic versus resumable batch semantics and replay failure |
| `ghostcrab_loadout_apply`, `ghostcrab_loadout_seed`                                                                | Preserve existing user data while installing domain structure                                                               | **Mock:** `tests/tools/loadouts.test.ts`; **Source:** handlers and ontology-loadout helpers                                                                                                | **P1:** several persistence phases; interruption/retry and divergent pre-existing user data need a native sequence test                                     |
| `ghostcrab_ddl_propose`, `ghostcrab_ddl_execute`                                                                   | Proposal scope, confirmed execution, DDL and status consistency                                                             | **Mock:** `tests/tools/ddl.test.ts`; native paths under `tests/integration/cli/`                                                                                                           | Mid-DDL failure/rollback with existing populated data; simultaneous execution of one proposal                                                               |
| `ghostcrab_project`                                                                                                | Projection identity, workspace scope and transactional replacement                                                          | **Mock:** `tests/tools/pragma.test.ts`; **Source:** transaction in `src/tools/pragma/project.ts`                                                                                           | Native update failure preserves old projection; concurrent same-key creation                                                                                |
| `ghostcrab_live_create`, `ghostcrab_live_refresh`                                                                  | Native governed artifact identity, version/event consistency, capability refusal                                            | **Mock:** `tests/unit/live-create.test.ts`, `answer-artifacts-refresh-events.test.ts`; prior native receipts in `reports/validation/studio-projection-*/`                                  | Those prior receipts were not replayed in this audit; concurrent refresh/create and event failure                                                           |
| `ghostcrab_business_query_register`                                                                                | Proposal fingerprint, activation state and fact persistence                                                                 | **Source:** `src/tools/business-query-learning/register-proposal.ts`; router/loader tests are not write persistence proof                                                                  | Idempotency races and final read-back scoped to the stored workspace column                                                                                 |
| `ghostcrab_graph_gap_rules_import`, `ghostcrab_graph_gap_rules_delete`, `ghostcrab_graph_rule_evaluations_run`     | Native rule identity, workspace scope, evaluation/event consistency                                                         | **Mock:** `tests/tools/dgraph.test.ts`; handlers delegate to native endpoints                                                                                                              | Real native batch failure, rules in multiple workspaces, deletion with existing evaluations                                                                 |
| `ghostcrab_quality_convergence_run`, `ghostcrab_quality_remediation_decide`, `ghostcrab_quality_remediation_apply` | Native run/action identity, approval state and allowed remediation                                                          | **Mock:** `tests/tools/quality-convergence.test.ts`; **Source:** native delegation and approved-action filtering                                                                           | Native repeated decision/application, partial remediation and out-of-workspace action IDs                                                                   |
| `ghostcrab_ddl_list_pending`, `ghostcrab_projection_get`                                                           | Read operations despite `model` catalog classification                                                                      | **Source:** read handlers; mock and optional integration tests                                                                                                                             | Catalog `model` must not be used as an exact write inventory by itself                                                                                      |
| Separate `ghostcrab_memory`: remember/update/forget                                                                | Host-bound scope, expected version, idempotency receipts, archive/FTS atomicity                                             | **Native:** all 10 cases in `tests/unit/memory-personal-native.test.ts` rerun successfully, including concurrent corrections and receipt-failure rollback; now required in the native gate | Cross-host/platform parity; default-suite skips remain distinct from these native results                                                                   |

## Additional architectural limits

- `createDatabaseClient` defaults to allowing legacy non-session fallback. The
  new transactional wrappers and native proofs protect the current session-capable
  engine; they do not establish atomicity against a backend without SQL sessions.
  **P1:** agree the compatibility policy, then require sessions for transactional
  writes or enforce the minimum engine capability at startup. Existing
  `tests/unit/db-client.test.ts` intentionally tests both compatibility fallback
  and strict refusal; changing the default is a compatibility decision, not just
  adding an assertion.
- SQL strings and native Zig logic are not semantically mutated by StrykerJS.
  SQLite failure triggers and native replays provide complementary evidence.
- A mutation survivor can be a meaningful missing assertion, an equivalent
  mutation, or a defensive path unreachable from the selected callers. It must
  be reviewed; a percentage is not a probability of correctness.
- No repository branch-protection setting was changed. Workflow dependencies
  block npm staging in the checked-in pipeline; requiring these checks for merges
  also depends on the hosting configuration.

## Running the checks

```sh
pnpm run build
pnpm run test:coverage
pnpm run test:integrity
pnpm run test:mutation
pnpm run test:integrity:native
```

Use Node 22+ for the integrity/coverage job. The native check launches its own
backend and database; it uses `MINDBRAIN_TEST_BINARY` when provided, otherwise
`cmd/backend/zig-out/bin/ghostcrab-backend`. It fails if the binary is missing.
Mutation reports are written to `reports/mutation/`; they are generated outputs,
not production data. The generated sequence test uses seed `20260914` and 75
runs of up to 25 operations, with shrinking to a reproducible failing sequence.

## Final measured results

See `evidence.json` for the measured summary and local backend SHA-256.

| Validation                                                               | Result                                                          |
| ------------------------------------------------------------------------ | --------------------------------------------------------------- |
| Default suite, with global and critical-module coverage gates            | 879 passed, 15 skipped                                          |
| Required canonical SQLite integrity suite                                | 52 passed, zero skipped                                         |
| Required native integrity suite                                          | 14 passed, zero skipped                                         |
| Mutation pilot: graph storage and executable learn/reset/delete handlers | 205 killed / 241 mutants = 85.06%; zero timeouts/errors         |
| Remaining mutations                                                      | 29 survived, 7 uncovered; all 36 explicitly reviewed            |
| Global TypeScript coverage                                               | 67.14% lines, 55.48% branches                                   |
| Graph storage                                                            | 96.96% lines, 95.83% branches                                   |
| Learn                                                                    | 98.36% lines, 98.24% branches                                   |
| Reset and delete handlers                                                | 100% lines and branches                                         |
| Typecheck, lint, build, diff whitespace checks                           | Passed                                                          |
| Isolated npm ci + integrity + mutation checks                            | 52 tests passed, same 85.06% mutation score, review gate passed |
| Native binary intentionally missing                                      | Gate fails before any suite can silently skip                   |

The 15 default-suite skips are not represented as passes. Eleven of those cases
(memory and collection lifecycle) run explicitly in the separate native gate,
alongside the three new MCP scenarios. This does not certify every integration
test or every supported platform.

The first mutation exploration included MCP schema/description literals and
scored 47.78% over 293 mutations. The pilot was then scoped explicitly to
executable handlers plus graph storage, keeping schema contract tests separate.
On that **same 241-mutation scope**, additional meaningful assertions improved
the score from 74.27% to 85.06%. These are different denominators from the first
exploration; they must not be presented as directly comparable scores.

`tests/fixtures/mutation-review.json` records the remaining findings, including
diagnostic wording, an unused helper, caller-constrained defaults, defensive SQL
paths and an outstanding concurrent-deletion response case. They remain in the
score. `scripts/verify-mutation-review.mjs` rejects new undetected signatures or
additional occurrences without review. The gate itself has negative tests.
The mutation threshold is 80%; critical branch thresholds are at least 90%.
Global thresholds retain the pre-audit baseline rather than demanding an
unjustified repository-wide 90% overnight.

Tools added: StrykerJS 9.6.1 (compatible with the repository's Node 20 floor;
the integrity job uses Node 22) and fast-check 4.10.0. Both lockfiles are updated;
pnpm platform packages retain local workspace links. npm's new Stryker transitive
`typed-rest-client` dependency retains the repository's existing `qs` 6.15.3 pin.

The local native checks used the existing executable recorded in the receipt,
not a freshly rebuilt engine. CI is configured to repeat native checks against
the freshly built release artifact on Linux x64. No remote CI execution, commit,
push, npm staging/publication, engine change or live database mutation occurred.
