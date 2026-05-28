# MCP lab — immeuble syndic reconstruction

Agent entry point for rebuilding the syndic domain from **raw documents** into workspace `immeuble-demo-llm`, then comparing against the golden reference.

**Variant:** workspace `immo-mcp` vs golden `immeuble-demo` in the **same SQLite as Cursor MCP** — see [`prompts/00-prerequisites-immo-mcp.md`](prompts/00-prerequisites-immo-mcp.md), [`prompts/06-validate-and-compare-immo-mcp.md`](prompts/06-validate-and-compare-immo-mcp.md), [`workspace-immo-mcp.json`](workspace-immo-mcp.json).

## Start here

1. Read [`workspace.json`](workspace.json) and [`success-criteria.yaml`](success-criteria.yaml)
2. Execute prompts **in order**:

| Step | File | Writes? |
|------|------|---------|
| 0 | [`prompts/00-prerequisites.md`](prompts/00-prerequisites.md) | No |
| 1 | [`prompts/01-discovery-and-model-proposal.md`](prompts/01-discovery-and-model-proposal.md) | No |
| 2 | [`prompts/02-ontology-register.md`](prompts/02-ontology-register.md) | Yes |
| 3 | [`prompts/03-gap-rules-design.md`](prompts/03-gap-rules-design.md) | Yes |
| 4 | [`prompts/04-document-ingest.md`](prompts/04-document-ingest.md) | Yes |
| 5 | [`prompts/05-graph-extraction.md`](prompts/05-graph-extraction.md) | Yes |
| 6 | [`prompts/06-validate-and-compare.md`](prompts/06-validate-and-compare.md) | No |

**Rule:** prompts 02–05 require human confirmation of the Model Proposal (GhostCrab ONBOARDING_CONTRACT §9).

## Corpus vs reference documents

| | `corpus/` (this lab) | `../reference/documents/` |
|--|----------------------|----------------------------|
| Count | 8 raw-ish markdown files | 7 qualified docs in bundle |
| Role | Agent ingestion input | Golden embedded in bundle |
| Style | Verbose, realistic sources | Structured, facet-ready |

## Mock / CI pipeline

```bash
node scripts/import-immeuble-demo-llm.mjs --mode mock --reset
node scripts/import-immeuble-demo-llm.mjs --mode dry-run --reset --debug-prompts
```

Reports: `reports/immeuble-demo-llm/<timestamp>/report.md`

## Reference checklists (read-only)

- [`reference/ontology-checklist.md`](reference/ontology-checklist.md)
- [`reference/gap-rules-checklist.md`](reference/gap-rules-checklist.md)

Golden bundle: [`../reference/bundle.json`](../reference/bundle.json)
