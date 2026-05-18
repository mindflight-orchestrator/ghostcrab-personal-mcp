# Document Import And LLM Qualification Inventory

Date: 2026-05-18

Scope:

- `../mindbrain`: current sibling checkout, focused on document import,
  normalization, LLM-assisted profiling, chunking, search indexing, embeddings,
  and qualification-related primitives.
- `ghostcrab-personal-mcp`: current package, focused on `bin/` commands and
  packaged `gcp` / `npx gcp` entrypoints that expose document import.

This document is intentionally descriptive. It does not compare the two systems
or propose a target architecture.

## Executive Summary

`../mindbrain` owns the document-processing engine. It provides the standalone
CLI verbs for normalization, document profiling, queue-backed import,
deterministic chunking, raw collection persistence, source facet derivation,
BM25/FTS5 indexing, optional embedding creation, hybrid contextual search, and
optional second-stage LLM reranking.

The current sibling checkout uses LLMs for three concrete jobs:

1. document profiling before import;
2. contextual retrieval text generation for persisted chunks;
3. optional reranking of already-retrieved search candidates.

It also uses embedding providers for chunk/search embeddings and live query
embeddings. Those embedding calls are separate from content qualification.

The raw-layer and ontology tables can store controlled facet assignments through
`facet_assignments_raw`, and the pipeline can replay those assignments into the
derived facet index. However, in the current sibling `../mindbrain` CLI there is
no implemented `document-qualify` or `qualification-vocab-list` subcommand.
Controlled LLM qualification against a taxonomy/ontology is therefore a
storage-ready but not fully engine-implemented workflow in this checkout.

`ghostcrab-personal-mcp` does not implement a second document engine in
JavaScript. It packages and launches the vendored MindBrain standalone tool as
`ghostcrab-document`, then exposes it through `gcp brain document` / `npx gcp
brain document`. The wrapper resolves the target SQLite file, refuses DB-backed
commands while the backend appears alive unless `--force` is passed, injects
`--db` for DB-backed subcommands, and forwards all remaining arguments to the
native document engine.

Current GhostCrab docs and wrapper tests mention `qualification-vocab-list` and
`document-qualify` as DB-backed document commands. The package-level wrapper can
forward them, but the current vendored MindBrain `tool.zig` command table does
not show those verbs in the inspected checkout. Treat GhostCrab's qualification
surface as documented/wrapper-prepared, with engine availability dependent on
the packaged native binary actually containing those verbs.

## MindBrain: Entry Points

The document-related CLI entrypoint is `mindbrain-standalone-tool`, implemented
in `../mindbrain/src/standalone/tool.zig`. The command dispatch includes:

- workspace and collection lifecycle: `workspace-create`, `collection-create`,
  `ontology-register`, `ontology-attach`, `collection-export`,
  `collection-import`;
- direct raw document import: `document-ingest`, `document-by-nanoid`;
- normalization and profile generation: `document-normalize`,
  `document-profile`;
- queue-backed processing: `document-profile-enqueue`,
  `document-profile-worker`;
- search and embedding operations: `contextual-search`,
  `search-embedding-batch`;
- offline regression/evaluation: `corpus-eval`;
- graph/search utility commands such as `external-link-add`, `graph-path`,
  `coverage`, `pack`, and queue utilities.

The inspected command table does not include `document-qualify` or
`qualification-vocab-list`.

## MindBrain: Normalization Process

Normalization is handled by `document_normalize.zig` and exposed as
`document-normalize`.

Supported source categories:

- PDF;
- HTML;
- plain text or unknown file types treated as text.

Supported extractor paths:

- PDF text layer via `pdftotext -layout`;
- OCR fallback via `ocrmypdf`;
- custom OCR path via `--deepseek-command`;
- HTML conversion via `pandoc`;
- minimal HTML fallback via `builtin_strip`;
- direct copy for text inputs.

Important behavior:

- `auto` PDF mode tries text extraction first and falls back to OCR if extracted
  text is too small.
- Language hints can be passed, and `--split-by-language` can emit separate
  normalized outputs for bilingual sources.
- Output files are accompanied by sidecar `*.metadata.json` files and a
  `manifest.json`.
- Normalization itself is not an LLM classification step unless the operator
  supplies a custom OCR command that calls an LLM/OCR model externally.

## MindBrain: Document Profile

`document-profile` is the first explicit LLM qualification-like step, but its
purpose is import planning rather than taxonomy assignment.

The prompt builder asks the model to classify a document sample and return strict
JSON with:

- `document_kind`;
- `language`;
- `jurisdiction`;
- `authority`;
- `structure_markers`;
- `reference_density`;
- `temporal_model`;
- `recommended_splitter`;
- `target_tokens`;
- `max_chars`;
- `risks`;
- `confidence`.

The profile parser validates confidence range, chunk budget, and required
structure-marker presence for known document kinds.

Sampling algorithm:

- if the text fits the sample budget, use it whole;
- otherwise build a sample from beginning, middle, and end sections.

Prompt guardrails:

- return only JSON;
- do not invent jurisdiction, authority, dates, references, or structure
  markers;
- use `unknown` and record risks when uncertain;
- the LLM only recommends the splitter; deterministic code performs the split.

## MindBrain: Chunking Algorithms

Generic chunking lives in `chunker.zig`. Implemented deterministic strategies:

- `fixed_token`: token windows with overlap;
- `sentence`;
- `paragraph`;
- `recursive_character`;
- `structure_aware`.

The `semantic` and `late` enum values exist in the public shape, but this file
rejects them as invalid in the current implementation and comments that
embedding-aware strategies belong to a future/out-of-band module.

Chunk records carry:

- stable chunk index;
- borrowed source slice;
- byte offsets;
- token count;
- optional parent chunk index;
- strategy label.

The token counter is deliberately simple: word-like byte spans, including stop
words, because chunking is budgeting LLM context rather than building BM25
vocabulary.

## MindBrain: Profile-To-Chunking Policy

`chunking_policy.zig` maps the LLM profile to deterministic chunker options.

Mappings:

- `technical_structure` -> `structure_aware`, larger technical chunk defaults,
  rationale around headings/tables/code/lists;
- `legal_article` -> legal-specialized path, fallback `structure_aware`,
  article/clause boundary rationale;
- `legal_consolidated` -> legal-specialized path, fallback `structure_aware`,
  temporal/version rationale;
- `legal_amendment` -> legal-specialized path, fallback `structure_aware`,
  amendment/repeal/replace rationale;
- `business_rule` -> `paragraph`, preserving condition/action/exception
  groupings;
- `fallback_recursive` -> `recursive_character`.

The policy is deterministic after the profile exists. It does not ask the LLM to
split content directly.

## MindBrain: Legal Splitter

`legal_chunker.zig` implements conservative legal/business splitters.

For legal text:

- it detects article-like headings such as `Article`, `Art.`, and `Section`;
- it emits one chunk per article span when the span fits the configured
  `max_chars`;
- it falls back to paragraph splitting inside oversized article spans;
- it falls back to `structure_aware` chunking when no article spans are found.

The file states the design rule clearly: the LLM may recommend a legal profile,
but legal chunk boundaries must be reproducible and evidence-friendly.

## MindBrain: Raw Ingestion And Source Facets

`import_pipeline.zig` is the high-level ingestion and reindexing entrypoint.

Direct document ingest:

- writes `search_documents`;
- syncs FTS5/BM25 search artifacts;
- optionally writes `search_embeddings`;
- syncs facet assignments into derived facet postings;
- if bound to workspace and collection, mirrors content into `documents_raw`
  and optional document vectors.

Chunked raw ingest:

- assigns or preserves a public `doc_nanoid`;
- writes `documents_raw`;
- chunks the source content;
- writes `chunks_raw`;
- derives `source.*` facet rows per chunk;
- writes those rows into `facet_assignments_raw`;
- optionally indexes parent documents and chunks into BM25/FTS5 with stable
  synthetic chunk document IDs.

The raw layer is designed as source of truth. Derived facet, BM25, vector, and
graph indexes can be rebuilt from raw tables.

## MindBrain: Ontologies And Facet Assignment Storage

The collection model includes:

- `workspaces`;
- `collections`;
- `ontologies`;
- `collection_ontologies`;
- `ontology_namespaces`;
- `ontology_dimensions`;
- `ontology_values`;
- `ontology_entity_types`;
- `ontology_edge_types`;
- `documents_raw`;
- `chunks_raw`;
- `documents_raw_vector`;
- `chunks_raw_vector`;
- `facet_assignments_raw`;
- graph raw tables and link tables.

`facet_assignments_raw` is the important storage target for controlled document
or chunk qualification. It can represent per-document and per-chunk facet picks,
including assignments derived deterministically from source metadata or supplied
by a future classifier.

`Pipeline.assignFacetRaw` writes raw assignments. `Pipeline.reindexFacets`
replays document-level assignments from `facet_assignments_raw` through the
derived `facet_postings` index by resolving `namespace.dimension` to registered
facet definitions.

## MindBrain: Queue-Backed Profiling And Persistence

`document-profile-enqueue` writes jobs to SQLite `queue_messages`, default queue
`document_profile`.

A job can include:

- content from a file or directory;
- source reference;
- sample size;
- language;
- optional persistence target: `workspace_id`, `collection_id`, and `doc_id` or
  `doc_id_start`.

`document-profile-worker`:

- leases queued jobs with a visibility timeout;
- profiles each document with a live LLM or `--mock-profile-json`;
- optionally persists raw documents and chunks when the job includes target
  workspace/collection/doc IDs;
- records profile and chunking decision in document metadata;
- archives successful jobs;
- can leave failures for retry or archive them with `--archive-failures`.

This gives MindBrain a batch-import path with retry semantics and auditable
profile output.

## MindBrain: Contextual Retrieval And Embeddings

With `document-profile-worker --contextual-retrieval`, MindBrain generates
LLM-written context for each persisted chunk. The design preserves raw evidence:

- `chunks_raw.content` remains the original chunk text;
- generated context and `contextualized_content` live in chunk metadata;
- with `--contextual-search-table-id` and `--embedding-model`, contextualized
  chunk text is indexed into BM25/search artifacts;
- matching embeddings are written to `search_embeddings` and
  `chunks_raw_vector`.

Embeddings are created during import/profile worker execution or by explicit
batch backfill:

- `document-profile-worker --contextual-retrieval ... --embedding-model ...`;
- `search-embedding-batch --missing-only`;
- library calls through the LLM manager and search embedding writers.

Search does not backfill missing document/chunk embeddings during reads.

## MindBrain: Search And Retrieval Algorithms

MindBrain separates structured facets from text search:

- facets answer which documents/chunks match structured dimensions;
- search answers which documents/chunks match a text query.

Search tables:

- `search_documents`;
- `search_fts_docs`;
- `search_fts` virtual FTS5 table;
- `search_embeddings`;
- compact BM25 statistics/frequency/posting tables.

`contextual-search` modes:

- no embedding flags: BM25 only;
- embedding flags but no indexed embeddings: BM25 only, reported as no indexed
  semantic rows;
- embedding flags and indexed rows: hybrid BM25 plus vector nearest-neighbor
  search.

Fusion algorithm:

```text
combined_score = bm25_score * (1.0 - vector_weight) + vector_score * vector_weight
```

Default `vector_weight` is `0.5`.

Optional LLM reranking:

- enabled explicitly with `--rerank`;
- runs after BM25/vector candidate retrieval;
- sends candidate IDs, scores, and clipped candidate text to the LLM;
- expects JSON scores keyed by `doc_id`;
- sorts by rerank score, then by fused score;
- ignores unknown IDs and fails when no valid scores are returned while rerank
  was explicitly requested.

## MindBrain: Current Qualification Boundary

What exists today:

- strict LLM document profile for import planning;
- deterministic source facet derivation;
- ontology vocabulary tables;
- raw facet assignment storage;
- pipeline method to write raw assignments;
- reindex path from raw assignments to derived facet postings;
- contextual chunk generation;
- embedding creation and hybrid search;
- optional LLM reranking.

What was not found in the sibling engine command table:

- a `qualification-vocab-list` command;
- a `document-qualify` command;
- a full LLM workflow that loads an ontology vocabulary, constrains model output
  to allowed values, validates/rejects out-of-vocabulary picks, and persists
  accepted business/taxonomy assignments.

This means MindBrain has the storage and indexing substrate for controlled
qualification, but the inspected sibling CLI does not currently expose the
complete controlled LLM qualification workflow.

## GhostCrab Personal MCP: `gcp brain document`

GhostCrab's package-level command is implemented in
`bin/commands/brain-document.mjs`.

Responsibilities:

- parse wrapper-level `--workspace`, `--db`, and `--force`;
- resolve `ghostcrab-document` through:
  - `GHOSTCRAB_DOCUMENT_ENGINE`;
  - optional native platform package;
  - bundled prebuild;
  - local vendored `mindbrain-standalone-tool`;
  - dev build output under `cmd/backend/zig-out/bin/ghostcrab-document`;
- ensure executable permissions on Unix;
- resolve the same SQLite path family as `gcp brain up`;
- classify subcommands as DB-backed or no-DB;
- for DB-backed commands, probe the backend health endpoint and refuse to run
  when the backend appears alive unless `--force` is passed;
- inject `--db <resolved sqlite path>` exactly once for DB-backed commands;
- forward the final argument vector to the native binary.

No-DB forwarded commands:

- `document-normalize`;
- `document-profile`;
- `corpus-eval`;
- `simulate`.

Everything else is treated as database-backed by default.

## GhostCrab Personal MCP: Native Engine Packaging

`cmd/backend/build.zig` builds two native executables from `vendor/mindbrain`:

- `ghostcrab-backend`, from the GhostCrab HTTP server module linked against the
  vendored MindBrain standalone library;
- `ghostcrab-document`, from `vendor/mindbrain/src/standalone/tool.zig`.

The document binary is therefore not a JavaScript reimplementation of import
logic. It is the MindBrain standalone tool built under a GhostCrab binary name,
with SQLite amalgamation and FTS5 enabled for reproducible packaging.

`bin/lib/prebuild-permissions.mjs` resolves that binary at runtime and falls
back to `vendor/mindbrain/zig-out/bin/mindbrain-standalone-tool` or
`cmd/backend/zig-out/bin/ghostcrab-document` for development checkouts.

## GhostCrab Personal MCP: Document Import UX

The operator-facing runbook `docs/setup/document-import.md` documents these
workflows:

- normalize only;
- deterministic import without LLM;
- profile and persist;
- contextual retrieval with embeddings;
- taxonomy/facet qualification;
- no-LLM fallbacks with mock profile or mock qualification JSON.

Important operational rule:

- DB-backed document commands should run while MCP / `ghostcrab-backend` is
  stopped;
- the wrapper probes backend health and refuses to run if the backend is alive
  unless `--force` is passed.

The documented data layers are:

- normalized `.txt` / `.md` outputs and metadata sidecars;
- `documents_raw`;
- `chunks_raw`;
- deterministic `source.*` facets;
- LLM qualification rows in `facet_assignments_raw`;
- optional contextual retrieval text and embeddings.

## GhostCrab Personal MCP: Qualification Surface

The GhostCrab docs and wrapper tests currently treat these commands as expected
document-engine commands:

- `qualification-vocab-list`;
- `document-qualify`.

The wrapper will treat them as DB-backed, inject the resolved `--db`, and forward
them to the native binary.

Documented behavior:

- `qualification-vocab-list` lists controlled vocabularies for a workspace and
  collection;
- `document-qualify` accepts taxonomy IDs and facet IDs such as
  `--taxonomies my_ws::core --facets topic.category`;
- live mode uses an OpenAI-compatible LLM;
- fallback mode accepts `--mock-qualification-json`;
- dry run checks prompt construction and target selection;
- accepted rows are written to `facet_assignments_raw`;
- accepted chunk assignments are aggregated to document-level assignments.

Implementation boundary observed in this checkout:

- the JavaScript wrapper does not implement the qualification algorithm itself;
- `cmd/backend/build.zig` builds `ghostcrab-document` directly from vendored
  `vendor/mindbrain/src/standalone/tool.zig`;
- the inspected vendored `tool.zig` command dispatch does not show
  `qualification-vocab-list` or `document-qualify`;
- an older/current plan document says this qualification flow was the intended
  or subsequent implementation, but the engine command table inspected here does
  not confirm it.

For later comparison work, treat this as a key verification point: run
`gcp brain document --help` and the native `ghostcrab-document --help` from the
actual package build being evaluated before claiming qualification is available
end to end.

## Source Map

MindBrain sibling files inspected:

- `../mindbrain/src/standalone/tool.zig`
- `../mindbrain/src/standalone/document_normalize.zig`
- `../mindbrain/src/standalone/corpus_profile.zig`
- `../mindbrain/src/standalone/corpus_profile_prompt.zig`
- `../mindbrain/src/standalone/chunker.zig`
- `../mindbrain/src/standalone/chunking_policy.zig`
- `../mindbrain/src/standalone/legal_chunker.zig`
- `../mindbrain/src/standalone/import_pipeline.zig`
- `../mindbrain/src/standalone/llm_client.zig`
- `../mindbrain/docs/document-profile.md`
- `../mindbrain/docs/collections.md`
- `../mindbrain/docs/faceted-hybrid-search.md`

GhostCrab Personal MCP files inspected:

- `bin/commands/brain-document.mjs`
- `bin/lib/prebuild-permissions.mjs`
- `cmd/backend/build.zig`
- `docs/setup/document-import.md`
- `docs/setup/gcp-client-setup.md`
- `docs/plan/2026-05-17-brain-document.md`
- `docs/plan/2026-05-17-brain-document-llm-facets.md`
- `tests/unit/brain-document-cli.test.ts`
- `vendor/mindbrain/src/standalone/tool.zig`
