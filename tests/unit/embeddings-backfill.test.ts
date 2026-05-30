import { describe, expect, it, vi } from "vitest";

import type { DatabaseClient, Queryable } from "../../src/db/client.js";
import { runBackfill } from "../../src/cli/embeddings-backfill.js";
import * as standaloneMindBrain from "../../src/db/standalone-mindbrain.js";
import { FACETS_SEARCH_TABLE_ID } from "../../src/db/fact-store.js";

function createMockDatabase(
  queryImpl: DatabaseClient["query"]
): DatabaseClient {
  return {
    query: queryImpl,
    ping: async () => true,
    close: async () => undefined,
    transaction: async (operation) => {
      const queryable: Queryable = {
        query: queryImpl
      };

      return operation(queryable);
    }
  };
}

describe("embeddings backfill", () => {
  it("supports dry-run mode without updating rows", async () => {
    const query = vi
      .fn<DatabaseClient["query"]>()
      .mockResolvedValueOnce([
        { id: "facet-1", content: "hello" },
        { id: "facet-2", content: "world" }
      ])
      .mockResolvedValueOnce([]);
    const database = createMockDatabase(query);
    const embeddings = {
      async embedMany() {
        throw new Error("should not be called");
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

    const summary = await runBackfill(database, embeddings, {
      batchSize: 2,
      dryRun: true
    });

    expect(summary).toEqual({
      failed: 0,
      scanned: 2,
      skipped: 2,
      updated: 0
    });
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("updates missing embeddings in batches", async () => {
    const query = vi
      .fn<DatabaseClient["query"]>()
      .mockResolvedValueOnce([
        { id: "facet-1", content: "hello" },
        { id: "facet-2", content: "world" }
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValue([]);
    const database = createMockDatabase(query);
    const embeddings = {
      async embedMany(texts: string[]) {
        return texts.map((text, index) =>
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

    const summary = await runBackfill(database, embeddings, {
      batchSize: 2,
      dryRun: false
    });

    expect(summary).toEqual({
      failed: 0,
      scanned: 2,
      skipped: 0,
      updated: 2
    });
    expect(
      query.mock.calls.some((call) => call[0].includes("UPDATE facets"))
    ).toBe(true);
  });

  it("targets the active embedding_blob column, not the legacy embedding column", async () => {
    const query = vi
      .fn<DatabaseClient["query"]>()
      .mockResolvedValueOnce([{ id: "facet-1", content: "hello" }])
      .mockResolvedValueOnce([])
      .mockResolvedValue([]);
    const database = createMockDatabase(query);
    const embeddings = {
      async embedMany(texts: string[]) {
        return texts.map(() => [0.1, 0.2, 0.3, 0.4]);
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

    await runBackfill(database, embeddings, {
      batchSize: 1,
      dryRun: false
    });

    const selectCalls = query.mock.calls.filter((call) =>
      call[0].includes("FROM agent_facts")
    );
    expect(selectCalls.length).toBeGreaterThan(0);
    for (const call of selectCalls) {
      expect(call[0]).toMatch(/embedding_blob\s+IS\s+NULL/);
      expect(call[0]).not.toMatch(/\bembedding\s+IS\s+NULL\b/);
    }

    const updateCalls = query.mock.calls.filter((call) =>
      call[0].includes("UPDATE facets")
    );
    expect(updateCalls.length).toBe(1);
    expect(updateCalls[0]?.[0]).toMatch(/SET\s+embedding_blob\s*=/);
    expect(updateCalls[0]?.[0]).not.toMatch(/SET\s+embedding\s*=/);
  });

  it("uses SQLite-style positional placeholders, not Postgres $N", async () => {
    const query = vi
      .fn<DatabaseClient["query"]>()
      .mockResolvedValueOnce([{ id: "facet-1", content: "hello" }])
      .mockResolvedValueOnce([])
      .mockResolvedValue([]);
    const database = createMockDatabase(query);
    const embeddings = {
      async embedMany(texts: string[]) {
        return texts.map(() => [0.1, 0.2, 0.3, 0.4]);
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

    await runBackfill(database, embeddings, {
      batchSize: 1,
      dryRun: false
    });

    for (const call of query.mock.calls) {
      expect(call[0]).not.toMatch(/\$\d+/);
      expect(call[0]).not.toMatch(/::vector/);
    }
  });

  it("mirrors each backfilled embedding into search_embeddings", async () => {
    // Guards the Bug-A regression for the backfill path: every row that gets
    // an embedding_blob written must also be synced into search_embeddings so
    // the MindBrain native hybrid engine can find it.
    const upsertSpy = vi
      .spyOn(standaloneMindBrain, "runStandaloneSearchEmbeddingUpsert")
      .mockResolvedValue(undefined);

    const query = vi
      .fn<DatabaseClient["query"]>()
      .mockResolvedValueOnce([
        { id: "facet-1", doc_id: 1, content: "hello" },
        { id: "facet-2", doc_id: 2, content: "world" }
      ])
      .mockResolvedValueOnce([]) // second batch → empty → stops loop
      .mockResolvedValue([]); // UPDATE calls inside tx
    const database = createMockDatabase(query);
    const embeddings = {
      async embedMany(texts: string[]) {
        return texts.map((_, i) =>
          i === 0 ? [0.1, 0.2, 0.3, 0.4] : [0.5, 0.6, 0.7, 0.8]
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

    await runBackfill(database, embeddings, { batchSize: 2, dryRun: false });

    expect(upsertSpy).toHaveBeenCalledTimes(2);
    expect(upsertSpy.mock.calls[0]?.[0]).toMatchObject({
      tableId: FACETS_SEARCH_TABLE_ID,
      docId: 1,
      embedding: [0.1, 0.2, 0.3, 0.4]
    });
    expect(upsertSpy.mock.calls[1]?.[0]).toMatchObject({
      tableId: FACETS_SEARCH_TABLE_ID,
      docId: 2,
      embedding: [0.5, 0.6, 0.7, 0.8]
    });

    upsertSpy.mockRestore();
  });

  it("counts search_embeddings sync failures in summary.failed", async () => {
    // Guards that a MindBrain sync failure does not abort the backfill but IS
    // counted so operators know the sync is degraded.
    const upsertSpy = vi
      .spyOn(standaloneMindBrain, "runStandaloneSearchEmbeddingUpsert")
      .mockRejectedValue(new Error("MindBrain unreachable"));

    const query = vi
      .fn<DatabaseClient["query"]>()
      .mockResolvedValueOnce([{ id: "facet-1", doc_id: 1, content: "hello" }])
      .mockResolvedValueOnce([])
      .mockResolvedValue([]);
    const database = createMockDatabase(query);
    const embeddings = {
      async embedMany(texts: string[]) {
        return texts.map(() => [0.1, 0.2, 0.3, 0.4]);
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

    const summary = await runBackfill(database, embeddings, {
      batchSize: 1,
      dryRun: false
    });

    expect(summary.updated).toBe(1); // facets was updated
    expect(summary.failed).toBe(1); // sync counted as failure
    upsertSpy.mockRestore();
  });

  it("is a no-op when every row already has an embedding_blob", async () => {
    const query = vi
      .fn<DatabaseClient["query"]>()
      .mockResolvedValueOnce([])
      .mockResolvedValue([]);
    const database = createMockDatabase(query);
    const embeddings = {
      async embedMany() {
        throw new Error("should not be called when nothing needs backfill");
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

    const summary = await runBackfill(database, embeddings, {
      batchSize: 50,
      dryRun: false
    });

    expect(summary).toEqual({
      failed: 0,
      scanned: 0,
      skipped: 0,
      updated: 0
    });
    expect(query).toHaveBeenCalledTimes(1);
  });
});
