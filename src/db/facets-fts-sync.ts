import type { DatabaseClient, Queryable } from "./client.js";
import { FACETS_SEARCH_TABLE_ID } from "./fact-store.js";

export interface FactsFtsSyncSummary {
  /** True when the bootstrap successfully verified the registration and ran the backfill. */
  ready: boolean;
  /** True when the sync_trigger row was newly inserted in this run. */
  registered: boolean;
  /** Number of `facets` rows newly mirrored into `search_documents`. */
  documentsInserted: number;
  /** Number of `facets` rows newly mirrored into `search_fts_docs`. */
  ftsDocsInserted: number;
  /** Number of `search_fts` virtual-table rows newly inserted. */
  ftsRowsInserted: number;
  /** Reason the bootstrap could not complete (null when ready=true). */
  error: string | null;
}

/**
 * One-shot, idempotent bootstrap that lights up MindBrain FTS5 BM25 search for
 * GhostCrab's `facets` table.
 *
 * Required because the MindBrain v1.2.1 baseline ships `search_fts`,
 * `search_fts_docs`, and `bm25_sync_triggers`, but the only call sites of
 * `bm25CreateSyncTrigger` are the document-import pipeline and tests — never
 * the `facets` table. So fresh GhostCrab installs land with `search_fts`
 * empty for facets even though every `remember`/`upsert` row has a `doc_id`.
 *
 * The bootstrap:
 * 1. Verifies that the MindBrain FTS5 surface is present (search_fts virtual
 *    table, search_fts_docs, bm25_sync_triggers).
 * 2. Inserts `facets` into `bm25_sync_triggers` (idempotent).
 * 3. Backfills `search_documents`, `search_fts_docs`, and `search_fts` for
 *    every `facets` row with a non-null `doc_id` that is missing from the
 *    search artifacts. Re-runs are safe and cheap thanks to `INSERT OR IGNORE`.
 *
 * Failures are non-fatal: the function returns `ready: false` with an error
 * string, and the caller is expected to fall back to keyword_sql scoring and
 * surface the failure via `ghostcrab_status`.
 */
export async function ensureFactsFtsSync(
  database: DatabaseClient,
  tableId = FACETS_SEARCH_TABLE_ID
): Promise<FactsFtsSyncSummary> {
  const summary: FactsFtsSyncSummary = {
    ready: false,
    registered: false,
    documentsInserted: 0,
    ftsDocsInserted: 0,
    ftsRowsInserted: 0,
    error: null
  };

  try {
    if (!(await ftsSurfaceExists(database))) {
      summary.error =
        "MindBrain FTS5 surface (search_fts / search_fts_docs / bm25_sync_triggers) is missing. Skipping bootstrap; keyword_sql fallback remains active.";
      return summary;
    }

    await database.transaction(async (tx) => {
      summary.registered = await registerFacetsForSync(tx, tableId);
      summary.documentsInserted = await backfillSearchDocuments(tx, tableId);
      summary.ftsDocsInserted = await backfillSearchFtsDocs(tx, tableId);
      summary.ftsRowsInserted = await backfillSearchFtsRows(tx, tableId);
    });

    summary.ready = await isRegistered(database, tableId);
    if (!summary.ready) {
      summary.error = `bm25_sync_triggers row for table_id=${tableId} was not visible after registration.`;
    }
  } catch (error) {
    summary.error = error instanceof Error ? error.message : String(error);
  }

  return summary;
}

async function ftsSurfaceExists(database: DatabaseClient): Promise<boolean> {
  const rows = await database.query<{ name: string }>(
    `
      SELECT name
      FROM sqlite_master
      WHERE type IN ('table','view')
        AND name IN ('search_fts','search_fts_docs','search_documents','bm25_sync_triggers')
    `
  );
  const names = new Set(rows.map((row) => row.name));
  return (
    names.has("search_fts") &&
    names.has("search_fts_docs") &&
    names.has("search_documents") &&
    names.has("bm25_sync_triggers")
  );
}

async function isRegistered(
  database: Queryable,
  tableId: number
): Promise<boolean> {
  const rows = await database.query<{ ok: number }>(
    `SELECT 1 AS ok FROM bm25_sync_triggers WHERE table_id = ? LIMIT 1`,
    [tableId]
  );
  return rows.length > 0;
}

async function registerFacetsForSync(
  tx: Queryable,
  tableId: number
): Promise<boolean> {
  const before = await isRegistered(tx, tableId);
  await tx.query(
    `
      INSERT OR IGNORE INTO bm25_sync_triggers (table_id, id_column, content_column, language)
      VALUES (?, ?, ?, ?)
    `,
    [tableId, "doc_id", "content", "english"]
  );
  return !before;
}

async function backfillSearchDocuments(
  tx: Queryable,
  tableId: number
): Promise<number> {
  const before = await countRows(
    tx,
    `SELECT COUNT(*) AS c FROM search_documents WHERE table_id = ?`,
    [tableId]
  );
  await tx.query(
    `
      INSERT OR IGNORE INTO search_documents (table_id, doc_id, content, language)
      SELECT ?, doc_id, content, 'english'
      FROM facets
      WHERE doc_id IS NOT NULL
    `,
    [tableId]
  );
  const after = await countRows(
    tx,
    `SELECT COUNT(*) AS c FROM search_documents WHERE table_id = ?`,
    [tableId]
  );
  return Math.max(0, after - before);
}

async function backfillSearchFtsDocs(
  tx: Queryable,
  tableId: number
): Promise<number> {
  const before = await countRows(
    tx,
    `SELECT COUNT(*) AS c FROM search_fts_docs WHERE table_id = ?`,
    [tableId]
  );
  await tx.query(
    `
      INSERT OR IGNORE INTO search_fts_docs (table_id, doc_id)
      SELECT ?, doc_id
      FROM facets
      WHERE doc_id IS NOT NULL
    `,
    [tableId]
  );
  const after = await countRows(
    tx,
    `SELECT COUNT(*) AS c FROM search_fts_docs WHERE table_id = ?`,
    [tableId]
  );
  return Math.max(0, after - before);
}

async function backfillSearchFtsRows(
  tx: Queryable,
  tableId: number
): Promise<number> {
  // Insert into the FTS5 virtual table for every (table_id, doc_id) that
  // already has a row in search_fts_docs but is missing from search_fts.
  // We cannot use `INSERT OR IGNORE` against a virtual table, so we filter
  // with NOT EXISTS instead and count the row delta via lastChange-style
  // before/after counts. The FTS table is content-less, but its rowid is
  // the search_fts_docs.fts_rowid we just allocated.
  const beforeRows = await tx.query<{ c: number }>(
    `SELECT COUNT(*) AS c FROM search_fts`
  );
  const before = Number(beforeRows[0]?.c ?? 0);

  await tx.query(
    `
      INSERT INTO search_fts (rowid, content)
      SELECT sd.fts_rowid, f.content
      FROM search_fts_docs sd
      JOIN facets f ON f.doc_id = sd.doc_id
      WHERE sd.table_id = ?
        AND NOT EXISTS (
          SELECT 1 FROM search_fts WHERE rowid = sd.fts_rowid
        )
    `,
    [tableId]
  );

  const afterRows = await tx.query<{ c: number }>(
    `SELECT COUNT(*) AS c FROM search_fts`
  );
  const after = Number(afterRows[0]?.c ?? 0);
  return Math.max(0, after - before);
}

async function countRows(
  tx: Queryable,
  sql: string,
  params: readonly unknown[]
): Promise<number> {
  const rows = await tx.query<{ c: number }>(sql, params);
  return Number(rows[0]?.c ?? 0);
}
