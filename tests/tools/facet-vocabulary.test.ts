import { describe, expect, it, vi } from "vitest";

import type { DatabaseClient, Queryable } from "../../src/db/client.js";
import {
  facetCatalogTool,
  facetInspectTool,
  facetRegisterTool,
  facetValidateTool
} from "../../src/tools/facets/catalog.js";
import { createToolContext } from "../helpers/tool-context.js";

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

function readStructured<T extends { structuredContent?: unknown }>(
  result: T
): Record<string, unknown> {
  expect(result.structuredContent).toBeDefined();
  return result.structuredContent as Record<string, unknown>;
}

describe("facet vocabulary tools", () => {
  it("lists declared facets and native registration state", async () => {
    const query = vi
      .fn<DatabaseClient["query"]>()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { facet_name: "schema_id" },
        { facet_name: "record_id" }
      ]);
    const database = createMockDatabase(query);

    const result = await facetCatalogTool.handler(
      {},
      createToolContext(database, {
        extensions: { pgFacets: true, pgDgraph: false, pgPragma: false }
      })
    );

    expect(readStructured(result)).toMatchObject({
      ok: true,
      tool: "ghostcrab_facet_catalog",
      schema_id: "mindbrain:facet-definition",
      total: expect.any(Number)
    });
    const catalog = readStructured(result).catalog as Array<Record<string, unknown>>;
    expect(catalog.some((entry) => entry.facet_name === "schema_id")).toBe(true);
    expect(
      catalog.find((entry) => entry.facet_name === "schema_id")
    ).toMatchObject({
      native_registered: true
    });
  });

  it("inspects a known facet and includes persisted metadata when present", async () => {
    const query = vi
      .fn<DatabaseClient["query"]>()
      .mockResolvedValueOnce([
        {
          id: "facet-def-1",
          content: "{\"facet_name\":\"domain\"}",
          facets_json: "{\"facet_name\":\"domain\"}",
          created_at_unix: 1_742_732_800
        }
      ]);
    const database = createMockDatabase(query);

    const result = await facetInspectTool.handler(
      { facet_name: "domain" },
      createToolContext(database)
    );

    expect(readStructured(result)).toMatchObject({
      ok: true,
      tool: "ghostcrab_facet_inspect",
      facet_name: "domain",
      declared: true,
      persisted_definition: {
        id: "facet-def-1"
      }
    });
  });

  it("validates facet records and flags unknown keys", async () => {
    const database = createMockDatabase(vi.fn(async () => []));

    const result = await facetValidateTool.handler(
      {
        record: {
          facets: {
            domain: "product",
            unknown_key: "nope"
          }
        }
      },
      createToolContext(database)
    );

    expect(readStructured(result)).toMatchObject({
      ok: true,
      tool: "ghostcrab_facet_validate",
      valid: false,
      validated: 1
    });
    expect(readStructured(result).issues as Array<Record<string, unknown>>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "unknown_facet" })
      ])
    );
  });

  it("registers a facet definition into the durable store", async () => {
    const query = vi
      .fn<DatabaseClient["query"]>()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ next_doc_id: 2 }])
      .mockResolvedValueOnce([]);
    const database = createMockDatabase(query);

    const result = await facetRegisterTool.handler(
      {
        definition: {
          facet_name: "domain",
          description: "Domain classification"
        }
      },
      createToolContext(database)
    );

    expect(readStructured(result)).toMatchObject({
      ok: true,
      tool: "ghostcrab_facet_register",
      registered: true,
      created: true,
      facet_name: "domain"
    });
  });

});
