# GhostCrab Personal v0.6.9 release preparation

The launch-plan ticket is fixed by GhostCrab commit `df7b3af` and MindBrain
commit `95af807`. Release `0.6.8` at `ec95fa0` predates those fixes.
This candidate packages them with MindBrain **1.9.0**, prepared for tag `v1.9`
initially at `49b89969e74943e0e6cfb3d4b357b73169396283`.
The current native knowledge candidate pins engine commit
`bf9e9b5e049bf8a677093cd4f32b63fb2ae18af3`; no tags were moved or pushed.
The MCP surface version is `2026-09-12`.

## Delivered behavior

- `ghostcrab_pack` accepts `selection_mode: "exact"` and optional `plan_id`.
  It selects one active plan within the requested workspace, agent and exact
  scope. It preserves the original question for fact retrieval and the public
  response. Absent or ambiguous identities fail explicitly. Existing text
  searches keep their previous semantics.
- FTS preparation preserves Unicode letters and NFC accents. The French query
  becomes `"échéance" OR "dépassée"`, instead of `"chance" OR "dpasse"`.
- Combined search accepts `collection_facet_value` separately from the question.
  The caller resolves vocabulary values such as `overdue`; SQL does not infer
  synonyms from a natural-language question.
- The six platform package versions, root manifest and both lockfiles are aligned
  at `0.6.9`. The previous lockfiles still referenced `0.6.6`.

See [the exact MCP arguments and replay command](search-contract.md).

## Ticket qualification on 12 September 2026

The tester's `0.6.8` kit from run `99261a01-526e-4624-b5da-cc238fff9133`
is available under the sibling architect-engine repository at
`reports/validation/ghostcrab-0.6.8-retest-20260912`. Its 51-file manifest and
all nine groups in its original evidence validator passed. This is a new local
reproduction using that kit's unchanged synthetic seed, with SHA256
`7e8b5151502d36d9706fe1bc0bc7623e7dce8f081803f19f60fc286583e74837`.

Both runs used real MCP stdio, a transparent native HTTP relay, and fresh seed
copies. The baseline was rebuilt from `ec95fa0` and its pinned engine
`8a71f7ce691bea4e3e5e9ec0c0a7036ba7aaec5a` with Zig 0.16.0 on Linux x64.
It is a source reconstruction, not the tester's original macOS ARM64 package.
The four relevant rebuilt dist files match the supplied dist copies byte for
byte. The supplied runner and validator were executed without modification on a
copy of the kit: runner exit 2, validator exit 0 (`evidence_verified`), new run
`55be14c8-2f10-4b33-a914-068c22c7882c`. These baseline statuses confirm the old
defects, not the candidate fixes.

| Check | Rebuilt 0.6.8 baseline | 0.6.9 candidate |
| --- | --- | --- |
| Historical full-question Pack request | 0 plans, 5 facts | 0 plans, the same 5 facts |
| New exact-selection contract | Unavailable | 1 expected plan, the same 5 facts |
| Rephrased question and explicit plan ID | Unavailable | Same plan identity and content |
| Missing ID/scope, wrong agent/workspace | Historical semantics only | `plan_not_found` |
| Two plans with `limit: 1` | Historical semantics only | `ambiguous_plan`; explicit ID succeeds |
| French accented BM25 witness | 0 | 1, same generated ID as the structured `record_id=gc068-fr` control |
| ASCII, GC068 marker, structured ID controls | 1 each | 1 each |
| Unrelated lexical query | 0 | 0 |
| Combined question without resolved value | 0 | 0 |
| Explicit `overdue` collection facet value | Legacy `query: overdue` returns 1 | Original question plus separate value returns 1 |

The target ID hash remains
`630503c77376906d0e65d5f43188aa3271e5cdc8d24722d6d064475737607fd2`,
and its content hash remains
`2f22dc49743522bedeb53fc809565c05e060cba753cf96e4dcf15500ded01e9f`.
The relay verifies that native fact retrieval receives each original question.
The five facts are identical between baseline and candidate.

Initialization finishes after the MCP handshake. The replay waits for completion
before taking the read-phase snapshots. Backend startup and MCP FTS initialization
are recorded separately from synthetic fixture writes. Preparation follows the
supplied runner: a separate synthetic workspace, four INSERT statements, and one
`ghostcrab_remember` call. Native, Pack, search and ambiguity-control read phases
preserve every table digest and the schema digest. No general reindex is run.

Local receipts are retained under `reports/release-v0.6.9/`:
`seed-inspection.json`, `official-baseline/`, `official-baseline-verdict.json`,
`candidate.json`, and `comparison.json`. They include complete MCP responses, native requests, binary
and dist hashes, and table digests. They are local test evidence, excluded from
Git and the npm package.

## Validation

- MindBrain: 448/448 tests with runtime version 1.9.0.
- GhostCrab: 811/811 unit and native tests; 104/104 integration tests.
- Typecheck, lint, changed-file formatting and npm pack verification passed.
- Candidate replay used the Linux x64 release prebuild, whose SHA256 is
  `fba7dba849446c5fcfc6e6fa395e72478fbe01db44c8fd3e870b798d0990368a`.
- All 12 native binaries were cross-compiled for Linux, macOS and Windows on
  x64 and ARM64; seven local npm archives are available in `dist-pack/`.
- Installation from the local installer and Linux x64 native archives passed,
  including MCP tool verification, host bootstrap and Cursor configuration.
  macOS and Windows binaries were cross-compiled, not executed on this Linux host.

Git tags and publication remain explicit release steps. Preparing these versions
does not publish a Git tag or an npm package.

## Native knowledge extension (B1)

See the [MCP contract](reference/native-knowledge.md) and
[qualification receipt](../reports/validation/native-knowledge-20260912/README.md).
The native writer now indexes structured facts transactionally; typed references
resolve imported IDs without a name fallback. `ghostcrab_evidence_get` follows
declared ontology profiles and verifies stored source spans, without inventing an
Evidence object. A separately enriched synthetic fixture proves a real Evidence
node path. Node startup and SQL upserts reconcile through the engine during their
write phase; native reads do not backfill indexes.

Validation: 454 native tests; 803 GhostCrab tests (15 skipped); 104 integration/e2e
tests; real MCP synthetic B1 replay and the supplied Pack/Unicode/combined replay.
The B1 SQLite, source text and client proxy are still unavailable; the exact client
fixture is not certified. This qualification targets Linux x64 local archives.
Other platform binaries are not rebuilt or certified by this extension's replay.
No push, tag update or npm publication was performed.
