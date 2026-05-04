import type { DatabaseClient } from "./client.js";

/**
 * Reads the declared pgvector dimension for facets.embedding from the catalog.
 * Returns null if the column is missing (e.g. migrations not applied).
 */
export async function getFacetsEmbeddingColumnDimension(
  database: DatabaseClient
): Promise<number | null> {
  if (database.kind === "sqlite") {
    return null;
  }

  const rows = await database.query<{ pg_type: string }>(
    `
      SELECT pg_catalog.format_type(a.atttypid, a.atttypmod) AS pg_type
      FROM pg_catalog.pg_attribute a
      JOIN pg_catalog.pg_class c ON a.attrelid = c.oid
      JOIN pg_catalog.pg_namespace n ON c.relnamespace = n.oid
      WHERE n.nspname = 'public'
        AND c.relname = 'facets'
        AND a.attname = 'embedding'
        AND a.attnum > 0
        AND NOT a.attisdropped
    `
  );

  const pgType = rows[0]?.pg_type?.trim();
  if (!pgType) {
    return null;
  }

  const match = /^vector\((\d+)\)$/i.exec(pgType);
  return match ? Number(match[1]) : null;
}
