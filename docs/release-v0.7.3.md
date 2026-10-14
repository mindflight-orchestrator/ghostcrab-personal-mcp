# GhostCrab Personal v0.7.3

Prepared locally on 14 October 2026. MindBrain engine:
`facb0afb69b8ae0b83289c6010f1d00bbe5f59da` (the exact hash is recorded in the artifact manifest).
MCP surface: `2026-10-14`, 80 registered tools.

## Changes

- Exact fact record reads/deletes, with version checks and atomic native
  FTS/BM25/vector cleanup. Closed history remains available.
- Optional expected_version for upsert, preserving existing unversioned calls.
- Business graph record CRUD on existing model types, synchronizing raw/runtime
  storage and aliases, protecting foreign-workspace relations and preserving
  metadata. Entity IDs are not recycled after deletion.
- Graph deletion and adjacency repair share one native SQL transaction;
  failed repair rolls back the complete deletion.
- Existing workspace metadata survives CLI registration and backend restarts.
- Mandatory CI coverage for these contracts, including failures, concurrent
  edits, restart/reindex, native rollback and all 80 MCP tools.

## Validation

MindBrain 469 tests; GhostCrab 892 passed / 16 optional skips; SQLite integrity
70; native integrity 17 (also on the packaged Linux binary); integration 106;
GraphRAG 35 cases / 2 optional skips. Mutation pilot: 85.06%, with explicit
reviews of the 36 undetected mutations. The 80-tool smoke and existing memory
scenarios passed. Typecheck, lint, targeted formatting and package checks passed.

A database created by the packaged v0.7.2 backend retained workspace metadata,
facts and a custom application table after upgrade. The new deletion endpoint
worked on its pre-upgrade record. No SQL schema migration was introduced.

All 12 binaries were compiled for Linux, macOS and Windows on x64/ARM64.
Linux x64 installation and runtime were exercised; other targets still need
native CI execution. Seven local archives are in `dist-pack/`. SHA-256 values
are in [release-v0.7.3-artifacts.json](release-v0.7.3-artifacts.json).

Full findings, coverage and limits:
[stock-hermes review](../reports/validation/stock-hermes-v0.7.3/README.md).

## Deployment sequence (not executed)

1. Publish MindBrain `main` containing the pinned engine commit, then verify
   that a clean clone can retrieve it. The consumer must not be published first.
2. Publish the reviewed GhostCrab `main`, create/publish release tag `v0.7.3`,
   and require the CI integrity, native and platform installation gates.
3. Submit the seven packages to staging using the release workflow's explicit
   `stage_npm` input or `pnpm publish:npm-split` from the tagged checkout.
   Approve the six platform packages first, verify availability, then approve
   the root package. No package has been staged or published during preparation.
4. Back up the target SQLite database while its writer is stopped, install
   the pinned MCP and native binaries together, and restart the target service.
   Verify health, 80 tools, a scoped read and workspace metadata on the target.
5. If rollback is needed, stop the service and restore the saved database and
   v0.7.2 binaries together. No target environment was changed by this review.

The graph version is a content fingerprint, not a monotonic edit counter.
Historical facts are retained intentionally. Host authorization remains required.
