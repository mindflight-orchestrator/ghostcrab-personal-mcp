import type { Queryable } from "./client.js";
import { FACETS_SEARCH_TABLE_ID } from "./fact-store.js";

/**
 * Helpers for the per-request usage of MindBrain's FTS5 surface against the
 * GhostCrab `agent_facts` table. The one-shot bootstrap that registers
 * `agent_facts` with `bm25_sync_triggers` and seeds historical rows lives in
 * `./facets-fts-sync.ts`. This module only does the per-request work:
 *
 *  - normalising free-text into an FTS5 MATCH expression that survives FTS5's
 *    grammar (no caller can crash the search by typing punctuation),
 *  - catching up `search_fts` for any `agent_facts.doc_id` that landed since
 *    the bootstrap (cheap: one INSERT … SELECT … NOT EXISTS).
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
    const filtered = Array.from(raw)
      .filter((char) => FTS5_SAFE_CHAR.test(char))
      .join("");
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
 * Idempotent incremental sync for `search_fts` from `agent_facts`. Inserts any
 * `(table_id, doc_id)` mapping missing from `search_fts_docs`, then inserts
 * the corresponding row into the FTS5 virtual table.
 *
 * Runs inside the caller's transaction (or queryable). Best-effort: on failure
 * it logs the reason on stderr (it no longer swallows errors silently) and the
 * caller falls back to keyword_sql for that call.
 */
export async function ensureSearchFtsCaughtUp(
  queryable: Queryable,
  tableId = FACETS_SEARCH_TABLE_ID
): Promise<void> {
  try {
    await queryable.query(
      `
        INSERT OR IGNORE INTO search_documents (table_id, doc_id, content, language)
        SELECT ?, f.doc_id, f.content, 'english'
        FROM agent_facts AS f
        WHERE f.doc_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM search_documents sd
            WHERE sd.table_id = ? AND sd.doc_id = f.doc_id
          )
      `,
      [tableId, tableId]
    );
    await queryable.query(
      `
        INSERT OR IGNORE INTO search_fts_docs (table_id, doc_id)
        SELECT ?, f.doc_id
        FROM agent_facts AS f
        WHERE f.doc_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM search_fts_docs sfd
            WHERE sfd.table_id = ? AND sfd.doc_id = f.doc_id
          )
      `,
      [tableId, tableId]
    );
    await queryable.query(
      `
        INSERT INTO search_fts (rowid, content)
        SELECT sd.fts_rowid, f.content
        FROM search_fts_docs sd
        JOIN agent_facts f ON f.doc_id = sd.doc_id
        WHERE sd.table_id = ?
          AND NOT EXISTS (
            SELECT 1 FROM search_fts WHERE rowid = sd.fts_rowid
          )
      `,
      [tableId]
    );
  } catch (error) {
    // Sync is best-effort: search falls back to keyword_sql if the FTS path
    // proves unavailable per call. We still surface the reason on stderr so a
    // broken catch-up (e.g. a schema/column mismatch) cannot fail silently and
    // leave freshly written facts invisible to BM25.
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `[ghostcrab] ensureSearchFtsCaughtUp failed (table_id=${tableId}) — keyword_sql fallback active for this call. Reason: ${message}`
    );
  }
}
