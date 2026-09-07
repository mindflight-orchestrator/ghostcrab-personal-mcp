/**
 * Temporal validity window for agent facts (SQLite flavour).
 *
 * A fact row is *current* when now falls inside [valid_from_unix,
 * valid_until_unix): `valid_from_unix` is NULL on rows written before the
 * column was wired, and `valid_until_unix` is NULL for facts that never expire.
 *
 * Closing a row by setting `valid_until_unix` to now removes it from every read
 * path at once — this is how ghostcrab_upsert retires the archived copy of a
 * superseded state without deleting anything.
 *
 * Mirrors src/db/temporal.ts in ghostcrab-mcp; the columns are epoch seconds
 * here and DATE there, so the shape is the same but the expressions are not.
 */
export function activeFactWindowSql(alias?: string): string {
  const column = alias ? `${alias}.` : "";
  return (
    `(${column}valid_until_unix IS NULL OR ${column}valid_until_unix > strftime('%s','now'))` +
    ` AND (${column}valid_from_unix IS NULL OR ${column}valid_from_unix <= strftime('%s','now'))`
  );
}

/** Unaliased window, for queries with a single fact-store table in scope. */
export const ACTIVE_FACT_WINDOW_SQL = activeFactWindowSql();

/**
 * Rows that are not closed, i.e. everything except retired history.
 *
 * This is the *write-side* and *index-side* selector, deliberately narrower
 * than the read window above: it drops the `valid_from` half.
 *
 * - `ghostcrab_upsert` must never select an archive as the row to mutate — an
 *   archive carries the facets of a state that is over, so matching on one of
 *   them (`status:"todo"` after the move to `done`) would silently rewrite
 *   history and report success while no read changes.
 * - The BM25 corpus must not carry archives either: reads filter them out, but
 *   an indexed archive still skews FTS5 term statistics and eats slots in the
 *   engine's top-K before the read filter runs.
 *
 * Keeping `valid_from` out is intentional in both cases: a fact dated in the
 * future is not yet readable, but it is still the current row for its record —
 * `upsert` must be able to correct it, and it must enter the index so it is
 * searchable the day it opens.
 */
export function openFactRowSql(alias?: string): string {
  const column = alias ? `${alias}.` : "";
  return `(${column}valid_until_unix IS NULL OR ${column}valid_until_unix > strftime('%s','now'))`;
}

/** Unaliased open-row selector, for queries with a single fact table in scope. */
export const OPEN_FACT_ROW_SQL = openFactRowSql();

/**
 * Instant at which an archived row is closed.
 *
 * MAX guards the case of a fact whose validity starts in the future: closing it
 * at "now" would produce valid_until < valid_from, an interval that reads as
 * corrupt. SQLite has no CHECK constraint on this table to catch it, unlike
 * Postgres, so the guard is the only line of defence.
 *
 * The CAST is not cosmetic. `strftime('%s','now')` returns TEXT, and the two
 * uses of it here are not equivalent:
 *
 * - In the window above the TEXT is compared against `valid_until_unix`, a
 *   column with INTEGER affinity, so SQLite converts it to a number first and
 *   the comparison is correct.
 * - MAX() is a scalar function and applies no affinity: it orders by storage
 *   class, where every INTEGER sorts before every TEXT. `MAX(int, text)` would
 *   therefore always return the text, silently closing every archive at "now"
 *   and defeating the guard exactly when it is needed.
 */
export const ARCHIVE_CLOSE_UNIX_EXPR =
  "MAX(COALESCE(valid_from_unix, CAST(strftime('%s','now') AS INTEGER))," +
  " CAST(strftime('%s','now') AS INTEGER))";
