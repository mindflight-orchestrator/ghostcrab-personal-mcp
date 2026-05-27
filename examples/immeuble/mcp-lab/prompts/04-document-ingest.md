# Document ingest

**Phase 4 — enqueue, profile, and qualify source documents.**

## Tools

MCP: `ghostcrab_workspace_create` (if needed)  
CLI: `gcp brain document …` (profile + qualify pipeline)

## Agent prompt

```
Pour chaque entrée de examples/immeuble/mcp-lab/corpus/manifest.json :

1. collection-create --workspace-id immeuble-demo-llm --collection-id immeuble-demo-llm::docs
2. ontology-attach --ontology-id immeuble-demo::core --role taxonomy
3. document-profile-enqueue --content-file examples/immeuble/mcp-lab/corpus/<filename> \
     --doc-id <doc_id> --language fr
4. document-profile-worker --limit <n>
5. qualification-vocab-list
6. document-qualify --taxonomies immeuble-demo::core \
     --facets source.document_type,domain.building,domain.unit,domain.role,domain.scenario,finance.payment_status

Commence par 1 document si itération prompts (--limit-docs 1).
Vérifie les qualifications par doc_id avant de continuer.
```

## Mock CI reference

```bash
node scripts/import-immeuble-demo-llm.mjs --mode mock --reset --limit-docs 8
```

## Deliverable

8 documents profiled and qualified in `immeuble-demo-llm::docs`.

## Next

→ [`05-graph-extraction.md`](05-graph-extraction.md)
