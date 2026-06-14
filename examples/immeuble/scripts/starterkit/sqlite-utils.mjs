/**
 * SQLite helpers for StarterKit projection scripts (CLI sqlite3, JSON output).
 */

import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

/**
 * @param {string} dbPath
 * @param {string} sql
 * @returns {Record<string, unknown>[]}
 */
export function sqliteQuery(dbPath, sql) {
  if (!existsSync(dbPath)) {
    throw new Error(`SQLite database not found: ${dbPath}`);
  }
  const res = spawnSync("sqlite3", [dbPath, "-json", sql], { encoding: "utf8" });
  if (res.status !== 0) {
    throw new Error(res.stderr?.trim() || res.stdout?.trim() || "sqlite3 query failed");
  }
  const text = (res.stdout || "").trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * @param {string} dbPath
 * @param {string} table
 * @returns {boolean}
 */
export function sqliteTableExists(dbPath, table) {
  const rows = sqliteQuery(
    dbPath,
    `SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name='${table.replace(/'/g, "''")}' LIMIT 1`
  );
  return rows.length > 0;
}

/**
 * @param {string} dbPath
 * @param {string} table
 * @returns {Set<string>}
 */
export function sqliteTableColumns(dbPath, table) {
  if (!sqliteTableExists(dbPath, table)) return new Set();
  const rows = sqliteQuery(dbPath, `PRAGMA table_info('${table.replace(/'/g, "''")}')`);
  return new Set(rows.map((r) => String(r.name ?? "")).filter(Boolean));
}

/**
 * @param {Set<string>} columns
 * @param {string|null|undefined} workspaceId
 * @returns {{ where: string, params: string[] }}
 */
export function workspaceWhere(columns, workspaceId) {
  if (workspaceId && columns.has("workspace_id")) {
    return {
      where: `WHERE workspace_id = '${escapeSql(workspaceId)}'`,
      params: [workspaceId]
    };
  }
  return { where: "", params: [] };
}

/**
 * @param {string} value
 * @returns {string}
 */
export function escapeSql(value) {
  return String(value).replace(/'/g, "''");
}

/**
 * @param {unknown} value
 * @returns {[boolean, unknown]}
 */
export function parseJsonMaybe(value) {
  if (value == null) return [false, null];
  if (typeof value === "object") return [true, value];
  try {
    return [true, JSON.parse(String(value))];
  } catch {
    return [false, null];
  }
}

/**
 * @param {number|null|undefined} unix
 * @returns {string|null}
 */
export function dtFromUnix(unix) {
  if (!unix) return null;
  return new Date(Number(unix) * 1000).toISOString();
}

/**
 * @param {Record<string, string>} argvMap
 * @param {string} name
 * @param {string} defaultValue
 * @returns {string}
 */
export function parseFlag(argvMap, name, defaultValue = "") {
  return argvMap[name] ?? defaultValue;
}

/**
 * @param {string[]} argv
 * @returns {Record<string, string>}
 */
export function parseArgs(argv) {
  /** @type {Record<string, string>} */
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      out[key] = next;
      i++;
    } else {
      out[key] = "true";
    }
  }
  return out;
}
