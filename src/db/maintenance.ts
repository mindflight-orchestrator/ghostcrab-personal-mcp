import type { DatabaseClient } from "./client.js";
import type { ExtensionCapabilities } from "./extension-probe.js";

/**
 * After facet writes: merge pg_facets delta bitmaps when the table is registered.
 * Safe no-op if pg_facets is absent or facets is not indexed.
 */
export async function mergeFacetDeltasIfNeeded(
  database: DatabaseClient,
  extensions: ExtensionCapabilities
): Promise<void> {
  if (!extensions.pgFacets) {
    return;
  }

  try {
    await database.query(`
      SELECT facets.merge_deltas('facets'::regclass)
    `);
  } catch {
    /* not registered or not applicable */
  }
}

export interface RefreshEntityDegreeReport {
  ok: boolean;
  refreshed: boolean;
  skipped: boolean;
  reason?: string;
}

/**
 * Refresh pg_dgraph hub-degree stats (expensive; call from cron / batch jobs).
 * Returns a structured result for CLI / diagnostics; does not throw on refresh failure.
 */
export async function refreshEntityDegreeWithReport(
  database: DatabaseClient,
  extensions: ExtensionCapabilities
): Promise<RefreshEntityDegreeReport> {
  if (!extensions.pgDgraph) {
    return {
      ok: true,
      refreshed: false,
      skipped: true,
      reason: "pg_dgraph_not_loaded"
    };
  }

  try {
    await database.query(`
      REFRESH MATERIALIZED VIEW CONCURRENTLY graph.entity_degree
    `);
    return { ok: true, refreshed: true, skipped: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      refreshed: false,
      skipped: false,
      reason: message
    };
  }
}

/**
 * Refresh pg_dgraph hub-degree stats (expensive; call from cron / batch jobs).
 * Swallows errors (legacy behavior for post-write hooks).
 */
export async function refreshEntityDegreeIfNeeded(
  database: DatabaseClient,
  extensions: ExtensionCapabilities
): Promise<void> {
  await refreshEntityDegreeWithReport(database, extensions);
}
