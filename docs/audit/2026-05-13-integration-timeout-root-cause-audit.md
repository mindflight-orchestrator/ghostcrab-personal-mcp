# Integration timeout audit after MindBrain v1.1.3

Date: 2026-05-13

Scope: explain why the integration suite still takes hundreds of seconds after the `vendor/mindbrain` update to `v1.1.3`, describe the actual process topology, and separate root causes from symptoms before doing more fixes.

## Executive summary

This is no longer the original `database is locked` failure shape.

The original failure was visible as backend `StepFailed - database is locked` errors. The current pasted run mostly shows:

- repeated 30 second test stalls,
- quick follow-on assertion failures,
- backend `HttpRequestTruncated` noise,
- no pasted `database is locked` stack in the failing output.

The highest-probability problem is now a combination of three issues:

1. `vendor/mindbrain` is not the backend server that GhostCrab actually runs. GhostCrab builds `cmd/backend/http_server.zig`, so the upstream `v1.1.3` writer-lane fix only helps if the same behavior is ported into that file.
2. SQL session and normal SQL writes must use the same serialized writer connection. Any remaining second SQLite writer connection can wait exactly `PRAGMA busy_timeout=30000`, which matches the 30s failures.
3. The integration CLI harness runs the CLI in-process with mocked `process.exit`; if an awaited command stalls or times out, it can leave global process state, open async work, or a backend SQL session in a bad state for later tests.

Do not treat another full `npm run test:integration` run as useful until the suite has a minimal reproducer and request-level observability.

## Process model

### Backend process

The user starts:

```bash
GHOSTCRAB_BACKEND_ADDR=:8091 \
GHOSTCRAB_SQLITE_PATH=/tmp/ghostcrab-integration.sqlite \
cmd/backend/zig-out/bin/ghostcrab-backend
```

That binary is built from `cmd/backend/http_server.zig`, with `vendor/mindbrain/src/standalone/lib.zig` as a library module. It does not run `vendor/mindbrain/src/standalone/http_server.zig`.

Consequences:

- Updating `vendor/mindbrain` to `v1.1.3` updates shared SQLite/library code and the upstream standalone HTTP server source.
- It does not automatically update GhostCrab's copied/parallel backend HTTP server.
- Any HTTP-server behavior fix in upstream MindBrain must be ported, or GhostCrab must stop carrying its own server implementation.

### Test process

`vitest.integration.config.ts` disables file parallelism, but not all failure coupling:

- tests share one live backend URL,
- test files construct `createIntegrationHarness()` at module load,
- the previous CLI integration tests called `runCliCapture()` in the Vitest process,
- `runCliCapture()` mocked `process.stdout.write`, `console.error`, and `process.exit`.

The helper creates a temp `SQLITE_TEST_DB_PATH`, but the HTTP client uses `GHOSTCRAB_MINDBRAIN_URL`; it does not open that temp SQLite file directly. Therefore the real DB is whichever file the separately started backend uses. The temp path mainly affects environment passed to code paths that still read `GHOSTCRAB_SQLITE_PATH`; it does not isolate the live backend DB.

### MCP process

MCP tests spawn `node dist/index.js` through stdio. These tests passed in the latest pasted run, which is useful signal: the MCP stdio server can connect to the backend and list/call tools. The remaining problem is concentrated in write-heavy CLI/tool flows and DDL/workspace flows.

## Observed failure classes

### 1. 30 second stalls

Examples from the pasted run:

- `bootstraps a new domain end-to-end` failed at about 30042ms.
- `remember`, `upsert`, `status`, and several edge cases failed at about 30038-30062ms.
- Kanban/CRM workspace creation and DDL paths failed at about 30044-30063ms.

The 30s value is not random. The backend config currently applies:

```zig
PRAGMA busy_timeout=30000
```

A 30s stall therefore strongly suggests a SQLite connection is waiting on a lock or a request is hanging until the test timeout while the underlying backend operation is blocked. If backend request logs do not include per-request route/status/duration, this appears only as a slow test, not a precise operation.

### 2. Quick failures after a stall

Several tests fail in a few ms immediately after one 30s failure. This usually means one of:

- prior setup did not run,
- a migration/workspace/fact was not persisted,
- a previous command left state inconsistent,
- the same test file continues after a failed prerequisite.

These quick failures are likely downstream symptoms, not independent root causes.

### 3. `HttpRequestTruncated`

The backend logs:

```text
failed to receive request: HttpRequestTruncated
```

This is probably not the root cause of the 30s stalls. It can happen when the client closes a connection while the Zig HTTP server is still trying to read the next request, especially with keep-alive/connection-close mismatch. It is still harmful because it hides useful backend signal.

Treat it as a logging/connection lifecycle issue to clean up, but do not chase it before lock/request-duration observability is added.

## Current code risks

### Backend duplication risk

`cmd/backend/http_server.zig` and `vendor/mindbrain/src/standalone/http_server.zig` are now two separate implementations of the same kind of server. They drifted during this incident.

This caused a false sense of completion: upstream `v1.1.3` had the serialized writer lane, but the GhostCrab binary still needed equivalent changes.

Long-term, GhostCrab should either:

- import/reuse the upstream MindBrain HTTP app directly, or
- keep an explicit porting checklist and contract tests for every upstream HTTP behavior.

### Writer lane semantics are necessary but not sufficient

The intended backend invariant is:

- all SQL writes and SQL sessions use one writer SQLite handle guarded by one mutex,
- read-only `SELECT`/safe `PRAGMA` can use short-lived read handles,
- while a SQL session is open, unrelated writes should fail fast with a structured busy response, not wait 30s.

If any write path still uses `openDb()` on a separate handle, a session can block it for 30s. The audit must verify all write-bearing routes, not only `/api/mindbrain/sql`.

### SQL classification is fragile

The current writer-lane design classifies raw SQL by string prefix. That is acceptable as a short-term mitigation, but it is fragile:

- CTEs can be write statements in SQLite (`WITH ... INSERT/UPDATE/DELETE`).
- `PRAGMA` may be read-only or write-affecting.
- comments and multi-statements complicate classification.

For test stability, the safer policy is to route all non-trivial SQL through the writer lane, and only allow a narrow allowlist of known read-only forms on read handles.

### In-process CLI harness is high risk

`runCliCapture()` imports and runs `src/cli/runner.ts` directly. The runner calls `process.exit()`, while tests mock it to return. This works for simple cases but is fragile because:

- application code after `process.exit()` may still continue unless every path returns correctly,
- globals are mocked process-wide,
- a timed-out `runCli()` cannot be killed like a subprocess,
- leftover async fetches or SQL sessions can affect later tests.

The integration suite should not use this helper. CLI runner behavior belongs in unit/contract tests; the main integration path should validate backend HTTP and MCP stdio behavior without process-global mocks.

### HTTP client has no request timeout

`src/db/standalone-mindbrain.ts` calls `fetch()` without an `AbortSignal.timeout`. That means the application layer has no bounded request duration. Vitest or MCP helper timeouts become the first cancellation layer, which is too late and leaves poor diagnostics.

Add an explicit GhostCrab MindBrain HTTP timeout, shorter in tests than SQLite `busy_timeout`, so errors are classified at the client boundary.

## Recommended fix plan

### Phase 1: observability before more behavior changes

Add backend request logging for every route:

- request id,
- method,
- path,
- status,
- duration ms,
- whether writer lane was used,
- current `writer_active_session_id`,
- SQLite operation error detail when present.

Add a status endpoint or extend `/api/mindbrain/sql/write-status` to include:

- active session id,
- completed/failed writer operation counters,
- last writer error code/message,
- whether a transaction is currently active.

This makes the next failure explain itself without a 10 minute run.

### Phase 2: fail fast instead of waiting 30s

For integration/test mode:

- lower `busy_timeout` to 1000-3000ms, or
- make it configurable through `GHOSTCRAB_BACKEND_SQLITE_BUSY_TIMEOUT_MS`.

Production can keep 30000ms. Tests should not wait 30s for a known contention condition.

Also add client-side timeout in `src/db/standalone-mindbrain.ts`, for example:

- default 10000ms,
- integration default 5000ms,
- env override `GHOSTCRAB_MINDBRAIN_HTTP_TIMEOUT_MS`.

### Phase 3: harden backend writer routing

Backend rules should be:

- SQL session open/query/close always use the same writer connection.
- Raw SQL not proven read-only uses the writer lane.
- Writes during an active SQL session return `409` or `503` immediately with `sql_session_busy`.
- DDL execute and semantic persistence should ideally use one transaction/session, not separate HTTP SQL writes.

Add targeted backend contract coverage:

- open session, perform DDL, close session, then a normal write succeeds immediately.
- open session, normal write outside session returns busy in under 500ms.
- failed session query can still rollback and close.
- read-only `SELECT` works while no writer session is active.

### Phase 4: remove CLI from the main integration path

Remove `runCliCapture()` from integration/e2e tests instead of replacing it with subprocess execution in this phase:

- keep CLI parser/output/exit behavior in unit or narrow contract tests,
- keep backend and MCP integration tests focused on real HTTP and stdio surfaces,
- do not mock `process.stdout`, `console.error`, `process.exit`, or `process.stdin` in integration/e2e tests.

Keep in-process `runCli()` only for unit tests where global mocking is acceptable.

### Phase 5: isolate the integration DB contract

Make the helper stop creating a misleading temp SQLite path when using HTTP mode, or make it assert that the backend was started with the same path.

Recommended test startup contract:

- tests require `GHOSTCRAB_MINDBRAIN_URL`,
- tests optionally read `GHOSTCRAB_SQLITE_PATH` only for diagnostics,
- helper prints/records the backend URL and expected DB path,
- cleanup happens through HTTP SQL only.

## Minimal next investigations

Do these before another full integration run:

1. Run one manual request to `/api/mindbrain/sql/write-status` after a single failing test, not after the full suite.
2. Run exactly one CLI command as a subprocess, for example `remember`, with a 5s timeout and full stderr capture.
3. Run exactly one transaction-heavy tool (`project` or `learn`) and confirm whether it leaves an active writer session.
4. Inspect backend route-duration logs for the single command.

## Acceptance criteria

The problem is not resolved until all of these are true:

- no integration test failure waits for SQLite's 30s busy timeout,
- a timed-out CLI command cannot leave mocks or async work inside Vitest,
- backend logs identify the exact route and SQL operation responsible for slow requests,
- `database is locked` and `sql_session_busy` are structured, fast, and visible to the caller,
- full integration runtime returns to seconds/minutes appropriate for the suite, not 600+ seconds of blocked calls.
