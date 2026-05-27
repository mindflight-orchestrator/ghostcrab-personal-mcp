# Immeuble demo (legacy path)

**This directory is a compatibility shim.** Canonical layout:

→ [`../immeuble/`](../immeuble/)

| Legacy file | Points to |
|-------------|-----------|
| `bundle.json` | `immeuble/reference/bundle.json` |
| `documents/` | `immeuble/reference/documents/` |
| `sources/` | `immeuble/mcp-lab/corpus/` |
| `gap-rules.*.json` | `immeuble/reference/gap-rules/` |

## Quick start

See [`../immeuble/README.md`](../immeuble/README.md).

```bash
node bin/gcp.mjs load examples/immeuble/reference/bundle.json \
  --workspace immeuble-demo --reindex all
```
