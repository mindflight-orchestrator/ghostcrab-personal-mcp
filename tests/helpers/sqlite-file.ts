import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const require = createRequire(import.meta.url);
let cachedDatabaseSync: unknown;

function loadDatabaseSync():
  | (new (path: string) => {
      close(): void;
      prepare(sql: string): { get(...params: readonly unknown[]): unknown };
    })
  | null {
  if (cachedDatabaseSync) {
    return cachedDatabaseSync as new (path: string) => {
      close(): void;
      prepare(sql: string): { get(...params: readonly unknown[]): unknown };
    };
  }
  try {
    cachedDatabaseSync = require("node:sqlite").DatabaseSync;
    return cachedDatabaseSync as new (path: string) => {
      close(): void;
      prepare(sql: string): { get(...params: readonly unknown[]): unknown };
    };
  } catch {
    return null;
  }
}

export function canReadSqliteFile(): boolean {
  return loadDatabaseSync() !== null;
}

export function resolveMindbrainUrlFromPid(
  cwd = process.cwd()
): string | undefined {
  const pidPath = join(cwd, "data", "ghostcrab-backend.pid");
  if (!existsSync(pidPath)) {
    return undefined;
  }

  try {
    const [, port] = readFileSync(pidPath, "utf8").trim().split(":");
    if (port) {
      return `http://127.0.0.1:${port}`;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

export function readSqliteCount(
  sqlitePath: string,
  sql: string,
  params: readonly unknown[] = []
): number {
  const DatabaseSync = loadDatabaseSync();
  if (!DatabaseSync) {
    throw new Error("node:sqlite is not available in this Node.js runtime.");
  }
  const db = new DatabaseSync(sqlitePath);
  try {
    const row = db.prepare(sql).get(...params) as { count: number } | undefined;
    return Number(row?.count ?? 0);
  } finally {
    db.close();
  }
}

export async function backendSeesSqliteCounts(options: {
  database: { query: <T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[]
  ) => Promise<T[]> };
  sqlitePath: string;
  workspaceId: string;
}): Promise<boolean> {
  const fileCount = readSqliteCount(
    options.sqlitePath,
    `SELECT COUNT(*) AS count FROM entities_raw WHERE workspace_id = ?`,
    [options.workspaceId]
  );
  if (fileCount === 0) {
    return false;
  }

  const [httpRow] = await options.database.query<{ count: number }>(
    `SELECT COUNT(*) AS count FROM entities_raw WHERE workspace_id = ?`,
    [options.workspaceId]
  );
  return Number(httpRow?.count ?? 0) === fileCount;
}
