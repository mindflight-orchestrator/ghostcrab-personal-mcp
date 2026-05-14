export const SQLITE_FACT_STORE_TABLE = "facets";
export const SQLITE_FACTS_COLUMN = "facets_json";
export const SQLITE_NEXT_FACT_DOC_ID_EXPR = `(SELECT COALESCE(MAX(doc_id), 0) + 1 FROM ${SQLITE_FACT_STORE_TABLE})`;

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
