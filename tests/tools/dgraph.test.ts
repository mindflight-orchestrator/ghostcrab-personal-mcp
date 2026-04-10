import { describe, expect, it, vi } from "vitest";

import type { DatabaseClient, Queryable } from "../../src/db/client.js";
import { createToolContext } from "../helpers/tool-context.js";
import { coverageTool } from "../../src/tools/dgraph/coverage.js";
import { learnTool } from "../../src/tools/dgraph/learn.js";
import { marketplaceTool } from "../../src/tools/dgraph/marketplace.js";
import { patchTool } from "../../src/tools/dgraph/patch.js";
import { traverseTool } from "../../src/tools/dgraph/traverse.js";
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
  result: Awaited<ReturnType<typeof coverageTool.handler>>
): Record<string, unknown> {
  expect(result.structuredContent).toBeDefined();
  return result.structuredContent as Record<string, unknown>;
}

describe("dgraph tools", () => {
  it("reports when no ontology exists for a domain", async () => {
    const query = vi
      .fn<DatabaseClient["query"]>()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const database = createMockDatabase(query);

    const result = await coverageTool.handler(
      { domain: "gdpr" },
      createToolContext(database)
    );

    expect(readStructured(result)).toMatchObject({
      ok: true,
      tool: "ghostcrab_coverage",
      surface_version: GHOSTCRAB_MCP_SURFACE_VERSION,
      domain: "gdpr",
      coverage_score: null,
      can_proceed_autonomously: false
    });
  });

  it("reports partial coverage for the seeded ghostcrab-product domain", async () => {
    const query = vi
      .fn<DatabaseClient["query"]>()
      .mockResolvedValueOnce([
        {
          id: "concept:ghostcrab:public-mcp-surface",
          label: "Public MCP surface"
        },
        {
          id: "concept:ghostcrab:docker-fallback-default",
          label: "Native Docker bootstrap default"
        },
        {
          id: "concept:ghostcrab:startup-bootstrap",
          label: "Startup bootstrap"
        },
        {
          id: "concept:ghostcrab:distribution-targets",
          label: "Distribution targets"
        },
        {
          id: "concept:ghostcrab:embeddings-capability",
          label: "Embeddings capability axis"
        }
      ])
      .mockResolvedValueOnce([
        {
          id: "concept:ghostcrab:public-mcp-surface",
          label: "Public MCP surface",
          criticality: "high"
        },
        {
          id: "concept:ghostcrab:docker-fallback-default",
          label: "Native Docker bootstrap default",
          criticality: "high"
        },
        {
          id: "concept:ghostcrab:startup-bootstrap",
          label: "Startup bootstrap",
          criticality: "high"
        },
        {
          id: "concept:ghostcrab:distribution-targets",
          label: "Distribution targets",
          criticality: "medium"
        },
        {
          id: "concept:ghostcrab:embeddings-capability",
          label: "Embeddings capability axis",
          criticality: "medium"
        },
        {
          id: "concept:ghostcrab:native-compatibility",
          label: "Native compatibility constraint",
          criticality: "high"
        }
      ]);
    const database = createMockDatabase(query);

    const result = await coverageTool.handler(
      { domain: "ghostcrab-product" },
      createToolContext(database)
    );

    expect(readStructured(result)).toMatchObject({
      ok: true,
      tool: "ghostcrab_coverage",
      coverage_score: 0.833,
      covered_nodes: 5,
      total_nodes: 6,
      can_proceed_autonomously: false,
      recommended_action: "proceed_with_disclosure"
    });
    expect(readStructured(result).gap_nodes).toEqual([
      {
        id: "concept:ghostcrab:native-compatibility",
        label: "Native compatibility constraint",
        criticality: "high",
        decayed_confidence: null
      }
    ]);
  });

  it("includes decayed_confidence for gap nodes when pg_dgraph is loaded", async () => {
    const query = vi
      .fn<DatabaseClient["query"]>()
      .mockResolvedValueOnce([
        {
          id: "concept:ghostcrab:public-mcp-surface",
          label: "Public MCP surface"
        }
      ])
      .mockResolvedValueOnce([
        {
          id: "concept:ghostcrab:public-mcp-surface",
          label: "Public MCP surface",
          criticality: "high"
        },
        {
          id: "concept:ghostcrab:native-compatibility",
          label: "Native compatibility constraint",
          criticality: "high"
        }
      ])
      .mockResolvedValueOnce([
        {
          name: "concept:ghostcrab:native-compatibility",
          decayed: 0.72
        }
      ]);
    const database = createMockDatabase(query);

    const result = await coverageTool.handler(
      { domain: "ghostcrab-product" },
      createToolContext(database, {
        extensions: { pgFacets: false, pgDgraph: true, pgPragma: false }
      })
    );

    const payload = readStructured(result);
    expect(payload.gap_nodes).toEqual([
      {
        id: "concept:ghostcrab:native-compatibility",
        label: "Native compatibility constraint",
        criticality: "high",
        decayed_confidence: 0.72
      }
    ]);
  });

  it("applies ghostcrab_patch when pg_dgraph is loaded", async () => {
    const query = vi.fn<DatabaseClient["query"]>(async (sql) => {
      if (sql.includes("apply_knowledge_patch")) {
        return [{ apply_knowledge_patch: 3 }];
      }
      return [];
    });
    const database = createMockDatabase(query);

    const result = await patchTool.handler(
      { patch_id: 42, applied_by: "agent:test" },
      createToolContext(database, {
        extensions: { pgFacets: false, pgDgraph: true, pgPragma: false }
      })
    );

    expect(readStructured(result)).toMatchObject({
      ok: true,
      tool: "ghostcrab_patch",
      patch_id: 42,
      relations_applied: 3,
      backend: "native"
    });
  });

  it("returns error for ghostcrab_patch when pg_dgraph is not loaded", async () => {
    const database = createMockDatabase(vi.fn());

    const result = await patchTool.handler(
      { patch_id: 1 },
      createToolContext(database)
    );

    expect(result.isError).toBe(true);
  });

  it("ghostcrab_marketplace returns error when pg_dgraph is not loaded", async () => {
    const database = createMockDatabase(vi.fn());

    const result = await marketplaceTool.handler(
      { query: "test" },
      createToolContext(database)
    );

    expect(result.isError).toBe(true);
    expect(
      (result.structuredContent as Record<string, unknown>)?.error
    ).toMatchObject({ code: "extension_not_loaded" });
  });

  it("ghostcrab_marketplace returns results from graph.marketplace_search", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([
        {
          entity_id: "42",
          name: "GhostCrab",
          type: "product",
          confidence: 0.9,
          is_direct_match: true,
          composite_score: 0.82,
          metadata: { version: "2.0" }
        }
      ]);
    const database = createMockDatabase(query);

    const result = await marketplaceTool.handler(
      { query: "ghostcrab", domain: "product", limit: 10 },
      createToolContext(database, {
        extensions: { pgFacets: false, pgDgraph: true, pgPragma: false }
      })
    );

    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0]?.[0]).toContain("mb_ontology.marketplace_search_by_domain");
    const structured = result.structuredContent as Record<string, unknown>;
    expect(structured).toMatchObject({
      ok: true,
      tool: "ghostcrab_marketplace",
      returned: 1,
      backend: "native",
      results: [
        expect.objectContaining({
          name: "GhostCrab",
          composite_score: 0.82,
          is_direct_match: true,
          fts_rank: null,
          hub_score: null
        })
      ]
    });
  });

  it("ghostcrab_marketplace falls back to graph.marketplace_search when mb_ontology is unavailable", async () => {
    const query = vi
      .fn()
      .mockRejectedValueOnce(new Error("mb_ontology missing"))
      .mockResolvedValueOnce([
        {
          entity_id: "42",
          name: "GhostCrab",
          type: "product",
          confidence: 0.9,
          fts_rank: 0.75,
          is_direct_match: true,
          hub_score: 0.6,
          composite_score: 0.82,
          metadata: { version: "2.0" }
        }
      ]);
    const database = createMockDatabase(query);

    const result = await marketplaceTool.handler(
      { query: "ghostcrab", domain: "product", limit: 10 },
      createToolContext(database, {
        extensions: { pgFacets: false, pgDgraph: true, pgPragma: false }
      })
    );

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1]?.[0]).toContain("graph.marketplace_search");
    const structured = result.structuredContent as Record<string, unknown>;
    expect(structured).toMatchObject({
      ok: true,
      tool: "ghostcrab_marketplace",
      returned: 1,
      backend: "native"
    });
  });

  it("traverses toward a target node and surfaces gap candidates", async () => {
    const database = createMockDatabase(async () => [
      {
        node_id: "task:start",
        node_label: "Start",
        node_type: "task",
        properties: {},
        edge_label: null,
        depth: 0,
        path: ["task:start"]
      },
      {
        node_id: "concept:gap",
        node_label: "Missing Concept",
        node_type: "concept",
        properties: { mastery: 0 },
        edge_label: "REQUIRES",
        depth: 1,
        path: ["task:start", "concept:gap"]
      },
      {
        node_id: "task:target",
        node_label: "Target",
        node_type: "task",
        properties: { mastery: 1 },
        edge_label: "ENABLES",
        depth: 2,
        path: ["task:start", "concept:gap", "task:target"]
      }
    ]);

    const result = await traverseTool.handler(
      {
        start: "task:start",
        target: "task:target",
        edge_labels: ["REQUIRES", "ENABLES"]
      },
      createToolContext(database)
    );

    expect(readStructured(result)).toMatchObject({
      ok: true,
      tool: "ghostcrab_traverse",
      target_found: true,
      node_count: 3,
      backend: "sql",
      graph_backend: "graph.entity"
    });
    expect(readStructured(result).gap_candidates).toEqual([
      {
        id: "concept:gap",
        label: "Missing Concept",
        via: "REQUIRES"
      }
    ]);
  });

  it("traverses explicit BLOCKS edges in the seeded ghostcrab-product graph", async () => {
    const database = createMockDatabase(async () => [
      {
        node_id: "component:ghostcrab:native-extension-build",
        node_label: "Native Extension Build",
        node_type: "component",
        properties: { domain: "ghostcrab-product" },
        edge_label: null,
        depth: 0,
        path: ["component:ghostcrab:native-extension-build"]
      },
      {
        node_id: "distribution:ghostcrab:compose-mcp-service",
        node_label: "Compose MCP Service",
        node_type: "distribution",
        properties: { domain: "ghostcrab-product" },
        edge_label: "BLOCKS",
        depth: 1,
        path: [
          "component:ghostcrab:native-extension-build",
          "distribution:ghostcrab:compose-mcp-service"
        ]
      }
    ]);

    const result = await traverseTool.handler(
      {
        start: "component:ghostcrab:native-extension-build",
        direction: "outbound",
        edge_labels: ["BLOCKS"],
        depth: 2
      },
      createToolContext(database)
    );

    expect(readStructured(result)).toMatchObject({
      ok: true,
      tool: "ghostcrab_traverse",
      start_node: "component:ghostcrab:native-extension-build",
      node_count: 2
    });
    expect(readStructured(result).path).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          node_id: "distribution:ghostcrab:compose-mcp-service",
          edge_label: "BLOCKS"
        })
      ])
    );
  });

  it("traverses HAS_GAP toward the native compatibility gap concept", async () => {
    const database = createMockDatabase(async () => [
      {
        node_id: "task:ghostcrab:native-toolchain-pinning",
        node_label: "Native Toolchain Pinning",
        node_type: "task",
        properties: { domain: "ghostcrab-product" },
        edge_label: null,
        depth: 0,
        path: ["task:ghostcrab:native-toolchain-pinning"]
      },
      {
        node_id: "concept:ghostcrab:native-compatibility",
        node_label: "Native compatibility constraint",
        node_type: "concept",
        properties: { mastery: 0, status: "gap" },
        edge_label: "HAS_GAP",
        depth: 1,
        path: [
          "task:ghostcrab:native-toolchain-pinning",
          "concept:ghostcrab:native-compatibility"
        ]
      }
    ]);

    const result = await traverseTool.handler(
      {
        start: "task:ghostcrab:native-toolchain-pinning",
        direction: "outbound",
        edge_labels: ["HAS_GAP"],
        depth: 2
      },
      createToolContext(database)
    );

    expect(readStructured(result)).toMatchObject({
      ok: true,
      tool: "ghostcrab_traverse",
      start_node: "task:ghostcrab:native-toolchain-pinning",
      node_count: 2
    });
    expect(readStructured(result).gap_candidates).toEqual([
      {
        id: "concept:ghostcrab:native-compatibility",
        label: "Native compatibility constraint",
        via: "HAS_GAP"
      }
    ]);
  });

  it("uses entity_neighborhood at depth=1 when pg_dgraph is loaded", async () => {
    const query = vi
      .fn<DatabaseClient["query"]>()
      // First call: resolve entity ID + metadata
      .mockResolvedValueOnce([{ id: "99", metadata: { label: "Start Task", node_type: "task" } }])
      // Second call: entity_neighborhood returns JSONB
      .mockResolvedValueOnce([
        {
          neighborhood: {
            outbound: [
              {
                name: "concept:linked",
                label: "Linked Concept",
                node_type: "concept",
                metadata: { mastery: 1 },
                relation_type: "REQUIRES"
              }
            ],
            inbound: []
          }
        }
      ])
      // Third call: metadata hydration for discovered nodes
      .mockResolvedValueOnce([
        {
          name: "concept:linked",
          metadata: { label: "Linked Concept", node_type: "concept", mastery: 1 }
        }
      ]);
    const database = createMockDatabase(query);

    const result = await traverseTool.handler(
      { start: "task:start", depth: 1 },
      createToolContext(database, {
        extensions: { pgFacets: false, pgDgraph: true, pgPragma: false }
      })
    );

    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[1]?.[0]).toContain("entity_neighborhood");
    expect(readStructured(result)).toMatchObject({
      ok: true,
      tool: "ghostcrab_traverse",
      backend: "native",
      graph_backend: "graph.entity_neighborhood",
      node_count: 2
    });
    // Verify root node uses real metadata from entity query
    const path = (readStructured(result).path as Array<Record<string, unknown>>);
    expect(path[0]).toMatchObject({
      node_id: "task:start",
      node_label: "Start Task",
      node_type: "task",
      depth: 0
    });
  });

  it("entity_neighborhood post-filters by edge_labels in native mode", async () => {
    const query = vi
      .fn<DatabaseClient["query"]>()
      // Resolve entity ID + metadata
      .mockResolvedValueOnce([{ id: "55", metadata: { label: "Origin", node_type: "task" } }])
      // entity_neighborhood with two outbound relations
      .mockResolvedValueOnce([
        {
          neighborhood: {
            outbound: [
              {
                name: "concept:a",
                label: "Concept A",
                node_type: "concept",
                metadata: {},
                relation_type: "REQUIRES"
              },
              {
                name: "concept:b",
                label: "Concept B",
                node_type: "concept",
                metadata: {},
                relation_type: "ENABLES"
              }
            ],
            inbound: []
          }
        }
      ])
      .mockResolvedValueOnce([
        {
          name: "concept:a",
          metadata: { label: "Concept A", node_type: "concept" }
        }
      ]);
    const database = createMockDatabase(query);

    const result = await traverseTool.handler(
      { start: "task:origin", depth: 1, edge_labels: ["REQUIRES"] },
      createToolContext(database, {
        extensions: { pgFacets: false, pgDgraph: true, pgPragma: false }
      })
    );

    expect(query).toHaveBeenCalledTimes(3);
    // Only REQUIRES should remain after post-filter, plus the start node = 2 total
    expect(readStructured(result)).toMatchObject({
      ok: true,
      tool: "ghostcrab_traverse",
      backend: "native",
      node_count: 2
    });
    const path = (readStructured(result).path as Array<Record<string, unknown>>);
    const edgeLabels = path.map((n) => n["edge_label"]);
    expect(edgeLabels).not.toContain("ENABLES");
    expect(edgeLabels).toContain("REQUIRES");
  });

  it("normalizes native rows when neighborhood metadata is partial", async () => {
    const query = vi
      .fn<DatabaseClient["query"]>()
      .mockResolvedValueOnce([{ id: "77", metadata: { label: "Start", node_type: "task" } }])
      .mockResolvedValueOnce([
        {
          neighborhood: {
            outbound: [
              {
                name: "concept:partial",
                relation_type: "REQUIRES"
              }
            ],
            inbound: []
          }
        }
      ])
      .mockResolvedValueOnce([]);
    const database = createMockDatabase(query);

    const result = await traverseTool.handler(
      { start: "task:start", depth: 1 },
      createToolContext(database, {
        extensions: { pgFacets: false, pgDgraph: true, pgPragma: false }
      })
    );

    expect(readStructured(result)).toMatchObject({
      ok: true,
      tool: "ghostcrab_traverse",
      backend: "native",
      node_count: 2,
      gap_candidates: []
    });
  });

  it("entity_neighborhood returns empty path when entity is not found", async () => {
    const query = vi
      .fn<DatabaseClient["query"]>()
      // Resolve entity ID: entity not found
      .mockResolvedValueOnce([]);
    const database = createMockDatabase(query);

    const result = await traverseTool.handler(
      { start: "task:nonexistent", depth: 1 },
      createToolContext(database, {
        extensions: { pgFacets: false, pgDgraph: true, pgPragma: false }
      })
    );

    expect(query).toHaveBeenCalledOnce();
    expect(readStructured(result)).toMatchObject({
      ok: true,
      tool: "ghostcrab_traverse",
      node_count: 0,
      backend: "native"
    });
  });

  it("falls back to SQL CTE at depth=1 when target is set (path-finding)", async () => {
    const query = vi.fn(async () => [
      {
        node_id: "task:start",
        node_label: "Start",
        node_type: "task",
        properties: {},
        edge_label: null,
        depth: 0,
        path: ["task:start"]
      }
    ]);
    const database = createMockDatabase(query);

    const result = await traverseTool.handler(
      { start: "task:start", depth: 1, target: "concept:gap" },
      createToolContext(database, {
        extensions: { pgFacets: false, pgDgraph: true, pgPragma: false }
      })
    );

    // With target set, SQL CTE is used even at depth=1 with pg_dgraph
    expect(query.mock.calls[0]?.[0]).toContain("WITH RECURSIVE traversal");
    expect(readStructured(result)).toMatchObject({
      ok: true,
      tool: "ghostcrab_traverse",
      backend: "sql"
    });
  });

  it("uses SQL CTE when depth > 1 even if pg_dgraph is loaded", async () => {
    const query = vi.fn(async () => [
      {
        node_id: "task:start",
        node_label: "Start",
        node_type: "task",
        properties: {},
        edge_label: null,
        depth: 0,
        path: ["task:start"]
      }
    ]);
    const database = createMockDatabase(query);

    const result = await traverseTool.handler(
      { start: "task:start", depth: 3 },
      createToolContext(database, {
        extensions: { pgFacets: false, pgDgraph: true, pgPragma: false }
      })
    );

    expect(query.mock.calls[0]?.[0]).toContain("WITH RECURSIVE traversal");
    expect(readStructured(result)).toMatchObject({
      ok: true,
      tool: "ghostcrab_traverse",
      backend: "sql",
      graph_backend: "graph.entity"
    });
  });

  it("upserts nodes and updates an existing edge inside one transaction", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("INSERT INTO graph.entity")) {
        return [{ id: "1" }];
      }

      if (sql.includes("INSERT INTO graph.entity_alias")) {
        return [];
      }

      if (sql.includes("FROM graph.entity") && sql.includes("WHERE type =")) {
        return [{ id: "1" }];
      }

      if (sql.includes("FROM graph.relation") && sql.includes("LIMIT 1")) {
        return [{ id: "edge-1" }];
      }

      if (sql.includes("UPDATE graph.relation")) {
        return [];
      }

      return [];
    });
    const database = createMockDatabase(query);

    const result = await learnTool.handler(
      {
        node: {
          id: "task:start",
          node_type: "task",
          label: "Start"
        },
        edge: {
          source: "task:start",
          target: "concept:gap",
          label: "HAS_GAP",
          weight: 1
        }
      },
      createToolContext(database)
    );

    expect(readStructured(result)).toMatchObject({
      ok: true,
      tool: "ghostcrab_learn",
      node: { learned: true, id: "task:start" },
      edge: { learned: true, id: "edge-1", updated: true }
    });
  });
});
