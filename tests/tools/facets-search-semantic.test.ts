import { afterEach, describe, expect, it, vi } from "vitest";

import type { DatabaseClient, Queryable } from "../../src/db/client.js";
import { encodeEmbedding } from "../../src/embeddings/blob.js";
import { createDeterministicUnitVector } from "../../src/embeddings/vector.js";
import { setFactsFtsReady } from "../../src/runtime/facets-fts-state.js";
import { searchTool } from "../../src/tools/facets/search.js";
import { createToolContext } from "../helpers/tool-context.js";

const FIXED_CREATED_AT_UNIX = Date.parse("2026-03-23T12:00:00.000Z") / 1000;
const FAKE_DIMENSIONS = 8;

interface SeedRow {
  id: string;
  schema_id: string;
  content: string;
  facets_json: string;
  created_at_unix: number;
  version: number;
  embedding_blob: string | null;
}

function seedRow(
  id: string,
  content: string,
  options?: { embedded?: boolean }
): SeedRow {
  const embedded = options?.embedded ?? true;
  return {
    id,
    schema_id: "agent:observation",
    content,
    facets_json: JSON.stringify({ domain: "product" }),
    created_at_unix: FIXED_CREATED_AT_UNIX,
    version: 1,
    embedding_blob: embedded
      ? encodeEmbedding(createDeterministicUnitVector(content, FAKE_DIMENSIONS))
      : null
  };
}

function createMockDatabase(
  queryImpl: DatabaseClient["query"]
): DatabaseClient {
  return {
    query: queryImpl,
    ping: async () => true,
    close: async () => undefined,
    transaction: async (operation) => {
      const queryable: Queryable = { query: queryImpl };
      return operation(queryable);
    }
  };
}

function readStructured(
  result: Awaited<ReturnType<typeof searchTool.handler>>
): Record<string, unknown> {
  expect(result.structuredContent).toBeDefined();
  return result.structuredContent as Record<string, unknown>;
}

interface ResultRow {
  id: string;
  content: string;
  score: number;
}

describe("ghostcrab_search semantic and hybrid (fake embeddings)", () => {
  afterEach(() => {
    setFactsFtsReady(false);
  });

  it("ranks the closest semantic match first when mode=semantic", async () => {
    const exactMatch = seedRow("facet-exact", "The semantic anchor sentence");
    const distractor = seedRow(
      "facet-distractor",
      "Completely unrelated administrative paperwork"
    );

    const query = vi.fn<DatabaseClient["query"]>(async (sql) => {
      if (sql.includes("embedding_blob IS NOT NULL")) {
        return [exactMatch, distractor];
      }
      return [];
    });
    const database = createMockDatabase(query);

    const result = await searchTool.handler(
      {
        query: "The semantic anchor sentence",
        mode: "semantic",
        limit: 5
      },
      createToolContext(database, {
        embeddingsMode: "fake",
        embeddingDimensions: FAKE_DIMENSIONS
      })
    );

    const payload = readStructured(result) as Record<string, unknown> & {
      results: ResultRow[];
      notes?: string[];
    };

    expect(payload.mode_requested).toBe("semantic");
    expect(payload.mode_applied).toBe("semantic");
    expect(payload.semantic_available).toBe(true);
    expect(payload.results.map((row) => row.id)).toEqual([
      "facet-exact",
      "facet-distractor"
    ]);
    expect(payload.results[0]?.score ?? 0).toBeGreaterThan(
      payload.results[1]?.score ?? 0
    );
    expect(payload.results[0]?.score ?? 0).toBeCloseTo(1, 5);
  });

  it("falls back gracefully when no candidate row has an embedding", async () => {
    const noEmbedding = seedRow(
      "facet-none",
      "This row was never embedded",
      { embedded: false }
    );

    const query = vi.fn<DatabaseClient["query"]>(async (sql) => {
      if (sql.includes("embedding_blob IS NOT NULL")) {
        return [];
      }
      if (sql.includes("FROM facets")) {
        return [{ ...noEmbedding, score: 0.42 }];
      }
      return [];
    });
    const database = createMockDatabase(query);

    const result = await searchTool.handler(
      {
        query: "This row was never embedded",
        mode: "semantic",
        limit: 5
      },
      createToolContext(database, {
        embeddingsMode: "fake",
        embeddingDimensions: FAKE_DIMENSIONS
      })
    );

    const payload = readStructured(result) as Record<string, unknown> & {
      notes?: string[];
    };
    expect(payload.mode_applied).toBe("keyword_sql");
    expect(payload.semantic_available).toBe(false);
    expect(payload.notes).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "Semantic ranking found no rows with usable embeddings"
        )
      ])
    );
  });

  it("blends BM25 and cosine for mode=hybrid when both layers are available", async () => {
    setFactsFtsReady(true);

    const ftsTopBm25 = seedRow(
      "facet-bm25",
      "term term term term term phrase"
    );
    const ftsCosineWinner = seedRow(
      "facet-cosine",
      "shared semantic anchor reference"
    );

    const query = vi.fn<DatabaseClient["query"]>(async (sql) => {
      if (sql.includes("search_fts MATCH") && sql.includes("embedding_blob")) {
        return [
          { ...ftsTopBm25, score: -2 },
          { ...ftsCosineWinner, score: -1 }
        ];
      }
      return [];
    });
    const database = createMockDatabase(query);

    // Use the cosine winner's content as the query so cosine ~= 1 for it.
    // Heavy vector weight makes the cosine layer dominate even if the
    // deterministic-but-arbitrary vector for the BM25 leader happens to land
    // close to the query vector.
    const result = await searchTool.handler(
      {
        query: ftsCosineWinner.content,
        mode: "hybrid",
        limit: 5
      },
      createToolContext(database, {
        embeddingsMode: "fake",
        embeddingDimensions: FAKE_DIMENSIONS,
        hybridBm25Weight: 0.1,
        hybridVectorWeight: 0.9
      })
    );

    const payload = readStructured(result) as Record<string, unknown> & {
      results: ResultRow[];
      notes?: string[];
    };
    expect(payload.mode_requested).toBe("hybrid");
    expect(payload.mode_applied).toBe("hybrid");
    expect(payload.semantic_available).toBe(true);
    // With vector_weight=0.7 the cosine winner outranks the BM25 winner.
    expect(payload.results[0]?.id).toBe("facet-cosine");
    expect(payload.results[1]?.id).toBe("facet-bm25");
  });

  it("flips to BM25-only when hybrid candidates have no embeddings", async () => {
    setFactsFtsReady(true);

    const a = seedRow("facet-a", "alpha beta gamma", { embedded: false });
    const b = seedRow("facet-b", "delta epsilon zeta", { embedded: false });

    const query = vi.fn<DatabaseClient["query"]>(async (sql) => {
      if (sql.includes("search_fts MATCH") && sql.includes("embedding_blob")) {
        return [
          { ...a, score: -1 },
          { ...b, score: -2 }
        ];
      }
      return [];
    });
    const database = createMockDatabase(query);

    const result = await searchTool.handler(
      {
        query: "alpha beta",
        mode: "hybrid",
        limit: 5
      },
      createToolContext(database, {
        embeddingsMode: "fake",
        embeddingDimensions: FAKE_DIMENSIONS
      })
    );

    const payload = readStructured(result) as Record<string, unknown> & {
      notes?: string[];
    };
    expect(payload.mode_applied).toBe("hybrid");
    expect(payload.semantic_available).toBe(false);
    expect(payload.notes).toEqual(
      expect.arrayContaining([
        expect.stringContaining("no candidate row had a usable embedding")
      ])
    );
  });

  it("reports semantic_available=false when the embedding provider is disabled", async () => {
    const seedNoFts = seedRow("facet-x", "filler text content");

    const query = vi.fn<DatabaseClient["query"]>(async (sql) => {
      if (sql.includes("FROM facets")) {
        return [{ ...seedNoFts, score: 0.5 }];
      }
      return [];
    });
    const database = createMockDatabase(query);

    const result = await searchTool.handler(
      {
        query: "filler",
        mode: "semantic",
        limit: 5
      },
      createToolContext(database)
    );

    const payload = readStructured(result) as Record<string, unknown> & {
      notes?: string[];
    };
    expect(payload.mode_applied).toBe("keyword_sql");
    expect(payload.semantic_available).toBe(false);
    expect(payload.notes).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "Semantic mode unavailable: no embedding provider is configured"
        )
      ])
    );
  });
});
