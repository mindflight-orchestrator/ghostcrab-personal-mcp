import { describe, expect, it, vi } from "vitest";

import type { DatabaseClient, Queryable } from "../../src/db/client.js";
import { createToolContext } from "../helpers/tool-context.js";
import { countTool } from "../../src/tools/facets/count.js";
import { hierarchyTool } from "../../src/tools/facets/hierarchy.js";
import { rememberTool } from "../../src/tools/facets/remember.js";
import {
  schemaInspectTool,
  schemaListTool,
  schemaRegisterTool
} from "../../src/tools/facets/schema.js";
import { searchTool } from "../../src/tools/facets/search.js";
import { upsertTool } from "../../src/tools/facets/upsert.js";
import { GHOSTCRAB_MCP_SURFACE_VERSION } from "../../src/tools/registry.js";

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

function readStructured(
  result: Awaited<ReturnType<typeof searchTool.handler>>
): Record<string, unknown> {
  expect(result.structuredContent).toBeDefined();
  return result.structuredContent as Record<string, unknown>;
}

describe("facet tools", () => {
  it("stores a fact and returns its identifier", async () => {
    const database = createMockDatabase(async () => [
      { id: "facet-1", created_at: "2026-03-23T12:00:00.000Z" }
    ]);

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
      id: "facet-1",
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
          facets: { record_id: "task:1", status: "a_faire", scope: "project:demo" },
          created_by: "seed",
          valid_until: null,
          created_at: "2026-03-23T12:00:00.000Z",
          version: 1
        }
      ])
      .mockResolvedValueOnce([
        {
          id: "facet-1",
          updated_at: "2026-03-24T12:00:00.000Z",
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

    expect(query).toHaveBeenCalledTimes(2);
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
      .mockResolvedValueOnce([
        {
          id: "facet-2",
          created_at: "2026-03-24T12:00:00.000Z",
          version: 1
        }
      ]);
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
      id: "facet-2",
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
        facets: { domain: "product" },
        created_at: "2026-03-23T12:00:00.000Z",
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
      semantic_available: false
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
    const query = vi.fn(async () => [
      { id: "facet-2", created_at: "2026-03-23T12:01:00.000Z" }
    ]);
    const database = createMockDatabase(query);

    const result = await rememberTool.handler(
      {
        content: "Native extension build is deferred.",
        facets: { domain: "product" }
      },
      createToolContext(database, { embeddingsMode: "fake" })
    );

    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0]?.[0]).toContain("embedding");
    expect(query.mock.calls[0]?.[1]?.[3]).toContain("[");
    expect(readStructured(result)).toMatchObject({
      embedding_runtime: expect.objectContaining({
        mode: "fake"
      }),
      embedding_stored: true,
      stored: true
    });
  });

  it("supports real hybrid mode when the fake provider is enabled", async () => {
    const query = vi.fn(async () => [
      {
        id: "facet-1",
        schema_id: "agent:observation",
        content: "Native extension build is still blocked",
        facets: { domain: "product" },
        created_at: "2026-03-23T12:00:00.000Z",
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
    expect(query.mock.calls[0]?.[0]).toContain("embedding <=>");
    expect(readStructured(result)).toMatchObject({
      returned: 1,
      hybrid_weights: {
        bm25: 0.6,
        vector: 0.4
      },
      mode_requested: "hybrid",
      mode_applied: "hybrid",
      semantic_available: true,
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
        facets: { domain: "smoke" },
        created_at: "2026-03-23T12:00:00.000Z",
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
    expect(query.mock.calls[0]?.[0]).not.toContain("embedding <=>");
    expect(query.mock.calls[0]?.[1]).toEqual([
      JSON.stringify({ domain: "smoke" }),
      "smoke fact",
      5
    ]);
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
        facets: { domain: "product" },
        created_at: "2026-03-23T12:00:00.000Z",
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
        extensions: {
          pgFacets: false,
          pgDgraph: false,
          pgPragma: false
        },
        nativeExtensionsMode: "auto",
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
        }
      }
    );

    expect(readStructured(result)).toMatchObject({
      mode_requested: "semantic",
      mode_applied: "bm25",
      semantic_available: false,
      embedding_runtime: expect.objectContaining({
        mode: "openrouter",
        failure: expect.objectContaining({
          code: "auth_error"
        })
      })
    });
    expect(readStructured(result).notes).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Semantic retrieval unavailable:")
      ])
    );
  });

  it("uses native BM25 path when pg_facets is loaded, mode=bm25, no JSONB filters", async () => {
    const query = vi.fn(async () => [
      {
        id: "facet-native-1",
        schema_id: "agent:observation",
        content: "Native BM25 result",
        facets: { domain: "product" },
        created_at: "2026-03-23T12:00:00.000Z",
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
      createToolContext(database, {
        extensions: { pgFacets: true, pgDgraph: false, pgPragma: false }
      })
    );

    expect(query).toHaveBeenCalledOnce();
    // Native path uses facets.bm25_search CTE
    expect(query.mock.calls[0]?.[0]).toContain("facets.bm25_search");
    expect(readStructured(result)).toMatchObject({
      ok: true,
      tool: "ghostcrab_search",
      returned: 1,
      mode_requested: "bm25",
      mode_applied: "bm25",
      backend: "native"
    });
  });

  it("uses native BM25 path with schema_id filter (schema_id CTE branch)", async () => {
    const query = vi.fn(async () => [
      {
        id: "facet-native-2",
        schema_id: "agent:task",
        content: "Native BM25 with schema filter",
        facets: { status: "open" },
        created_at: "2026-03-23T12:00:00.000Z",
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
      createToolContext(database, {
        extensions: { pgFacets: true, pgDgraph: false, pgPragma: false }
      })
    );

    expect(query).toHaveBeenCalledOnce();
    // The schema_id CTE branch adds WHERE f.schema_id = $3
    expect(query.mock.calls[0]?.[0]).toContain("facets.bm25_search");
    expect(query.mock.calls[0]?.[0]).toContain("schema_id");
    expect(query.mock.calls[0]?.[1]).toEqual(["schema filter", 5, "agent:task"]);
    expect(readStructured(result)).toMatchObject({
      ok: true,
      tool: "ghostcrab_search",
      returned: 1,
      mode_applied: "bm25",
      backend: "native"
    });
  });

  it("falls back to SQL when nativeExtensionsMode is sql-only even with pgFacets loaded (search)", async () => {
    const query = vi.fn(async () => [
      {
        id: "facet-sql-1",
        schema_id: "agent:observation",
        content: "SQL fallback result",
        facets: { domain: "product" },
        created_at: "2026-03-23T12:00:00.000Z",
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
      createToolContext(database, {
        extensions: { pgFacets: true, pgDgraph: false, pgPragma: false },
        nativeExtensionsMode: "sql-only"
      })
    );

    expect(query).toHaveBeenCalledOnce();
    // sql-only forces the regular bm25_vector SQL path
    expect(query.mock.calls[0]?.[0]).not.toContain("facets.bm25_search");
    expect(query.mock.calls[0]?.[0]).toContain("bm25_vector");
    expect(readStructured(result)).toMatchObject({
      ok: true,
      tool: "ghostcrab_search",
      backend: "sql"
    });
  });

  it("falls back to SQL when nativeExtensionsMode is sql-only even with pgFacets loaded (count)", async () => {
    const query = vi
      .fn<DatabaseClient["query"]>()
      .mockResolvedValueOnce([
        { val: "agent:observation", count: 3 }
      ]);
    const database = createMockDatabase(query);

    const result = await countTool.handler(
      { group_by: ["schema_id"] },
      createToolContext(database, {
        extensions: { pgFacets: true, pgDgraph: false, pgPragma: false },
        nativeExtensionsMode: "sql-only"
      })
    );

    expect(query).toHaveBeenCalledOnce();
    // sql-only forces the JSONB GROUP BY path, not get_facet_counts
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

  it("uses native get_facet_counts path when pg_facets is loaded", async () => {
    // "schema_id" is a registered pg_facets column (PG_FACETS_REGISTERED_COLUMNS)
    const query = vi
      .fn<DatabaseClient["query"]>()
      .mockResolvedValueOnce([
        { facet_value: "agent:observation", cardinality: "3" },
        { facet_value: "agent:task", cardinality: "1" }
      ]);
    const database = createMockDatabase(query);

    const result = await countTool.handler(
      { group_by: ["schema_id"] },
      createToolContext(database, {
        extensions: { pgFacets: true, pgDgraph: false, pgPragma: false }
      })
    );

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toContain("facets.get_facet_counts");
    expect(readStructured(result)).toMatchObject({
      ok: true,
      tool: "ghostcrab_count",
      counts: { schema_id: { "agent:observation": 3, "agent:task": 1 } },
      backend: "native"
    });
  });

  it("builds filter bitmap for schema_id in native count path", async () => {
    // "record_id" maps to "facet_record_id" which is registered
    const query = vi
      .fn<DatabaseClient["query"]>()
      .mockResolvedValueOnce([{ facet_value: "task:123", cardinality: "2" }]);
    const database = createMockDatabase(query);

    const result = await countTool.handler(
      { group_by: ["record_id"], schema_id: "agent:observation" },
      createToolContext(database, {
        extensions: { pgFacets: true, pgDgraph: false, pgPragma: false }
      })
    );

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toContain("bitmap_1 AS");
    expect(query.mock.calls[0]?.[0]).toContain(
      "facets.get_documents_with_facet"
    );
    expect(query.mock.calls[0]?.[0]).toContain(
      "FROM facets.get_facet_counts"
    );
    expect(readStructured(result)).toMatchObject({
      ok: true,
      tool: "ghostcrab_count",
      counts: { record_id: { "task:123": 2 } },
      backend: "native"
    });
  });

  it("ghostcrab_facet_tree returns error when pg_facets is not loaded", async () => {
    const database = createMockDatabase(async () => []);

    const result = await hierarchyTool.handler(
      { top_n: 5 },
      createToolContext(database)
    );

    expect(readStructured(result)).toMatchObject({
      ok: false,
      tool: "ghostcrab_facet_tree",
      error: { code: "extension_not_loaded" }
    });
  });

  it("ghostcrab_facet_tree returns hierarchical tree when pg_facets is loaded", async () => {
    const fakeTree = { facets: [{ name: "schema_id", values: [] }] };
    const query = vi
      .fn<DatabaseClient["query"]>()
      // OID resolution
      .mockResolvedValueOnce([{ oid: "12345" }])
      // No schema_id bitmap (not provided)
      // No facet_names (not provided)
      // hierarchical_facets result
      .mockResolvedValueOnce([{ tree: fakeTree }]);
    const database = createMockDatabase(query);

    const result = await hierarchyTool.handler(
      { top_n: 3 },
      createToolContext(database, {
        extensions: { pgFacets: true, pgDgraph: false, pgPragma: false }
      })
    );

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1]?.[0]).toContain("facets.hierarchical_facets");
    expect(readStructured(result)).toMatchObject({
      ok: true,
      tool: "ghostcrab_facet_tree",
      top_n: 3,
      backend: "native",
      tree: fakeTree
    });
  });

  it("ghostcrab_facet_tree builds bitmap filter when schema_id is provided", async () => {
    const fakeTree = { facets: [{ name: "domain", values: [{ value: "product", count: 2 }] }] };
    const query = vi
      .fn<DatabaseClient["query"]>()
      // OID resolution
      .mockResolvedValueOnce([{ oid: "12345" }])
      // build_filter_bitmap_native for schema_id
      .mockResolvedValueOnce([{ bitmap: "<bitmap_opaque>" }])
      // hierarchical_facets result
      .mockResolvedValueOnce([{ tree: fakeTree }]);
    const database = createMockDatabase(query);

    const result = await hierarchyTool.handler(
      { top_n: 5, schema_id: "agent:observation" },
      createToolContext(database, {
        extensions: { pgFacets: true, pgDgraph: false, pgPragma: false }
      })
    );

    expect(query).toHaveBeenCalledTimes(3);
    // Second call: bitmap build for schema_id
    expect(query.mock.calls[1]?.[0]).toContain("build_filter_bitmap_native");
    // Verify composite type cast is scalar (not ARRAY[$2])
    expect(query.mock.calls[1]?.[0]).toContain("ROW('schema_id', $2)::facets.facet_filter");
    expect(query.mock.calls[1]?.[1]).toEqual(["12345", "agent:observation"]);
    expect(readStructured(result)).toMatchObject({
      ok: true,
      tool: "ghostcrab_facet_tree",
      schema_id: "agent:observation",
      backend: "native",
      tree: fakeTree
    });
  });

  it("ghostcrab_facet_tree returns empty tree when schema_id bitmap is null (no matching docs)", async () => {
    const query = vi
      .fn<DatabaseClient["query"]>()
      // OID resolution
      .mockResolvedValueOnce([{ oid: "12345" }])
      // build_filter_bitmap_native returns no row (no docs match)
      .mockResolvedValueOnce([]);
    const database = createMockDatabase(query);

    const result = await hierarchyTool.handler(
      { top_n: 5, schema_id: "agent:nonexistent" },
      createToolContext(database, {
        extensions: { pgFacets: true, pgDgraph: false, pgPragma: false }
      })
    );

    expect(query).toHaveBeenCalledTimes(2);
    // hierarchical_facets must NOT be called when bitmap is null
    expect(query.mock.calls[1]?.[0]).toContain("build_filter_bitmap_native");
    expect(readStructured(result)).toMatchObject({
      ok: true,
      tool: "ghostcrab_facet_tree",
      schema_id: "agent:nonexistent",
      tree: null,
      backend: "native"
    });
  });

  it("ghostcrab_facet_tree resolves facet_ids from facet_names", async () => {
    const fakeTree = { facets: [] };
    const query = vi
      .fn<DatabaseClient["query"]>()
      // OID resolution
      .mockResolvedValueOnce([{ oid: "12345" }])
      // No schema_id (not provided)
      // list_table_facets for facet_names resolution
      .mockResolvedValueOnce([{ facet_id: 3 }, { facet_id: 7 }])
      // hierarchical_facets result
      .mockResolvedValueOnce([{ tree: fakeTree }]);
    const database = createMockDatabase(query);

    const result = await hierarchyTool.handler(
      { top_n: 5, facet_names: ["domain", "status"] },
      createToolContext(database, {
        extensions: { pgFacets: true, pgDgraph: false, pgPragma: false }
      })
    );

    expect(query).toHaveBeenCalledTimes(3);
    // Second call: list_table_facets to resolve facet_ids
    expect(query.mock.calls[1]?.[0]).toContain("facets.list_table_facets");
    // Third call: hierarchical_facets receives resolved facet_ids
    expect(query.mock.calls[2]?.[0]).toContain("facets.hierarchical_facets");
    expect(readStructured(result)).toMatchObject({
      ok: true,
      tool: "ghostcrab_facet_tree",
      facet_names: ["domain", "status"],
      backend: "native",
      tree: fakeTree
    });
  });

  it("handles schema registration, listing, and inspect flows", async () => {
    const query = vi
      .fn<DatabaseClient["query"]>()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "schema-1" }])
      .mockResolvedValueOnce([
        {
          id: "schema-1",
          facets: {
            schema_id: "ghostcrab:task",
            target: "facets",
            version: 1
          },
          content: JSON.stringify({
            schema_id: "ghostcrab:task",
            description: "Task schema"
          }),
          created_at: "2026-03-23T12:00:00.000Z"
        }
      ])
      .mockResolvedValueOnce([
        {
          id: "schema-1",
          facets: {
            schema_id: "ghostcrab:task",
            target: "facets",
            version: 1
          },
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
