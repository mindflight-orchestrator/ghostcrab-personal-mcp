import { describe, expect, it, vi } from "vitest";

import type { DatabaseClient, Queryable } from "../../src/db/client.js";
import { runBackfill } from "../../src/cli/embeddings-backfill.js";

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
});
