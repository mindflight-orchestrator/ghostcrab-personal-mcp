export const SQLITE_FACT_STORE_TABLE = "facets";
export const SQLITE_FACTS_COLUMN = "facets_json";
export const SQLITE_NEXT_FACT_DOC_ID_EXPR = `(SELECT COALESCE(MAX(doc_id), 0) + 1 FROM ${SQLITE_FACT_STORE_TABLE})`;

/**
 * Canonical MindBrain `bm25_sync_triggers.table_id` for the GhostCrab `facets`
 * table. Stable across versions; used as the namespace key for `search_fts_docs`,
 * `search_documents`, and `search_embeddings`.
 *
 * Document profile import (vendor/mindbrain/src/standalone/import_pipeline.zig)
 * picks table ids per-collection at runtime, so collisions are not possible
 * for fresh GhostCrab installs. If a future MindBrain release changes the
 * default table-id allocation strategy, bump this constant in a major release
 * and re-run the FTS-sync bootstrap.
 */
export const FACETS_SEARCH_TABLE_ID = 1;

export function sqliteFacetJsonExtractClause(facetKey: string): string {
  return `json_extract(${SQLITE_FACTS_COLUMN}, '$.${facetKey}')`;
}

export function sqliteFactStoreLookupWhere(
  lookupFacets: Record<string, unknown>
): {
  clause: string;
  params: unknown[];
} {
  const pairs = Object.entries(lookupFacets);
  if (pairs.length === 0) {
    return {
      clause: "",
      params: []
    };
  }

  return {
    clause: pairs
      .map(([key]) => `${sqliteFacetJsonExtractClause(key)} = ?`)
      .join(" AND "),
    params: pairs.map(([, value]) =>
      typeof value === "object" && value !== null ? JSON.stringify(value) : value
    )
  };
}

export function safeParseFacetJson(value: string | null | undefined): Record<string, unknown> {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
