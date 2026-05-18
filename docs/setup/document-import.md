# Document Import Runbook

This runbook covers the GhostCrab document import path exposed through
`gcp brain document`. It is the operator-facing guide for getting documents into
MindBrain SQLite, with and without an LLM provider.

For the lower-level engine reference and all flags, see
`vendor/mindbrain/docs/document-profile.md`.

## What This Imports

The document flow can write several layers:

- normalized `.txt` / `.md` files and sidecar metadata;
- raw documents in `documents_raw`;
- raw chunks in `chunks_raw`;
- source-derived facets and LLM qualification rows in `facet_assignments_raw`;
- optional contextual retrieval text and embeddings for search.

`gcp brain document` launches the bundled `ghostcrab-document` engine. For
database-backed commands, the wrapper injects `--db` automatically from
`GHOSTCRAB_SQLITE_PATH`, `--workspace`, or an explicit wrapper-level
`--db <path>`.

## Prerequisites

Install GhostCrab and authorize native binaries:

```bash
npm install
npm run build
node bin/gcp.mjs authorize
```

For a packaged install, use `gcp authorize`.

Set the database path when you do not want the default `./data/ghostcrab.sqlite`:

```bash
export GHOSTCRAB_SQLITE_PATH="$PWD/data/ghostcrab.sqlite"
```

If you built the document engine locally, point the wrapper at it:

```bash
export GHOSTCRAB_DOCUMENT_ENGINE="$PWD/cmd/backend/zig-out/bin/ghostcrab-document"
```

Database-backed import commands should run while MCP / `ghostcrab-backend` is
stopped. The wrapper probes backend health and refuses to run when the backend
is alive unless you pass `--force`.

Optional extraction tools:

- `pdftotext` for PDF text layers;
- `ocrmypdf` plus Tesseract language packs for OCR;
- `pandoc` for HTML to Markdown;
- `--html-backend builtin-strip` when Pandoc is not installed;
- `--deepseek-command <template>` for a custom OCR wrapper.

## Choose A Mode

Use the no-LLM path when you only need deterministic document/chunk storage or
when no API key is configured. This can normalize files and ingest raw content,
but it cannot infer a document profile or controlled taxonomy assignment unless
you supply mock JSON.

Use the live LLM path when you want corpus-aware profiling, legal/document
splitter choices, contextual retrieval, or taxonomy/facet qualification.

Common provider flags:

```bash
export OPENAI_API_KEY="..."
--base-url https://api.openai.com/v1 --api-key "$OPENAI_API_KEY" --model gpt-4.1-mini
```

## Workflow 1: Normalize Only

Normalize a PDF, HTML, or text source into files that can be inspected before
import:

```bash
gcp brain document document-normalize \
  --input ./source.pdf \
  --output-dir ./out \
  --languages fr,nl \
  --split-by-language
```

Useful fallbacks:

```bash
gcp brain document document-normalize \
  --input ./page.html \
  --output-dir ./out \
  --html-backend builtin-strip
```

```bash
gcp brain document document-normalize \
  --input ./scan.pdf \
  --output-dir ./out \
  --pdf-backend none
```

Normalization does not require an LLM unless you explicitly use a custom OCR
command that calls one.

## Workflow 2: Deterministic Import Without LLM

Create or reuse a workspace and collection, then ingest a text file directly:

```bash
gcp brain document --force document-ingest \
  --workspace-id my_ws \
  --collection-id my_ws::docs \
  --doc-id 1 \
  --source-ref ./out/source.md \
  --language english \
  --strategy paragraph \
  --content-file ./out/source.md
```

This writes `documents_raw`, `chunks_raw`, and deterministic `source.*` facets.
It does not create a semantic profile or taxonomy qualification.

Inspect the inserted document:

```bash
gcp brain document --force document-by-nanoid --nanoid <doc_nanoid>
```

Export the collection for review:

```bash
gcp brain document --force collection-export \
  --workspace-id my_ws \
  --collection-id my_ws::docs \
  --output ./my_ws_docs.export.json
```

## Workflow 3: Profile And Persist

One-shot live profile:

```bash
gcp brain document document-profile \
  --content-file ./out/source.md \
  --base-url https://api.openai.com/v1 \
  --api-key "$OPENAI_API_KEY" \
  --model gpt-4.1-mini
```

No-LLM profile inspection:

```bash
gcp brain document document-profile \
  --content-file ./out/source.md \
  --dry-run
```

No-LLM mock profile:

```bash
gcp brain document document-profile \
  --content-file ./out/source.md \
  --mock-profile-json ./fixtures/profile.json
```

Queue a directory for profiling and persistence:

```bash
gcp brain document --force document-profile-enqueue \
  --content-dir ./out \
  --include-ext md,txt \
  --workspace-id my_ws \
  --collection-id my_ws::docs \
  --doc-id-start 1
```

Process queued jobs with a live LLM:

```bash
gcp brain document --force document-profile-worker \
  --base-url https://api.openai.com/v1 \
  --api-key "$OPENAI_API_KEY" \
  --model gpt-4.1-mini \
  --limit 4
```

Process queued jobs without an LLM by supplying a validated mock profile:

```bash
gcp brain document --force document-profile-worker \
  --mock-profile-json ./fixtures/profile.json \
  --limit 4
```

Optional contextual retrieval needs both an LLM and embeddings:

```bash
gcp brain document --force document-profile-worker \
  --base-url https://api.openai.com/v1 \
  --api-key "$OPENAI_API_KEY" \
  --model gpt-4.1-mini \
  --contextual-retrieval \
  --contextual-search-table-id 1 \
  --embedding-model text-embedding-3-small
```

## Workflow 4: Qualify Taxonomies And Facets

After documents and chunks exist, list the controlled vocabulary:

```bash
gcp brain document --force qualification-vocab-list \
  --workspace-id my_ws \
  --collection-id my_ws::docs
```

Use the returned taxonomy IDs and facet IDs with `document-qualify`:

```bash
gcp brain document --force document-qualify \
  --workspace-id my_ws \
  --collection-id my_ws::docs \
  --taxonomies my_ws::core \
  --facets topic.category \
  --base-url https://api.openai.com/v1 \
  --api-key "$OPENAI_API_KEY" \
  --model gpt-4.1-mini
```

No-LLM qualification fallback:

```bash
gcp brain document --force document-qualify \
  --workspace-id my_ws \
  --collection-id my_ws::docs \
  --taxonomies my_ws::core \
  --facets topic.category \
  --mock-qualification-json ./fixtures/qualification.json
```

Dry-run qualification checks prompt construction and target selection without
calling an LLM or writing assignments:

```bash
gcp brain document --force document-qualify \
  --workspace-id my_ws \
  --collection-id my_ws::docs \
  --taxonomies my_ws::core \
  --facets topic.category \
  --dry-run
```

Accepted qualification rows are written to `facet_assignments_raw`. Chunk
assignments are persisted directly and aggregated to document-level assignments.

## Fallbacks And Troubleshooting

| Situation | Fallback |
|-----------|----------|
| No LLM key | Use `document-ingest`, `document-profile --dry-run`, `--mock-profile-json`, or `--mock-qualification-json`. |
| No Pandoc | Use `--html-backend builtin-strip`. |
| No OCR tooling | Use text-layer PDFs with `pdftotext`, pass already extracted text, or use `--pdf-backend none`. |
| Backend is running | Stop MCP / `ghostcrab-backend`, or pass `--force` only when you accept SQLite lock risk. |
| Wrong database | Set `GHOSTCRAB_SQLITE_PATH` or pass wrapper-level `--db <path>` before the subcommand. |
| Need to inspect what happened | Run `collection-export`, `document-by-nanoid`, or `qualification-vocab-list`. |

If a DB-backed command refuses to run, inspect holders:

```bash
gcp brain db-who --path "$GHOSTCRAB_SQLITE_PATH"
```

If the document engine is missing, build it:

```bash
ZIG=zig-0.16 npm run backend:build:debug
```

Then set:

```bash
export GHOSTCRAB_DOCUMENT_ENGINE="$PWD/cmd/backend/zig-out/bin/ghostcrab-document"
```
