import { describe, expect, it, vi } from "vitest";

import type { Queryable } from "../../src/db/client.js";
import { discoverWorkspaceReindexTargets } from "../../src/db/reindex-workspace.js";

function createQueryable(queryImpl: Queryable["query"]): Queryable {
  return { query: queryImpl };
}

describe("discoverWorkspaceReindexTargets", () => {
  it("returns targets from collections joined to facet_tables", async () => {
    const query = vi.fn<Queryable["query"]>(async (sql) => {
      if (sql.includes("FROM collections c")) {
        return [
          { collection_id: "ws::docs", table_id: 42 },
          { collection_id: "ws::archive", table_id: 43 }
        ];
      }
      if (sql.includes("FROM collections") && sql.includes("collection_id")) {
        return [
          { collection_id: "ws::docs" },
          { collection_id: "ws::archive" },
          { collection_id: "ws::orphan" }
        ];
      }
      return [];
    });

    const discovery = await discoverWorkspaceReindexTargets(
      createQueryable(query),
      "ws"
    );

    expect(discovery.source).toBe("collections");
    expect(discovery.targets).toEqual([
      { collection_id: "ws::docs", table_id: 42 },
      { collection_id: "ws::archive", table_id: 43 }
    ]);
    expect(discovery.skipped_collections).toEqual(["ws::orphan"]);
  });

  it("falls back to documents_raw when collections have no facet_tables match", async () => {
    const query = vi.fn<Queryable["query"]>(async (sql) => {
      if (sql.includes("FROM collections c")) {
        return [];
      }
      if (sql.includes("FROM documents_raw dr")) {
        return [{ collection_id: "ws::docs", table_id: 99 }];
      }
      if (sql.includes("FROM collections") && sql.includes("collection_id")) {
        return [];
      }
      if (sql.includes("FROM documents_raw") && sql.includes("DISTINCT")) {
        return [
          { collection_id: "ws::docs" },
          { collection_id: "ws::missing-facet" }
        ];
      }
      return [];
    });

    const discovery = await discoverWorkspaceReindexTargets(
      createQueryable(query),
      "ws"
    );

    expect(discovery.source).toBe("documents_raw");
    expect(discovery.targets).toEqual([
      { collection_id: "ws::docs", table_id: 99 }
    ]);
    expect(discovery.skipped_collections).toEqual(["ws::missing-facet"]);
  });

  it("reports skipped collections when facet_tables registration is missing", async () => {
    const query = vi.fn<Queryable["query"]>(async (sql) => {
      if (sql.includes("FROM collections c")) {
        return [];
      }
      if (sql.includes("FROM documents_raw dr")) {
        return [];
      }
      if (sql.includes("FROM collections") && sql.includes("collection_id")) {
        return [{ collection_id: "ws::unregistered" }];
      }
      return [];
    });

    const discovery = await discoverWorkspaceReindexTargets(
      createQueryable(query),
      "ws"
    );

    expect(discovery.targets).toEqual([]);
    expect(discovery.skipped_collections).toEqual(["ws::unregistered"]);
  });
});
