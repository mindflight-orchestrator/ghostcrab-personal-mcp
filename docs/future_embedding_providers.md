# Future Embedding Providers

This note captures the next candidate providers after the current OpenRouter-first path.

## Current Baseline

Current real provider:

- OpenRouter
- model: `openai/text-embedding-3-small`
- dimensions: `1536`

This baseline was chosen because it fits the existing `mfo_facets.embedding vector(1536)` schema without requiring a migration.

## Evaluation Criteria

Any future provider should be compared on:

- vector dimensions
- compatibility with `mfo_facets.embedding`
- multilingual retrieval quality
- latency and rate limits
- cost predictability
- availability of stable embeddings endpoints
- fit for hybrid retrieval in `ghostcrab_search` and `ghostcrab_pack`

## Candidate Providers

- OpenAI direct
  - simplest conceptual match with the current `text-embedding-3-small` baseline
  - useful if we want to remove the OpenRouter hop
- Google embeddings
  - strong general candidate, especially if we later need broader context handling
- Qwen embedding models
  - worth evaluating for multilingual and cost/performance tradeoffs
- BGE / E5 style models
  - attractive if GhostCrab shifts toward stronger multilingual retrieval or self-hostable evaluation paths
- Ollama-hosted local embeddings
  - useful for offline or local-first experimentation, but should stay outside the standard CI rail

## Migration Notes

Before switching providers, validate:

1. whether dimensions still match the existing column
2. whether the hybrid ranking defaults still make sense
3. whether the real smoke stays stable on the new provider
4. whether backfill should be rerun for existing rows

If a future model requires dimensions different from `1536`, that change should be treated as a dedicated schema migration step rather than an incidental runtime tweak.
