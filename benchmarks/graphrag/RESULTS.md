# Personal development replay — 2026-09-12

The adapted benchmark completed on GhostCrab Personal 0.6.9 / MindBrain 1.9.0.
All numbers below measure source-evidence coverage, not generated-answer accuracy.

- [Runtime and artifact receipt](results/2026-09-12/receipt.json)
- [Verification](results/2026-09-12/verification.json)
- Full native responses and graph traces: `runs/20260912-personal-final/` (local, ignored; about 17 MB).
- Gold metrics and the ELI reference answers are retained next to the receipt.

## Identity and checks

- Source research: `pg_mindbrain@11ca28e2130e7d8ed1172806bde0969a2991b9b2`.
- Personal checkout base: `75559a4689305f8218f62cda22576440198e4adb`; the receipt pins every working Python script by SHA-256.
- Vendored engine: `49b89969e74943e0e6cfb3d4b357b73169396283`.
- Executed backend SHA-256: `06bea894cc2284d754eeb63da217345fbccfbba458c0d1caa607f52689a1f85e`.
- Run: `2026-09-12T14:57:59.587078+00:00` to `2026-09-12T14:58:35.142096+00:00`.
- 35 protocol, temporal and real native regression tests passed.
- 362 retrieval queries / 1086 native searches; 1694 HTTP reads including graph traversal.
- 19 owned runtimes cleaned; every measured-read SQLite digest equals its post-preparation digest.
- A fresh independent import reproduced the pinned input manifest.
- Maximum BM25 reference error: `7.11e-15`; cosine: `3.77e-15`.
- 11 lexical queries had ordering differences from floating point near-ties; 0 vector queries did. Component tolerances and independent RRF checks passed.

## Business

24 development questions; 21 have annotated evidence. Counts denote questions
whose required claims all have a complete evidence set in the selected context.

| Selection             | Complete / 21 | Mean claim coverage |
| --------------------- | ------------: | ------------------: |
| lexical               |            13 |               67.5% |
| vector                |            15 |               73.8% |
| hybrid                |            15 |               76.2% |
| full_context          |            21 |              100.0% |
| document_graph        |            17 |               83.3% |
| entity_graph_outbound |            19 |               92.9% |
| entity_graph_both     |            16 |               81.0% |
| mixed_rrf             |            17 |               85.7% |

Directed graph expansion improves coverage on this fixture. Bidirectional
expansion displaces useful evidence on some questions and scores lower. The
full-context row is an unbounded upper bound; the other rows select eight passages.

## Legal chunk and context views

26 development queries; 24 have required source spans. Counts denote complete
span coverage within the same 6000-byte source context budget.

| View / Nomic embeddings | Lexical | Vector | Hybrid | Hybrid + graph |
| ----------------------- | ------: | -----: | -----: | -------------: |
| legal_context           |      19 |     11 |     18 |             18 |
| legal_descriptors       |      21 |      7 |     17 |             17 |
| technical_context       |      16 |      7 |     11 |             11 |
| technical_raw           |      15 |     11 |     16 |             16 |

## Frozen embedding ablation

All arms use the same legal descriptor passages. Lexical selection is identical
across all nine arms (21/24 complete). Counts below use original source text.

| Embeddings                  | Vector / 24 | Hybrid / 24 | Hybrid + graph / 24 |
| --------------------------- | ----------: | ----------: | ------------------: |
| nomic-local-768             |           7 |          17 |                  17 |
| bge-m3:latest               |          18 |          18 |                  19 |
| embeddinggemma:latest       |          22 |          19 |                  20 |
| qwen3-embedding:0.6b        |          20 |          20 |                  21 |
| text-embedding-3-large-1536 |          18 |          20 |                  20 |
| text-embedding-3-large-3072 |          18 |          19 |                  19 |
| text-embedding-3-large-768  |          17 |          19 |                  19 |
| text-embedding-3-small-1536 |          19 |          18 |                  19 |
| text-embedding-3-small-768  |          19 |          18 |                  20 |

EmbeddingGemma vector retrieval covers 22/24 here; adding hybrid fusion does
not improve every model. These development results do not establish a generally
best model. Context-enriched secondary scores are retained in the receipt; they
are not mixed with the primary source-only figures above.

## Temporal reference and limits

All 31 curated ELI reference queries passed, including indeterminate outcomes.
This is a pure resolver replay, not native temporal or RDF/SHACL validation.

No held-out business evaluation, generation, deployed MCP/ingestion parity,
product ACL proof or external GraphRAG comparison was performed. The source
fixtures and author-written gold remain development material. PostgreSQL scores
were not required to match SQLite scores. No tag or npm publication was made.

Earlier local attempts are retained under `runs/` with failed receipts. They
exposed a judgment-ID mapping issue and sub-ULP SQLite score-order differences;
they are not used as successful evidence. The final run above uses the corrected
harness without changing gold, embeddings, retrieval budgets or model parameters.
