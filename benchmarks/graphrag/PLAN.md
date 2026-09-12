# Personal GraphRAG comparison adaptation

Source: `pg_mindbrain`, branch `research/graphrag-mindbrain-comparison`,
commit `11ca28e`. Target: GhostCrab Personal 0.6.9 / MindBrain 1.9.0.

1. Preserve the business, legal and temporal fixtures and their provenance.
   Reuse frozen embeddings and contexts with verified hashes; no provider calls.
2. Replace PostgreSQL with test-owned native Personal HTTP processes and fresh
   SQLite files. Separate each authorized document snapshot physically so global
   FTS corpus statistics cannot include forbidden or future documents.
3. Measure lexical, vector and RRF retrieval, document expansion, directed and
   bidirectional entity paths, reserved-slot and RRF context selection. Compare
   native scores/paths with independent references using the actual tokenizer
   and float32 storage precision, rather than requiring PostgreSQL scores.
4. Replay legal chunk/context variants and frozen multilingual embedding arms
   with the same 6000-byte source context budget. Keep enriched views secondary.
   Keep curated ELI temporal resolution a separate reference experiment.
5. Add regression tests and execute native business/legal development runs.
   Persist runtime identity, input hashes, traces, metrics and cleanup receipts.

Gold is used only after retrieval; the held-out business split stays unexecuted.
The benchmark does not claim answer-generation accuracy, product authorization,
OWL reasoning, or superiority over external GraphRAG systems. The source branch
has not executed those external adapters either. No release, tag or npm action.
