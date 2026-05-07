import { afterEach, describe, expect, it, vi } from "vitest";

import type { DatabaseClient, Queryable } from "../../src/db/client.js";
import {
  projectionGetTool,
  ProjectionGetInput
} from "../../src/tools/pragma/projection-get.js";
import { createToolContext } from "../helpers/tool-context.js";

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
  result: { structuredContent?: unknown }
): Record<string, unknown> {
  expect(result.structuredContent).toBeDefined();
  return result.structuredContent as Record<string, unknown>;
}

describe("ghostcrab_projection_get", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads materialized graph projections through the MindBrain endpoint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: URL) => {
        expect(url.searchParams.get("collection_id")).toBe("seo");
        return new Response(
          JSON.stringify({
            workspace_id: "mindbrain-seo-audit",
            collection_id: "seo",
            projection_id: "proj_keyword_opportunities",
            projection_results: [
              {
                entity_id: 10,
                entity_type: "ProjectionResult",
                name: "keyword opportunity set",
                confidence: 1,
                metadata_json:
                  '{"projection_id":"proj_keyword_opportunities","external_id":"result-1"}'
              }
            ],
            linked_evidence: [
              {
                relation_id: 20,
                relation_type: "PROVEN_BY",
                source_id: 10,
                target_id: 11,
                relation_metadata_json: '{"source":"import"}',
                evidence_entity_id: 11,
                evidence_entity_type: "Evidence",
                evidence_name: "query export",
                evidence_confidence: 0.9,
                evidence_metadata_json: '{"external_id":"evidence-1"}'
              }
            ],
            deltas: [
              {
                entity_id: 12,
                entity_type: "DeltaFinding",
                name: "keyword gap",
                confidence: 0.8,
                metadata_json:
                  '{"metric":"proj_keyword_opportunities","external_id":"delta-1"}'
              }
            ],
            report: {
              workspace_id: "mindbrain-seo-audit",
              collection_id: "seo",
              projection_id: "proj_keyword_opportunities",
              projection_result_count: 1,
              linked_evidence_count: 1,
              delta_count: 1,
              has_projection: true
            }
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        );
      })
    );

    const database = createMockDatabase(vi.fn(async () => []));
    const result = await projectionGetTool.handler(
      {
        workspace_id: "mindbrain-seo-audit",
        collection_id: "seo",
        projection_id: "proj_keyword_opportunities",
        include_evidence: true,
        include_deltas: true
      },
      createToolContext(database)
    );

    const structured = readStructured(result);
    expect(structured).toMatchObject({
      ok: true,
      tool: "ghostcrab_projection_get",
      backend: "native",
      report: {
        collection_id: "seo",
        projection_result_count: 1,
        linked_evidence_count: 1,
        delta_count: 1,
        has_projection: true
      }
    });
    expect(structured.projection_results).toEqual([
      expect.objectContaining({
        entity_type: "ProjectionResult",
        metadata: expect.objectContaining({
          projection_id: "proj_keyword_opportunities"
        })
      })
    ]);
    expect(structured.linked_evidence).toEqual([
      expect.objectContaining({
        relation: expect.objectContaining({ relation_type: "PROVEN_BY" }),
        evidence: expect.objectContaining({ name: "query export" })
      })
    ]);
  });

  it("falls back to local graph SQL when the endpoint is unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("backend offline");
      })
    );

    const query = vi.fn<DatabaseClient["query"]>(async (sql) => {
      if (sql.includes("JOIN graph_relation")) {
        return [
          {
            relation_id: 20,
            relation_type: "PROVEN_BY",
            source_id: 10,
            target_id: 11,
            relation_metadata_json: "{}",
            evidence_entity_id: 11,
            evidence_entity_type: "Evidence",
            evidence_name: "query export",
            evidence_confidence: 0.9,
            evidence_metadata_json: '{"external_id":"evidence-1"}'
          }
        ];
      }

      if (sql.includes("entity_type = 'ProjectionResult'")) {
        return [
          {
            entity_id: 10,
            entity_type: "ProjectionResult",
            name: "keyword opportunity set",
            confidence: 1,
            metadata_json:
              '{"projection_id":"proj_keyword_opportunities","external_id":"result-1"}'
          }
        ];
      }

      if (sql.includes("entity_type = 'DeltaFinding'")) {
        return [
          {
            entity_id: 12,
            entity_type: "DeltaFinding",
            name: "keyword gap",
            confidence: 0.8,
            metadata_json:
              '{"metric":"proj_keyword_opportunities","external_id":"delta-1"}'
          }
        ];
      }

      return [];
    });

    const result = await projectionGetTool.handler(
      {
        workspace_id: "mindbrain-seo-audit",
        collection_id: null,
        projection_id: "proj_keyword_opportunities"
      },
      createToolContext(createMockDatabase(query))
    );

    expect(readStructured(result)).toMatchObject({
      backend: "sql",
      collection_id: null,
      report: {
        collection_id: null,
        projection_result_count: 1,
        linked_evidence_count: 1,
        delta_count: 1,
        has_projection: true
      }
    });
  });

  it("requires a projection_id", () => {
    expect(ProjectionGetInput.safeParse({ projection_id: "" }).success).toBe(
      false
    );
    expect(
      ProjectionGetInput.safeParse({
        collection_id: "nil",
        projection_id: "proj_keyword_opportunities"
      }).success
    ).toBe(true);
  });
});
