# Immeuble structured-import demo

Tabular import fixtures for the GhostCrab structured-import pipeline (Belgian syndic narrative, OSS-safe).

## Layout

```
contracts/
  immeuble_structured_import_model.json
  mapping_external_to_canonical.json
  mapping_external_to_canonical_ws.json   # Phase D: data_plane=ws
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

See [docs/setup/structured-import.md](../../../docs/setup/structured-import.md).
