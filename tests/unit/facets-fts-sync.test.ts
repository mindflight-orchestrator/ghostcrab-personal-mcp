import { describe, expect, it, vi } from "vitest";

import type { DatabaseClient, Queryable } from "../../src/db/client.js";
import { ensureFactsFtsSync } from "../../src/db/facets-fts-sync.js";
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

describe("ensureFactsFtsSync", () => {
  it("skips and reports an error when the FTS surface is missing", async () => {
    const query = vi
      .fn<DatabaseClient["query"]>()
      .mockResolvedValueOnce([{ name: "facets" }]); // sqlite_master probe — only facets, no FTS tables
    const database = createMockDatabase(query);

    const summary = await ensureFactsFtsSync(database);

    expect(summary.ready).toBe(false);
    expect(summary.error).toMatch(/MindBrain FTS5 surface .* missing/);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("registers facets in bm25_sync_triggers and backfills search_fts", async () => {
    const counters = {
      registrationProbe: 0,
      searchDocuments: 0,
      searchFtsDocs: 0,
      searchFts: 0
    };
    const query = vi.fn<DatabaseClient["query"]>(async (sql) => {
      if (sql.includes("FROM sqlite_master")) {
        return [
          { name: "search_fts" },
          { name: "search_fts_docs" },
          { name: "search_documents" },
          { name: "bm25_sync_triggers" }
        ];
      }
      if (
        sql.includes("FROM bm25_sync_triggers") &&
        sql.includes("table_id = ?")
      ) {
        counters.registrationProbe += 1;
        // The probe is hit twice: once inside the transaction (pre-INSERT, must
        // be empty so we report registered=true), and once after the
        // transaction commits (must be non-empty for ready=true).
        return counters.registrationProbe === 1 ? [] : [{ ok: 1 }];
      }
      if (sql.includes("FROM search_documents")) {
        counters.searchDocuments += 1;
        return [{ c: counters.searchDocuments === 1 ? 0 : 2 }];
      }
      if (sql.includes("FROM search_fts_docs")) {
        counters.searchFtsDocs += 1;
        return [{ c: counters.searchFtsDocs === 1 ? 0 : 2 }];
      }
      if (sql.includes("COUNT(*) AS c FROM search_fts")) {
        counters.searchFts += 1;
        return [{ c: counters.searchFts === 1 ? 0 : 2 }];
      }
      return [];
    });

    const database = createMockDatabase(query);
    const summary = await ensureFactsFtsSync(database);

    expect(summary.ready).toBe(true);
    expect(summary.registered).toBe(true);
    expect(summary.documentsInserted).toBe(2);
    expect(summary.ftsDocsInserted).toBe(2);
    expect(summary.ftsRowsInserted).toBe(2);
    expect(summary.error).toBeNull();

    const registrationCall = query.mock.calls.find((call) =>
      call[0].includes("INSERT OR IGNORE INTO bm25_sync_triggers")
    );
    expect(registrationCall).toBeDefined();
    expect(registrationCall?.[1]).toEqual([
      FACETS_SEARCH_TABLE_ID,
      "doc_id",
      "content",
      "english"
    ]);
  });

  it("returns a non-fatal failure when the registration probe stays empty", async () => {
    const query = vi.fn<DatabaseClient["query"]>(async (sql) => {
      if (sql.includes("FROM sqlite_master")) {
        return [
          { name: "search_fts" },
          { name: "search_fts_docs" },
          { name: "search_documents" },
          { name: "bm25_sync_triggers" }
        ];
      }
      if (sql.includes("FROM bm25_sync_triggers")) {
        return []; // Always empty — the registration is silently dropped.
      }
      if (sql.includes("FROM search_documents")) {
        return [{ c: 0 }];
      }
      if (sql.includes("FROM search_fts_docs")) {
        return [{ c: 0 }];
      }
      if (sql.includes("COUNT(*) AS c FROM search_fts")) {
        return [{ c: 0 }];
      }
      return [];
    });
    const database = createMockDatabase(query);

    const summary = await ensureFactsFtsSync(database);

    expect(summary.ready).toBe(false);
    expect(summary.error).toMatch(/not visible after registration/);
  });

  it("captures unexpected SQL errors as a non-fatal summary", async () => {
    const query = vi
      .fn<DatabaseClient["query"]>()
      .mockResolvedValueOnce([
        { name: "search_fts" },
        { name: "search_fts_docs" },
        { name: "search_documents" },
        { name: "bm25_sync_triggers" }
      ])
      .mockRejectedValueOnce(new Error("boom"));
    const database = createMockDatabase(query);

    const summary = await ensureFactsFtsSync(database);

    expect(summary.ready).toBe(false);
    expect(summary.error).toBe("boom");
  });
});
