import { afterEach, describe, expect, it, vi } from "vitest";

import type { DatabaseClient, Queryable } from "../../src/db/client.js";
import { createToolContext } from "../helpers/tool-context.js";
import { coverageTool } from "../../src/tools/dgraph/coverage.js";
import {
  graphDiagnosticsTool,
  graphGapRulesDeleteTool,
  graphGapRulesImportTool,
  graphGapRulesTool,
  graphRuleEvaluationsRunTool,
  graphRuleEvaluationsTool,
  graphRuleEventsTool
} from "../../src/tools/dgraph/diagnostics.js";
import { entityChunksTool } from "../../src/tools/dgraph/entity-chunks.js";
import { graphPathTool } from "../../src/tools/dgraph/graph-path.js";
import { graphReindexTool } from "../../src/tools/dgraph/graph-reindex.js";
import { collectionReindexTool } from "../../src/tools/dgraph/collection-reindex.js";
import { graphSearchTool } from "../../src/tools/dgraph/graph-search.js";
import { graphSubgraphTool } from "../../src/tools/dgraph/graph-subgraph.js";
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

function mockDiagnosticsFetch(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/mindbrain/graph/diagnostics")) {
        expect(url).toContain("workspace_id=immeuble-demo");
        expect(url).toContain("limit=25");
        return new Response(
          JSON.stringify({
            kind: "graph_diagnostics_report",
            summary: {
              workspace_id: "immeuble-demo",
              ontology_id: "immeuble-demo::core",
              issues_total: 1
            },
            issues: [
              {
                kind: "too_many_relations",
                severity: "error",
                label: "Unit must belong to one building",
                suggested_action: "review_duplicate_or_conflicting_relations",
                entity_id: 7,
                rule_id: "unit-one-building",
                observed_count: 2,
                expected_min: 1,
                expected_max: 1
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url.includes("/api/mindbrain/graph/gap-rules/import")) {
        expect(init?.method).toBe("POST");
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        expect(body).toMatchObject({
          ontology_id: "immeuble-demo::core",
          workspace_id: "immeuble-demo",
          replace: true
        });
        return new Response(JSON.stringify({ ok: true, imported: 1 }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }

      if (url.includes("/api/mindbrain/graph/gap-rules/delete")) {
        expect(init?.method).toBe("POST");
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        expect(body).toMatchObject({
          rule_ids: ["leased-unit-has-lease"],
          ontology_id: "immeuble-demo::core",
          workspace_id: "immeuble-demo"
        });
        return new Response(JSON.stringify({ ok: true, deleted: 1 }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }

      if (url.includes("/api/mindbrain/graph/rule-evaluations/run")) {
        expect(init?.method).toBe("POST");
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        expect(body).toMatchObject({
          workspace_id: "immeuble-demo",
          limit: 25,
          create_remediation_actions: true
        });
        return new Response(
          JSON.stringify({
            kind: "graph_rule_evaluation_run",
            workspace_id: "immeuble-demo",
            ontology_id: "immeuble-demo::core",
            evaluated: 2,
            changed: 1,
            events_created: 1,
            invalid_count: 1,
            remediation_actions_created: 0,
            events: [
              {
                event_id: "event-1",
                rule_id: "unit-one-building",
                subject_entity_id: 7,
                from_state: "unknown",
                to_state: "invalid",
                observed_count: 2,
                expected_min: 1,
                expected_max: 1,
                idempotency_key: "key-1",
                created_at_unix: 123
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url.includes("/api/mindbrain/graph/rule-evaluations")) {
        expect(url).toContain("workspace_id=immeuble-demo");
        expect(url).toContain("limit=25");
        return new Response(
          JSON.stringify({
            kind: "graph_rule_evaluations",
            workspace_id: "immeuble-demo",
            ontology_id: "immeuble-demo::core",
            evaluations: [
              {
                rule_id: "unit-one-building",
                subject_entity_id: 7,
                state: "invalid",
                observed_count: 2,
                expected_min: 1,
                expected_max: 1,
                last_evaluated_at_unix: 123,
                updated_at_unix: 123
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url.includes("/api/mindbrain/graph/rule-events")) {
        expect(url).toContain("workspace_id=immeuble-demo");
        expect(url).toContain("limit=25");
        return new Response(
          JSON.stringify({
            kind: "graph_rule_events",
            workspace_id: "immeuble-demo",
            ontology_id: "immeuble-demo::core",
            events: [
              {
                event_id: "event-1",
                rule_id: "unit-one-building",
                subject_entity_id: 7,
                from_state: "unknown",
                to_state: "invalid",
                observed_count: 2,
                expected_min: 1,
                expected_max: 1,
                idempotency_key: "key-1",
                created_at_unix: 123
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url.includes("/api/mindbrain/graph/gap-rules")) {
        expect(url).toContain("workspace_id=immeuble-demo");
        return new Response(
          JSON.stringify({
            kind: "graph_gap_rules",
            ontology_id: "immeuble-demo::core",
            workspace_id: "immeuble-demo",
            rules: [
              {
                rule_id: "unit-one-building",
                ontology_id: "immeuble-demo::core",
                workspace_id: "immeuble-demo",
                entity_type: "unit",
                relation_type: "part_of",
                direction: "out",
                target_entity_type: "building",
                min_count: 1,
                max_count: 1,
                severity: "error",
                label: "Unit must belong to one building",
                enabled: true,
                metadata: {}
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      throw new Error(`Unexpected fetch: ${url}`);
    }
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("dgraph tools", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("advertises workspace_id for graph-path and graph-subgraph", () => {
    const pathProperties = graphPathTool.definition.inputSchema.properties as
      | Record<string, unknown>
      | undefined;
    const subgraphProperties = graphSubgraphTool.definition.inputSchema
      .properties as Record<string, unknown> | undefined;

    expect(pathProperties).toHaveProperty("workspace_id");
    expect(subgraphProperties).toHaveProperty("workspace_id");
  });

  it("counts backend node events in graph-subgraph results", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      expect(url).toContain("/api/mindbrain/graph/subgraph");
      expect(url).toContain("workspace_id=serenity-v4");
      return new Response(
        JSON.stringify([
          { seq: 0, kind: "seed_node", payload: { entity: { entity_id: 33 } } },
          { seq: 1, kind: "node", payload: { entity: { entity_id: 85 } } },
          { seq: 2, kind: "edge", payload: { relation: { relation_id: 520 } } },
          {
            seq: 3,
            kind: "done",
            payload: { kind: "subgraph", node_count: 2, edge_count: 1 }
          }
        ]),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const database = createMockDatabase(vi.fn());
    const context = createToolContext(database);
    context.session.workspace_id = "default";

    const result = await graphSubgraphTool.handler(
      {
        workspace_id: "serenity-v4",
        seed_ids: [33],
        hops: 1,
        edge_types: ["ouvrir"]
      },
      context
    );

    expect(readStructured(result)).toMatchObject({
      ok: true,
      tool: "ghostcrab_graph_subgraph",
      workspace_id: "serenity-v4",
      node_count: 2,
      edge_count: 1
    });
  });

  it("passes workspace_id to graph-path backend", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      expect(url).toContain("workspace_id=immeuble-demo");
      return new Response("path: ok", {
        status: 200,
        headers: { "content-type": "text/plain; charset=utf-8" }
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const database = createMockDatabase(vi.fn());
    const context = createToolContext(database);
    context.session.workspace_id = "default";

    const result = await graphPathTool.handler(
      {
        source: "A",
        target: "B",
        workspace_id: "immeuble-demo"
      },
      context
    );

    expect(readStructured(result)).toMatchObject({
      ok: true,
      tool: "ghostcrab_graph_path",
      workspace_id: "immeuble-demo"
    });
    expect(fetchMock).toHaveBeenCalled();
  });

  it("calls native reindexAll for ghostcrab_collection_reindex", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toEqual({
          workspace_id: "immeuble-demo",
          collection_id: "immeuble-demo::main",
          table_id: 1
        });
        return new Response(
          JSON.stringify({
            workspace_id: "immeuble-demo",
            collection_id: "immeuble-demo::main",
            table_id: 1,
            graph_projected: 32,
            facet_assignments: 10,
            bm25_documents: 5
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        );
      }
    );
    vi.stubGlobal("fetch", fetchMock);

    const database = createMockDatabase(vi.fn());
    const context = createToolContext(database);
    context.session.workspace_id = "immeuble-demo";

    const result = await collectionReindexTool.handler(
      {
        collection_id: "immeuble-demo::main",
        table_id: 1
      },
      context
    );

    expect(readStructured(result)).toMatchObject({
      ok: true,
      tool: "ghostcrab_collection_reindex",
      workspace_id: "immeuble-demo",
      collection_id: "immeuble-demo::main",
      table_id: 1,
      backend: "mindbrain/reindex/all"
    });
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

  it("keeps unsafe 64-bit relation ids distinct when including graph relations", async () => {
    mockGraphSearchFetch([
      {
        entity_id: 1,
        entity_type: "Document",
        name: "doc:a",
        confidence: 1,
        metadata_json: "{}",
        score: 1
      }
    ]);
    const relationA = "9162202066626072000";
    const relationB = "9162202066626072001";
    const query = vi.fn<DatabaseClient["query"]>(async (sql) => {
      if (sql.includes("FROM graph_relation_property")) {
        return [
          {
            relation_id: relationA,
            property_key: "marker",
            value_type: "text",
            value_text: "first",
            value_number: null,
            value_integer: null,
            ref_doc_id: null,
            currency: null
          },
          {
            relation_id: relationB,
            property_key: "marker",
            value_type: "text",
            value_text: "second",
            value_number: null,
            value_integer: null,
            ref_doc_id: null,
            currency: null
          }
        ];
      }
      if (sql.includes("FROM graph_relation")) {
        return [
          {
            relation_id: relationA,
            relation_type: "REFERENCES",
            source_id: 1,
            target_id: 2,
            metadata_json: "{}"
          },
          {
            relation_id: relationB,
            relation_type: "REFERENCES",
            source_id: 1,
            target_id: 3,
            metadata_json: "{}"
          }
        ];
      }
      return [];
    });

    const result = await graphSearchTool.handler(
      {
        workspace_id: "mindbrain-seo-audit",
        query: "doc:a",
        include_relations: true
      },
      createToolContext(createMockDatabase(query))
    );

    const relations = readStructured(result).relations as Array<{
      relation_id: string;
      relation_properties: Array<{ value_text: string | null }>;
    }>;
    expect(relations).toHaveLength(2);
    expect(relations.map((row) => row.relation_id)).toEqual([
      relationA,
      relationB
    ]);
    expect(
      relations.map((row) => row.relation_properties[0]?.value_text)
    ).toEqual(["first", "second"]);
  });

  it("wraps MindBrain graph diagnostics", async () => {
    mockDiagnosticsFetch();
    const context = createToolContext(createMockDatabase(vi.fn()));
    context.session.workspace_id = "default";

    const result = await graphDiagnosticsTool.handler(
      {
        workspace_id: "immeuble-demo",
        limit: 25
      },
      context
    );

    expect(readStructured(result)).toMatchObject({
      ok: true,
      tool: "ghostcrab_graph_diagnostics",
      backend: "mindbrain/graph/diagnostics",
      workspace_id: "immeuble-demo",
      summary: expect.objectContaining({
        issues_total: 1
      }),
      issues: [
        expect.objectContaining({
          kind: "too_many_relations",
          rule_id: "unit-one-building"
        })
      ]
    });
  });

  it("lists and imports MindBrain graph gap rules", async () => {
    const fetchMock = mockDiagnosticsFetch();
    const context = createToolContext(createMockDatabase(vi.fn()));
    context.session.workspace_id = "immeuble-demo";

    const rules = await graphGapRulesTool.handler({}, context);
    expect(readStructured(rules)).toMatchObject({
      ok: true,
      tool: "ghostcrab_graph_gap_rules",
      backend: "mindbrain/graph/gap-rules",
      workspace_id: "immeuble-demo",
      ontology_id: "immeuble-demo::core",
      rules: [
        expect.objectContaining({
          rule_id: "unit-one-building",
          entity_type: "unit",
          relation_type: "part_of"
        })
      ]
    });

    const imported = await graphGapRulesImportTool.handler(
      {
        ontology_id: "immeuble-demo::core",
        replace: true,
        rules: [
          {
            rule_id: "unit-one-building",
            entity_type: "unit",
            relation_type: "part_of",
            direction: "out",
            target_entity_type: "building",
            min_count: 1,
            max_count: 1,
            severity: "error",
            label: "Unit must belong to one building"
          }
        ]
      },
      context
    );

    expect(readStructured(imported)).toMatchObject({
      ok: true,
      tool: "ghostcrab_graph_gap_rules_import",
      backend: "mindbrain/graph/gap-rules/import",
      workspace_id: "immeuble-demo",
      ontology_id: "immeuble-demo::core",
      imported: 1
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("deletes MindBrain graph gap rules by rule_id", async () => {
    const fetchMock = mockDiagnosticsFetch();
    const context = createToolContext(createMockDatabase(vi.fn()));
    context.session.workspace_id = "immeuble-demo";

    const result = await graphGapRulesDeleteTool.handler(
      {
        rule_ids: ["leased-unit-has-lease"],
        ontology_id: "immeuble-demo::core"
      },
      context
    );

    expect(readStructured(result)).toMatchObject({
      ok: true,
      tool: "ghostcrab_graph_gap_rules_delete",
      backend: "mindbrain/graph/gap-rules/delete",
      workspace_id: "immeuble-demo",
      ontology_id: "immeuble-demo::core",
      deleted: 1
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("runs and reads MindBrain graph rule evaluations and events", async () => {
    const fetchMock = mockDiagnosticsFetch();
    const context = createToolContext(createMockDatabase(vi.fn()));
    context.session.workspace_id = "immeuble-demo";

    const run = await graphRuleEvaluationsRunTool.handler(
      {
        limit: 25,
        create_remediation_actions: true
      },
      context
    );

    expect(readStructured(run)).toMatchObject({
      ok: true,
      tool: "ghostcrab_graph_rule_evaluations_run",
      backend: "mindbrain/graph/rule-evaluations/run",
      workspace_id: "immeuble-demo",
      ontology_id: "immeuble-demo::core",
      evaluated: 2,
      changed: 1,
      events_created: 1,
      invalid_count: 1,
      remediation_actions_created: 0,
      events: [
        expect.objectContaining({
          rule_id: "unit-one-building",
          from_state: "unknown",
          to_state: "invalid"
        })
      ]
    });

    const evaluations = await graphRuleEvaluationsTool.handler(
      { workspace_id: "immeuble-demo", limit: 25 },
      context
    );
    expect(readStructured(evaluations)).toMatchObject({
      ok: true,
      tool: "ghostcrab_graph_rule_evaluations",
      backend: "mindbrain/graph/rule-evaluations",
      workspace_id: "immeuble-demo",
      evaluations: [
        expect.objectContaining({
          rule_id: "unit-one-building",
          state: "invalid"
        })
      ]
    });

    const events = await graphRuleEventsTool.handler(
      { workspace_id: "immeuble-demo", limit: 25 },
      context
    );
    expect(readStructured(events)).toMatchObject({
      ok: true,
      tool: "ghostcrab_graph_rule_events",
      backend: "mindbrain/graph/rule-events",
      workspace_id: "immeuble-demo",
      events: [
        expect.objectContaining({
          event_id: "event-1",
          idempotency_key: "key-1"
        })
      ]
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("returns backend_unavailable when MindBrain graph-search endpoint is offline", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("backend offline");
      })
    );

    const result = await graphSearchTool.handler(
      {
        workspace_id: "mindbrain-seo-audit",
        collection_id: null,
        query: "SEOIssue",
        entity_types: ["SEOIssue"],
        metadata_filters: { severity: "high" },
        include_relations: true
      },
      createToolContext(createMockDatabase(async () => []))
    );

    expect(result.isError).toBe(true);
    const structured = result.structuredContent as Record<string, unknown>;
    expect(structured).toMatchObject({
      ok: false,
      tool: "ghostcrab_graph_search",
      error: expect.objectContaining({ code: "backend_unavailable" })
    });
  });

  it("ghostcrab_graph_reindex projects raw graph grounding tables", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("fetch failed");
      })
    );
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

  it("ghostcrab_graph_reindex reports relations the native backend skipped as dangling", async () => {
    // Regression: one relation whose endpoint is outside the workspace used to
    // abort the whole projection. It is now skipped and counted, and the count
    // has to reach the caller with an actionable warning.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            workspace_id: "mindbrain-seo-audit",
            projected_count: 4310,
            document_table_id: null,
            adjacency_rebuilt: true,
            skipped_cross_workspace_relations: 3
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      })
    );

    const result = await graphReindexTool.handler(
      { workspace_id: "mindbrain-seo-audit" },
      createToolContext(createMockDatabase(async () => []))
    );

    const structured = readStructured(result);
    expect(structured).toMatchObject({
      ok: true,
      tool: "ghostcrab_graph_reindex",
      backend: "mindbrain/reindex/graph",
      projected_count: 4310,
      skipped_cross_workspace_relations: 3
    });
    expect(structured.warnings).toEqual([
      expect.stringContaining("3 relation(s) were skipped")
    ]);
  });

  it("ghostcrab_graph_reindex stays warning-free when no relation was skipped", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            workspace_id: "mindbrain-seo-audit",
            projected_count: 12,
            document_table_id: null,
            adjacency_rebuilt: true,
            skipped_cross_workspace_relations: 0
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      })
    );

    const result = await graphReindexTool.handler(
      { workspace_id: "mindbrain-seo-audit" },
      createToolContext(createMockDatabase(async () => []))
    );

    const structured = readStructured(result);
    expect(structured).toMatchObject({
      ok: true,
      skipped_cross_workspace_relations: 0
    });
    expect(structured.warnings).toBeUndefined();
  });

  it("ghostcrab_graph_reindex returns native backend errors instead of hiding them with SQL fallback", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(JSON.stringify({ error: "Boom" }), {
          status: 500,
          statusText: "Internal Server Error",
          headers: { "content-type": "application/json" }
        });
      })
    );
    const query = vi.fn<DatabaseClient["query"]>(async () => []);

    const result = await graphReindexTool.handler(
      { workspace_id: "mindbrain-seo-audit" },
      createToolContext(createMockDatabase(query))
    );

    expect(result.isError).toBe(true);
    expect(query).not.toHaveBeenCalled();
    expect(result.structuredContent).toMatchObject({
      ok: false,
      tool: "ghostcrab_graph_reindex",
      error: expect.objectContaining({ code: "backend_reindex_failed" })
    });
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
        sql.includes("WHERE workspace_id =") &&
        sql.includes("AND entity_type =")
      ) {
        return [{ entity_id: 1 }];
      }
      if (sql.includes("INSERT INTO workspaces")) return [];
      if (sql.includes("INSERT INTO ontologies")) return [];
      if (sql.includes("INSERT INTO entities_raw")) return [];
      if (sql.includes("INSERT INTO relations_raw")) return [];

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

  it("creates a new edge with relation_properties and writes raw source plus graph projection", async () => {
    const sqlCalls: string[] = [];
    const query = vi.fn(async (sql: string) => {
      sqlCalls.push(sql);

      if (sql.includes("AS next_id") && sql.includes("graph_entity")) {
        return [{ next_id: 2 }];
      }
      if (sql.includes("AS next_id") && sql.includes("graph_relation")) {
        return [{ next_id: 5 }];
      }
      if (sql.includes("INSERT INTO graph_entity")) return [];
      if (sql.includes("INSERT OR IGNORE INTO graph_entity_alias")) return [];
      if (
        sql.includes("FROM graph_entity") &&
        sql.includes("WHERE workspace_id =") &&
        sql.includes("AND entity_type =")
      ) {
        return [{ entity_id: 2 }];
      }
      if (
        sql.includes("FROM graph_relation") &&
        sql.includes("LIMIT 1") &&
        !sql.includes("ORDER BY relation_id DESC")
      ) {
        return [];
      }
      if (sql.includes("ORDER BY relation_id DESC")) {
        return [{ relation_id: "5" }];
      }
      if (sql.includes("INSERT INTO graph_relation")) return [];
      if (sql.includes("INSERT INTO workspaces")) return [];
      if (sql.includes("INSERT INTO ontologies")) return [];
      if (sql.includes("INSERT INTO entities_raw")) return [];
      if (sql.includes("INSERT INTO relations_raw")) return [];
      if (sql.includes("INSERT INTO relation_properties_raw")) return [];
      if (sql.includes("INSERT INTO graph_relation_property")) return [];
      if (sql.includes("JOIN graph_entity") && sql.includes("relation_type"))
        return [];

      return [];
    });
    const database = createMockDatabase(query);

    const result = await learnTool.handler(
      {
        edge: {
          source: "doc:a",
          target: "doc:b",
          label: "REFERENCES",
          weight: 0.9,
          relation_properties: [
            {
              property_key: "url",
              value_type: "uri",
              value_text: "https://example.com"
            }
          ]
        }
      },
      createToolContext(database)
    );

    expect(readStructured(result)).toMatchObject({
      ok: true,
      tool: "ghostcrab_learn",
      edge: {
        learned: true,
        created: true,
        id: "5",
        label: "REFERENCES",
        relation_properties_count: 1
      }
    });
    expect(
      sqlCalls.some((s) => s.includes("INSERT INTO relation_properties_raw"))
    ).toBe(true);
    expect(
      sqlCalls.some((s) => s.includes("INSERT INTO graph_relation_property"))
    ).toBe(true);
    expect(
      sqlCalls.some(
        (s) => s.includes("AS next_id") && s.includes("graph_relation")
      )
    ).toBe(true);
  });

  it("allocates safe relation ids when legacy rows exceed JS safe integer range", async () => {
    const sqlCalls: string[] = [];
    let allocatedRelationId = 0;
    const query = vi.fn(async (sql: string, params?: readonly unknown[]) => {
      sqlCalls.push(sql);

      if (sql.includes("AS next_id") && sql.includes("graph_entity")) {
        return [{ next_id: 1 }];
      }
      if (sql.includes("AS next_id") && sql.includes("graph_relation")) {
        allocatedRelationId += 1;
        return [{ next_id: allocatedRelationId }];
      }
      if (sql.includes("INSERT INTO graph_entity")) return [];
      if (sql.includes("INSERT OR IGNORE INTO graph_entity_alias")) return [];
      if (
        sql.includes("FROM graph_entity") &&
        sql.includes("WHERE workspace_id =") &&
        sql.includes("AND entity_type =")
      ) {
        const nodeName = String(params?.[2] ?? "");
        const entityId = nodeName.endsWith(":a")
          ? 1
          : nodeName.endsWith(":b")
            ? 2
            : 3;
        return [{ entity_id: entityId }];
      }
      if (
        sql.includes("FROM graph_relation") &&
        sql.includes("LIMIT 1") &&
        !sql.includes("ORDER BY relation_id DESC")
      ) {
        return [];
      }
      if (sql.includes("INSERT INTO graph_relation")) return [];
      if (sql.includes("ORDER BY relation_id DESC")) {
        return [{ relation_id: String(allocatedRelationId) }];
      }
      if (sql.includes("INSERT INTO workspaces")) return [];
      if (sql.includes("INSERT INTO ontologies")) return [];
      if (sql.includes("INSERT INTO entities_raw")) return [];
      if (sql.includes("INSERT INTO relations_raw")) return [];

      return [];
    });
    const database = createMockDatabase(query);

    const first = await learnTool.handler(
      {
        edge: {
          source: "doc:a",
          target: "doc:b",
          label: "REFERENCES"
        }
      },
      createToolContext(database)
    );
    const second = await learnTool.handler(
      {
        edge: {
          source: "doc:a",
          target: "doc:c",
          label: "REFERENCES"
        }
      },
      createToolContext(database)
    );

    const firstEdge = readStructured(first).edge as Record<string, unknown>;
    const secondEdge = readStructured(second).edge as Record<string, unknown>;
    expect(firstEdge.id).toBe("1");
    expect(secondEdge.id).toBe("2");
    expect(firstEdge.id).not.toBe(secondEdge.id);
    expect(
      sqlCalls.some(
        (s) => s.includes("AS next_id") && s.includes("graph_relation")
      )
    ).toBe(true);
  });

  it("updates an existing edge with relation_properties and issues UPDATE + raw property upsert", async () => {
    const sqlCalls: string[] = [];
    const query = vi.fn(async (sql: string) => {
      sqlCalls.push(sql);

      if (sql.includes("INSERT INTO graph_entity")) return [];
      if (sql.includes("INSERT OR IGNORE INTO graph_entity_alias")) return [];
      if (
        sql.includes("FROM graph_entity") &&
        sql.includes("WHERE workspace_id =") &&
        sql.includes("AND entity_type =")
      ) {
        return [{ entity_id: 3 }];
      }
      if (sql.includes("FROM graph_relation") && sql.includes("LIMIT 1")) {
        return [{ relation_id: 7 }];
      }
      if (sql.includes("UPDATE graph_relation")) return [];
      if (sql.includes("INSERT INTO workspaces")) return [];
      if (sql.includes("INSERT INTO ontologies")) return [];
      if (sql.includes("INSERT INTO entities_raw")) return [];
      if (sql.includes("INSERT INTO relations_raw")) return [];
      if (sql.includes("INSERT INTO relation_properties_raw")) return [];
      if (sql.includes("INSERT INTO graph_relation_property")) return [];
      if (sql.includes("JOIN graph_entity") && sql.includes("relation_type")) {
        return [{ relation_id: 7 }];
      }

      return [];
    });
    const database = createMockDatabase(query);

    const result = await learnTool.handler(
      {
        edge: {
          source: "doc:a",
          target: "doc:b",
          label: "REFERENCES",
          weight: 0.8,
          relation_properties: [
            {
              property_key: "weight_bp",
              value_type: "percentage_bp",
              value_number: 8000
            }
          ]
        }
      },
      createToolContext(database)
    );

    expect(readStructured(result)).toMatchObject({
      ok: true,
      tool: "ghostcrab_learn",
      edge: {
        learned: true,
        updated: true,
        id: "7",
        relation_properties_count: 1
      }
    });
    expect(sqlCalls.some((s) => s.includes("UPDATE graph_relation"))).toBe(
      true
    );
    expect(
      sqlCalls.some((s) => s.includes("INSERT INTO relation_properties_raw"))
    ).toBe(true);
    expect(
      sqlCalls.some((s) => s.includes("INSERT INTO graph_relation_property"))
    ).toBe(true);
  });

  it("ghostcrab_graph_reindex projects relation_properties_raw into graph_relation_property", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("fetch failed");
      })
    );
    const sqlCalls: string[] = [];
    const query = vi.fn<DatabaseClient["query"]>(async (sql) => {
      sqlCalls.push(sql);

      if (sql.includes("FROM entities_raw") && sql.includes("COUNT(*)"))
        return [{ count: 1 }];
      if (sql.includes("FROM entity_aliases_raw") && sql.includes("COUNT(*)"))
        return [{ count: 0 }];
      if (sql.includes("FROM relations_raw") && sql.includes("COUNT(*)"))
        return [{ count: 2 }];
      if (
        sql.includes("FROM relation_properties_raw") &&
        sql.includes("COUNT(*)")
      )
        return [{ count: 3 }];
      if (sql.includes("FROM entity_chunks_raw") && sql.includes("COUNT(*)"))
        return [{ count: 0 }];
      return [];
    });

    const result = await graphReindexTool.handler(
      { workspace_id: "ws-test" },
      createToolContext(createMockDatabase(query))
    );

    expect(readStructured(result)).toMatchObject({
      ok: true,
      tool: "ghostcrab_graph_reindex",
      relation_count: 2,
      relation_property_count: 3,
      projected_count: 6
    });
    expect(
      sqlCalls.some((s) => s.includes("FROM relation_properties_raw"))
    ).toBe(true);
    expect(
      sqlCalls.some((s) =>
        s.includes("INSERT OR REPLACE INTO graph_relation_property")
      )
    ).toBe(true);
  });

  it("ghostcrab_graph_search returns typed relation_properties when include_relations is true", async () => {
    mockGraphSearchFetch([
      {
        entity_id: 10,
        entity_type: "Concept",
        name: "sprint-planning",
        confidence: 1.0,
        metadata_json: "{}",
        score: 1
      }
    ]);

    const query = vi.fn<DatabaseClient["query"]>(async (sql) => {
      if (
        sql.includes("FROM graph_relation") &&
        sql.includes("deprecated_at IS NULL")
      ) {
        return [
          {
            relation_id: 20,
            relation_type: "BLOCKS",
            source_id: 10,
            target_id: 11,
            metadata_json: "{}"
          }
        ];
      }
      if (sql.includes("FROM graph_relation_property")) {
        return [
          {
            relation_id: 20,
            property_key: "reason",
            value_type: "text",
            value_text: "missing approval",
            value_number: null,
            value_integer: null,
            ref_doc_id: null,
            currency: null
          }
        ];
      }
      return [];
    });

    const result = await graphSearchTool.handler(
      {
        workspace_id: "ws-test",
        query: "sprint",
        include_relations: true
      },
      createToolContext(createMockDatabase(query))
    );

    const structured = readStructured(result);
    expect(structured).toMatchObject({
      ok: true,
      tool: "ghostcrab_graph_search",
      returned: 1
    });
    const relations = structured.relations as Array<Record<string, unknown>>;
    expect(relations).toHaveLength(1);
    expect(relations[0]).toMatchObject({
      relation_id: 20,
      relation_type: "BLOCKS",
      relation_properties: [
        {
          property_key: "reason",
          value_type: "text",
          value_text: "missing approval"
        }
      ]
    });
  });
});
