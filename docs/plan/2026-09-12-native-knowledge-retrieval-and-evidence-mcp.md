# Native knowledge retrieval and evidence through MCP

Status: implemented on `main`, 2026-09-12; synthetic import-to-MCP qualification
passes. Native engine commit: `bf9e9b5e049bf8a677093cd4f32b63fb2ae18af3`.
The unpublished Personal 0.6.9 candidate now exposes native-required search,
typed traversal, evidence reads and scoped native index maintenance. See the
[implemented contract](../reference/native-knowledge.md) and release receipt.
Exact client certification remains pending: no B1 SQLite, authoritative source,
import manifest or client proxy was found in the supplied engine directory.
Do not treat the synthetic witness as certification of that unavailable fixture.

Branch decision: this plan and the subsequent GhostCrab implementation belong
on **`main`**, as explicitly requested. Native engine changes belong in the
source repository `../mindbrain-perso` before consumer synchronization. The
GraphRAG research branch is not the implementation base for this correction.

## Decision

Keep retrieval, imported-identity resolution, graph provenance and source-text
verification in MindBrain. GhostCrab exposes typed MCP operations and preserves
their results. The client proxy only forwards MCP requests with session/workspace
context; it contains no SQL, indexing code, graph reconstruction or private HTTP
fallback.

Extend existing `ghostcrab_search`, `ghostcrab_traverse`, `ghostcrab_reindex_all`
and `ghostcrab_status`. Add **one read tool: `ghostcrab_evidence_get`**. Keep
discovery and exact evidence lookup separate: a known assertion does not need
another lexical search, and a question remains unchanged throughout discovery.

The initial structured import remains the existing administrative import
pipeline. Its implementation is repaired at the native source. Reconciliation
of an existing installation is exposed through the existing MCP maintenance
tool. No new import tool or general SQL/HTTP gateway is needed for this client
retrieval workflow. A future request to perform initial imports from the proxy
would require a separate, bounded write contract rather than overloading reads.

## Evidence and current boundaries

- Client report: `/home/dlamotte/Downloads/poc-b1-native-retrieval-result.md`.
- HTTP capture: `/home/dlamotte/Downloads/poc-b1-native-retrieval-capture.json`.
- The capture runs MindBrain 1.8.2, workspace `synthesellm-mindbrain-poc-a`:
  native BM25 returns zero; inbound `SUPPORTS` traversal from
  `assertion:asrt_884ffc127f6a` returns zero.
- Reported imported topology is `Document --CONTAINS_PASSAGE--> PassageStable
--SUPPORTS--> Assertion`. There is no distinct `Evidence` object.
- The B1 SQLite and import manifest are not present in the supplied files. The
  architect-engine handoff's `project-management.sqlite` is a different fixture.
  Its successful Pack replay cannot qualify B1.
- The report's displayed excerpt, offsets and hash have not been reconciled
  against its source bytes. In particular, offsets `14714..14810` and the displayed
  short sentence must not be treated as a verified slice without its coordinate
  convention and canonical text version.

Current source findings:

| Surface                             | Observation                                                                             | Planned correction                                                               |
| ----------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `src/db/facets-fts-search.ts`       | 0.6.9 Unicode preparation is in GhostCrab                                               | Do not claim it repairs a direct native HTTP call                                |
| Native `search_sqlite.zig`          | Agent-fact BM25 joins FTS documents to facts through `doc_id`                           | Ensure imported facts really populate and maintain these native indexes          |
| Native `structured_import.zig`      | Reindex defaults to graph; search sync is conditional and its counter can count a no-op | Make index completion explicit and verifiable, with truthful per-phase counts    |
| `src/db/facets-fts-sync.ts`         | MCP startup registers and backfills FTS; registration alone reports readiness           | Native import/upgrade must work without relying on this Node startup side effect |
| Native `graph_sqlite.zig`           | Traverse resolves `start` through `graph_entity.name`                                   | Add explicit typed reference resolution; retain legacy name semantics            |
| Native `structured_import.zig`      | External ID is `source_ref`; graph name is record content                               | Preserve the stable ID through raw-to-derived graph projection                   |
| `src/tools/dgraph/entity-chunks.ts` | Reads native document/chunk links                                                       | Do not equate an imported PassageStable with an ingestion chunk                  |

The exact deployed proxy implementation has not been identified from the report.
Locate its tool catalogue/allowlist and transport adapter before changing it;
do not assume the architect-engine report repository owns the proxy runtime.

## Public MCP contract

### 1. Discovery: extend `ghostcrab_search`

Add `execution: "auto" | "native_required"`, default `auto` for compatibility.
`native_required` must use the native search implementation, with no SQL keyword
fallback, embedding-provider substitution or query rewrite. Explicit `mode:
"bm25"` requires no provider. Preserve current response fields and backend labels;
report actual applied mode, execution path and native index readiness accurately.

```json
{
  "workspace_id": "synthesellm-mindbrain-poc-a",
  "query": "Quand l'ordonnance de référé a-t-elle été remise au greffe par mise à disposition ?",
  "mode": "bm25",
  "execution": "native_required",
  "limit": 10
}
```

Enrich each existing `results[]` entry additively with `source_ref` and
`entity_ref` when the fact-to-entity identity is established. Retain the original
fact `id`; do not replace it with the external ID. A proposed `entity_ref` is:

```json
{ "kind": "external_id", "value": "assertion:asrt_884ffc127f6a" }
```

References may include `ontology_id` and `entity_type` to disambiguate. Resolve
them within the effective workspace and caller's visibility. Never infer identity
from equal text, choose the first ambiguous entity, or return a passage hit as an
assertion hit. Use structured-import provenance to establish the fact mapping.

### 2. Graph navigation: extend `ghostcrab_traverse`

Add `start_ref` and `target_ref` using the same reference schema. Each is mutually
exclusive with its corresponding legacy string. Reference kinds are
`external_id`, `fact_id`, `entity_id` and `name`; numeric entity IDs must be positive
integers. A string of digits remains an external ID when its kind says so.
Apply the same resolver to starts and targets.

```json
{
  "workspace_id": "synthesellm-mindbrain-poc-a",
  "start_ref": {
    "kind": "external_id",
    "value": "assertion:asrt_884ffc127f6a"
  },
  "direction": "inbound",
  "edge_labels": ["SUPPORTS"],
  "depth": 1
}
```

Return stable references alongside existing path fields and preserve real edge
directions. Distinguish a missing start from an existing isolated node. Reject
ambiguous/contradictory references explicitly. Preserve legacy `start`/`target`
name calls, direction semantics and limits; do not change the meaning of all old
calls silently. New traversal responses must let GhostCrab select a resolved
target without comparing an external reference to an unrelated display name.

### 3. Evidence: new `ghostcrab_evidence_get`

Read-only exact lookup; no `query` parameter and no SQL/path/URL input. Resolve
the assertion with the same engine resolver, then apply the imported ontology's
declared evidence relations. Do not search arbitrary neighboring edges for
something that resembles proof.

```json
{
  "workspace_id": "synthesellm-mindbrain-poc-a",
  "assertion_ref": {
    "kind": "external_id",
    "value": "assertion:asrt_884ffc127f6a"
  },
  "include_text": true,
  "limit": 20
}
```

Response data includes:

- Exact assertion identity/content/version and effective workspace.
- `representation: "direct_support" | "evidence_node"` per supporting path;
  `evidence_ref: null` for a legacy direct support, never a fabricated object.
- Actual nodes/edges with predicate, direction and import provenance, plus stable
  PassageStable and Document references and their canonical source version.
- Source text when locally stored, offsets, explicit offset unit, encoding,
  declared hash, computed hash and verification state. Hash the authoritative
  original bytes; never hash a normalized display string as a substitute.
- `text_status: "verified" | "not_stored" | "hash_mismatch" | "invalid_span"`
  and separate relationship status. An accessible path does not imply verified
  text or legal truth. A mismatch cannot yield an overall verified result.
- Pagination/truncation and an explicit completeness flag. Use stable cursors,
  deterministic ordering, a maximum of 100 paths and a 64 KiB text response cap.
  Missing links, unsupported evidence profiles and incomplete responses must be
  visible, not silently dropped to make the remaining result appear complete.

The native evidence read should use one consistent read snapshot and a bounded
set of queries, not one network round trip per graph hop. It may reuse native
document/chunk readers internally where identities and coordinate systems match.
GhostCrab performs validation/transport, not a second evidence implementation.

### 4. Maintenance and status: reuse existing tools

Add `scope: "facts"` to `ghostcrab_reindex_all` for targeted native fact-index
reconciliation. Keep all current scopes compatible. Every phase must be scoped
to the requested workspace; eliminate an implicit all-workspace backfill from
this scoped operation. Counts distinguish scanned, eligible, indexed, unchanged,
skipped and failed records. Expose graph/index completion and failure details.

Extend `ghostcrab_status` and native capabilities with explicit support for typed
references, native fact-index readiness and evidence lookup. An older engine
returns `capability_unavailable` before execution; do not probe by issuing a
series of speculative requests. Registration, HTTP success or nonzero scanned
counts alone cannot mean ready.

For reads distinguish `index_not_ready`, `not_found`, `ambiguous_reference`,
`capability_unavailable` and a legitimate successful zero-hit search. Preserve
non-disclosure across unauthorized workspaces: foreign and absent IDs must not
leak which one exists. Use the existing MCP error envelope consistently.

## Native implementation and data ownership

### P0 — Reproduction and import inventory

1. Capture the exact client SQLite, associated source text/version, import
   manifest/mapping and model. Record hashes without publishing client data.
2. On a fresh copy, reproduce the original HTTP calls unchanged. Inspect raw
   facts/provenance, derived graph identity and native FTS mappings separately.
   Diagnostic SQL is allowed in the isolated developer harness only.
3. Add a synthetic regression fixture via the real structured-import path:
   Assertion, PassageStable, Document, directed edges and canonical stored text.
   Do not seed search/graph derived tables by hand, as the research benchmark does.

Deliverable: exact baseline receipt when available, plus a failing synthetic
import-to-retrieval test. Missing client data blocks exact client certification,
not implementation of the independently reproducible product corrections.

### P1 — Make structured facts natively searchable

Implement first in `../mindbrain-perso`, including `facts_sqlite.zig`,
`structured_import.zig` and `search_sqlite.zig` as indicated by reproduction.
Reuse the canonical native indexing path for insert/update/delete and sync setup.
An import reports retrieval-ready only when all eligible rows are indexed at the
committed content version. A missing registration is not a successful no-op;
replace swallowed sync failures with truthful failures or explicit partial state.

Prefer transactionally consistent derived updates. For a separate existing
reconciliation phase, expose the pending state until it completes and make
retries idempotent. Verify changed content removes obsolete lexical terms.
Retain native tokenizer behavior and active fact windows. No broad fallback or
special-case vocabulary for the client's question.

Upgrade existing databases through the same bounded native reconciliation, with
an explicit preparation receipt. Reads must not initiate writes or a hidden
reindex. Align Node bootstrap/catch-up with the native authority instead of
maintaining two divergent registration/indexing lifecycles.

### P2 — Preserve and resolve imported identity

Inventory the actual uniqueness keys and raw-to-derived graph mapping before
altering schema. Reuse existing external IDs and provenance tables. If a durable
projection mapping is missing, add the smallest indexed mapping necessary, owned
by the native graph projection; document keys, backfill and rollback. Do not
overwrite `graph_entity.name` with an ID or duplicate business entities.

Resolve only the explicitly supplied kind and scope. Reindex/restart must not
change external reference identity. Collisions across types/ontologies require
qualification or yield ambiguity; duplicate display names must not affect exact
external references. Reject missing/dangling mappings instead of guessing.

### P3 — Return the existing proof faithfully

Implement native evidence lookup for the declared legacy direct-support profile.
The engine follows the inbound `SUPPORTS` link to PassageStable and the inbound
`CONTAINS_PASSAGE` link to Document, preserving source direction in the result.
Store/read canonical passage text through existing native content facilities
where possible; keep imported stable passages distinct from generated chunks.

If the current import contains only ledger references, include the actual text
and source version in an explicit follow-up import. The read tool must return
`not_stored` until then, without fetching files, invoking a provider or consulting
the client's external ledger through the proxy.

### P4 — Support explicit Evidence objects without falsifying legacy data

Do not force a new Evidence node into every ontology. Support a second declared
profile, `Assertion -> Evidence -> PassageStable -> Document`, whose actual
predicates/directions are defined in the imported model rather than guessed.

For the client that requires this literal chain, prepare a versioned fixture
enrichment and reviewed mapping: create real Evidence records with stable IDs,
the asserted support relation, provenance and source-version references. Mark
records derived from legacy support links as derived, not source-authored. Keep
the original direct-support links and make the enrichment idempotent and reversible
by its import provenance. Creating the record does not certify legal validity.

Qualify two distinct outcomes: legacy B1 can return a verified direct-support
path; the enriched fixture can return a real Evidence-node path. Never report the
second outcome from the first fixture. If the literal chain is a client acceptance
requirement, its enrichment and validation are release requirements as well.

### P5 — Expose through GhostCrab and the proxy

1. Synchronize the tested native source into `vendor/mindbrain` through the normal
   source-first workflow. Never author engine fixes inside the vendored checkout.
2. Extend `src/db/standalone-mindbrain.ts` and the existing search/traverse/status/
   reindex handlers; add `src/tools/dgraph/evidence-get.ts` with the read contract.
3. Update tool registration, `tool-manifest.ts`, catalogue/access classification,
   discovery metadata, generated MCP documentation, native capability reporting,
   permission-preset tests and compiled `dist`. Evidence is a governed read tool;
   reindex remains maintenance, not a hidden read privilege escalation.
4. Update the identified proxy's MCP catalogue/allowlist to expose these contracts.
   All client discovery, exact navigation, evidence reads and requested maintenance
   go through MCP. Remove B1's direct HTTP/SQLite workaround after parity is proven.
   Native HTTP remains an internal GhostCrab-to-engine transport, not an additional
   proxy interface. Do not remove unrelated interfaces used by other consumers.

No public `include_evidence` search flag is necessary initially: search returns
typed references, and the exact tool follows them. The two operations remain
independently testable and avoid an expensive proof traversal for every search hit.

## Acceptance matrix

| Gate                      | Required evidence                                                                                                                                                                                  |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Native baseline/candidate | Same B1 question, workspace, BM25-only mode and limit; candidate retrieves the expected assertion identity, not just any fact                                                                      |
| Real import               | No direct writes into FTS or derived graph tables in fixture preparation; no dependence on an MCP startup to make a native import searchable                                                       |
| Lifecycle                 | Insert, content update, deletion/supersession, active-window boundaries, restart, upgrade and repeated reconciliation are covered                                                                  |
| Identity                  | External ID, fact ID and qualified name round-trip; numeric-string external ID, duplicate names, ambiguous scopes, wrong workspace/type/ontology, absent IDs and dangling mappings are tested      |
| Native graph              | Original imported assertion ID resolves through the new explicit contract; correct `SUPPORTS` direction reaches the expected PassageStable                                                         |
| Legacy proof              | Original edges returned honestly, `representation=direct_support`, no fabricated Evidence identity                                                                                                 |
| Enriched proof            | Real imported Evidence node and full declared path; reimport does not duplicate nodes or support claims                                                                                            |
| Text                      | Native canonical text equals the authoritative source slice byte-for-byte; encoding/offset convention/version and SHA-256 verified; missing text and mismatched hashes fail explicitly             |
| MCP transport             | Real `tools/list` and `tools/call` in the client-equivalent permission preset; public search -> returned reference -> evidence lookup succeeds with no raw SQL or native HTTP from the test client |
| Proxy                     | Client transport permits only the configured MCP server; direct database/native-endpoint/provider fallbacks disabled; all B1 steps still pass                                                      |
| Isolation                 | Target selection before candidate limiting; no cross-workspace identity/text leakage; scoped repair leaves unrelated facts, indexes and graph data unchanged                                       |
| Read-only                 | Baseline copy, upgrade, import/enrichment and startup writes recorded separately; all subsequent native and MCP reads preserve every SQLite table/schema digest                                    |
| Compatibility             | Existing Pack exact/ambiguous/absent cases, French positive/negative controls, combined resolved-value contract, legacy traversal calls and ordinary search stay covered                           |

Add focused Zig regressions at the native ownership boundaries, MCP contract
tests and a real stdio replay with a transparent diagnostic relay. Run the
complete relevant native, unit and integration suites before release packaging.
Then install rebuilt local archives and repeat the B1 candidate replay against
the packaged binary and `dist`, recording their exact hashes. Research scores,
successful startup, validator exit zero or tool registration are not B1 gates.

## Delivery, migration and release conditions

- Produce a reviewable implementation per phase: native index lifecycle, identity
  resolver, evidence profiles, MCP exposure, then client proxy integration.
- Preserve unrelated work and client fixtures. Store private replay artifacts
  locally; commit only synthetic fixtures, tests, contracts and appropriate
  aggregate evidence. Do not copy private SQLite data into the research corpus.
- Use a copy/backup for upgrade rehearsals. Track any schema migration and fixture
  enrichment independently; rollback restores the pre-upgrade copy and prior
  package, with source facts preserved. No in-place live migration in validation.
- Deliver exact engine and GhostCrab commits, package/native hashes, new MCP
  request examples, new receipt, expected identities/content and read-only digests.
- State separately `product_regressions_passed`, `client_b1_replayed`,
  `legacy_proof_verified` and `evidence_node_fixture_verified`. Only claim each
  outcome supported by its own run. Unknown/unavailable source bytes cannot be
  converted into a verified result to clear a release gate.
- This task prepares a plan only. Implementation must not push branches/tags or
  publish npm packages under the current user constraint. If 0.6.9 has been
  published elsewhere by implementation time, use the next release version
  rather than replacing an existing artifact. Keep the existing Pack fix intact.
