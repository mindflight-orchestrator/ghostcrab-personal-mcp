# GhostCrab Personal: document qualification, indexing and functional completeness

Status: S0 and the native S1b index/read path implemented locally; S1c and broader parity remain open. Updated 2026-09-11 after
prioritizing taxonomy/facet associations with documents and chunks alongside
indexing. This is the authoritative Personal plan; the pg_mindbrain plan links here.
Local implementation is authorized. Publication and live data migration are outside scope.

References: [cross-edition audit](../../pg_mindbrain/docs/audit/2026-09-11-ghostcrab-feature-parity.md),
[S0 implementation evidence](../../pg_mindbrain/docs/audit/2026-09-11-facet-target-implementation.md),
[Pro plan](../../ghostcrab-mcp/docs/plan/2026-09-11-ghostcrab-pro-parity.md).

## Product outcome

A user selects or supplies taxonomies/facets, imports documents with native or
external conversion/chunking, and can retrieve qualified documents **and their
precise chunks**. Lexical/vector indexing and qualification can progress
independently after their inputs are persisted. Accepted assignments become
searchable with explicit readiness, including when qualification finishes later.
Changing an assignment or reconverting a document must not leave stale matches
or silently attach evidence to a different passage.

Preserve local SQLite/Zig execution, autonomous distribution, session workspace
selection, graph-first combined search, evidence content, bounded results,
explicit fallbacks and durable host-bound memory. No PostgreSQL or remote service
is required for this Personal workflow. Pro parity is a shared behavior contract,
not a reason to remove Personal features or narrow its supported identifiers.

## Audited baseline and ownership

| Component | Current state | Responsibility |
| --- | --- | --- |
| Original assignments | Native qualification writes document/chunk rows to `facet_assignments_raw` | Native engine persists identity, values, weights and provenance |
| Facet bitmap rebuild | `import_pipeline.zig:767` selects only `target_kind='doc'` | Native engine must add chunk-aware indexing and invalidation |
| Collection bitmap search | `reindex_http.zig` emits document results with `chunk_index=null` | Native engine must distinguish document aggregates from exact chunk results |
| Exact MCP reads | S0 reads original assignments for explicit target/ontology filters | MCP preserves target semantics; untargeted bitmap behavior remains unchanged |
| Taxonomy selection | `document-qualify` currently resolves `firstCsvValue(taxonomy_filter)` | Audit and implement the full selected-taxonomy contract; never silently use only the first |
| Engine source | Tracked submodule `vendor/mindbrain`, remote `mindbrain-perso.git`, pinned at `8a71f7ce691bea4e3e5e9ec0c0a7036ba7aaec5a` at inspection | Make durable native changes in this engine repository and update the consumer pin after validation |

A document aggregate is a separate derived assignment. Automatic aggregation
must be specified and tested; storing a chunk assignment alone does not prove
aggregation or chunk indexing. S0's successful concurrent submission test proves
retrieval after both operations complete, not crash recovery or durable job scheduling.

## Common document/chunk contract

Define these semantics before changing index storage; reuse existing native
records, transactions and job mechanisms wherever they meet the contract.

- **Target:** explicit workspace, collection, document identity/revision and,
  for chunks, chunk identity/revision and index. Chunk zero is valid. Reusing a
  positional chunk index after reconversion must not reuse unrelated evidence.
- **Qualification:** taxonomy/ontology identity, namespace, dimension, value or
  term identity, value type, confidence/weight, evidence/source and applicable
  review state. Taxonomy hierarchy, facet dimension and ontology remain distinct.
- **Multiple taxonomies:** preserve identity when namespaces, dimensions or
  labels collide. Apply every selected taxonomy according to scope; report
  unsupported selections explicitly. Use the existing version model where available.
- **Aggregation:** retain original chunk assignments. Specify document-level
  aggregation separately, including provenance, weighting and invalidation.
  Do not substitute an aggregate document hit for a precise passage hit.
- **Readiness:** report persistence, qualification and index readiness separately.
  A missing vector provider cannot prevent lexical/facet search. A candidate must
  not become accepted merely because it was indexed; follow the configured policy.
- **Parallel execution:** indexing may start after document/chunk persistence;
  qualification may run alongside it. Commit each accepted assignment together
  with the durable indication that its derived indexes need updating. Track the
  indexed revision so an older job cannot mark newer data current.
- **SQLite coordination:** parallel work means independent tasks with short,
  coordinated write transactions, not unrestricted simultaneous SQLite writers.
  Bound retries, preserve idempotence and recover interrupted work on restart.
- **Retrieval:** exact reads remain available from committed originals while
  derived indexes catch up, with the path/readiness reported. Apply workspace,
  collection, taxonomy and target filters before ranking, deduplication and limits.

## Ordered implementation and exit criteria

### S0 — exact facet target reads: completed locally

- [x] Add `target_kind`, `doc_id`, `chunk_index` and `ontology_id` to collection search.
- [x] Preserve chunk zero and decimal-string document IDs in exact reads.
- [x] Keep existing untargeted Personal bitmap search and graph-first combined search.
- [x] Validate against both native runtimes before/after reindex and after late
  qualification, with populated neighboring workspaces and overlapping numeric IDs.

Evidence: Personal tool suite 250 passed; both consumer TypeScript checks passed;
shared real-data scenarios and large-ID retrieval passed. See the linked S0 record.
This is a completed read-path increment, not completion of S1.

### S1a — target identity and native index contract: index contract implemented

- [x] Inventory native document/chunk IDs, revision handling, raw assignments,
  bitmap keys, lookup mappings, deltas and existing rebuild tests.
- [x] Choose the smallest index representation that distinguishes doc hits from
  chunk hits and preserves taxonomy identity. Check collisions, large IDs and
  the existing native bitmap ID mapping; do not impose a new global int32 limit.
- [ ] Define reconversion/rechunking behavior: preserve identity where valid,
  otherwise supersede old assignments and links explicitly. Record data migration
  and rollback steps if storage changes are necessary.
- [x] Add and reproduce native regressions for doc/chunk retrieval; cover multiple
  chunks, duplicate labels across taxonomies, full-width IDs, assignment mutation,
  vacuum, interrupted rebuild and exact filtering before limits.
- [ ] Add content-revision/rechunking supersession tests when implementing S1c.

Exit: reviewed object/ID map, explicit output contract and reproductions on a
fresh disposable SQLite database using the pinned engine source.

### S1b — native chunk facet indexing and search: core implemented locally

- [x] Rebuild document/chunk bitmaps with dense target IDs and taxonomy-qualified
  postings; retain existing legacy document postings separately.
- [ ] Define automatic document aggregates and incremental bitmap maintenance.
  This increment uses transactional rebuilds and durable dirty invalidation.
- [x] Decode indexed results to original document/chunk identities; retain weights,
  taxonomy identity and source/evidence when resolving bitmap candidates.
- [x] Rebuild after assignment updates/removals, including empty scopes; preserve
  neighboring collections. Mutations atomically invalidate the derived index.
- [ ] Supersede qualifications after document/chunk content revisions (S1c).
- [x] Keep bitmap search and explicit raw fallback; detect stale/missing indexes
  instead of returning an apparently authoritative empty or incomplete result.

Exit: native indexed/raw semantic parity before/after rebuild, idempotent repeat
rebuild, deletion/invalidation and large-ID cases. Prove the bitmap path was used
where claimed; a successful raw fallback is not evidence of chunk index support.

Implementation and rollback record:
[native facet index](../../pg_mindbrain/docs/audit/2026-09-11-personal-native-facet-index.md).
Native changes are committed as `1be8693164e4b85c3600e48b91ae15452314075a`
and the consumer gitlink references that revision. No publication or prebuilt
distribution update has been performed. MCP probes the capability to remain compatible
with the old bundled engine. Full-width Personal identifiers are retained rather
than inheriting Pro's signed bigint bounds. Combined-search fallback retains
chunk/taxonomy provenance and distinct result identities.

### S1c — qualification coordinated with indexing

- [ ] Connect native ingestion and external chunk incorporation to the same target
  contract, with deterministic facets available without an LLM.
- [ ] Apply multiple selected taxonomies and doc/chunk qualification envelopes;
  validate target existence, taxonomy scope and configured acceptance policy.
- [ ] Reuse or extend durable work/revision tracking so indexing and qualification
  can finish in either order, retry and resume after restart.
- [ ] Refresh/invalidate derived facets and aggregates after accepted additions,
  revisions, rejection/retraction and rechunking. Keep original provenance.
- [ ] Expose bounded progress and effective readiness through native responses.

Exit: qualification before index, index before qualification, concurrent
submission, interrupted writes, duplicate delivery, stale job completion and
restart recovery all converge to the same committed/retrievable result. Prove
atomic rejection of an invalid envelope and preservation of previous valid data.

### S2 — expose the full ingestion contract through MCP/CLI

- [ ] Reuse the native S1 contracts for native/external document conversion,
  supplied chunks, taxonomies/facets and structured import. Inventory existing
  CLI/HTTP capabilities before adding another implementation.
- [ ] Accept external entity-passage mappings with stable references, scope checks,
  atomic validation and retry semantics. Attachment must not rename an entity.
- [ ] Report original targets, accepted/pending qualification and effective
  indexing state; make required reindex work explicit instead of silently omitting it.
- [ ] Test native API, CLI and MCP equivalence against real SQLite data.

Exit: one documented end-to-end path from supplied documents/chunks and selected
facets to indexed document and exact passage retrieval, including later qualification.

### S3 — combined retrieval and evidence

- [ ] Extend the existing graph-first combined search with S1/S2 evidence and
  taxonomy/target filters while preserving its alias and fallback behavior.
- [ ] Join entities/facts to original passages; distinguish source text, factual
  assertions, qualifications and document aggregates in the result contract.
- [ ] Test mixed graph/facet/chunk results, deduplication before limits, partial
  backend failure, missing links and index readiness on actual native data.

Exit: bounded, explainable results preserve passage identity and existing Personal
search behavior; common scenarios can then be run against Pro without making
Personal depend on Pro's deployment or development schedule.

### S4–S7 — retain the wider completeness roadmap

| Lot | Remaining work | Acceptance |
| --- | --- | --- |
| S4 | Artifact lists/snapshots/migrations; ontology inspection/schema sync, impact, requalification, branches and coverage | Map native/CLI/MCP equivalents; preserve domain identity, versions and safe review transitions |
| S5 | Typed/hierarchical/geographic facets; graph embedding helpers, patching and discovery | Reuse local primitives; test multilingual lexical/vector behavior and explicit provider absence |
| S6 | Calculated rules/process behavior, harness and workspace comparisons | Port feasible local behavior; document Pro-specific deployment/security differences without reducing Personal |
| S7 | Shared behavioral scenarios, capability manifest and packaging | Verify actual native/MCP/CLI support, distribution smoke and native durable memory; replace tests using user-installed databases with disposable fixtures |

These lots follow the document/chunk pipeline. Add targeted regression coverage
with each change; do not defer testing until S7. No parity claim is based solely
on matching tool names or manifest counts.

## Delivery workflow and definition of done

1. Start with S1a native reproductions. Implement S1b, then S1c, before declaring
   the parallel document qualification/indexing workflow complete.
2. Build with the repository-required Zig compiler (0.16 at inspection), writable
   isolated caches and a fixed submodule revision. Use `BACKEND_VENDOR_UPDATE=0`
   for reproducible validation; do not fetch an unrelated newer engine implicitly.
3. Validate the rebuilt binary, fresh data and any required upgrade/rollback.
   Update the Personal gitlink deliberately after engine validation; preserve
   unrelated changes in both repositories.
4. Run targeted regressions and affected TypeScript/tool suites, then native
   integration and distribution installation tests for changed shipped binaries.
   Retain host-bound memory, transaction, FTS, packaging and workspace isolation tests.
5. Record source revision, binary provenance, commands, results and limitations
   per completed lot. An optional native test reported as skipped does not pass
   the exit criterion. Keep the plan's completed/pending states accurate.

The next Personal step is **S1c**, including revision/rechunking supersession and
qualification scheduling. The user subsequently prioritized Pro P1 after the
local Personal commits; the unfinished Personal stages remain explicitly open.
