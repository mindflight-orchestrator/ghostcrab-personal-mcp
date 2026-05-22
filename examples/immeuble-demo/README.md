# Immeuble demo bundle

Reference workspace for validating import → reindex → query coherence.

## Load and reindex

```bash
gcp brain load examples/immeuble-demo/bundle.json --workspace immeuble-demo --reindex graph
# or after MCP serve:
# ghostcrab_graph_reindex { "workspace_id": "immeuble-demo" }
```

## Smoke checklist

| Step | Check |
|------|-------|
| After load (no reindex) | `entities_raw` > 0, `graph_entity` = 0 for workspace |
| After reindex | `graph_entity` ≈ `entities_raw` count |
| `ghostcrab_graph_search` | query `appartement` → ≥ 5 units |
| `ghostcrab_traverse` | from `Résidence Les Tilleuls` → paths via `contains` |
| `ghostcrab_search` | empty after import-only (expected — no agent `facets`) |
| `ghostcrab_learn` + reindex | learn nodes preserved via raw mirror |

See [`docs/audit/2026-05-22-mcp-import-storage-coherence-audit.md`](../../docs/audit/2026-05-22-mcp-import-storage-coherence-audit.md) §7.
