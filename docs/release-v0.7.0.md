# GhostCrab Personal v0.7.0 release preparation

Prepared on 14 September 2026 from GhostCrab `91a9d2d` and pinned MindBrain
`500f3818936d49e53f35303d4dfece21900a3693` (runtime `1.9.0`). The root package,
six platform packages and both lockfiles use `0.7.0`; the MCP tool surface is
`2026-09-14`.

## Changes since v0.6.9

Prepared native projection contracts can answer supported business questions in
two MCP calls: `ghostcrab_business_query_answer` selects a bound result, then
`ghostcrab_artifact_get` returns its rows, evidence, ontology, column meanings,
assumptions and freshness. `ghostcrab_live_create` and `ghostcrab_live_refresh`
prepare the contracts. No new MCP tool is introduced.

- `projection_only: true` prevents fallback to the agent-fact capability registry,
  including when no contract is prepared.
- Workspace, ontology, date, artifact version and source/contract digests bind
  discovery to retrieval. Changed sources invalidate the result; an explicit
  refresh and new discovery are required.
- Incomplete evidence returns `indeterminate` with `answer_available: false`.
  Reads neither refresh materializations nor change stored facts.
- The npm package includes three example contracts for building quotities,
  lots without declared owners and active leases, plus usage and architecture
  documentation.

See [the public contract and limits](reference/qualified-projection-answers.md),
[implementation validation](reference/projection-two-call-implementation-validation.md)
and [architecture and PostgreSQL impact](reference/projection-contracts-architecture-and-postgres-impact.md).

## Scope and compatibility

This is a bounded three-contract pilot over the Studio immeuble fixture, not a
qualification of all 25 Studio views or arbitrary semantic paraphrases. Quotities
and missing-owner declarations have complete expected answers. The lease fixture
lacks sufficient declared evidence and remains incomplete. Missing ownership
declarations describe the imported records, not real-world ownership absence.

Existing retrieval without `include_answer` and the legacy route without
`projection_only` retain their interfaces. The qualified path requires both this
consumer and the pinned native engine; engine runtime `1.9.0` alone does not
identify the projection implementation. Existing databases receive no automatic
example contracts or refresh as part of preparing this release.

## Validation

Fresh release checks use Node `22.17.0`, pnpm `10.10.0` and Zig `0.16.0`.

- Native engine: 463/463 tests passed.
- GhostCrab default suite: 828 passed, 15 skipped.
- Four optional native search tests passed against an owned temporary backend.
- Integration/e2e: 104/104 tests passed against a disposable SQLite backend;
  `/health` reports MindBrain `1.9.0`.
- GraphRAG: 35/35 tests passed.
- Typecheck, lint, TypeScript build, frozen offline pnpm lockfile and offline
  npm install dry-run passed.
- Real projection MCP replay: 15 scenarios, including 10 two-call cases;
  seven complete answers and three explicit incomplete lease answers. Date,
  scope, binding and stale-result controls passed. No table changed during
  serving; `agent_facts` stayed empty. A mutation on the disposable copy was
  rejected as stale, and explicit refresh produced the independently expected
  changed total. The original Studio fixture stayed unchanged.

Local logs and replay receipts are retained under `reports/release-v0.7.0/`.
Native knowledge and the supplied Pack/Unicode/combined-search ticket also pass
through real MCP with disposable fixtures. Native knowledge uses a synthetic
fixture; the unavailable original B1 client is not certified by this replay.

## Local artifacts and installed qualification

All 12 native binaries were rebuilt from the pinned engine for Linux, macOS and
Windows on x64 and ARM64. Seven npm tarballs and `ghostcrab-beta-0.7.0.zip` are
available in `dist-pack/`. See [archive and binary SHA-256 checksums](release-v0.7.0-artifacts.json).
Each archived native binary matches its prebuild byte for byte; the beta ZIP
contains the exact same seven tarballs. The installed package reports `0.7.0`
and surface `2026-09-14`, and includes the three qualified example contracts.
The package contents check passed with 760 files.

The local archive installation passed CLI startup, authorization, MCP tool
verification, host bootstrap and Cursor setup checks. The generated beta
installer passed offline. Its installed Linux x64 backend and installed MCP
server passed the projection, synthetic native-knowledge and supplied search
ticket replays. The projection replay again passed all 15 scenarios, including
10 two-call cases, with zero changed tables during serving.

Global PATH installation and automatic upgrade hooks were disabled during these
checks. The local npm allow-scripts policy deferred the beta package's automatic
postinstall; the installed runtime was checked explicitly. The other five
platforms were cross-compiled and their binary formats checked, but not executed.

## Publication

This preparation does not create a Git tag, push a repository, stage npm
packages or publish them. The existing Publish workflow builds tag pushes;
npm staging requires a manual run on a release tag with `stage_npm: true` and
successful Windows beta smoke. Package approvals remain six platforms first,
then the root package.

The engine remote check on 14 September finds `main` at `bf9e9b5` and no
advertised ref at `500f381`. The pinned projection commit therefore needs its
separate authorized engine publication and remote verification before this
release can be rebuilt from public Git refs.
