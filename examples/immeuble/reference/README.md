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

| File                          | Role                                                              |
| ----------------------------- | ----------------------------------------------------------------- |
| `bundle.json`                 | Full `ghostcrab_backup_bundle`                                    |
| `documents/`                  | 7 qualified markdown docs (mirrored in bundle)                    |
| `scenarios.yaml`              | Competency questions                                              |
| `answer-artifacts.seed.jsonl` | Optional `gcp load` seed for `analysis_plan` + `live_answer_view` |
| `gap-rules/demo.json`         | Patrimoine / annexes rules                                        |
| `gap-rules/syndic.json`       | Occupation / lease rules (L2 filtered)                            |

## Answer artifacts

The bundle includes `mindbrain_answer_artifacts` rows. After loading the
reference workspace, inspect and refresh them with:

```bash
gcp brain artifact list --workspace-id immeuble-demo --kind live_answer_view
gcp brain artifact get analysis_plan__immeuble_demo_competency_questions
gcp brain artifact refresh live_answer_view__immeuble_demo_pilotage
gcp brain artifact events live_answer_view__immeuble_demo_pilotage --limit 5
```

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
