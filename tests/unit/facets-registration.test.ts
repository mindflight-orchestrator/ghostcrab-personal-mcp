import { describe, expect, it, vi } from "vitest";

import type { DatabaseClient } from "../../src/db/client.js";
import type { ExtensionCapabilities } from "../../src/db/extension-probe.js";
import { registerPgFacetsWithReport } from "../../src/db/facets-registration.js";

/**
 * mockDb routes queries by substring matching against provided response map.
 * Keys are substrings to match in the SQL, values are the rows to return.
 */
function mockDb(queryResponses: Record<string, unknown[]>): DatabaseClient {
  return {
    query: vi.fn(async (sql: string) => {
      for (const [key, value] of Object.entries(queryResponses)) {
        if (sql.includes(key)) return value;
      }
      return [];
    }),
    ping: async () => true,
    close: async () => undefined,
    transaction: async (op) => op({ query: vi.fn(async () => []) })
  };
}

describe("registerPgFacetsWithReport", () => {
  const noFacets: ExtensionCapabilities = {
    pgFacets: false,
    pgDgraph: false,
    pgPragma: false
  };
  const withFacets: ExtensionCapabilities = {
    pgFacets: true,
    pgDgraph: false,
    pgPragma: false
  };

  it("skips when pg_facets extension is not loaded", async () => {
    const db = mockDb({});
    const report = await registerPgFacetsWithReport(db, noFacets);

    expect(report).toMatchObject({
      ok: true,
      registered: false,
      skipped: true,
      reason: "pg_facets_not_loaded"
    });
    expect(db.query).not.toHaveBeenCalled();
  });

  it("skips when facets is already registered", async () => {
    const db = mockDb({
      list_tables: [{ exists: true }],
      information_schema: [{ exists: true }],
      list_table_facets_simple: [
        { facet_name: "record_id" },
        { facet_name: "activity_family" },
        { facet_name: "title" },
        { facet_name: "label" },
        { facet_name: "schema_id" },
        { facet_name: "tier" },
        { facet_name: "app_segment" },
        { facet_name: "churn_risk" },
        { facet_name: "nationality" },
        { facet_name: "game_type" },
        { facet_name: "is_vip" },
        { facet_name: "marketing_consent" }
      ]
    });
    const report = await registerPgFacetsWithReport(db, withFacets);

    expect(report).toMatchObject({
      ok: true,
      registered: false,
      skipped: true,
      reason: "already_registered"
    });
  });

  it("fails when doc_id column is missing (migration 008 not run)", async () => {
    const db = mockDb({
      list_tables: [{ exists: false }],
      information_schema: [{ exists: false }]
    });
    const report = await registerPgFacetsWithReport(db, withFacets);

    expect(report).toMatchObject({
      ok: false,
      registered: false,
      skipped: false,
      reason: expect.stringContaining("doc_id")
    });
  });

  it("registers successfully when prerequisites are met", async () => {
    const db = mockDb({
      list_tables: [{ exists: false }],
      information_schema: [{ exists: true }],
      add_faceting_to_table: []
    });
    const report = await registerPgFacetsWithReport(db, withFacets);

    expect(report).toEqual({
      ok: true,
      registered: true,
      skipped: false
    });
  });

  it("reports failure when add_faceting_to_table throws", async () => {
    const db = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("list_tables")) return [{ exists: false }];
        if (sql.includes("information_schema")) return [{ exists: true }];
        if (sql.includes("add_faceting_to_table")) {
          throw new Error("column doc_id does not exist");
        }
        return [];
      }),
      ping: async () => true,
      close: async () => undefined,
      transaction: async (op: Parameters<DatabaseClient["transaction"]>[0]) =>
        op({ query: vi.fn(async () => []) })
    };
    const report = await registerPgFacetsWithReport(db, withFacets);

    expect(report).toMatchObject({
      ok: false,
      registered: false,
      skipped: false,
      reason: expect.stringContaining("doc_id")
    });
  });
});
