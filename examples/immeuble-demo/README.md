# Immeuble demo bundle

Reference workspace for validating import → reindex → query coherence.

## Load and reindex

```bash
# Rebuild native loader if vendor/mindbrain changed (requires Zig 0.16):
# cd vendor/mindbrain && /opt/zig/zig-x86_64-linux-0.16.0/zig build standalone-tool

gcp load examples/immeuble-demo/bundle.json --workspace immeuble-demo
# graph reindex runs by default; use --reindex none to skip derived indexes
# use --reindex all when BM25 + facet_postings are also needed
```

Operational fixes: [`docs/plan/2026-05-23-fix-reserves-operationnelles.md`](../../docs/plan/2026-05-23-fix-reserves-operationnelles.md)

## Bundle schema notes

The native `backup-load` parser (Zig `std.json`) requires optional struct fields to appear explicitly in JSON:

- `scope.collection_id`: `null`
- `workspaces[].domain_profile`: `null` when absent
- `relations_raw[]`: `valid_from` and `valid_to` as `null`
- `ontology_edge_types[]`: `source_entity_type` and `target_entity_type` as `null` when absent
- Boolean fields (`directed`, `frozen`) must be JSON `true`/`false`, not `0`/`1`

See [`docs/audit/2026-05-23-mcp-import-storage-coherence-audit-post-fix.md`](../../docs/audit/2026-05-23-mcp-import-storage-coherence-audit-post-fix.md) §5.

## Smoke checklist

| Step | Check |
|------|-------|
| After load (no reindex) | `entities_raw` > 0, `graph_entity` = 0 for workspace |
| After reindex | `graph_entity` ≈ `entities_raw` count |
| `ghostcrab_graph_search` | query `appartement` → ≥ 5 units |
| `ghostcrab_traverse` | from `Résidence Les Tilleuls` → paths via `contains` |
| `ghostcrab_search` | empty after import-only (expected — no agent `facets`) |
| `ghostcrab_learn` + reindex | learn nodes preserved via raw mirror |

See [`docs/audit/2026-05-23-mcp-import-storage-coherence-audit-post-fix.md`](../../docs/audit/2026-05-23-mcp-import-storage-coherence-audit-post-fix.md) §5.
