/**
 * Process-wide cache of whether the MindBrain FTS5 surface is wired and
 * registered for the GhostCrab `facets` table.
 *
 * Set once by the server-startup bootstrap (`ensureFactsFtsSync` in
 * `src/db/facets-fts-sync.ts`); consulted by `ghostcrab_search`,
 * `ghostcrab_pack`, and `ghostcrab_status` to decide between the FTS5 BM25
 * path and the keyword_sql fallback.
 *
 * Defaulting to `false` keeps the system honest: until the bootstrap proves
 * the FTS surface, every search reports `keyword_sql`.
 */
let factsFtsReady = false;

export function setFactsFtsReady(value: boolean): void {
  factsFtsReady = value;
}

export function isFactsFtsReady(): boolean {
  return factsFtsReady;
}
