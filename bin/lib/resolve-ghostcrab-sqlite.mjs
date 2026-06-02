/**
 * Resolves the GhostCrab SQLite file path the same way as `gcp brain up` / `gcp serve`.
 * Used by serve and by `gcp brain db-who` so the default is always
 * ~/.ghostcrab/databases/ghostcrab.sqlite when no GHOSTCRAB_SQLITE_PATH and no --db.
 */
import { resolve, join } from "node:path";
import { getDataDir } from "./data-dir.mjs";

/**
 * @param {{
 *   workspaceNameFromCli?: string | null;
 *   sqlitePathFromCli?: string | null;
 *   defaultFromCli?: boolean;
 * }} opts
 *   workspaceNameFromCli — accepted for compatibility; never selects the SQLite file.
 *   sqlitePathFromCli    — path supplied via `--db <path>` on the command line; wins over the
 *                          user-global default but loses to `GHOSTCRAB_SQLITE_PATH` env var.
 *   defaultFromCli       — true when the user explicitly supplied `--default`.
 * @returns {{
 *   sqlitePath: string;
 *   sqlitePathResolved: string;
 *   sqlitePathSource: string;
 *   backendAddr: string | undefined;
 *   portExplicit: boolean;
 * }}
 */
export function resolveGhostcrabSqlite(opts) {
  const { sqlitePathFromCli = null, defaultFromCli = false } = opts;

  let sqlitePath;
  /** @type {string} */
  let sqlitePathSource;
  let backendAddr;
  let portExplicit = false;

  if (process.env.GHOSTCRAB_SQLITE_PATH) {
    sqlitePath = process.env.GHOSTCRAB_SQLITE_PATH;
    sqlitePathSource = "GHOSTCRAB_SQLITE_PATH";
    if (process.env.GHOSTCRAB_BACKEND_ADDR) {
      backendAddr = process.env.GHOSTCRAB_BACKEND_ADDR;
      portExplicit = true;
    }
  } else if (sqlitePathFromCli) {
    sqlitePath = resolve(sqlitePathFromCli);
    sqlitePathSource = "CLI --db";
    if (process.env.GHOSTCRAB_BACKEND_ADDR) {
      backendAddr = process.env.GHOSTCRAB_BACKEND_ADDR;
      portExplicit = true;
    }
  } else {
    sqlitePath = getDefaultGhostcrabSqlitePath();
    sqlitePathSource = defaultFromCli
      ? "CLI --default"
      : "user default (~/.ghostcrab/databases/ghostcrab.sqlite)";
    if (process.env.GHOSTCRAB_BACKEND_ADDR) {
      backendAddr = process.env.GHOSTCRAB_BACKEND_ADDR;
      portExplicit = true;
    }
  }

  return {
    sqlitePath,
    sqlitePathResolved: resolve(sqlitePath),
    sqlitePathSource,
    backendAddr,
    portExplicit
  };
}

export function getDefaultGhostcrabSqlitePath() {
  return join(getDataDir(), "databases", "ghostcrab.sqlite");
}
