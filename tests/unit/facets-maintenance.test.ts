import { describe, expect, it, vi } from "vitest";

import type { DatabaseClient } from "../../src/db/client.js";
import type { ExtensionCapabilities } from "../../src/db/extension-probe.js";
import { mergeFacetDeltasWithReport } from "../../src/db/facets-maintenance.js";

function mockDb(queryFn?: DatabaseClient["query"]): DatabaseClient {
  return {
    query: queryFn ?? vi.fn(async () => []),
    ping: async () => true,
    close: async () => undefined,
    transaction: async (op) => op({ query: vi.fn(async () => []) })
  };
}

describe("mergeFacetDeltasWithReport", () => {
  it("skips when pg_facets is not loaded", async () => {
    const db = mockDb();
    const extensions: ExtensionCapabilities = {
      pgFacets: false,
      pgDgraph: false,
      pgPragma: false
    };

    const report = await mergeFacetDeltasWithReport(db, extensions);

    expect(report).toEqual({
      ok: true,
      merged: false,
      skipped: true,
      reason: "pg_facets_not_loaded"
    });
    expect(db.query).not.toHaveBeenCalled();
  });

  it("calls facets.merge_deltas when pg_facets is loaded", async () => {
    const queryFn = vi.fn(async () => []);
    const db = mockDb(queryFn);
    const extensions: ExtensionCapabilities = {
      pgFacets: true,
      pgDgraph: false,
      pgPragma: false
    };

    const report = await mergeFacetDeltasWithReport(db, extensions);

    expect(report).toEqual({
      ok: true,
      merged: true,
      skipped: false
    });
    expect(queryFn).toHaveBeenCalledWith(
      expect.stringContaining("facets.merge_deltas")
    );
  });

  it("reports failure on SQL error without throwing", async () => {
    const queryFn = vi.fn(async () => {
      throw new Error("merge_deltas failed");
    });
    const db = mockDb(queryFn);
    const extensions: ExtensionCapabilities = {
      pgFacets: true,
      pgDgraph: false,
      pgPragma: false
    };

    const report = await mergeFacetDeltasWithReport(db, extensions);

    expect(report).toEqual({
      ok: false,
      merged: false,
      skipped: false,
      reason: "merge_deltas failed"
    });
  });
});
