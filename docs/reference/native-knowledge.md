# Native knowledge retrieval and evidence (0.6.9 candidate)

This additive contract addresses structured-import retrieval. It requires an engine
advertising `native_fact_index`, `typed_entity_references` and `evidence_get`.
The original 0.6.8 package does not implement it. No publication is implied by
this document. See the release receipt for the qualified commit and binary.

## MCP-only client flow

The proxy uses MCP `tools/list` and `tools/call`. Its read allowlist must include
`ghostcrab_search`, `ghostcrab_traverse`, `ghostcrab_evidence_get` and
`ghostcrab_status`. `ghostcrab_reindex_all` is a separate write permission.
Evidence is an extended graph read; the basic IDE permission preset intentionally
keeps its existing list. There is no need for client SQL, a native HTTP client,
a local ledger reader or a second model/provider interface.

```json
{"name":"ghostcrab_search","arguments":{
  "workspace_id":"synthesellm-mindbrain-poc-a",
  "query":"Quand l'ordonnance de référé a-t-elle été remise au greffe par mise à disposition ?",
  "mode":"bm25","execution":"native_required","limit":10
}}
```

`native_required` performs native retrieval only. BM25 needs no embedding provider.
A missing capability or pending index produces `capability_unavailable` or
`index_not_ready`, not an empty success or SQL fallback. Schema and exact facet
filters apply before candidate limiting. Hybrid/semantic mode requires a working
embedding provider. The question remains in the response unchanged. Results retain
the original fact `id`, `source_ref`, version and a qualified `entity_ref` when
structured-import provenance exists. Ordinary `execution:"auto"` keeps its existing
retrieval semantics. Empty pure-facet reads remain available in `auto` mode.

```json
{"name":"ghostcrab_traverse","arguments":{
  "workspace_id":"synthesellm-mindbrain-poc-a",
  "start_ref":{"kind":"external_id","value":"assertion:asrt_884ffc127f6a"},
  "direction":"inbound","depth":1,"edge_labels":["SUPPORTS"]
}}
```

References accept `external_id`, `fact_id`, `entity_id` or `name`, with optional
`ontology_id` and `entity_type`. Only `entity_id` takes a JSON integer; an external
ID such as `"001"` remains a string. `start_ref` is exclusive with legacy `start`;
`target_ref` is exclusive with `target`. Legacy strings retain name semantics.
Typed traversal returns resolved numeric IDs, `entity_ref` on each row and
`path_entity_ids`; display labels are not identities. The start node is included
at depth zero. Absent, foreign or stale raw/derived mappings fail closed; a name
matching multiple types requires qualification (`ambiguous_reference`). Existing
raw/derived uniqueness constraints remain unchanged. Structured imports reject
same-type/name collisions with different external IDs instead of merging them.

```json
{"name":"ghostcrab_evidence_get","arguments":{
  "workspace_id":"synthesellm-mindbrain-poc-a",
  "assertion_ref":{"kind":"external_id","value":"assertion:asrt_884ffc127f6a"},
  "include_text":true,"limit":20
}}
```

The engine resolves the assertion and declared proof paths in one SQLite read
snapshot. It returns actual nodes and edges with their original directions.
`direct_support` has `evidence_ref:null`; `evidence_node` requires a real imported
Evidence entity. Neither representation certifies the assertion's legal truth.
An ontology without a matching profile returns `evidence_profile_unavailable`.
Missing links yield incomplete paths. Text states are `verified`, `not_stored`,
`invalid_span` or `hash_mismatch`; unverified text is never returned as a quote.

Pages contain at most 100 paths and 64 KiB of verified excerpts. `text_omitted`
indicates explicit suppression or the text budget. The bounded lookup rejects
more than 1,000 matching paths (`evidence_limit_exceeded`). `next_cursor` is opaque
and bound to the workspace, assertion and proof snapshot; changed data returns
`stale_cursor`. `complete` is false for missing/invalid proof or further pages.
Full source snapshots are removed from returned proof-node metadata.

## Explicit import contract

Administrative preparation uses the existing native `structured-import-apply`
CLI. Add `evidence_profiles` to its mapping JSON; registration is transactional
with the import and preserves other ontology metadata. Frozen ontologies reject
profile updates. Entity types below must match the actual qualified imported types.

```json
{
  "workspace_id":"b1","ontology_id":"b1:legal",
  "source_tag":"b1-source-v1","edges_mode":"provided",
  "evidence_profiles":[{
    "id":"direct-v1","representation":"direct_support",
    "assertion_type":"b1:assertion","passage_type":"b1:passage",
    "document_type":"b1:document",
    "steps":[
      {"predicate":"SUPPORTS","direction":"inbound"},
      {"predicate":"CONTAINS_PASSAGE","direction":"inbound"}
    ]
  }]
}
```

For verified text, import a canonical UTF-8 snapshot in the Document's metadata
(`source_text`, `text_version`, `encoding:"utf-8"`). The stable Passage metadata
contains `document_version`, zero-based half-open `start`/`end`,
`offset_unit:"utf8_bytes"` or `"unicode_codepoints"`, and lowercase `sha256` of the
exact excerpt's UTF-8 bytes. A source path, hash or ledger entry alone is not
stored text. Versions, boundaries and hash must agree; no filesystem/network
lookup is attempted during reads. Preserve the authoritative source separately
in the import kit to audit these declarations.

An optional enrichment imports a stable Evidence ID with explicit provenance
such as `derived:true`, `derivation:"legacy SUPPORTS"`, and `source_version`.
Keep the original direct links. A second profile may declare outbound
`HAS_EVIDENCE`, outbound `CITES_PASSAGE`, then inbound `CONTAINS_PASSAGE`.
Its `representation` is `evidence_node` and it also declares `evidence_type`.
These predicates are fixture declarations, not hard-coded ontology vocabulary.
Reimport with the same identities (or `ignore-duplicates`) does not add nodes or
claims; retain a distinct import source tag for scoped rollback.

## Index lifecycle and upgrade

Native fact writes and structured imports synchronize search artifacts inside
their write transaction. Failed indexing rolls back the write. Content updates
remove obsolete lexical terms. Native import reset and bundle overwrite remove
fact search artifacts. Typed references use existing raw IDs and provenance;
there is no schema migration or name-to-ID rewrite.

For older databases use the explicit scoped maintenance call:

```json
{"name":"ghostcrab_reindex_all","arguments":{"workspace_id":"b1","scope":"facts"}}
```

It returns before/after readiness, repaired, unchanged and skipped counts. It
reconciles only the target workspace; shared BM25 corpus statistics can change.
Status is a read. MCP startup performs scoped preparation after seed/session
selection. SQL-based `ghostcrab_upsert` reconciles through the engine in its write
phase and reports `native_index.ready`; reads never repair an engine-owned index.
Historical engines keep the scoped compatibility bootstrap.

## Qualification

```sh
node scripts/verify-native-knowledge.mjs --output /tmp/b1-receipt.json
```

The script creates a fresh SQLite using the real structured importer, runs the
real MCP stdio server, captures the internal transport and compares table digests
around each read. Native HTTP is only GhostCrab's internal engine transport.
Use `--root`, `--binary` and `--importer` to test an installed local archive.
The synthetic fixture reproduces the supplied question and assertion marker,
including a separate explicitly derived Evidence object. It is not the client's
missing B1 SQLite/source/manifest. The engine repository supplied as a location
contains no identified client proxy application; this contract documents its
required MCP allowlist without claiming that an unavailable proxy was modified.
