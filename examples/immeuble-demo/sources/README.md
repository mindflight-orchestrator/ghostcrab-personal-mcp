# Immeuble Demo LLM Sources

This directory is the raw-ish source corpus for reconstructing the syndic demo
through the document import and LLM qualification path. It is intentionally
separate from ../documents, which is the already-qualified golden corpus
embedded in ../bundle.json.

## Import target

```bash
export GHOSTCRAB_SQLITE_PATH="$PWD/data/immeuble-demo-llm.sqlite"
export MB_DOCUMENTS_LLM_MODE=live
export MB_DOCUMENTS_LLM_BASE_URL="${MB_DOCUMENTS_LLM_BASE_URL:-https://api.openai.com/v1}"
export MB_DOCUMENTS_LLM_MODEL="${MB_DOCUMENTS_LLM_MODEL:-gpt-4.1-mini}"
# MB_DOCUMENTS_LLM_API_KEY must be set in .env or the shell; do not commit it.
```

## Suggested flow

The preferred operator flow is the repository script, which builds the golden
workspace and the source-import workspace in the same SQLite database, records
LLM prompts/responses, and writes a comparison report:

```bash
node scripts/import-immeuble-demo-llm.mjs --reset
```

Use a bounded live smoke first when iterating on prompts:

```bash
node scripts/import-immeuble-demo-llm.mjs --reset --limit-docs 1 --debug-prompts
```

Use mock or dry-run mode when validating the pipeline without network/API calls:

```bash
node scripts/import-immeuble-demo-llm.mjs --mode mock --reset
node scripts/import-immeuble-demo-llm.mjs --mode dry-run --reset --debug-prompts
```

Manual equivalent:

```bash
node bin/gcp.mjs brain ontology compile \
  --workspace-id immeuble-demo-llm \
  --ontology-id immeuble-demo::core \
  --input ontologies/immeuble-demo/core.yaml \
  --import-db \
  --db "$GHOSTCRAB_SQLITE_PATH"

while read -r doc_id filename; do
  node bin/gcp.mjs brain document --force document-profile-enqueue \
    --content-file "examples/immeuble-demo/sources/$filename" \
    --workspace-id immeuble-demo-llm \
    --collection-id immeuble-demo-llm::docs \
    --doc-id "$doc_id" \
    --language fr
done < <(node -e 'const m=require("./examples/immeuble-demo/sources/manifest.json"); for (const f of m.files) console.log(f.doc_id, f.filename)')

node bin/gcp.mjs brain document --force document-profile-worker --limit 20

node bin/gcp.mjs brain document --force qualification-vocab-list \
  --workspace-id immeuble-demo-llm \
  --collection-id immeuble-demo-llm::docs

node bin/gcp.mjs brain document --force document-qualify \
  --workspace-id immeuble-demo-llm \
  --collection-id immeuble-demo-llm::docs \
  --taxonomies immeuble-demo::core \
  --facets source.document_type,domain.building,domain.unit,domain.role,domain.scenario,finance.payment_status
```

The expected business coverage is recorded in expected-coverage.json. The check
is controlled parity with the golden demo, not equality of internal IDs.
