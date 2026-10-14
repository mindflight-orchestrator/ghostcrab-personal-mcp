# GhostCrab Personal v0.7.3

Published on npmjs on 14 October 2026 after maintainer approval of all seven
staged packages. GitHub and GitLab main/tag are published; release CI passed.
[Publication receipt](../reports/validation/publication-v0.7.3/README.md).
MindBrain engine:
`facb0afb69b8ae0b83289c6010f1d00bbe5f59da` (the exact hash is recorded in the artifact manifest).
MCP surface: `2026-10-14`, 80 registered tools.

## Installation caveat discovered after publication

A standard registry installation can terminate its own npm process: the upgrade
cleanup matches the package name in `npm install`. The file-tarball smoke did
not reproduce that command line. The verified temporary workaround is
`GHOSTCRAB_SKIP_INSTALL_UPGRADE=1 npm install @mindflight/ghostcrab-personal-mcp@0.7.3`.
A v0.7.4 corrective release is being prepared; see the publication receipt.

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

MindBrain 469 tests; GhostCrab 909 passed / 16 optional skips; SQLite integrity
86; native integrity 17 (also on the packaged Linux binary); integration 106;
GraphRAG 35 cases / 2 optional skips. The expanded mutation gate detects 475/517
mutations (91.88%), with 42 explicit residual reviews and a blocking threshold
raised from 80% to 90%. Ten additional critical mutations, including SQL scope
removal, are all detected. Stale or duplicate mutation exceptions fail the gate.
The earlier 85.06% pilot used a smaller 241-mutation scope.

The full unit/tool suite, coverage thresholds, typecheck, lint, formatting,
package checks and local installation were rerun after test hardening. Runtime
sources and all 12 native binaries are unchanged; the prior engine, native,
integration, upgrade and 80-tool receipts remain applicable to those binaries.
See [mutation hardening evidence](../reports/validation/mutation-v073/README.md)
for exact scope, results and remaining defensive-path limitations.

A database created by the packaged v0.7.2 backend retained workspace metadata,
facts and a custom application table after upgrade. The new deletion endpoint
worked on its pre-upgrade record. No SQL schema migration was introduced.

All 12 binaries were compiled for Linux, macOS and Windows on x64/ARM64.
Linux x64 installation and runtime were exercised; other targets still need
native CI execution. Seven local archives are in `dist-pack/`. SHA-256 values
are in [release-v0.7.3-artifacts.json](release-v0.7.3-artifacts.json).

Full findings, coverage and limits:
[stock-hermes review](../reports/validation/stock-hermes-v0.7.3/README.md).

## Deployment to a target service (not executed)

Git publication and npm publication are complete. All seven packages are
available as v0.7.3 with the latest tag. The exact published archive hashes and
registry metadata are recorded in the publication receipt; npm packaging differs
from the local pnpm archives in metadata, executable modes and one README, while
runtime source and native binary contents are identical.

1. Back up the target SQLite database while its writer is stopped, install
   the pinned MCP and native binaries together, and restart the target service.
   Verify health, 80 tools, a scoped read and workspace metadata on the target.
2. If rollback is needed, stop the service and restore the saved database and
   v0.7.2 binaries together. No target environment was changed by this release.

The graph version is a content fingerprint, not a monotonic edit counter.
Historical facts are retained intentionally. Host authorization remains required.
