# Immeuble training demo (draft + golden)

Two comparable workspaces for graph gap diagnostics curriculum.

| Workspace | Bundle | Purpose |
|-----------|--------|---------|
| `immeuble-training-draft` | `bundles/draft.json` | Catalogued errors E01–E03 |
| `immeuble-training-golden` | `bundles/resolved.json` | Resolved graph after fixes |

Narrative source stays immutable in [`../reference/bundle.json`](../reference/bundle.json).

## Quick start (SQLite)

```bash
node scripts/generate-immeuble-demo.mjs --training --emit draft,resolved
export GHOSTCRAB_SQLITE_PATH="$PWD/data/immeuble-training.sqlite"
bash scripts/load-immeuble-training.sh --both --force
bash scripts/compare-immeuble-training.sh --rules gap-rules/L2-syndic-filtered.json
bash scripts/verify-training-module.sh --module A2
bash scripts/verify-training-module.sh --module A3
```

## Curriculum

### Track A — Data repair

| Module | Rules | Workspace | Expected |
|--------|-------|-----------|----------|
| A1 | `L0-patrimoine.json` | draft | patrimoine green |
| A2 | `L2-syndic-filtered.json` | draft | ≥6 syndic gaps |
| A3 | `L2-syndic-filtered.json` | golden | syndic green |

### Track B — Rule design

| Module | Rules | Workspace | Expected |
|--------|-------|-----------|----------|
| B1 | `L1-syndic-naive.json` | golden | FP on Érables A4 |
| B2 | `L2-syndic-filtered.json` | golden | FP removed |
| B3 | `L3-full.json` + `motifs.json` | golden | finance green |

Axioms: [`axioms/closed-world-contract.md`](axioms/closed-world-contract.md)  
Manifest: [`training-manifest.yaml`](training-manifest.yaml)

## Regenerate bundles

```bash
node scripts/generate-immeuble-demo.mjs --training --emit draft,resolved
# or: python3 scripts/generate-immeuble-training-bundles.py
```

Hub: [`../README.md`](../README.md)
