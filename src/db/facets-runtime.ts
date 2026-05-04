import type { DatabaseClient } from "./client.js";

export interface PgFacetsTableStatus {
  hasBm25: boolean;
  hasDelta: boolean;
  registered: boolean;
}

export async function getPgFacetsTableStatus(
  database: DatabaseClient,
  qualifiedName = "public.facets"
): Promise<PgFacetsTableStatus> {
  const [row] = await database.query<{
    has_bm25: boolean;
    has_delta: boolean;
  }>(
    `
      SELECT has_bm25, has_delta
      FROM facets.list_tables()
      WHERE qualified_name = $1
      LIMIT 1
    `,
    [qualifiedName]
  );

  return {
    registered: row !== undefined,
    hasBm25: row?.has_bm25 ?? false,
    hasDelta: row?.has_delta ?? false
  };
}
