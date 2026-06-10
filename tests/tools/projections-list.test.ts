import { afterEach, describe, expect, it, vi } from "vitest";

import type { DatabaseClient } from "../../src/db/client.js";
import {
  projectionsListTool,
  ProjectionsListInput
} from "../../src/tools/pragma/projections-list.js";
import { createToolContext } from "../helpers/tool-context.js";

function createMockDatabase(
  queryImpl: DatabaseClient["query"]
): DatabaseClient {
  return {
    kind: "sqlite",
    query: queryImpl,
    ping: async () => true,
    close: async () => undefined,
    transaction: async (operation) =>
      operation({
        kind: "sqlite",
        query: queryImpl
      })
  };
}

function readStructured(result: {
  structuredContent?: unknown;
  isError?: boolean;
}): Record<string, unknown> {
  expect(result.structuredContent).toBeDefined();
  return result.structuredContent as Record<string, unknown>;
}

describe("ghostcrab_projections_list", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists registry rows and graph projection ids with routing hints", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: URL, init?: RequestInit) => {
        if (url.pathname.endsWith("/sql") && init?.method === "POST") {
          const body = JSON.parse(String(init.body)) as { sql?: string };
          expect(body.sql).toContain("mindbrain_answer_artifacts");
          return new Response(
            JSON.stringify({
              columns: [
                "artifact_id",
                "slug",
                "workspace_id",
                "agent_id",
                "scope",
                "artifact_kind",
                "public_label",
                "lifecycle",
                "state",
                "current_version",
                "legacy_ref"
              ],
              rows: [
                [
                  "live_answer_view__weekly",
                  "weekly",
                  "ws_demo",
                  null,
                  "ws_demo",
                  "live_answer_view",
                  "Pilotage hebdo",
                  "active",
                  "open",
                  2,
                  null
                ],
                [
                  "analysis_plan__ws_demo",
                  "ws_demo",
                  null,
                  "agent:self",
                  "ws_demo",
                  "analysis_plan",
                  "Plan chantier",
                  "active",
                  "open",
                  1,
                  "projection:p_legacy"
                ]
              ]
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        throw new Error(`Unexpected fetch: ${url.pathname}`);
      })
    );

    const database = createMockDatabase(
      vi.fn(async (sql: string) => {
        expect(sql).toContain("graph_entity");
        return [
          {
            projection_id: "proj_keyword_opportunities",
            name: "Keyword opportunities",
            collection_id: "seo"
          }
        ];
      })
    );

    const result = await projectionsListTool.handler(
      { workspace_id: "ws_demo" },
      createToolContext(database)
    );

    const body = readStructured(result);
    expect(body.count).toBe(3);
    const projections = body.projections as Array<Record<string, unknown>>;
    expect(projections[0]?.artifact_kind).toBe("live_answer_view");
    expect(projections[0]?.suggested_tools).toEqual([
      "ghostcrab_artifact_get",
      "ghostcrab_live_refresh"
    ]);
    expect(projections[1]?.projection_id).toBe("p_legacy");
    expect(projections[2]?.source).toBe("graph");
    expect(projections[2]?.projection_id).toBe("proj_keyword_opportunities");
    expect(projections[2]?.suggested_tools).toEqual([
      "ghostcrab_projection_get"
    ]);
  });

  it("returns missing_workspace when session and input omit workspace_id", async () => {
    const database = createMockDatabase(vi.fn(async () => []));
    const context = createToolContext(database);
    context.session.workspace_id = null;
    const result = await projectionsListTool.handler({}, context);
    expect(result.isError).toBe(true);
    const body = readStructured(result);
    expect((body.error as Record<string, unknown>).code).toBe("missing_workspace");
  });

  it("documents optional filters and include_graph default", () => {
    const schema = projectionsListTool.definition.inputSchema as {
      properties: {
        include_graph: { default?: boolean };
        kind: { enum?: string[] };
      };
    };
    expect(schema.properties.include_graph.default).toBe(true);
    expect(schema.properties.kind.enum).toEqual(
      expect.arrayContaining(["analysis_plan", "graph"])
    );
    expect(
      ProjectionsListInput.parse({ workspace_id: "ws_demo", kind: "graph" }).kind
    ).toBe("graph");
  });
});
