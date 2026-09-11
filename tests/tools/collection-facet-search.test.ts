import { afterEach, describe, expect, it, vi } from "vitest";

import type { DatabaseClient } from "../../src/db/client.js";
import { collectionFacetSearchTool } from "../../src/tools/facets/collection-search.js";
import { createToolContext } from "../helpers/tool-context.js";

function createMockDatabase(): DatabaseClient {
  return {
    query: async () => [],
    ping: async () => true,
    close: async () => undefined,
    transaction: async (operation) =>
      operation({
        query: async () => []
      })
  };
}

describe("ghostcrab_collection_facet_search", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("passes table_id and taxonomy filters to the native collection facet endpoint", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      expect(url.pathname).toBe("/api/mindbrain/collections/facet-search");
      expect(url.searchParams.get("workspace_id")).toBe("ws");
      expect(url.searchParams.get("collection_id")).toBe("ws::main");
      expect(url.searchParams.get("table_id")).toBe("7");
      expect(url.searchParams.get("namespace")).toBe("topic");
      expect(url.searchParams.get("dimension")).toBe("category");
      expect(url.searchParams.get("value")).toBe("leg");
      expect(url.searchParams.get("limit")).toBe("10");

      return new Response(
        JSON.stringify({
          workspace_id: "ws",
          collection_id: "ws::main",
          returned: 1,
          source: "facet_postings",
          matches: [
            {
              doc_id: 42,
              chunk_index: null,
              namespace: "topic",
              dimension: "category",
              value: "legal",
              weight: 1
            }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await collectionFacetSearchTool.handler(
      {
        workspace_id: "ws",
        collection_id: "ws::main",
        table_id: 7,
        namespace: "topic",
        dimension: "category",
        value: "leg",
        limit: 10
      },
      createToolContext(createMockDatabase())
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result.structuredContent).toMatchObject({
      ok: true,
      tool: "ghostcrab_collection_facet_search",
      source: "facet_postings",
      returned: 1,
      matches: [
        expect.objectContaining({
          doc_id: 42,
          namespace: "topic",
          dimension: "category",
          value: "legal"
        })
      ]
    });
  });
  it("uses native exact filters only when advertised by the engine", async () => {
    const database = createMockDatabase();
    database.query = vi.fn(async () => []);
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/capabilities")) {
        return Response.json({ features: { collection_facet_targets: true } });
      }
      expect(url.searchParams.get("target_kind")).toBe("chunk");
      expect(url.searchParams.get("doc_id")).toBe("9007199254740993");
      expect(url.searchParams.get("chunk_index")).toBe("0");
      expect(url.searchParams.get("ontology_id")).toBe("a");
      return Response.json({
        returned: 1,
        source: "facet_postings",
        matches: [
          { doc_id: "9007199254740993", chunk_index: 0, ontology_id: "a" }
        ]
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await collectionFacetSearchTool.handler(
      {
        collection_id: "ws::main",
        target_kind: "chunk",
        doc_id: "9007199254740993",
        chunk_index: 0,
        ontology_id: "a"
      },
      createToolContext(database)
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(database.query).not.toHaveBeenCalled();
    expect(result.structuredContent).toMatchObject({
      source: "facet_postings",
      returned: 1
    });
  });

  it("keeps exact raw reads for older engines without this capability", async () => {
    const database = createMockDatabase();
    database.query = vi
      .fn()
      .mockResolvedValue([{ doc_id: "-1", chunk_index: 0 }]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ features: {} }))
    );
    const result = await collectionFacetSearchTool.handler(
      {
        collection_id: "ws::main",
        target_kind: "chunk",
        doc_id: "18446744073709551615",
        chunk_index: 0,
        ontology_id: "a"
      },
      createToolContext(database)
    );
    expect(database.query).toHaveBeenCalledOnce();
    expect(database.query).toHaveBeenCalledWith(
      expect.stringContaining("target_kind = 'chunk'"),
      expect.arrayContaining(["ws::main", "chunk", "-1", 0, "a"])
    );
    expect(result.structuredContent).toMatchObject({
      source: "facet_assignments_raw",
      returned: 1,
      matches: [{ doc_id: "18446744073709551615", chunk_index: 0 }]
    });
  });
});
