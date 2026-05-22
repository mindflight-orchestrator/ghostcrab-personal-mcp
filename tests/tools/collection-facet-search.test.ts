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
});
