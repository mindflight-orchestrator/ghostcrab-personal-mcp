/**
 * Resolves the GhostCrab SQLite file path the same way as `gcp brain up` / `gcp serve`.
 * Used by serve and by `gcp brain db-who` so the default is always
 * ./data/ghostcrab.sqlite in cwd when no GHOSTCRAB_SQLITE_PATH and no per-workspace path.
 */
import { resolve, join } from "node:path";
import { readConfig } from "./cli-config.mjs";

/**
 * @param {{
 *   workspaceNameFromCli?: string | null;
 *   sqlitePathFromCli?: string | null;
 * }} opts
 *   workspaceNameFromCli — only the `--workspace` / `-w` value when provided; not read from config here.
 *   sqlitePathFromCli    — path supplied via `--db <path>` on the command line; wins over workspace /
 *                          cwd fallback but loses to `GHOSTCRAB_SQLITE_PATH` env var.
 * @returns {{
 *   sqlitePath: string;
 *   sqlitePathResolved: string;
 *   sqlitePathSource: string;
 *   backendAddr: string | undefined;
 *   portExplicit: boolean;
 * }}
 */
export function resolveGhostcrabSqlite(opts) {
  const { workspaceNameFromCli = null, sqlitePathFromCli = null } = opts;
  const config = readConfig();

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
    const wsName =
      workspaceNameFromCli ?? config.defaultWorkspace ?? null;
    const ws = wsName ? config.workspaces?.[wsName] : null;
    sqlitePath =
      ws?.sqlitePath ?? join(process.cwd(), "data", "ghostcrab.sqlite");
    if (ws?.sqlitePath) {
      sqlitePathSource = `workspace "${wsName}" (sqlitePath in config)`;
    } else if (wsName) {
      sqlitePathSource = `workspace "${wsName}" (fallback: data/ghostcrab.sqlite in cwd)`;
    } else {
      sqlitePathSource =
        "no workspace selected (fallback: data/ghostcrab.sqlite in cwd)";
    }
    if (process.env.GHOSTCRAB_BACKEND_ADDR) {
      backendAddr = process.env.GHOSTCRAB_BACKEND_ADDR;
      portExplicit = true;
    } else if (ws?.backendAddr) {
      backendAddr = ws.backendAddr;
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
