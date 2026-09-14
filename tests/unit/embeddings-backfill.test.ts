import { afterEach, describe, expect, it, vi } from "vitest";

import { runBackfill } from "../../src/cli/embeddings-backfill.js";
import type { DatabaseClient, Queryable } from "../../src/db/client.js";
import { FACETS_SEARCH_TABLE_ID } from "../../src/db/fact-store.js";
import * as standaloneMindBrain from "../../src/db/standalone-mindbrain.js";

function database(queryImpl: DatabaseClient["query"]): DatabaseClient {
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

const provider = {
  async embedMany(texts: string[]) {
    return texts.map((_, index) =>
      index === 0 ? [0.1, 0.2, 0.3, 0.4] : [0.5, 0.6, 0.7, 0.8]
    );
  },
  getStatus() {
    return {
      available: true,
      dimensions: 4,
      mode: "fake" as const,
      note: "Fake",
      vectorSearchReady: true,
      writeEmbeddingsEnabled: true
    };
  }
};

describe("embeddings backfill native boundary", () => {
  afterEach(() => vi.restoreAllMocks());

  it("pages through dry-run rows without calling the provider or native writer", async () => {
    const query = vi
      .fn<DatabaseClient["query"]>()
      .mockResolvedValueOnce([
        { id: "facet-1", doc_id: 1, content: "hello" },
        { id: "facet-2", doc_id: 2, content: "world" }
      ])
      .mockResolvedValueOnce([{ id: "facet-3", doc_id: 3, content: "again" }])
      .mockResolvedValueOnce([]);
    const embedMany = vi.fn(async () => {
      throw new Error("should not be called");
    });
    const batch = vi.spyOn(
      standaloneMindBrain,
      "runStandaloneSearchEmbeddingBatchUpsert"
    );

    const summary = await runBackfill(
      database(query),
      { ...provider, embedMany },
      { batchSize: 2, dryRun: true }
    );

    expect(summary).toEqual({ failed: 0, scanned: 3, skipped: 3, updated: 0 });
    expect(embedMany).not.toHaveBeenCalled();
    expect(batch).not.toHaveBeenCalled();
    expect(query.mock.calls.map((call) => call[1]?.at(-1))).toEqual([0, 2, 3]);
  });

  it("sends one native transaction per provider batch", async () => {
    const query = vi
      .fn<DatabaseClient["query"]>()
      .mockResolvedValueOnce([
        { id: "facet-1", doc_id: 1, content: "hello" },
        { id: "facet-2", doc_id: 2, content: "world" }
      ])
      .mockResolvedValueOnce([]);
    const batch = vi
      .spyOn(standaloneMindBrain, "runStandaloneSearchEmbeddingBatchUpsert")
      .mockResolvedValue({ ok: true, processed: 2, dimensions: 4 });

    const summary = await runBackfill(database(query), provider, {
      batchSize: 2,
      dryRun: false
    });

    expect(summary).toEqual({ failed: 0, scanned: 2, skipped: 0, updated: 2 });
    expect(batch).toHaveBeenCalledOnce();
    expect(batch.mock.calls[0]?.[0].items).toEqual([
      {
        tableId: FACETS_SEARCH_TABLE_ID,
        docId: 1,
        embedding: [0.1, 0.2, 0.3, 0.4]
      },
      {
        tableId: FACETS_SEARCH_TABLE_ID,
        docId: 2,
        embedding: [0.5, 0.6, 0.7, 0.8]
      }
    ]);
    expect(query.mock.calls.some((call) => call[0].includes("UPDATE"))).toBe(
      false
    );
  });

  it("selects rows missing from the native vector index", async () => {
    const query = vi.fn<DatabaseClient["query"]>().mockResolvedValue([]);

    await runBackfill(database(query), provider, {
      batchSize: 10,
      dryRun: false,
      schemaId: "agent:observation"
    });

    const [sql, params] = query.mock.calls[0] ?? [];
    expect(sql).toContain("NOT EXISTS");
    expect(sql).toContain("FROM search_embeddings indexed");
    expect(sql).not.toContain("embedding_blob");
    expect(sql).not.toMatch(/\$\d+/);
    expect(params).toEqual([
      FACETS_SEARCH_TABLE_ID,
      "agent:observation",
      10,
      0
    ]);
  });

  it("fails the batch instead of reporting vectors that MindBrain did not store", async () => {
    const query = vi
      .fn<DatabaseClient["query"]>()
      .mockResolvedValueOnce([{ id: "facet-1", doc_id: 1, content: "hello" }]);
    vi.spyOn(
      standaloneMindBrain,
      "runStandaloneSearchEmbeddingBatchUpsert"
    ).mockRejectedValue(new Error("MindBrain unreachable"));

    await expect(
      runBackfill(database(query), provider, { batchSize: 1, dryRun: false })
    ).rejects.toThrow("MindBrain unreachable");
  });
});
