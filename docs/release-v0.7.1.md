# GhostCrab Personal v0.7.1

Prepared on 14 September 2026 with GhostCrab Personal `0.7.1` and the pinned
MindBrain engine commit `500f3818936d49e53f35303d4dfece21900a3693`. The
vendored engine is identical to `../mindbrain-perso` `main`.

## Changes

- Adding a graph relation preserves existing endpoint nodes and their business
  metadata. Placeholder nodes are created only for missing endpoints.
- Workspace reset, hard delete and soft delete are atomic. A failure during
  cleanup or the final lifecycle transition rolls back the full operation.
- Required SQLite, native MCP, coverage and mutation gates protect the audited
  write paths. Publication now depends on the write-integrity workflows.
- The all-tools smoke matrix covers all 74 registered MCP tools, including
  `ghostcrab_evidence_get`.

The detailed operation inventory, measured coverage and remaining risks are in
[`reports/validation/write-integrity-20260914/`](../reports/validation/write-integrity-20260914/README.md).

## Validation

- Default suite with coverage: 873 passed, 15 explicitly skipped.
- Required SQLite integrity suite: 52 passed.
- Required native integrity suite: 14 passed.
- Integration/e2e: 107 passed.
- GraphRAG: 35 passed, including 2 explicitly optional native cases.
- Mutation pilot: 205/241 killed, score 85.06%; all 36 undetected mutations are
  explicitly reviewed.
- Typecheck, lint, build, frozen offline pnpm lockfile, npm lockfile validation,
  package verification and 74/74 MCP smoke calls passed.
- Local archive installation passed CLI startup, authorization, MCP tool
  verification, host bootstrap and Cursor setup.

All 12 native binaries were rebuilt for Linux, macOS and Windows on x64 and
ARM64. Seven npm archives are available in `dist-pack/`; their checksums are in
[`release-v0.7.1-artifacts.json`](release-v0.7.1-artifacts.json).

## npm staging

From this tagged checkout, run:

```sh
pnpm publish:npm-split
```

The command uses `npm stage publish` and does not make packages live by itself.
Review and approve the six platform package stages first, then approve
`@mindflight/ghostcrab-personal-mcp` last so its optional dependencies resolve.
