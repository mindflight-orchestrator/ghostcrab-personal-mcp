# Serenity micro-project starter

Dossier d’exemple minimal pour tester un import structuré complet (CSV + JSONL)
avec `gcp brain structured-import` + `scripts/run-structured-import-system.mjs`.

- Workspace cible : `serenity-micro-start`
- Taxonomies métiers attendues :
  - `administrative:FormuleService`
  - `administrative:StatutMandatGestion`

## Ordre recommandé

### 0. Pré-checks (runner robuste)

Le runner accepte maintenant un mode "skip/preflight" explicite :

```bash
node scripts/run-structured-import-system.mjs \
  --manifest examples/serenity-micro-start/manifests/manifest-csv.yaml \
  --skip-preflight
```

### 1. Plan (dry-run)

```bash
node scripts/run-structured-import-system.mjs \
  --manifest examples/serenity-micro-start/manifests/manifest-csv.yaml
node scripts/run-structured-import-system.mjs \
  --manifest examples/serenity-micro-start/manifests/manifest-jsonl.yaml
```

### 2. Apply en deux passes

```bash
node scripts/run-structured-import-system.mjs \
  --manifest examples/serenity-micro-start/manifests/manifest-csv.yaml \
  --apply
node scripts/run-structured-import-system.mjs \
  --manifest examples/serenity-micro-start/manifests/manifest-jsonl.yaml \
  --apply
```

### 2. Scenario serialisé (preuve minimale JSON)

```bash
node scripts/run-serenity-micro-start-scenario.mjs \
  --workspace-id serenity-micro-start \
  --db /tmp/serenity-micro-start/immeuble.sqlite \
  --evidence-dir /tmp/serenity-micro-start/artifacts
```

### 3. Validation technique

```bash
gcp brain structured-import reindex --workspace-id serenity-micro-start --scope all
gcp brain structured-import validate-provenance --workspace-id serenity-micro-start
```

- Vérifier ensuite par vos outils MCP : `ghostcrab_search`, `ghostcrab_graph_search`, `ghostcrab_graph_diagnostics`, `ghostcrab_coverage`.
- Le mini contrat est dans `contracts/consumer_contract.yaml`.

## Fichiers produits

- `manifests/manifest-csv.yaml`
- `manifests/manifest-jsonl.yaml`
- `contracts/ontology.json`
- `contracts/mapping_services.json`
- `contracts/mapping_mandats.json`
- `contracts/consumer_contract.yaml`
- `source/services.csv`
- `source/mandats.jsonl`
