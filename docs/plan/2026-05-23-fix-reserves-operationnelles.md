# Plan — fix réserves opérationnelles

Date: 2026-05-23

Baseline audit: [`docs/audit/2026-05-23-mcp-import-storage-coherence-audit-post-fix.md`](../audit/2026-05-23-mcp-import-storage-coherence-audit-post-fix.md)

Prior audit: [`docs/audit/2026-05-22-mcp-import-storage-coherence-audit.md`](../audit/2026-05-22-mcp-import-storage-coherence-audit.md)

---

## Scope baseline (préflight)

Fichiers inclus dans le périmètre de cohérence import/MCP (baseline reproductible) :

| Fichier | Rôle |
|---------|------|
| [`docs/audit/2026-05-23-mcp-import-storage-coherence-audit-post-fix.md`](../audit/2026-05-23-mcp-import-storage-coherence-audit-post-fix.md) | Audit post-fix de référence |
| [`examples/immeuble-demo/bundle.json`](../../examples/immeuble-demo/bundle.json) | Bundle de validation |
| [`examples/immeuble-demo/README.md`](../../examples/immeuble-demo/README.md) | Checklist opérationnelle |
| [`tests/integration/immeuble-demo-coherence.test.ts`](../../tests/integration/immeuble-demo-coherence.test.ts) | Test d'intégration |
| [`tests/helpers/backup-load.ts`](../../tests/helpers/backup-load.ts), [`tests/helpers/sqlite-file.ts`](../../tests/helpers/sqlite-file.ts) | Helpers test |

Ce plan implémente les correctifs opérationnels ; les fichiers ci-dessus restent la baseline de validation.

---

## Principes (minimal diff / hot path)

- **Hot path first** : import bundle → graph queryable sans étape manuelle oubliée
- **Réutiliser l'existant** : endpoints HTTP (`reindex/all`, `shortestPathToonWorkspace`) avant nouvelles pipelines
- **Reindex graph par défaut**, pas `reindexAll` (BM25 + facet_postings = coût ×10, opt-in)
- **Pas de projection `document_links_raw` en v1** (Phase 3 différée)

---

## Vue d'ensemble par repo

| Réserve | Repo | Phase | Statut implémentation |
|---------|------|-------|----------------------|
| P1 reindex après import | GhostCrab | 1 | `--reindex graph` par défaut |
| Backend / SQLite drift | GhostCrab + MindBrain | 1 | Check post-load + `sqlite_path` meta |
| MCP `reindexAll` | GhostCrab | 1 | `ghostcrab_collection_reindex` |
| `ghostcrab_workspace_use` | GhostCrab | 1 | Import dans `register-all.ts` |
| `ghostcrab_facet_register` workspace | GhostCrab | 1 | Session workspace threadé |
| Graph path workspace | MindBrain + GhostCrab | 1 | `shortestPathToonWorkspace` câblé |
| Graph subgraph workspace | MindBrain + GhostCrab | 2 | `streamSubgraphWorkspace` |
| SQL fallback adjacency | GhostCrab | 1 | Warning explicite |
| `document_links_raw` | MindBrain | 3 | **Différé** |
| Bundle JSON strict | MindBrain | 3 | **Différé** |
| Adjacency-only endpoint | MindBrain | 3 | **Différé** |

---

## Phase 1 — GhostCrab (`ghostcrab-personal-mcp`)

### 1.1 Default `--reindex graph` pour backup bundles

- [`bin/commands/load.mjs`](../../bin/commands/load.mjs) : default `reindex = "graph"`
- [`tests/unit/load-cli.test.ts`](../../tests/unit/load-cli.test.ts)

### 1.2 Détection drift backend / SQLite

- [`bin/lib/sqlite-file-count.mjs`](../../bin/lib/sqlite-file-count.mjs) — lecture comptages via `node:sqlite`
- [`bin/lib/backend-sqlite-alignment.mjs`](../../bin/lib/backend-sqlite-alignment.mjs) — compare fichier vs HTTP SQL
- [`bin/commands/load.mjs`](../../bin/commands/load.mjs) — après `backup-load`, exit 1 si backend alive et mismatch

### 1.3 `ghostcrab_collection_reindex`

- [`src/tools/dgraph/collection-reindex.ts`](../../src/tools/dgraph/collection-reindex.ts)
- [`src/db/standalone-mindbrain.ts`](../../src/db/standalone-mindbrain.ts) — `runStandaloneReindexAll`
- Contrat : `workspace_id`, `collection_id`, `table_id` (endpoint MindBrain existant)

### 1.4 Correctifs MCP

- [`src/tools/register-all.ts`](../../src/tools/register-all.ts) — `workspace/use.js`
- [`src/db/facet-vocabulary.ts`](../../src/db/facet-vocabulary.ts) + [`src/tools/facets/catalog.ts`](../../src/tools/facets/catalog.ts) — workspace session
- [`src/tools/dgraph/graph-reindex.ts`](../../src/tools/dgraph/graph-reindex.ts) — warning si `adjacency_rebuilt: false`

### 1.5 Graph path `workspace_id`

- [`src/tools/dgraph/graph-path.ts`](../../src/tools/dgraph/graph-path.ts)
- [`src/db/standalone-mindbrain.ts`](../../src/db/standalone-mindbrain.ts)

---

## Phase 1 — MindBrain (`../mindbrain` → `vendor/mindbrain`)

### 1.7 `sqlite_path` dans write-status

- [`vendor/mindbrain/src/standalone/http_app.zig`](../../vendor/mindbrain/src/standalone/http_app.zig) — champ `sqlite_path` dans `handleSqlWriteStatus`

### 1.8 Graph path workspace

- [`handleGraphPath`](../../vendor/mindbrain/src/standalone/http_app.zig) → `graph_sqlite.shortestPathToonWorkspace`

Workflow vendor : commit MindBrain → bump submodule → `zig build standalone-tool` (Zig 0.16)

---

## Phase 2 — subgraph workspace

### MindBrain

- [`graph_sqlite.zig`](../../vendor/mindbrain/src/standalone/graph_sqlite.zig) :
  - `loadTraverseNeighborsWorkspace` — filtre `r.workspace_id` + `n.workspace_id`
  - `streamSubgraphWorkspace` — validation seeds + BFS scopé
  - `traverseWorkspace` — utilise neighbors workspace-aware
- [`handleGraphSubgraph`](../../vendor/mindbrain/src/standalone/http_app.zig) — param `workspace_id`

### GhostCrab

- [`src/tools/dgraph/graph-subgraph.ts`](../../src/tools/dgraph/graph-subgraph.ts)
- [`src/db/standalone-mindbrain.ts`](../../src/db/standalone-mindbrain.ts)

---

## Phase 3 — différé (specs only)

### 3.1 `document_links_raw` → derived

Projection dans [`import_pipeline.zig`](../../vendor/mindbrain/src/standalone/import_pipeline.zig). Coût élevé ; hors hot path immeuble-demo.

### 3.2 Bundle JSON tolérant

Defaults Zig dans [`collections_io.zig`](../../vendor/mindbrain/src/standalone/collections_io.zig) pour champs optionnels (`valid_from`, `domain_profile`, etc.).

### 3.3 Adjacency-only rebuild

`POST /api/mindbrain/reindex/adjacency` ou documentation du mode SQL dégradé. Ne pas dupliquer en TypeScript.

---

## Test plan

```bash
pnpm exec vitest run tests/unit/load-cli.test.ts tests/tools/dgraph.test.ts tests/tools/mcp-schema-contract.test.ts tests/tools/facet-vocabulary.test.ts
pnpm run test:integration -- tests/integration/immeuble-demo-coherence.test.ts
cd vendor/mindbrain && zig build test-standalone   # Zig 0.16
```

Smoke : `gcp load examples/immeuble-demo/bundle.json` → graph queryable sans reindex MCP manuel.

---

## Critères de succès

- Import bundle → `graph_entity` > 0 par défaut
- Drift backend/sqlite détecté avant debug MCP vide
- `ghostcrab_collection_reindex` rebuild BM25 + facets + graph via MCP
- Path/subgraph respectent `workspace_id`
- Tests immeuble-demo passent (MCP leg si backend aligné)
