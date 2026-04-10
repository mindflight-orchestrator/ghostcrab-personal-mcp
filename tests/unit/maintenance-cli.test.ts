import { describe, expect, it, vi } from "vitest";

import type { DatabaseClient } from "../../src/db/client.js";
import type { ExtensionCapabilities } from "../../src/db/extension-probe.js";
import { refreshEntityDegreeWithReport } from "../../src/db/maintenance.js";

function mockDb(queryFn?: DatabaseClient["query"]): DatabaseClient {
  return {
    query: queryFn ?? vi.fn(async () => []),
    ping: async () => true,
    close: async () => undefined,
    transaction: async (op) => op({ query: vi.fn(async () => []) })
  };
}

describe("refreshEntityDegreeWithReport", () => {
  it("skips when pg_dgraph is not loaded", async () => {
    const db = mockDb();
    const extensions: ExtensionCapabilities = {
      pgFacets: false,
      pgDgraph: false,
      pgPragma: false
    };

    const report = await refreshEntityDegreeWithReport(db, extensions);

    expect(report).toEqual({
      ok: true,
      refreshed: false,
      skipped: true,
      reason: "pg_dgraph_not_loaded"
    });
    expect(db.query).not.toHaveBeenCalled();
  });

  it("refreshes successfully when pg_dgraph is loaded", async () => {
    const queryFn = vi.fn(async () => []);
    const db = mockDb(queryFn);
    const extensions: ExtensionCapabilities = {
      pgFacets: false,
      pgDgraph: true,
      pgPragma: false
    };

    const report = await refreshEntityDegreeWithReport(db, extensions);

    expect(report).toEqual({
      ok: true,
      refreshed: true,
      skipped: false
    });
    expect(queryFn).toHaveBeenCalledWith(
      expect.stringContaining("REFRESH MATERIALIZED VIEW")
    );
  });

  it("reports failure on SQL error without throwing", async () => {
    const queryFn = vi.fn(async () => {
      throw new Error('relation "graph.entity_degree" does not exist');
    });
    const db = mockDb(queryFn);
    const extensions: ExtensionCapabilities = {
      pgFacets: false,
      pgDgraph: true,
      pgPragma: false
    };

    const report = await refreshEntityDegreeWithReport(db, extensions);

    expect(report).toEqual({
      ok: false,
      refreshed: false,
      skipped: false,
      reason: expect.stringContaining("entity_degree")
    });
  });
});
