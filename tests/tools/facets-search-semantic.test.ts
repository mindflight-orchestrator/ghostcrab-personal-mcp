import { afterEach, describe, expect, it, vi } from "vitest";

import type { DatabaseClient, Queryable } from "../../src/db/client.js";
import { setFactsFtsReady } from "../../src/runtime/facets-fts-state.js";
import { searchTool } from "../../src/tools/facets/search.js";
import { createToolContext } from "../helpers/tool-context.js";

const CREATED_AT = Date.parse("2026-03-23T12:00:00.000Z") / 1000;
const FAKE_DIMENSIONS = 8;

function row(id: string, content: string, docId = 1) {
  return {
    id,
    doc_id: docId,
    schema_id: "agent:observation",
    content,
    facets_json: JSON.stringify({ domain: "product" }),
    created_at_unix: CREATED_AT,
    version: 1,
    score: 0
  };
}

function database(queryImpl: DatabaseClient["query"]): DatabaseClient {
  return {
    query: queryImpl,
    ping: async () => true,
    close: async () => undefined,
    transaction: async (operation) => {
      const queryable: Queryable = { query: queryImpl };
      return operation(queryable);
    }
  };
}

function nativeResponse(matches: Array<Record<string, number>>): Response {
  return new Response(
    JSON.stringify({ workspace_id: "default", query: "", matches }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

describe("ghostcrab_search native semantic and hybrid", () => {
  afterEach(() => {
    setFactsFtsReady(false);
    vi.unstubAllGlobals();
  });

  it("keeps pure semantic ranking inside Zig and preserves its ordering", async () => {
    const queries: string[] = [];
    const query = vi.fn<DatabaseClient["query"]>(async (sql) => {
      queries.push(sql);
      if (sql.includes("doc_id IN")) {
        return [row("lower", "Lower", 1), row("higher", "Higher", 2)];
      }
      return [];
    });
    const fetchMock = vi.fn(async () =>
      nativeResponse([
        { doc_id: 2, bm25_score: 0, vector_score: 0.9, combined_score: 0.9 },
        { doc_id: 1, bm25_score: 0, vector_score: 0.4, combined_score: 0.4 }
      ])
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchTool.handler(
      {
        query: "Native semantic anchor",
        filters: { domain: "product" },
        schema_id: "agent:observation",
        mode: "semantic",
        limit: 5
      },
      createToolContext(database(query), {
        embeddingsMode: "fake",
        embeddingDimensions: FAKE_DIMENSIONS
      })
    );

    expect(result.structuredContent).toMatchObject({
      backend: "mindbrain",
      mode_applied: "semantic",
      semantic_available: true,
      returned: 2,
      results: [{ id: "higher" }, { id: "lower" }]
    });
    expect(queries.join("\n")).not.toContain("embedding_blob");

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      workspace_id: "default",
      table_id: 1,
      schema_id: "agent:observation",
      filters: { domain: "product" },
      query: "",
      vector_weight: 1
    });
    expect(body.embedding).toEqual(
      expect.arrayContaining([expect.any(Number)])
    );
  });

  it("delegates hybrid score fusion to Zig", async () => {
    const query = vi.fn<DatabaseClient["query"]>(async (sql) =>
      sql.includes("doc_id IN") ? [row("hybrid", "Hybrid", 7)] : []
    );
    const fetchMock = vi.fn(async () =>
      nativeResponse([
        { doc_id: 7, bm25_score: 0.6, vector_score: 0.8, combined_score: 0.78 }
      ])
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchTool.handler(
      { query: "hybrid query", mode: "hybrid", limit: 5 },
      createToolContext(database(query), {
        embeddingsMode: "fake",
        embeddingDimensions: FAKE_DIMENSIONS,
        hybridBm25Weight: 0.1,
        hybridVectorWeight: 0.9
      })
    );

    expect(result.structuredContent).toMatchObject({
      backend: "mindbrain",
      mode_applied: "hybrid",
      semantic_available: true,
      results: [{ id: "hybrid", score: 0.78 }]
    });
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body)) as Record<string, unknown>;
    expect(body.query).toBe("hybrid query");
    expect(body.vector_weight).toBe(0.9);
  });

  it("falls back without computing vectors in JavaScript when Zig is unavailable", async () => {
    setFactsFtsReady(true);
    const queries: string[] = [];
    const query = vi.fn<DatabaseClient["query"]>(async (sql) => {
      queries.push(sql);
      if (sql.includes("search_fts MATCH")) return [row("bm25", "BM25")];
      return [];
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new Error("offline")))
    );

    const result = await searchTool.handler(
      { query: "BM25", mode: "hybrid", limit: 5 },
      createToolContext(database(query), {
        embeddingsMode: "fake",
        embeddingDimensions: FAKE_DIMENSIONS
      })
    );

    expect(result.structuredContent).toMatchObject({
      backend: "sql",
      mode_applied: "bm25",
      semantic_available: false
    });
    expect(result.structuredContent?.notes).toEqual(
      expect.arrayContaining([
        expect.stringContaining("without JavaScript vector scoring")
      ])
    );
    expect(queries.join("\n")).not.toContain("embedding_blob");
  });

  it("reports semantic unavailable when no embedding provider is configured", async () => {
    const query = vi.fn<DatabaseClient["query"]>(async (sql) =>
      sql.includes("FROM agent_facts") ? [row("keyword", "filler text")] : []
    );
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchTool.handler(
      { query: "filler", mode: "semantic", limit: 5 },
      createToolContext(database(query))
    );

    expect(result.structuredContent).toMatchObject({
      mode_applied: "keyword_sql",
      semantic_available: false
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
