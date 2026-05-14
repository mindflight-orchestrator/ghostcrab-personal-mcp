import type { DatabaseClient } from "./client.js";

/**
 * SQLite path stores embeddings as JSON-encoded TEXT (no declared dimension).
 * Always returns null; kept as a stable hook so callers don't crash.
 */
export async function getFacetsEmbeddingColumnDimension(
  _database: DatabaseClient
): Promise<number | null> {
  return null;
}
