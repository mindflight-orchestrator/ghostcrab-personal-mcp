---
name: upgrade visibility P1 P2
overview: Implémenter P1 (logs stderr migrations + capture GhostCrab) et P2 (GET /api/mindbrain/schema/status + rapport upgrade enrichi). Nécessite mindbrain-perso + ghostcrab-personal-mcp + rebuild binaire backend.
todos:
  - id: p1-mindbrain-logs
    content: "mindbrain-perso facet_sqlite.zig: logMigrationSkipped/Applying/Applied + log applyStandaloneSchema"
    status: pending
  - id: p2-mindbrain-endpoint
    content: "mindbrain-perso http_app.zig: GET /api/mindbrain/schema/status + listSchemaMigrations/countUserTables"
    status: pending
  - id: p1-p2-ghostcrab
    content: "install-upgrade.mjs: pipe stderr, fetch schema/status, enrichir printUpgradeReport + tests"
    status: pending
  - id: sync-vendor
    content: "Copier facet_sqlite.zig + http_app.zig vers vendor/mindbrain (submodule aligné)"
    status: pending
  - id: rebuild-backend
    content: "Rebuild ghostcrab-backend prebuild (dist-pack) pour que P1/P2 soient actifs en prod"
    status: pending
isProject: false
---

# P1 + P2 — Upgrade visibility (à exécuter)

**Statut : en attente d'approbation mode Agent** (le mode Plan bloque l'édition du code Zig/JS).

---

## P1 — Logs stderr + capture GhostCrab

### mindbrain-perso — [src/standalone/facet_sqlite.zig](file:///home/dlamotte/Documents/mindflight/mindbrain-perso/src/standalone/facet_sqlite.zig)

Ajouter helpers (après `markMigrationApplied`) :

```zig
fn logMigrationSkipped(id: []const u8) void {
    std.debug.print("[mindbrain] migration skipped (already applied): {s}\n", .{id});
}
fn logMigrationApplying(id: []const u8) void {
    std.debug.print("[mindbrain] migration applying: {s}\n", .{id});
}
fn logMigrationApplied(id: []const u8) void {
    std.debug.print("[mindbrain] migration applied: {s}\n", .{id});
}
```

Dans `applyStandaloneSchema` : log `[mindbrain] schema: applying standalone metadata schema`.

Dans chaque migration (`applyGraphEntityWorkspaceMigration`, `applyRawGraphAutoincrementMigration`, `applyGraphGapRulesMigration`, `applyAgentFactsTableRenameMigration`) :
- early return si déjà appliqué → `logMigrationSkipped`
- avant travail → `logMigrationApplying`
- après `markMigrationApplied` → `logMigrationApplied`

### ghostcrab — [bin/lib/install-upgrade.mjs](bin/lib/install-upgrade.mjs)

Dans `migrateViaBackend` :
- `stdio: ["ignore", "ignore", "pipe"]` (stderr pipé)
- accumuler stderr, extraire lignes `[mindbrain]`
- retourner `{ ..., backendLogs: string[] }`

Dans `printUpgradeReport` / boucle DB :
- afficher `backend startup logs:` avec chaque ligne `[mindbrain]`

---

## P2 — Endpoint schema/status

### mindbrain-perso — facet_sqlite.zig (exports publics)

```zig
pub const SchemaMigrationRecord = struct { id: []const u8, applied_at: []const u8 };
pub fn listSchemaMigrations(db, allocator) ![]SchemaMigrationRecord
pub fn freeSchemaMigrations(allocator, rows)
pub fn countUserTables(db) !usize
```

### mindbrain-perso — [src/standalone/http_app.zig](file:///home/dlamotte/Documents/mindflight/mindbrain-perso/src/standalone/http_app.zig)

Route (après `/api/mindbrain/capabilities`) :

```
GET /api/mindbrain/schema/status
```

Handler `handleSchemaStatus` → JSON via `helper_api.jsonResponse` :

```json
{
  "kind": "mindbrain_schema_status",
  "mindbrain_version": "1.7.1",
  "sqlite_path": "...",
  "schema_tables_count": 42,
  "mindbrain_schema_migrations_table": true,
  "applied_migrations": [{ "id": "...", "applied_at": "..." }]
}
```

Documenter la route dans le bloc `routes:` du help HTTP (~L4547).

### ghostcrab — install-upgrade.mjs

Après `/health` OK, avant SIGTERM backend :

```javascript
const schemaStatus = await fetchJson(
  `http://127.0.0.1:${port}/api/mindbrain/schema/status`
);
```

- Si 200 : inclure dans `report.migrations[].schemaStatus`
- Si 501/484 : ignorer (backend ancien sans endpoint)
- Afficher : `mindbrain_version`, `schema_tables_count`, liste `applied_migrations`

---

## Sync + rebuild

1. Copier les fichiers modifiés vers [vendor/mindbrain](vendor/mindbrain) (identique à mindbrain-perso aujourd'hui)
2. Rebuild `ghostcrab-backend` prebuild (sinon P1/P2 inactifs — le binaire embarqué est l'ancien)
3. Tests : `tests/unit/install-upgrade.test.ts` — mock stderr + schema status JSON

---

## Fichiers touchés

| Repo | Fichiers |
|------|----------|
| mindbrain-perso | `src/standalone/facet_sqlite.zig`, `src/standalone/http_app.zig` |
| ghostcrab-personal-mcp | `bin/lib/install-upgrade.mjs`, `tests/unit/install-upgrade.test.ts`, `vendor/mindbrain/...` (sync) |
