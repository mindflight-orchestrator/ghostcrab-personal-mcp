# Immeuble reference demo

Golden workspace `immeuble-demo` — importable bundle for Studio, smoke tests, and MCP lab comparison.

## Import

```bash
export GHOSTCRAB_SQLITE_PATH="$PWD/data/immeuble-demo.sqlite"
mkdir -p "$(dirname "$GHOSTCRAB_SQLITE_PATH")"

node bin/gcp.mjs load examples/immeuble/reference/bundle.json --dry-run
node bin/gcp.mjs load examples/immeuble/reference/bundle.json \
  --workspace immeuble-demo --reindex all
```

## Contents

| File | Role |
|------|------|
| `bundle.json` | Full `ghostcrab_backup_bundle` |
| `documents/` | 7 qualified markdown docs (mirrored in bundle) |
| `scenarios.yaml` | Competency questions |
| `projections.seed.jsonl` | Optional `ghostcrab_project` seed |
| `gap-rules/demo.json` | Patrimoine / annexes rules |
| `gap-rules/syndic.json` | Occupation / lease rules (L2 filtered) |

## Gap diagnostics

```bash
bash vendor/mindbrain/scripts/demo-immeuble-gaps.sh \
  --rules examples/immeuble/reference/gap-rules/demo.json
```

## Regenerate

```bash
node scripts/generate-immeuble-demo.mjs
```

Hub: [`../README.md`](../README.md)
