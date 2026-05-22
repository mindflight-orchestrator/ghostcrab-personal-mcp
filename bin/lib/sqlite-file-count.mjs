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
