import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let cachedDatabaseSync = null;

function loadDatabaseSync() {
  if (cachedDatabaseSync) {
    return cachedDatabaseSync;
  }
  try {
    cachedDatabaseSync = require("node:sqlite").DatabaseSync;
    return cachedDatabaseSync;
  } catch (error) {
    throw new Error(
      "node:sqlite is not available in this Node.js runtime; skipping SQLite file count alignment check.",
      { cause: error }
    );
  }
}

/**
 * @param {string} sqlitePath
 * @param {string} sql
 * @param {readonly unknown[]} [params]
 * @returns {number}
 */
export function readSqliteCount(sqlitePath, sql, params = []) {
  const DatabaseSync = loadDatabaseSync();
  const db = new DatabaseSync(sqlitePath);
  try {
    const row = db.prepare(sql).get(...params);
    return Number(row?.count ?? 0);
  } finally {
    db.close();
  }
}

/**
 * @typedef {{ id: string, appliedAt: string | null }} SchemaMigrationRow
 */

/**
 * Read applied MindBrain schema migration ids from mindbrain_schema_migrations.
 * Returns [] when the table is absent, null when the file is unreadable or
 * node:sqlite is unavailable.
 * @param {string} sqlitePath
 * @returns {SchemaMigrationRow[] | null}
 */
export function readSchemaMigrations(sqlitePath) {
  let DatabaseSync;
  try {
    DatabaseSync = loadDatabaseSync();
  } catch {
    return null;
  }
  try {
    const db = new DatabaseSync(sqlitePath);
    try {
      const table = db
        .prepare(
          "SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'mindbrain_schema_migrations' LIMIT 1"
        )
        .get();
      if (!table) return [];
      const rows = db
        .prepare(
          "SELECT id, applied_at AS appliedAt FROM mindbrain_schema_migrations ORDER BY applied_at, id"
        )
        .all();
      return rows.map((row) => ({
        id: String(row.id),
        appliedAt: row.appliedAt != null ? String(row.appliedAt) : null
      }));
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}
