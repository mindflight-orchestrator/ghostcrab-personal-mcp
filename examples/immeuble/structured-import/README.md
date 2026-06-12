# Immeuble structured-import demo

Tabular import fixtures for the GhostCrab structured-import pipeline (Belgian syndic narrative, OSS-safe).

## Layout

```
contracts/
  immeuble_structured_import_model.json
  mapping_external_to_canonical.json
  mapping_external_to_canonical_ws.json   # Phase D: data_plane=ws
manifests/
  manifest.yaml
fixtures/
  fake_data/                              # copropriete, personne, lot CSVs
  import_ready/                           # facets + edges CSV bundles
```

Workspace: `immeuble-structured-import`.

## Quick start

```bash
export GHOSTCRAB_SQLITE_PATH="$PWD/data/ghostcrab.sqlite"
npm run structured-import:smoke
```

Scenario sérialisé (plan/apply/reindex/provenance) :

```bash
npm run structured-import:scenario:immeuble -- --workspace-id immeuble-structured-import \
  --db /tmp/immeuble-demo/immeuble.sqlite \
  --evidence-dir /tmp/immeuble-demo/artifacts
```

Ou sans npm :

```bash
node scripts/run-immeuble-structured-import-scenario.mjs \
  --workspace-id immeuble-structured-import \
  --db /tmp/immeuble-demo/immeuble.sqlite \
  --evidence-dir /tmp/immeuble-demo/artifacts
```

See [docs/setup/structured-import.md](../../../docs/setup/structured-import.md).
