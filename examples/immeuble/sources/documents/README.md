# MCP lab corpus

Raw-ish source documents for reconstructing the syndic demo via the MCP agent workflow.

Separate from the bundled golden corpus (`../bundle/immeuble.bundle.json`).

**Agent entry:** [`../README.md`](../README.md) → [`../prompts/00-prerequisites.md`](../prompts/00-prerequisites.md)

## Import target

```bash
export GHOSTCRAB_SQLITE_PATH="$PWD/data/immeuble.sqlite"
```

## Scripted flow (mock CI)

```bash
node scripts/import-immeuble.mjs --mode mock --reset
node scripts/import-immeuble.mjs --reset --limit-docs 1 --debug-prompts
```

## Manual equivalent

```bash
node bin/gcp.mjs brain ontology compile \
  --workspace-id immeuble \
  --ontology-id immeuble::core \
  --input ontologies/immeuble/core.yaml \
  --import-db \
  --db "$GHOSTCRAB_SQLITE_PATH"

while read -r doc_id filename; do
  node bin/gcp.mjs brain document --force document-profile-enqueue \
    --content-file "examples/immeuble/sources/documents/$filename" \
    --workspace-id immeuble \
    --collection-id immeuble::docs \
    --doc-id "$doc_id" \
    --language fr
done < <(node -e 'const m=require("./examples/immeuble/sources/documents/manifest.json"); for (const f of m.files) console.log(f.doc_id, f.filename)')
```

Coverage expectations: `expected-coverage.json` and [`../success-criteria.yaml`](../success-criteria.yaml).
