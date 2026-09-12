# GraphRAG comparison on GhostCrab Personal

This adapts the development experiments from `pg_mindbrain` branch
`research/graphrag-mindbrain-comparison`, commit
`11ca28e2130e7d8ed1172806bde0969a2991b9b2`, to the Personal native HTTP engine.
The target checkout is GhostCrab Personal 0.6.9 with MindBrain 1.9.0.
[SOURCE.json](SOURCE.json) records the original files and hashes;
[PLAN.md](PLAN.md) defines the adaptation scope.

The runner measures retrieval and source-evidence coverage. It uses native
`/api/mindbrain/ghostcrab/search` and `/api/mindbrain/traverse`, and writes fixture
data directly into canonical SQLite tables. It does not measure MCP transport,
the document ingestion pipeline, answer generation, or product authorization.
The branch in PostgreSQL has not run external Microsoft GraphRAG or KAG adapters;
this port makes no comparison claim against those products either.

## Run locally

Use Python 3.10+ with SQLite FTS5 support and the locally built native backend.
No Python packages, Docker, database server, model server or API key are needed.
Build the backend with the repository's normal prerequisites if it is absent:

```sh
npm run backend:build
```

Import the **already generated** embeddings and contexts from the pinned source
checkout. This performs file reads and Git object verification only. The source
checkout must still be at the commit above. Modified archives are rejected.

```sh
python3 benchmarks/graphrag/import_inputs.py --source ../pg_mindbrain
```

The imported files are local, ignored artifacts, approximately 29 MB compressed.
`INPUTS.lock.json` pins their manifest and contents. Import refuses to overwrite
an existing directory. An existing valid import can be reused by every run;
use `--out /tmp/personal-graphrag-inputs` for another import and pass that path
with `--inputs` to the runner. There is no provider-call fallback.

```sh
npm run test:graphrag
PERSONAL_GRAPHRAG_NATIVE=1 npm run test:graphrag
npm run benchmark:graphrag -- all --out benchmarks/graphrag/runs/my-first-run
```

Every output directory must be new. Choose `business`, `legal`, `embeddings` or
`temporal` instead of `all` for a bounded replay. `temporal` needs no embeddings
or backend. `--binary /absolute/path/to/ghostcrab-backend` selects another native
candidate; its hash and runtime capabilities are recorded. Native tests also
accept `MINDBRAIN_TEST_BINARY`.

The runner starts only its own processes on random loopback ports, with a clean
environment and a fresh temporary SQLite for every snapshot or embedding arm.
It closes those processes and removes those SQLite files on success or failure.
It accepts no existing database or external endpoint. Preparation and measured
reads have separate logical SQLite digests; changed state during reads fails
the run. Runtime receipts remain available even when a later stage fails.

## Experiments and Personal differences

| Suite                  | Frozen inputs                                                                      | Measured variants                                                                                                          |
| ---------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Business               | 24 development questions; 21 with annotated evidence; synthetic maintenance corpus | Lexical, vector, hybrid RRF, full visible context, same-document expansion, directed graph, bidirectional graph, mixed RRF |
| Belgian legal v2       | Four archived works, 26 development questions; 24 with evidence; 410 source units  | Technical or legal chunks, archived contextual prefixes, descriptors, and citation proof bundles                           |
| Embeddings             | Same legal descriptor passages and queries                                         | Nomic, Qwen3 0.6B, BGE-M3, EmbeddingGemma, five archived OpenAI model/dimension arms                                       |
| ELI temporal reference | Sixteen synthetic cases and 31 dated queries                                       | Pure curated resolver: text, status, reason and evidence against separate gold                                             |

Business selection uses the fixture's workspace, visibility and publication
cutoff **before indexing**. Each context is physically isolated because SQLite
FTS5 corpus statistics cover the whole FTS table. This tests a fixture policy;
it does not prove that the deployed product enforces those access rules. Business
time reasoning is not added by the filter. The held-out business questions are
preserved and structurally validated, but are never executed or used for tuning.

Personal uses FTS5's default `unicode61` tokenizer, native OR-query preparation
and English stop words. PostgreSQL's French text-search scores are not expected
to match. An independent SQL query checks lexical candidates and scores; Python
cosine checks float32 stored vectors. The reference tolerances are `1e-10` for
BM25 and `2e-6` for cosine. Differences in ordering from sub-tolerance floating
point ties are recorded. After checking raw component scores, Python constructs
RRF ranks using those native raw scores and verifies the fused result to `1e-12`.
The SQL lexical reference shares the SQLite FTS5 algorithm; it is not a second
independent BM25 implementation.

The retrieval candidate pool includes all visible passages, up to the native
limit of 1000. The fixture fails rather than silently truncating a larger corpus.
All current snapshots fit. Final business contexts have eight passages (except
the explicit full-context upper bound). Hybrid uses vector weight 0.5 and RRF
constant 60. Pure lexical calls omit vectors; pure vector calls omit question
text. Raw scores, native responses, question IDs and timings are retained.

Personal accepts `direction=outbound` and `direction=inbound`, not `both`.
The directed arm uses a native multihop call. The bidirectional arm is an adapter
BFS over real one-hop calls in both directions. Every HTTP response is saved;
reachable nodes, distances and path steps are checked against the fixture graph.
Business path provenance is reconstructed from stored source edges, with
ambiguous predicates rejected. The corpus-specific parser recognizes a small
set of maintenance statements; it is not a general entity extractor or ontology
reasoner. Reserved selection protects four hybrid seeds. Native traversal returns
discovered-node paths; it does not enumerate every edge or every possible path.

Legal selection has a 6000-byte UTF-8 budget, including passage IDs and separators.
The primary view includes original source text only. An enriched hybrid view is
reported separately and pays for its contextual prefixes within the same budget.
Citation bundles preserve source, quotation and target spans; a bundle must be
reachable through native graph reads and fit completely before insertion. A
citation does not establish the target's historical applicability. Overlapping
chunks cannot double-count source coverage. Unsupported questions receive no
positive coverage score; no answer-generation or abstention score is inferred.

Frozen embeddings retain the original model-specific query/document prefixes,
dimensions and request hashes. Context prefixes are reused, not regenerated by
Personal's production ingestion pipeline. The lexical selection must stay
identical across embedding arms. `legal` replays four context/chunk views;
`embeddings` replays nine models/dimensions on one fixed descriptor view.

The ELI experiment executes only the imported pure reference resolver. RDF/SHACL,
native ELI storage and production temporal reasoning are not exercised. The
legal-v1 fixture and original fixture READMEs are preserved as source provenance;
their PostgreSQL commands and old result statements do not describe this port.
Use the commands in this README for Personal.

## Evidence and interpretation

Each run contains `receipt.json`, individual runtime receipts, compressed native
retrieval/graph traces and separate metrics. The receipt records checkout base,
working script hashes, fixture and input hashes, binary hash, runtime version,
parameters, start/finish times, artifact hashes and status. Retrieval is saved
before gold judgments are loaded for scoring. Report `status: passed` only as
protocol/reference validation, together with the actual coverage scores.

These are development fixtures with author-written gold, not independently
reviewed test sets. Coverage does not prove a correct generated answer. Graph
expansion can displace useful passages and reduce coverage. PostgreSQL archived
results remain separate reference experiments; neither identical scores nor
cross-engine speed claims are required. Timings include Python/HTTP overhead and
are diagnostics, not a controlled performance benchmark.

See [RESULTS.md](RESULTS.md) for the identified Personal replay and its limits.
This directory is excluded from the npm package's file allowlist. No tagging,
publication or release step is part of this workflow.
