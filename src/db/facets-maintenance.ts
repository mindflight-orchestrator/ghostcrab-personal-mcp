import type { DatabaseClient } from "./client.js";
import type { ExtensionCapabilities } from "./extension-probe.js";

export interface MergeFacetDeltasReport {
  ok: boolean;
  merged: boolean;
  skipped: boolean;
  reason?: string;
}

/**
 * Apply pending facet deltas for `facets` via pg_facets (SQL wrapper around apply_deltas).
 * Idempotent; safe to run periodically after bulk facet writes.
 */
export async function mergeFacetDeltasWithReport(
  database: DatabaseClient,
  extensions: ExtensionCapabilities
): Promise<MergeFacetDeltasReport> {
  if (!extensions.pgFacets) {
    return {
      ok: true,
      merged: false,
      skipped: true,
      reason: "pg_facets_not_loaded"
    };
  }

  try {
    await database.query(
      `SELECT facets.merge_deltas('public.facets'::regclass)`
    );
    return {
      ok: true,
      merged: true,
      skipped: false
    };
  } catch (error) {
    return {
      ok: false,
      merged: false,
      skipped: false,
      reason: error instanceof Error ? error.message : String(error)
    };
  }
}
