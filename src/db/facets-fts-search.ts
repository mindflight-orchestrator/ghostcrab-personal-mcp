import type { Queryable } from "./client.js";
import { FACETS_SEARCH_TABLE_ID } from "./fact-store.js";

/**
 * Helpers for the per-request usage of MindBrain's FTS5 surface against the
 * GhostCrab `facets` table. The one-shot bootstrap that registers `facets`
 * with `bm25_sync_triggers` and seeds historical rows lives in
 * `./facets-fts-sync.ts`. This module only does the per-request work:
 *
 *  - normalising free-text into an FTS5 MATCH expression that survives FTS5's
 *    grammar (no caller can crash the search by typing punctuation),
 *  - catching up `search_fts` for any `facets.doc_id` that landed since the
 *    bootstrap (cheap: one INSERT … SELECT … NOT EXISTS).
 *
 * The catch-up is the Phase 2 interim. Once an upstream MindBrain release
 * exposes a typed `POST /api/mindbrain/search-sync` (see "Upstream follow-up
 * #2" in the plan) the write path will keep `search_fts` warm and this helper
 * can be deleted.
 */

const FTS5_SAFE_CHAR = /[A-Za-z0-9_]/;

/**
 * Build a safe FTS5 MATCH expression from arbitrary user input.
 *
 * Strategy:
 *   - Tokenise on whitespace.
 *   - Drop the FTS5-special characters that would otherwise be parsed as
 *     operators (`"`, `*`, `(`, `)`, `:`, `^`, `+`, `-`, `~`).
 *   - Wrap each surviving token in double quotes so any remaining punctuation
 *     becomes a literal phrase fragment.
 *   - OR the tokens together so multi-word queries behave like a "match any"
 *     bag-of-words search, matching the spirit of the previous substring
 *     fallback.
 *
 * Returns `null` when the query reduces to nothing — callers must skip the
 * FTS5 path in that case.
 */
export function buildFtsMatchExpression(query: string): string | null {
  const cleaned = query.trim();
  if (cleaned.length === 0) {
    return null;
  }

  const tokens: string[] = [];
  for (const raw of cleaned.split(/\s+/)) {
    const filtered = Array.from(raw).filter((char) => FTS5_SAFE_CHAR.test(char)).join("");
    if (filtered.length > 0) {
      tokens.push(filtered);
    }
  }

  if (tokens.length === 0) {
    return null;
  }

  return tokens.map((token) => `"${token}"`).join(" OR ");
}

/**
 * Idempotent incremental sync for `search_fts` from `facets`. Inserts any
 * `(table_id, doc_id)` mapping missing from `search_fts_docs`, then inserts
 * the corresponding row into the FTS5 virtual table.
 *
 * Runs inside the caller's transaction (or queryable) and never throws —
 * silent best-effort. The caller decides whether to fall back to keyword_sql
 * if the sync fails.
 */
export async function ensureSearchFtsCaughtUp(
  queryable: Queryable,
  tableId = FACETS_SEARCH_TABLE_ID
): Promise<void> {
  try {
    await queryable.query(
      `
        INSERT OR IGNORE INTO search_documents (table_id, doc_id, content, language)
        SELECT ?, doc_id, content, 'english'
        FROM facets
        WHERE doc_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM search_documents
            WHERE table_id = ? AND doc_id = facets.doc_id
          )
      `,
      [tableId, tableId]
    );
    await queryable.query(
      `
        INSERT OR IGNORE INTO search_fts_docs (table_id, doc_id)
        SELECT ?, doc_id
        FROM facets
        WHERE doc_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM search_fts_docs
            WHERE table_id = ? AND doc_id = facets.doc_id
          )
      `,
      [tableId, tableId]
    );
    await queryable.query(
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
  } catch {
    // Sync is best-effort. Search falls back to keyword_sql if the FTS path
    // proves unavailable per call.
  }
}
