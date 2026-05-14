import { afterEach, describe, expect, it, vi } from "vitest";

import type { DatabaseClient, Queryable } from "../../src/db/client.js";
import { createToolContext } from "../helpers/tool-context.js";
import { coverageTool } from "../../src/tools/dgraph/coverage.js";
import { entityChunksTool } from "../../src/tools/dgraph/entity-chunks.js";
import { graphReindexTool } from "../../src/tools/dgraph/graph-reindex.js";
import { graphSearchTool } from "../../src/tools/dgraph/graph-search.js";
import { learnTool } from "../../src/tools/dgraph/learn.js";
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

function mockTraverseFetch(
  rows: Array<Record<string, unknown>>,
  targetFound: boolean | null = null
): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      return new Response(
        JSON.stringify({
          target_found: targetFound,
          rows
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json"
          }
        }
      );
    })
  );
}

function mockCoverageFetch(responseText: string): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      return new Response(responseText, {
        status: 200,
        headers: {
          "content-type": "text/plain; charset=utf-8"
        }
      });
    })
  );
}

function mockGraphSearchFetch(rows: Array<Record<string, unknown>>): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      return new Response(
        JSON.stringify({
          workspace_id: "mindbrain-seo-audit",
          collection_id: "seo",
          query: "SEOIssue",
          entity_types: ["SEOIssue"],
          returned: rows.length,
          searched_layers: ["graph_entity"],
          rows
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json"
          }
        }
      );
    })
  );
}

describe("dgraph tools", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports when no ontology exists for a domain", async () => {
    mockCoverageFetch(
      [
        "kind: coverage_report",
        "summary:",
        "  workspace_id: gdpr",
        "  covered_nodes: 0",
        "  total_nodes: 0",
        "  graph_entities: 0",
        "  facet_rows: 0",
        "  projection_rows: 0",
        "  coverage_ratio: null",
        "gaps[0]{id\tlabel\tentity_type\tcriticality}:"
      ].join("\n")
    );
    const database = createMockDatabase(vi.fn());

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
      can_proceed_autonomously: false,
      backend: "native"
    });
  });

  it("reports partial coverage for the seeded ghostcrab-product domain", async () => {
    mockCoverageFetch(
      [
        "kind: coverage_report",
        "summary:",
        "  workspace_id: ghostcrab-product",
        "  covered_nodes: 5",
        "  total_nodes: 6",
        "  graph_entities: 5",
        "  facet_rows: 6",
        "  projection_rows: 1",
        "  coverage_ratio: 0.833333333333",
        "gaps[1]{id\tlabel\tentity_type\tcriticality\tdecayed_confidence}:",
        "  concept:ghostcrab:native-compatibility\tNative compatibility constraint\tconcept\thigh\t0.72"
      ].join("\n")
    );
    const database = createMockDatabase(vi.fn());

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
      recommended_action: "proceed_with_disclosure",
      backend: "native"
    });
    expect(readStructured(result).gap_nodes).toEqual([
      {
        id: "concept:ghostcrab:native-compatibility",
        label: "Native compatibility constraint",
        criticality: "high",
        decayed_confidence: 0.72
      }
    ]);
  });

  it("keeps gap node decayed_confidence null when the backend report omits it", async () => {
    mockCoverageFetch(
      [
        "kind: coverage_report",
        "summary:",
        "  workspace_id: ghostcrab-product",
        "  covered_nodes: 1",
        "  total_nodes: 2",
        "  graph_entities: 1",
        "  facet_rows: 2",
        "  projection_rows: 0",
        "  coverage_ratio: 0.5",
        "gaps[1]{id\tlabel\tentity_type\tcriticality\tdecayed_confidence}:",
        "  concept:ghostcrab:native-compatibility\tNative compatibility constraint\tconcept\thigh\tnull"
      ].join("\n")
    );
    const database = createMockDatabase(vi.fn());

    const result = await coverageTool.handler(
      { domain: "ghostcrab-product" },
      createToolContext(database)
    );

    const payload = readStructured(result);
    expect(payload.gap_nodes).toEqual([
      {
        id: "concept:ghostcrab:native-compatibility",
        label: "Native compatibility constraint",
        criticality: "high",
        decayed_confidence: null
      }
    ]);
  });

  it("ghostcrab_graph_search returns graph entities from MindBrain", async () => {
    mockGraphSearchFetch([
      {
        entity_id: 7,
        entity_type: "SEOIssue",
        name: "Missing title tag",
        confidence: 0.91,
        metadata_json: '{"collection_id":"seo","severity":"high"}',
        score: 4
      }
    ]);
    const database = createMockDatabase(vi.fn());

    const result = await graphSearchTool.handler(
      {
        workspace_id: "mindbrain-seo-audit",
        collection_id: "seo",
        query: "SEOIssue",
        entity_types: ["SEOIssue"],
        include_relations: false
      },
      createToolContext(database)
    );

    expect(readStructured(result)).toMatchObject({
      ok: true,
      tool: "ghostcrab_graph_search",
      backend: "native",
      searched_layers: ["graph_entity"],
      excluded_layers: ["facets", "projections", "memory_projections"],
      returned: 1,
      results: [
        expect.objectContaining({
          entity_type: "SEOIssue",
          name: "Missing title tag",
          metadata: expect.objectContaining({ severity: "high" })
        })
      ]
    });
  });

  it("ghostcrab_graph_search falls back to local SQL and can include relations", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("backend offline");
      })
    );
    const query = vi.fn<DatabaseClient["query"]>(async (sql) => {
      if (sql.includes("FROM graph_entity")) {
        return [
          {
            entity_id: 7,
            entity_type: "SEOIssue",
            name: "Missing title tag",
            confidence: 0.91,
            metadata_json: '{"collection_id":"seo","severity":"high"}',
            score: 4
          }
        ];
      }

      if (sql.includes("FROM graph_relation")) {
        return [
          {
            relation_id: 11,
            relation_type: "OBSERVED_IN",
            source_id: 7,
            target_id: 8,
            metadata_json: '{"phase":"a1_phase1"}'
          }
        ];
      }

      return [];
    });

    const result = await graphSearchTool.handler(
      {
        workspace_id: "mindbrain-seo-audit",
        collection_id: null,
        query: "SEOIssue",
        entity_types: ["SEOIssue"],
        metadata_filters: { severity: "high" },
        include_relations: true
      },
      createToolContext(createMockDatabase(query))
    );

    expect(readStructured(result)).toMatchObject({
      backend: "sql",
      collection_id: null,
      returned: 1,
      relations: [
        expect.objectContaining({
          relation_type: "OBSERVED_IN",
          metadata: expect.objectContaining({ phase: "a1_phase1" })
        })
      ]
    });
  });

  it("ghostcrab_graph_reindex projects raw graph grounding tables", async () => {
    const query = vi.fn<DatabaseClient["query"]>(async (sql) => {
      if (sql.includes("FROM entities_raw") && sql.includes("COUNT(*)")) {
        return [{ count: 2 }];
      }
      if (sql.includes("FROM entity_aliases_raw") && sql.includes("COUNT(*)")) {
        return [{ count: 1 }];
      }
      if (sql.includes("FROM relations_raw") && sql.includes("COUNT(*)")) {
        return [{ count: 1 }];
      }
      if (
        sql.includes("FROM entity_documents_raw") &&
        sql.includes("COUNT(*)")
      ) {
        return [{ count: 1 }];
      }
      if (sql.includes("FROM entity_chunks_raw") && sql.includes("COUNT(*)")) {
        return [{ count: 1 }];
      }
      return [];
    });

    const result = await graphReindexTool.handler(
      {
        workspace_id: "mindbrain-seo-audit",
        document_table_id: 42
      },
      createToolContext(createMockDatabase(query))
    );

    expect(readStructured(result)).toMatchObject({
      ok: true,
      tool: "ghostcrab_graph_reindex",
      backend: "sql",
      workspace_id: "mindbrain-seo-audit",
      document_table_id: 42,
      entity_count: 2,
      alias_count: 1,
      relation_count: 1,
      document_link_count: 1,
      chunk_link_count: 1,
      projected_count: 6
    });
    expect(
      query.mock.calls.some(([sql]) => sql.includes("graph_entity_chunk"))
    ).toBe(true);
  });

  it("ghostcrab_entity_chunks returns chunk grounding for graph entities", async () => {
    const query = vi.fn<DatabaseClient["query"]>(async (sql) => {
      expect(sql).toContain("FROM graph_entity_chunk c");
      return [
        {
          entity_id: 7,
          entity_type: "SEOIssue",
          entity_name: "Missing title tag",
          entity_metadata_json: '{"severity":"high"}',
          collection_id: "seo",
          doc_id: 3,
          chunk_index: 0,
          role: "evidence",
          confidence: 0.88,
          metadata_json: "{}",
          chunk_content: "The page is missing a title tag.",
          language: "english",
          token_count: 8,
          chunk_metadata_json: '{"section":"head"}',
          doc_nanoid: "doc_3",
          source_ref: "https://example.test/page",
          summary: "audit row"
        }
      ];
    });

    const result = await entityChunksTool.handler(
      {
        workspace_id: "mindbrain-seo-audit",
        entity_name: "Missing title tag",
        collection_id: "seo"
      },
      createToolContext(createMockDatabase(query))
    );

    expect(readStructured(result)).toMatchObject({
      ok: true,
      tool: "ghostcrab_entity_chunks",
      backend: "sql",
      returned: 1,
      results: [
        {
          entity: {
            entity_id: 7,
            entity_type: "SEOIssue",
            name: "Missing title tag",
            metadata: { severity: "high" }
          },
          chunk: {
            collection_id: "seo",
            doc_id: 3,
            chunk_index: 0,
            role: "evidence",
            confidence: 0.88,
            content: "The page is missing a title tag.",
            chunk_metadata: { section: "head" }
          },
          document: {
            doc_nanoid: "doc_3",
            source_ref: "https://example.test/page",
            summary: "audit row"
          }
        }
      ]
    });
  });

  it("traverses toward a target node and surfaces gap candidates", async () => {
    mockTraverseFetch(
      [
        {
          node_id: "task:start",
          node_label: "Start",
          node_type: "task",
          metadata_json: "{}",
          edge_label: null,
          depth: 0,
          path: ["task:start"]
        },
        {
          node_id: "concept:gap",
          node_label: "Missing Concept",
          node_type: "concept",
          metadata_json: '{"mastery":0}',
          edge_label: "REQUIRES",
          depth: 1,
          path: ["task:start", "concept:gap"]
        },
        {
          node_id: "task:target",
          node_label: "Target",
          node_type: "task",
          metadata_json: '{"mastery":1}',
          edge_label: "ENABLES",
          depth: 2,
          path: ["task:start", "concept:gap", "task:target"]
        }
      ],
      true
    );
    const database = createMockDatabase(vi.fn());

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
      backend: "native",
      graph_backend: "api/mindbrain/traverse"
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
    mockTraverseFetch([
      {
        node_id: "component:ghostcrab:native-extension-build",
        node_label: "Native Extension Build",
        node_type: "component",
        metadata_json: '{"domain":"ghostcrab-product"}',
        edge_label: null,
        depth: 0,
        path: ["component:ghostcrab:native-extension-build"]
      },
      {
        node_id: "distribution:ghostcrab:compose-mcp-service",
        node_label: "Compose MCP Service",
        node_type: "distribution",
        metadata_json: '{"domain":"ghostcrab-product"}',
        edge_label: "BLOCKS",
        depth: 1,
        path: [
          "component:ghostcrab:native-extension-build",
          "distribution:ghostcrab:compose-mcp-service"
        ]
      }
    ]);
    const database = createMockDatabase(vi.fn());

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
      node_count: 2,
      backend: "native"
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
    mockTraverseFetch([
      {
        node_id: "task:ghostcrab:native-toolchain-pinning",
        node_label: "Native Toolchain Pinning",
        node_type: "task",
        metadata_json: '{"domain":"ghostcrab-product"}',
        edge_label: null,
        depth: 0,
        path: ["task:ghostcrab:native-toolchain-pinning"]
      },
      {
        node_id: "concept:ghostcrab:native-compatibility",
        node_label: "Native compatibility constraint",
        node_type: "concept",
        metadata_json: '{"mastery":0,"status":"gap"}',
        edge_label: "HAS_GAP",
        depth: 1,
        path: [
          "task:ghostcrab:native-toolchain-pinning",
          "concept:ghostcrab:native-compatibility"
        ]
      }
    ]);
    const database = createMockDatabase(vi.fn());

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
      node_count: 2,
      backend: "native"
    });
    expect(readStructured(result).gap_candidates).toEqual([
      {
        id: "concept:ghostcrab:native-compatibility",
        label: "Native compatibility constraint",
        via: "HAS_GAP"
      }
    ]);
  });

  it("uses the backend traverse route at depth=1", async () => {
    mockTraverseFetch([
      {
        node_id: "task:start",
        node_label: "Start Task",
        node_type: "task",
        metadata_json: '{"label":"Start Task","node_type":"task"}',
        edge_label: null,
        depth: 0,
        path: ["task:start"]
      },
      {
        node_id: "concept:linked",
        node_label: "Linked Concept",
        node_type: "concept",
        metadata_json:
          '{"label":"Linked Concept","node_type":"concept","mastery":1}',
        edge_label: "REQUIRES",
        depth: 1,
        path: ["task:start", "concept:linked"]
      }
    ]);
    const database = createMockDatabase(vi.fn());

    const result = await traverseTool.handler(
      { start: "task:start", depth: 1 },
      createToolContext(database)
    );

    expect(readStructured(result)).toMatchObject({
      ok: true,
      tool: "ghostcrab_traverse",
      backend: "native",
      graph_backend: "api/mindbrain/traverse",
      node_count: 2
    });
    // Verify root node uses real metadata from entity query
    const path = readStructured(result).path as Array<Record<string, unknown>>;
    expect(path[0]).toMatchObject({
      node_id: "task:start",
      node_label: "Start Task",
      node_type: "task",
      depth: 0
    });
  });

  it("filters edge labels in the backend traverse response", async () => {
    mockTraverseFetch([
      {
        node_id: "task:origin",
        node_label: "Origin",
        node_type: "task",
        metadata_json: '{"label":"Origin","node_type":"task"}',
        edge_label: null,
        depth: 0,
        path: ["task:origin"]
      },
      {
        node_id: "concept:a",
        node_label: "Concept A",
        node_type: "concept",
        metadata_json: '{"label":"Concept A","node_type":"concept"}',
        edge_label: "REQUIRES",
        depth: 1,
        path: ["task:origin", "concept:a"]
      }
    ]);
    const database = createMockDatabase(vi.fn());

    const result = await traverseTool.handler(
      { start: "task:origin", depth: 1, edge_labels: ["REQUIRES"] },
      createToolContext(database)
    );

    // Only REQUIRES should remain after post-filter, plus the start node = 2 total
    expect(readStructured(result)).toMatchObject({
      ok: true,
      tool: "ghostcrab_traverse",
      backend: "native",
      node_count: 2
    });
    const path = readStructured(result).path as Array<Record<string, unknown>>;
    const edgeLabels = path.map((n) => n["edge_label"]);
    expect(edgeLabels).not.toContain("ENABLES");
    expect(edgeLabels).toContain("REQUIRES");
  });

  it("normalizes backend rows when metadata is partial", async () => {
    mockTraverseFetch([
      {
        node_id: "task:start",
        node_label: "Start",
        node_type: "task",
        metadata_json: '{"label":"Start","node_type":"task"}',
        edge_label: null,
        depth: 0,
        path: ["task:start"]
      },
      {
        node_id: "concept:partial",
        node_label: "concept:partial",
        node_type: "entity",
        metadata_json: "{}",
        edge_label: "REQUIRES",
        depth: 1,
        path: ["task:start", "concept:partial"]
      }
    ]);
    const database = createMockDatabase(vi.fn());

    const result = await traverseTool.handler(
      { start: "task:start", depth: 1 },
      createToolContext(database)
    );

    expect(readStructured(result)).toMatchObject({
      ok: true,
      tool: "ghostcrab_traverse",
      backend: "native",
      node_count: 2,
      gap_candidates: []
    });
  });

  it("returns an empty path when the backend reports no matches", async () => {
    mockTraverseFetch([], false);
    const database = createMockDatabase(vi.fn());

    const result = await traverseTool.handler(
      { start: "task:nonexistent", depth: 1 },
      createToolContext(database)
    );

    expect(readStructured(result)).toMatchObject({
      ok: true,
      tool: "ghostcrab_traverse",
      node_count: 0,
      backend: "native"
    });
  });

  it("reports target lookups from the backend route", async () => {
    mockTraverseFetch([
      {
        node_id: "task:start",
        node_label: "Start",
        node_type: "task",
        metadata_json: "{}",
        edge_label: null,
        depth: 0,
        path: ["task:start"]
      }
    ]);
    const database = createMockDatabase(vi.fn());

    const result = await traverseTool.handler(
      { start: "task:start", depth: 1, target: "concept:gap" },
      createToolContext(database)
    );

    expect(readStructured(result)).toMatchObject({
      ok: true,
      tool: "ghostcrab_traverse",
      backend: "native"
    });
  });

  it("handles depth greater than 1 via the backend route", async () => {
    mockTraverseFetch([
      {
        node_id: "task:start",
        node_label: "Start",
        node_type: "task",
        metadata_json: "{}",
        edge_label: null,
        depth: 0,
        path: ["task:start"]
      }
    ]);
    const database = createMockDatabase(vi.fn());

    const result = await traverseTool.handler(
      { start: "task:start", depth: 3 },
      createToolContext(database)
    );

    expect(readStructured(result)).toMatchObject({
      ok: true,
      tool: "ghostcrab_traverse",
      backend: "native",
      graph_backend: "api/mindbrain/traverse"
    });
  });

  it("upserts nodes and updates an existing edge inside one transaction", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("INSERT INTO graph_entity")) {
        return [];
      }

      if (sql.includes("INSERT OR IGNORE INTO graph_entity_alias")) {
        return [];
      }

      if (
        sql.includes("FROM graph_entity") &&
        sql.includes("WHERE entity_type =")
      ) {
        return [{ entity_id: 1 }];
      }

      if (sql.includes("FROM graph_relation") && sql.includes("LIMIT 1")) {
        return [{ relation_id: 1 }];
      }

      if (sql.includes("UPDATE graph_relation")) {
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
      edge: { learned: true, id: "1", label: "HAS_GAP", updated: true }
    });
  });
});
