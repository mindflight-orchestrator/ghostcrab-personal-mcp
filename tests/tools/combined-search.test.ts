import { afterEach, describe, expect, it, vi } from "vitest";

import type { DatabaseClient, Queryable } from "../../src/db/client.js";
import {
  combinedSearchAliasTool,
  combinedSearchTool
} from "../../src/tools/search/combined-search.js";
import { createToolContext } from "../helpers/tool-context.js";

const FIXED_CREATED_AT_UNIX = Date.parse("2026-03-23T12:00:00.000Z") / 1000;

function createMockDatabase(
  queryImpl: DatabaseClient["query"]
): DatabaseClient {
  return {
    kind: "sqlite",
    query: queryImpl,
    ping: async () => true,
    close: async () => undefined,
    transaction: async (operation) => {
      const queryable: Queryable = {
        kind: "sqlite",
        query: queryImpl
      };

      return operation(queryable);
    }
  };
}

function readStructured(
  result: Awaited<ReturnType<typeof combinedSearchTool.handler>>
): Record<string, unknown> {
  expect(result.structuredContent).toBeDefined();
  return result.structuredContent as Record<string, unknown>;
}

function mockGraphSearchFetch(rows: Array<Record<string, unknown>>): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      return new Response(
        JSON.stringify({
          workspace_id: "ws-test",
          collection_id: "collection-a",
          query: "risk",
          entity_types: [],
          returned: rows.length,
          searched_layers: ["graph_entity"],
          rows
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      );
    })
  );
}

describe("combined search tools", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("runs graph-first and returns linked facet facts", async () => {
    mockGraphSearchFetch([
      {
        entity_id: 7,
        entity_type: "Risk",
        name: "Invoice risk",
        confidence: 0.9,
        metadata_json: '{"severity":"high"}',
        score: 4
      }
    ]);
    const query = vi.fn<DatabaseClient["query"]>(async (sql) => {
      if (sql.includes("FROM graph_entity_document")) {
        return [
          {
            entity_id: 7,
            link_confidence: 0.8,
            id: "fact-1",
            schema_id: "demo:risk",
            content: "Invoice risk is blocked by legal review",
            facets_json: JSON.stringify({ status: "blocked" }),
            created_at_unix: FIXED_CREATED_AT_UNIX,
            version: 1,
            doc_id: 42
          }
        ];
      }
      return [];
    });

    const result = await combinedSearchTool.handler(
      {
        workspace_id: "ws-test",
        collection_id: "collection-a",
        query: "risk",
        include_relations: false
      },
      createToolContext(createMockDatabase(query))
    );

    expect(readStructured(result)).toMatchObject({
      ok: true,
      tool: "ghostcrab_combined_search",
      strategy: "graph_first",
      searched_layers: ["graph_entity", "graph_relation", "facets"],
      graph: { returned: 1 },
      facets: { linked_returned: 1, fallback_returned: 0 },
      partial_errors: []
    });
    const payload = readStructured(result);
    expect(payload.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "graph_entity" }),
        expect.objectContaining({
          kind: "facet_fact",
          match_origin: "linked_graph_fact"
        })
      ])
    );
  });

  it("falls back to facets when graph search returns no entities", async () => {
    mockGraphSearchFetch([]);
    const query = vi.fn<DatabaseClient["query"]>(async (sql) => {
      if (sql.includes("FROM agent_facts")) {
        return [
          {
            id: "fact-2",
            schema_id: "demo:risk",
            content: "Risk fact from facet fallback",
            facets_json: JSON.stringify({ status: "open" }),
            created_at_unix: FIXED_CREATED_AT_UNIX,
            version: 1,
            score: 0.25
          }
        ];
      }
      return [];
    });

    const result = await combinedSearchTool.handler(
      {
        workspace_id: "ws-test",
        query: "risk",
        include_relations: false
      },
      createToolContext(createMockDatabase(query))
    );

    expect(readStructured(result)).toMatchObject({
      ok: true,
      tool: "ghostcrab_combined_search",
      graph: { returned: 0 },
      facets: { linked_returned: 0, fallback_returned: 1 },
      returned: 1,
      partial_errors: []
    });
    expect(readStructured(result).results).toEqual([
      expect.objectContaining({
        kind: "facet_fact",
        match_origin: "facet_fallback"
      })
    ]);
  });

  it("falls back to facets when graph backend is unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("graph offline");
      })
    );
    const query = vi.fn<DatabaseClient["query"]>(async (sql) => {
      if (sql.includes("FROM agent_facts")) {
        return [
          {
            id: "fact-3",
            schema_id: "demo:risk",
            content: "Fallback still works",
            facets_json: "{}",
            created_at_unix: FIXED_CREATED_AT_UNIX,
            version: 1,
            score: 0.1
          }
        ];
      }
      return [];
    });

    const result = await combinedSearchTool.handler(
      { workspace_id: "ws-test", query: "risk" },
      createToolContext(createMockDatabase(query))
    );

    expect(readStructured(result)).toMatchObject({
      ok: true,
      graph: { returned: 0 },
      facets: { fallback_returned: 1 },
      partial_errors: [
        expect.objectContaining({
          layer: "graph",
          message: "graph offline"
        })
      ]
    });
  });

  it("returns chunk evidence when include_chunks is true and respects chunk_limit", async () => {
    mockGraphSearchFetch([
      {
        entity_id: 11,
        entity_type: "Document",
        name: "Design spec",
        confidence: 0.85,
        metadata_json: "{}",
        score: 3
      }
    ]);
    const query = vi.fn<DatabaseClient["query"]>(async (sql) => {
      if (sql.includes("FROM graph_entity_document")) return [];
      if (sql.includes("FROM graph_entity_chunk")) {
        return [
          {
            entity_id: 11,
            collection_id: "col-a",
            doc_id: 55,
            chunk_index: 0,
            role: "body",
            confidence: 0.9,
            chunk_content: "Design spec chunk 0"
          },
          {
            entity_id: 11,
            collection_id: "col-a",
            doc_id: 55,
            chunk_index: 1,
            role: "body",
            confidence: 0.7,
            chunk_content: "Design spec chunk 1"
          }
        ];
      }
      return [];
    });

    const result = await combinedSearchTool.handler(
      {
        workspace_id: "ws-test",
        query: "design",
        include_relations: false,
        include_chunks: true,
        chunk_limit: 5
      },
      createToolContext(createMockDatabase(query))
    );

    const payload = readStructured(result);
    expect(payload).toMatchObject({
      ok: true,
      chunks: {
        included: true,
        limit: 5,
        returned: 2
      }
    });
    const chunks = (payload.chunks as Record<string, unknown>).results as Array<
      Record<string, unknown>
    >;
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toMatchObject({
      entity_id: 11,
      collection_id: "col-a",
      chunk_index: 0,
      content: "Design spec chunk 0"
    });
  });

  it("deduplicates facts linked from multiple graph entities (fan-out)", async () => {
    mockGraphSearchFetch([
      {
        entity_id: 20,
        entity_type: "Topic",
        name: "Alpha",
        confidence: 0.9,
        metadata_json: "{}",
        score: 5
      },
      {
        entity_id: 21,
        entity_type: "Topic",
        name: "Beta",
        confidence: 0.8,
        metadata_json: "{}",
        score: 4
      }
    ]);
    // Both entities link to the same fact-shared
    const sharedRow = (entityId: number) => ({
      entity_id: entityId,
      link_confidence: 0.9,
      id: "fact-shared",
      schema_id: "demo:note",
      content: "Shared fact content",
      facets_json: "{}",
      created_at_unix: FIXED_CREATED_AT_UNIX,
      version: 1,
      doc_id: 99
    });

    const query = vi.fn<DatabaseClient["query"]>(async (sql) => {
      if (sql.includes("FROM graph_entity_document")) {
        return [sharedRow(20), sharedRow(21)];
      }
      return [];
    });

    const result = await combinedSearchTool.handler(
      {
        workspace_id: "ws-test",
        query: "shared",
        include_relations: false
      },
      createToolContext(createMockDatabase(query))
    );

    const payload = readStructured(result);
    expect(payload).toMatchObject({
      ok: true,
      facets: { linked_returned: 1 }
    });
    const linkedFacts = (payload.facets as Record<string, unknown>)
      .linked_facts as Array<Record<string, unknown>>;
    expect(linkedFacts).toHaveLength(1);
    expect(linkedFacts[0]).toMatchObject({
      id: "fact-shared",
      linked_entity_ids: expect.arrayContaining([20, 21])
    });
  });

  it("exposes ghostcrab_csearch as an alias for the canonical tool", async () => {
    mockGraphSearchFetch([]);
    const result = await combinedSearchAliasTool.handler(
      { workspace_id: "ws-test", query: "risk" },
      createToolContext(createMockDatabase(async () => []))
    );

    expect(readStructured(result)).toMatchObject({
      ok: true,
      tool: "ghostcrab_csearch",
      canonical_tool: "ghostcrab_combined_search",
      strategy: "graph_first"
    });
  });
});
