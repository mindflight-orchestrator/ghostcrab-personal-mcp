import { describe, expect, it, vi } from "vitest";

import type { DatabaseClient, Queryable } from "../../src/db/client.js";
import { createToolContext } from "../helpers/tool-context.js";
import { countTool } from "../../src/tools/facets/count.js";
import { rememberTool } from "../../src/tools/facets/remember.js";
import {
  schemaInspectTool,
  schemaListTool,
  schemaRegisterTool
} from "../../src/tools/facets/schema.js";
import { searchTool } from "../../src/tools/facets/search.js";
import { upsertTool } from "../../src/tools/facets/upsert.js";
import { GHOSTCRAB_MCP_SURFACE_VERSION } from "../../src/tools/registry.js";

const FIXED_CREATED_AT_UNIX = Date.parse("2026-03-23T12:00:00.000Z") / 1000;
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

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
  result: Awaited<ReturnType<typeof searchTool.handler>>
): Record<string, unknown> {
  expect(result.structuredContent).toBeDefined();
  return result.structuredContent as Record<string, unknown>;
}

describe("facet tools", () => {
  it("stores a fact and returns its identifier", async () => {
    const database = createMockDatabase(async () => [{ next_doc_id: 1 }]);

    const result = await rememberTool.handler(
      {
        content: "Ghostcrab remembers smoke facts.",
        facets: { domain: "smoke" }
      },
      createToolContext(database)
    );

    expect(readStructured(result)).toMatchObject({
      ok: true,
      tool: "ghostcrab_remember",
      surface_version: GHOSTCRAB_MCP_SURFACE_VERSION,
      stored: true,
      id: expect.stringMatching(UUID_V4),
      schema_id: "agent:observation"
    });
  });

  it("updates an existing current-state fact in place", async () => {
    const query = vi
      .fn<DatabaseClient["query"]>()
      .mockResolvedValueOnce([
        {
          id: "facet-1",
          content: "Task is still pending",
          facets_json: JSON.stringify({
            record_id: "task:1",
            status: "a_faire",
            scope: "project:demo"
          }),
          created_by: "seed",
          valid_until_unix: null,
          created_at_unix: FIXED_CREATED_AT_UNIX,
          version: 1
        }
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "facet-1",
          updated_at_unix: Date.parse("2026-03-24T12:00:00.000Z") / 1000,
          version: 2
        }
      ]);
    const database = createMockDatabase(query);

    const result = await upsertTool.handler(
      {
        schema_id: "ghostcrab:task",
        match: {
          facets: {
            record_id: "task:1",
            scope: "project:demo"
          }
        },
        set_facets: {
          status: "en_cours"
        },
        created_by: "test:upsert"
      },
      createToolContext(database)
    );

    expect(query).toHaveBeenCalledTimes(3);
    expect(readStructured(result)).toMatchObject({
      ok: true,
      tool: "ghostcrab_upsert",
      updated: true,
      created: false,
      matched_existing: true,
      id: "facet-1",
      schema_id: "ghostcrab:task",
      version: 2
    });
  });

  it("creates a record when no match exists and create_if_missing is enabled", async () => {
    const query = vi
      .fn<DatabaseClient["query"]>()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const database = createMockDatabase(query);

    const result = await upsertTool.handler(
      {
        schema_id: "ghostcrab:task",
        match: {
          facets: {
            record_id: "task:2",
            scope: "project:demo"
          }
        },
        set_content: "Task created through upsert",
        set_facets: {
          status: "a_faire"
        },
        create_if_missing: true,
        created_by: "test:upsert"
      },
      createToolContext(database)
    );

    expect(readStructured(result)).toMatchObject({
      ok: true,
      tool: "ghostcrab_upsert",
      updated: false,
      created: true,
      matched_existing: false,
      id: expect.stringMatching(UUID_V4),
      schema_id: "ghostcrab:task",
      version: 1
    });
  });

  it("returns a structured error when no match exists and create_if_missing is false", async () => {
    const query = vi.fn<DatabaseClient["query"]>().mockResolvedValueOnce([]);
    const database = createMockDatabase(query);

    const result = await upsertTool.handler(
      {
        schema_id: "ghostcrab:task",
        match: {
          facets: {
            record_id: "task:missing"
          }
        },
        set_facets: {
          status: "bloque"
        }
      },
      createToolContext(database)
    );

    expect(readStructured(result)).toMatchObject({
      ok: false,
      tool: "ghostcrab_upsert",
      error: {
        code: "record_not_found"
      }
    });
  });

  it("searches with BM25 fallback when semantic mode is requested", async () => {
    const query = vi.fn(async () => [
      {
        id: "facet-1",
        schema_id: "agent:observation",
        content: "Ghostcrab stores product memory",
        facets_json: JSON.stringify({ domain: "product" }),
        created_at_unix: FIXED_CREATED_AT_UNIX,
        version: 1,
        score: 0.42
      }
    ]);
    const database = createMockDatabase(query);

    const result = await searchTool.handler(
      {
        query: "product memory",
        filters: { domain: ["product", "docs"] },
        mode: "semantic",
        limit: 5
      },
      createToolContext(database)
    );

    expect(query).toHaveBeenCalledOnce();
    expect(readStructured(result)).toMatchObject({
      ok: true,
      tool: "ghostcrab_search",
      surface_version: GHOSTCRAB_MCP_SURFACE_VERSION,
      returned: 1,
      exact_structured_read: false,
      mode_requested: "semantic",
      mode_applied: "bm25",
      semantic_available: false,
      searched_layers: ["facets"],
      excluded_layers: ["graph_entity", "graph_relation", "projection_result"],
      suggested_tools: ["ghostcrab_graph_search", "ghostcrab_projection_get"]
    });
  });

  it("marks exact structured reads and scopes zero-result interpretation", async () => {
    const query = vi.fn(async () => []);
    const database = createMockDatabase(query);

    const result = await searchTool.handler(
      {
        query: "",
        schema_id: "demo:crm-pipeline:lead",
        filters: { stage: "qualified" }
      },
      createToolContext(database)
    );

    expect(readStructured(result)).toMatchObject({
      returned: 0,
      exact_structured_read: true,
      mode_applied: "filter"
    });
    expect(readStructured(result).notes).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Zero rows returned for this exact structured read only")
      ])
    );
  });

  it("stores embeddings when the fake provider is enabled", async () => {
    const query = vi.fn(async () => [{ next_doc_id: 1 }]);
    const database = createMockDatabase(query);

    const result = await rememberTool.handler(
      {
        content: "Native extension build is deferred.",
        facets: { domain: "product" }
      },
      createToolContext(database, { embeddingsMode: "fake" })
    );

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toContain("embedding_blob");
    expect(query.mock.calls[0]?.[1]?.[4]).toContain("[");
    expect(readStructured(result)).toMatchObject({
      embedding_runtime: expect.objectContaining({
        mode: "fake"
      }),
      embedding_stored: true,
      stored: true
    });
  });

  it("applies SQLite keyword scoring for hybrid requests", async () => {
    const query = vi.fn(async () => [
      {
        id: "facet-1",
        schema_id: "agent:observation",
        content: "Native extension build is still blocked",
        facets_json: JSON.stringify({ domain: "product" }),
        created_at_unix: FIXED_CREATED_AT_UNIX,
        version: 1,
        score: 0.84
      }
    ]);
    const database = createMockDatabase(query);

    const result = await searchTool.handler(
      {
        query: "native extension build",
        filters: { domain: "product" },
        mode: "hybrid",
        limit: 5
      },
      createToolContext(database, { embeddingsMode: "fake" })
    );

    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0]?.[0]).toContain("FROM facets");
    expect(readStructured(result)).toMatchObject({
      returned: 1,
      hybrid_weights: {
        bm25: 0.6,
        vector: 0.4
      },
      mode_requested: "hybrid",
      mode_applied: "hybrid",
      semantic_available: false,
      embedding_runtime: expect.objectContaining({
        mode: "fake",
        vectorSearchReady: true,
        writeEmbeddingsEnabled: true
      })
    });
  });

  it("does not allocate a semantic parameter in pure bm25 mode", async () => {
    const query = vi.fn(async () => [
      {
        id: "facet-1",
        schema_id: "agent:observation",
        content: "Smoke fact for BM25-only validation",
        facets_json: JSON.stringify({ domain: "smoke" }),
        created_at_unix: FIXED_CREATED_AT_UNIX,
        version: 1,
        score: 0.61
      }
    ]);
    const database = createMockDatabase(query);

    const result = await searchTool.handler(
      {
        query: "smoke fact",
        filters: { domain: "smoke" },
        mode: "bm25",
        limit: 5
      },
      createToolContext(database, { embeddingsMode: "fake" })
    );

    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0]?.[0]).not.toContain("embedding_blob IS NOT NULL");
    expect(query.mock.calls[0]?.[1]).toEqual(
      expect.arrayContaining(["default", "smoke", "fact", 5])
    );
    expect(readStructured(result)).toMatchObject({
      returned: 1,
      mode_requested: "bm25",
      mode_applied: "bm25",
      semantic_available: false
    });
  });

  it("falls back to BM25 when embeddings provider errors in semantic mode", async () => {
    const query = vi.fn(async () => [
      {
        id: "facet-1",
        schema_id: "agent:observation",
        content: "Semantic fallback still returns a result",
        facets_json: JSON.stringify({ domain: "product" }),
        created_at_unix: FIXED_CREATED_AT_UNIX,
        version: 1,
        score: 0.55
      }
    ]);
    const database = createMockDatabase(query);
    let hasFailed = false;

    const result = await searchTool.handler(
      {
        query: "semantic fallback",
        filters: { domain: "product" },
        mode: "semantic"
      },
      {
        database,
        embeddings: {
          async embedMany() {
            hasFailed = true;
            throw new Error("Invalid API key");
          },
          getStatus() {
            return {
              available: !hasFailed,
              dimensions: 1536,
              mode: "openrouter",
              model: "openai/text-embedding-3-small",
              note: hasFailed
                ? "Configured but failed."
                : "Configured and ready.",
              failure: hasFailed
                ? {
                    code: "auth_error",
                    message: "Invalid API key",
                    occurred_at: "2026-03-23T12:00:00.000Z",
                    recoverable: false
                  }
                : undefined,
              vectorSearchReady: !hasFailed,
              writeEmbeddingsEnabled: !hasFailed
            };
          }
        },
        retrieval: {
          hybridBm25Weight: 0.6,
          hybridVectorWeight: 0.4
        },
        session: {
          workspace_id: "default",
          schema_id: null
        }
      }
    );

    expect(readStructured(result)).toMatchObject({
      mode_requested: "semantic",
      mode_applied: "bm25",
      semantic_available: false,
      embedding_runtime: expect.objectContaining({
        mode: "openrouter",
        failure: undefined
      })
    });
    expect(readStructured(result).notes).toEqual([
      "SQLite mode currently applies fast local keyword scoring."
    ]);
  });

  it("uses SQLite BM25 path when pg_facets flags are ignored in SQLite mode", async () => {
    const query = vi.fn(async () => [
      {
        id: "facet-native-1",
        schema_id: "agent:observation",
        content: "Native BM25 result",
        facets_json: JSON.stringify({ domain: "product" }),
        created_at_unix: FIXED_CREATED_AT_UNIX,
        version: 1,
        score: 0.88
      }
    ]);
    const database = createMockDatabase(query);

    const result = await searchTool.handler(
      {
        query: "native bm25",
        mode: "bm25",
        limit: 10
      },
      createToolContext(database)
    );

    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0]?.[0]).toContain("FROM facets");
    expect(query.mock.calls[0]?.[0]).not.toContain("facets.bm25_search");
    expect(readStructured(result)).toMatchObject({
      ok: true,
      tool: "ghostcrab_search",
      returned: 1,
      mode_requested: "bm25",
      mode_applied: "bm25",
      backend: "sql"
    });
  });

  it("uses SQLite BM25 path with schema_id filter", async () => {
    const query = vi.fn(async () => [
      {
        id: "facet-native-2",
        schema_id: "agent:task",
        content: "Native BM25 with schema filter",
        facets_json: JSON.stringify({ status: "open" }),
        created_at_unix: FIXED_CREATED_AT_UNIX,
        version: 1,
        score: 0.72
      }
    ]);
    const database = createMockDatabase(query);

    const result = await searchTool.handler(
      {
        query: "schema filter",
        schema_id: "agent:task",
        mode: "bm25",
        limit: 5
      },
      createToolContext(database)
    );

    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0]?.[0]).not.toContain("facets.bm25_search");
    expect(query.mock.calls[0]?.[0]).toContain("schema_id");
    expect(query.mock.calls[0]?.[1]).toEqual(
      expect.arrayContaining(["schema", "filter", "default", "agent:task", 5])
    );
    expect(readStructured(result)).toMatchObject({
      ok: true,
      tool: "ghostcrab_search",
      returned: 1,
      mode_applied: "bm25",
      backend: "sql"
    });
  });

  it("uses SQL bm25 path for search", async () => {
    const query = vi.fn(async () => [
      {
        id: "facet-sql-1",
        schema_id: "agent:observation",
        content: "SQL fallback result",
        facets_json: JSON.stringify({ domain: "product" }),
        created_at_unix: FIXED_CREATED_AT_UNIX,
        version: 1,
        score: 0.5
      }
    ]);
    const database = createMockDatabase(query);

    const result = await searchTool.handler(
      {
        query: "sql fallback",
        mode: "bm25",
        limit: 5
      },
      createToolContext(database)
    );

    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0]?.[0]).not.toContain("facets.bm25_search");
    expect(query.mock.calls[0]?.[0]).toContain("FROM facets");
    expect(readStructured(result)).toMatchObject({
      ok: true,
      tool: "ghostcrab_search",
      backend: "sql"
    });
  });

  it("uses SQL JSONB GROUP BY path for count", async () => {
    const query = vi
      .fn<DatabaseClient["query"]>()
      .mockResolvedValueOnce([
        { val: "agent:observation", count: 3 }
      ]);
    const database = createMockDatabase(query);

    const result = await countTool.handler(
      { group_by: ["schema_id"] },
      createToolContext(database)
    );

    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0]?.[0]).not.toContain("facets.get_facet_counts");
    expect(readStructured(result)).toMatchObject({
      ok: true,
      tool: "ghostcrab_count",
      backend: "sql"
    });
  });

  it("counts items grouped by multiple dimensions", async () => {
    const query = vi
      .fn<DatabaseClient["query"]>()
      .mockResolvedValueOnce([
        { val: "product", count: 2 },
        { val: "docs", count: 1 }
      ])
      .mockResolvedValueOnce([
        { val: "active", count: 3 },
        { val: "draft", count: 1 }
      ]);
    const database = createMockDatabase(query);

    const result = await countTool.handler(
      {
        group_by: ["domain", "status"],
        filters: { visibility: "public" }
      },
      createToolContext(database)
    );

    expect(readStructured(result)).toMatchObject({
      ok: true,
      tool: "ghostcrab_count",
      counts: {
        domain: { product: 2, docs: 1 },
        status: { active: 3, draft: 1 }
      },
      backend: "sql"
    });
  });

  it("uses SQLite count path when pg_facets flags are ignored in SQLite mode", async () => {
    const query = vi
      .fn<DatabaseClient["query"]>()
      .mockResolvedValueOnce([
        { val: "agent:observation", count: 3 },
        { val: "agent:task", count: 1 }
      ]);
    const database = createMockDatabase(query);

    const result = await countTool.handler(
      { group_by: ["schema_id"] },
      createToolContext(database)
    );

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toContain("FROM facets");
    expect(query.mock.calls[0]?.[0]).not.toContain("facets.get_facet_counts");
    expect(readStructured(result)).toMatchObject({
      ok: true,
      tool: "ghostcrab_count",
      counts: { schema_id: { "agent:observation": 3, "agent:task": 1 } },
      backend: "sql"
    });
  });

  it("applies schema_id in the SQLite count path", async () => {
    const query = vi
      .fn<DatabaseClient["query"]>()
      .mockResolvedValueOnce([{ val: "task:123", count: 2 }]);
    const database = createMockDatabase(query);

    const result = await countTool.handler(
      { group_by: ["record_id"], schema_id: "agent:observation" },
      createToolContext(database)
    );

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toContain("schema_id = ?");
    expect(query.mock.calls[0]?.[0]).not.toContain("bitmap_1 AS");
    expect(readStructured(result)).toMatchObject({
      ok: true,
      tool: "ghostcrab_count",
      counts: { record_id: { "task:123": 2 } },
      backend: "sql"
    });
  });

  it("handles schema registration, listing, and inspect flows", async () => {
    const query = vi
      .fn<DatabaseClient["query"]>()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "schema-1",
          facets_json: JSON.stringify({
            schema_id: "ghostcrab:task",
            target: "facets",
            version: 1
          }),
          content: JSON.stringify({
            schema_id: "ghostcrab:task",
            description: "Task schema"
          }),
          created_at_unix: 1_742_732_800
        }
      ])
      .mockResolvedValueOnce([
        {
          id: "schema-1",
          facets_json: JSON.stringify({
            schema_id: "ghostcrab:task",
            target: "facets",
            version: 1
          }),
          content: JSON.stringify({
            schema_id: "ghostcrab:task",
            description: "Task schema"
          })
        }
      ]);
    const database = createMockDatabase(query);

    const registerResult = await schemaRegisterTool.handler(
      {
        definition: {
          schema_id: "ghostcrab:task",
          description: "Task schema"
        }
      },
      createToolContext(database)
    );
    const listResult = await schemaListTool.handler(
      {},
      createToolContext(database)
    );
    const inspectResult = await schemaInspectTool.handler(
      { schema_id: "ghostcrab:task" },
      createToolContext(database)
    );

    expect(readStructured(registerResult)).toMatchObject({
      ok: true,
      tool: "ghostcrab_schema_register",
      registered: true,
      schema_id: "ghostcrab:task"
    });
    expect(readStructured(listResult)).toMatchObject({
      ok: true,
      tool: "ghostcrab_schema_list",
      target: "all"
    });
    expect(readStructured(inspectResult)).toMatchObject({
      ok: true,
      tool: "ghostcrab_schema_inspect",
      found: true,
      schema_id: "ghostcrab:task"
    });
  });
});
