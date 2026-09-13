# Projection two-call pilot — implementation validation

Date: 2026-09-13. Consumer branch: `docs/projection-two-call-reliability`.
Historical baseline/report commit: `bf80d07`. Canonical MindBrain implementation:
`500f3818936d49e53f35303d4dfece21900a3693`, branch
`feat/projection-two-call-reliability`, pinned by this change in `vendor/mindbrain`.
Both changes are local and unpublished. The sibling MindBrain main checkout and
Studio's source fixture were preserved.

The result qualifies the **bounded three-contract pilot**, with complete answers
for quotities and missing owner declarations and an explicit incomplete-evidence
result for leases. It does not establish the original general claim for all 25
Studio live views or arbitrary nearby questions. See
[usage and limits](qualified-projection-answers.md).

## Real business replay

Source: `../mindbrain-personal-studio/fixtures/immeuble-demo.sqlite`, SHA-256
`17d60e66d12fb78cc1692d4ae1a0b5a902bb28f9d70b3a73c816e2bf6c7b4cb3`.
The script opens it read-only and uses a temporary SQLite backup. The original
contains zero `agent_facts`. Seeding and embeddings are disabled.

Preparation creates and explicitly refreshes three additional `qualified_*`
artifacts via the actual MCP tools. Serving uses the actual SDK stdio transport,
`ghostcrab_business_query_answer` with `projection_only: true`, and its exact
bound `ghostcrab_artifact_get` call. Setup and preparation are recorded separately.

| Scenario | Independent expected result | Observed status |
| --- | --- | --- |
| Quotities | Buildings 1227, 1228, 1383, 1499, 1615 each total 1000; distinct member counts 5, 8, 9, 9, 9 | Ready, 5 rows |
| Lots without declared owners | Only entity 1529, Résidence Le Canal apartment A3 | Ready, declared-record coverage only |
| Active leases at 2026-09-13 | Lease roots 1342–1346, 1446, 1562, 1677; landlord declarations incomplete | Indeterminate, 8 rows, `answer_available: false` |

For each pilot: one canonical question and two declared paraphrases. One extra
polite reformulation was withheld from the alias list. Thus **10 two-call cases**
return result and ontology: seven complete answers and three partial lease
results. This tests limited normalization, not broad held-out paraphrase recall.

Five contrasts are refused: a 90-day lease condition, a 900 quota target,
ownership present rather than absent, a narrower Érables building scope, and an
unrelated Neptune question. Additional probes reject a different date (leases
and sums), a foreign workspace and a different source digest.

Every SQLite table is inventoried before and after serving using row counts and
canonical row digests with lossless BigInt handling. Both replays show:
**zero changed tables; `agent_facts` 0 before and 0 after**. Native tests additionally
deny SQL access to `agent_facts` with a SQLite authorizer, covering materialization
and answer reads; router tests reject fact SQL and exercise an empty catalog.

After the read-integrity window, an isolated mutation sets unit 1242's tantièmes
to 191. The old answer is rejected as stale. Explicit refresh invalidates the
old version binding, and a fresh two-call request returns total **1001** with
`matches: 0`. The original fixture SHA remains unchanged.

Receipts contain actual request/response bodies, scoped evidence, explanations,
timings, identities, digests, startup/preparation and mutation outcomes:

- [Built backend + source MCP receipt](../../reports/validation/studio-projection-qualified-20260913/receipt.json)
- [Installed Linux x64 + installed MCP receipt](../../reports/validation/studio-projection-qualified-20260913/installed-receipt.json)

## Checks and package provenance

| Check | Result |
| --- | --- |
| Native `zig build test --summary all`, Zig 0.16.0 | 463/463 passed |
| GhostCrab `pnpm test` | 828 passed, 15 skipped; 95 files passed, 3 skipped |
| Integration suite against the rebuilt GhostCrab backend on an isolated empty DB | 104/104 passed, 14 files |
| `pnpm build` | Passed |
| ESLint on changed TypeScript, tests and scripts | Passed |
| Strict replay against rebuilt GhostCrab backend | 15 scenarios passed, including 10 two-call cases |
| Strict replay against installed Linux x64 candidate | Same business and integrity gates passed |

The native regression suite covers independent totals, ownership changes,
temporal inclusion/exclusion, missing data, invalid intervals, quota units,
workspace/ontology isolation, source/definition invalidation, result bounds and
fact-table access denial. Consumer tests cover matching, ambiguity, explicit
dates, empty projection-only catalogs, identity/revision binding, inactive
artifacts and partial-result availability. A legacy ranking regression also
ensures a weaker snapshot cannot outrank the stronger matching live view.

Backend SHA-256:
`9f471e2f778de51fe98aafa4fed207432eccdcbde860c3d949d95f6ad3d34744`.
Local npm archive hashes:

| Archive | SHA-256 |
| --- | --- |
| `mindflight-ghostcrab-personal-mcp-0.6.9.tgz` | `221d55846ec35cd0781efb9fe69c0660572aa279f83ffe5b35c0708f312e00d7` |
| `mindflight-ghostcrab-personal-mcp-linux-x64-0.6.9.tgz` | `f5a3d55b9b237e4f31827905ecb7183a61267cbc8f1dacaffd4b237730fa2680` |

Archives were staged in `/tmp/ghostcrab-projection-package-fq59jalo` from the
built consumer and the newly rebuilt backend/document binaries. The existing
published-platform staging files were not overwritten. Both archives were
installed together into a temporary consumer using:

```sh
npm install --offline --ignore-scripts --omit=optional --no-audit --no-fund \
  --cache /tmp/ghostcrab-npm-cache <root-archive.tgz> <linux-x64-archive.tgz>
```

The replay executed `dist/index.js` and the backend binary inside that installation.
Lifecycle scripts were deliberately disabled because the existing postinstall
terminates host GhostCrab processes. This qualifies the installed runtime pair,
not a new host-bootstrap/postinstall run. Archive version `0.6.9` identifies a
local candidate, not a republished release; hashes distinguish these bytes.
The archives capture runtime and usage documentation before this final report.

## Remaining work

The other 22 live views need independent contracts and expected-result tests.
The original lease dataset needs qualified landlord and tenant coverage before
the full business question can be advertised as complete. Arbitrary semantic
matching, larger-source revision tracking, general OWL constraints, historical
source reconstruction, active Studio migration, external client exposure and
other platforms remain unqualified. No schema migration, live data modification,
remote push, release tag or publication was performed.
