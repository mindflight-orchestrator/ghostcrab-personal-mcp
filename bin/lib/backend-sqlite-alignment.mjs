import { readFileSync } from "node:fs";

import { probeBackend } from "./brain-engine-runner.mjs";
import { readSqliteCount } from "./sqlite-file-count.mjs";

/**
 * @param {string} bundlePath
 * @returns {string | null}
 */
export function readBundleWorkspaceId(bundlePath) {
  try {
    const doc = JSON.parse(readFileSync(bundlePath, "utf8"));
    if (
      doc?.scope?.workspace_id &&
      typeof doc.scope.workspace_id === "string"
    ) {
      return doc.scope.workspace_id;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * @param {string} baseUrl
 * @param {string} sql
 * @param {readonly unknown[]} params
 * @returns {Promise<number>}
 */
async function queryBackendCount(baseUrl, sql, params = []) {
  const response = await fetch(
    `${baseUrl.replace(/\/$/, "")}/api/mindbrain/sql`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sql, params: [...params] }),
      signal: AbortSignal.timeout(3_000)
    }
  );
  if (!response.ok) {
    throw new Error(`MindBrain SQL probe failed (${response.status})`);
  }
  const payload = await response.json();
  return readCountFromSqlPayload(payload);
}

/**
 * @param {unknown} payload
 * @returns {number}
 */
export function readCountFromSqlPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return 0;
  }
  const record =
    /** @type {{ rows?: unknown, result?: unknown, data?: unknown, columns?: unknown }} */ (
      payload
    );
  const rows = payload?.rows ?? payload?.result ?? payload?.data;
  if (!Array.isArray(rows) || rows.length === 0) {
    return 0;
  }
  const firstRow = rows[0];
  if (Array.isArray(firstRow)) {
    const columns = Array.isArray(record.columns) ? record.columns : [];
    const countIndex = columns.findIndex((column) => column === "count");
    return Number(firstRow[countIndex >= 0 ? countIndex : 0] ?? 0);
  }
  return Number(firstRow?.count ?? 0);
}

/**
 * @param {{
 *   sqlitePathResolved: string;
 *   bundlePath?: string | null;
 * }} options
 * @returns {Promise<{ aligned: boolean; backend: Awaited<ReturnType<typeof probeBackend>>; fileCount: number; httpCount: number | null; workspaceId: string | null }>}
 */
export async function inspectBackendSqliteAlignment(options) {
  const workspaceId = options.bundlePath
    ? readBundleWorkspaceId(options.bundlePath)
    : null;
  const sql = workspaceId
    ? "SELECT COUNT(*) AS count FROM entities_raw WHERE workspace_id = ?"
    : "SELECT COUNT(*) AS count FROM entities_raw";
  const params = workspaceId ? [workspaceId] : [];

  let fileCount;
  try {
    fileCount = readSqliteCount(options.sqlitePathResolved, sql, params);
  } catch {
    const backend = await probeBackend(options.sqlitePathResolved);
    return {
      aligned: true,
      backend,
      fileCount: null,
      httpCount: null,
      workspaceId
    };
  }
  const backend = await probeBackend(options.sqlitePathResolved);

  if (!backend.alive || !backend.url) {
    return {
      aligned: true,
      backend,
      fileCount,
      httpCount: null,
      workspaceId
    };
  }

  let httpCount;
  try {
    httpCount = await queryBackendCount(backend.url, sql, params);
  } catch {
    return {
      aligned: true,
      backend,
      fileCount,
      httpCount: null,
      workspaceId
    };
  }

  return {
    aligned: httpCount === fileCount,
    backend,
    fileCount,
    httpCount,
    workspaceId
  };
}

/**
 * @param {{
 *   sqlitePathResolved: string;
 *   bundlePath?: string | null;
 * }} options
 * @returns {Promise<void>}
 */
export async function assertBackendSqliteAlignedOrExit(options) {
  const report = await inspectBackendSqliteAlignment(options);
  if (report.aligned) {
    return;
  }

  const backendSqlitePath =
    report.backend.writeStatus &&
    typeof report.backend.writeStatus === "object" &&
    "sqlite_path" in report.backend.writeStatus
      ? String(report.backend.writeStatus.sqlite_path)
      : null;

  const lines = [
    "[ghostcrab] MindBrain backend SQLite is not aligned with the imported file.",
    `  SQLite file: ${options.sqlitePathResolved}`,
    `  Backend URL: ${report.backend.url ?? "unknown"}`,
    report.workspaceId
      ? `  entities_raw (${report.workspaceId}): file=${report.fileCount}, backend=${report.httpCount}`
      : `  entities_raw total: file=${report.fileCount}, backend=${report.httpCount}`
  ];

  if (backendSqlitePath && backendSqlitePath !== options.sqlitePathResolved) {
    lines.push(`  Backend sqlite_path: ${backendSqlitePath}`);
  }

  lines.push(
    "  Fix: restart the backend with GHOSTCRAB_SQLITE_PATH pointing at the same file, or run:",
    `    GHOSTCRAB_SQLITE_PATH="${options.sqlitePathResolved}" gcp serve`
  );

  console.error(lines.join("\n"));
  process.exit(1);
}
