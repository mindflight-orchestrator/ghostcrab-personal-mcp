# Document ingest

**Phase 4 — enqueue, profile, and qualify source documents.**

## Tools

MCP: `ghostcrab_workspace_create` (if needed)  
CLI: `gcp brain document …` (profile + qualify pipeline)

## Agent prompt

```
Pour chaque entrée de examples/immeuble/sources/documents/ :

1. collection-create --workspace-id immeuble --collection-id immeuble::docs
2. ontology-attach --ontology-id immeuble::core --role taxonomy
3. document-profile-enqueue --content-file examples/immeuble/sources/documents/<filename> \
     --doc-id <doc_id> --language fr
4. document-profile-worker --limit <n>
5. qualification-vocab-list
6. document-qualify --taxonomies immeuble::core \
     --facets source.document_type,domain.building,domain.unit,domain.role,domain.scenario,finance.payment_status

Commence par 1 document si itération prompts (--limit-docs 1).
Vérifie les qualifications par doc_id avant de continuer.
```

## Mock CI reference

```bash
node examples/immeuble/scripts/run-immeuble-import.mjs --apply --skip-provenance-validation --skip-preflight
```

## Deliverable

8 documents profiled and qualified in `immeuble::docs`.

## Next

→ [`05-graph-extraction.md`](05-graph-extraction.md)
