import { describe, expect, it, vi } from "vitest";

import {
  computeSubsystemBackends,
  resolveExtensionCapabilities,
  probePgExtensions
} from "../../src/db/extension-probe.js";
import type { DatabaseClient } from "../../src/db/client.js";

function mockDb(rows: { extname: string }[]): DatabaseClient {
  return {
    query: vi.fn(async () => rows),
    ping: async () => true,
    close: async () => undefined,
    transaction: async (op) => op({ query: vi.fn(async () => []) })
  };
}

describe("resolveExtensionCapabilities", () => {
  it("returns all false in sql-only without querying", async () => {
    const db = mockDb([]);
    const caps = await resolveExtensionCapabilities(db, "sql-only");
    expect(caps).toEqual({
      pgFacets: false,
      pgDgraph: false,
      pgPragma: false,
      pgMindbrain: false
    });
    expect(db.query).not.toHaveBeenCalled();
  });

  it("probes in auto mode", async () => {
    const db = mockDb([{ extname: "pg_pragma" }]);
    const caps = await resolveExtensionCapabilities(db, "auto");
    expect(caps).toEqual({
      pgFacets: false,
      pgDgraph: false,
      pgPragma: true,
      pgMindbrain: false
    });
    expect(db.query).toHaveBeenCalled();
  });

  it("throws in native mode when an extension is missing", async () => {
    const db = mockDb([{ extname: "pg_pragma" }]);
    await expect(resolveExtensionCapabilities(db, "native")).rejects.toThrow(
      "MINDBRAIN_NATIVE_EXTENSIONS=native requires"
    );
  });

  it("succeeds in native mode when pg_mindbrain alone is present", async () => {
    const db = mockDb([{ extname: "pg_mindbrain" }]);
    const caps = await resolveExtensionCapabilities(db, "native");
    expect(caps).toEqual({
      pgFacets: true,
      pgDgraph: true,
      pgPragma: true,
      pgMindbrain: true
    });
  });

  it("succeeds in native mode when all three are present", async () => {
    const db = mockDb([
      { extname: "pg_facets" },
      { extname: "pg_dgraph" },
      { extname: "pg_pragma" }
    ]);
    const caps = await resolveExtensionCapabilities(db, "native");
    expect(caps.pgFacets && caps.pgDgraph && caps.pgPragma).toBe(true);
  });
});

describe("probePgExtensions", () => {
  it("maps extension rows to flags", async () => {
    const db = mockDb([{ extname: "pg_dgraph" }]);
    const caps = await probePgExtensions(db);
    expect(caps).toEqual({
      pgFacets: false,
      pgDgraph: true,
      pgPragma: false,
      pgMindbrain: false
    });
  });

  it("maps pg_mindbrain to all subsystem flags", async () => {
    const db = mockDb([{ extname: "pg_mindbrain" }]);
    const caps = await probePgExtensions(db);
    expect(caps).toEqual({
      pgFacets: true,
      pgDgraph: true,
      pgPragma: true,
      pgMindbrain: true
    });
  });
});

describe("computeSubsystemBackends", () => {
  it("returns all sql in sql-only mode regardless of extensions", () => {
    expect(
      computeSubsystemBackends(
        { pgFacets: true, pgDgraph: true, pgPragma: true },
        "sql-only"
      )
    ).toEqual({ facets: "sql", graph: "sql", pragma: "sql" });
  });

  it("returns conditional pragma when pgPragma is loaded in auto mode", () => {
    expect(
      computeSubsystemBackends(
        { pgFacets: false, pgDgraph: false, pgPragma: true },
        "auto"
      )
    ).toEqual({ facets: "sql", graph: "sql", pragma: "conditional" });
  });

  it("returns sql pragma when pgPragma is not loaded", () => {
    expect(
      computeSubsystemBackends(
        { pgFacets: false, pgDgraph: false, pgPragma: false },
        "auto"
      )
    ).toEqual({ facets: "sql", graph: "sql", pragma: "sql" });
  });

  it("returns conditional pragma in native mode when pgPragma is loaded", () => {
    expect(
      computeSubsystemBackends(
        { pgFacets: true, pgDgraph: true, pgPragma: true },
        "native"
      )
    ).toEqual({ facets: "sql", graph: "sql", pragma: "conditional" });
  });
});
