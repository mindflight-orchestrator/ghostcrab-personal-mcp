import { afterEach, describe, expect, it, vi } from "vitest";

import type { DatabaseClient, Queryable } from "../../src/db/client.js";
import {
  artifactGetTool,
  ArtifactGetInput
} from "../../src/tools/pragma/artifact-get.js";
import {
  liveRefreshTool,
  LiveRefreshInput
} from "../../src/tools/pragma/live-refresh.js";
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

function readStructured(result: {
  structuredContent?: unknown;
  isError?: boolean;
}): Record<string, unknown> {
  expect(result.structuredContent).toBeDefined();
  return result.structuredContent as Record<string, unknown>;
}

describe("answer artifact MCP tools (Phase 3)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("ghostcrab_artifact_get", () => {
    it("fetches registry row with parsed payload", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: URL) => {
          expect(url.pathname).toBe(
            "/api/mindbrain/ghostcrab/artifact/analysis_plan__demo"
          );
          return new Response(
            JSON.stringify({
              artifact_id: "analysis_plan__demo",
              slug: "demo",
              workspace_id: "ws_demo",
              agent_id: "agent:self",
              scope: "ws_demo",
              artifact_kind: "analysis_plan",
              public_label: "Plan démo",
              lifecycle: "active",
              state: "open",
              current_version: 1,
              payload_json: '{"steps":["a"]}',
              legacy_ref: "projection:p1"
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        })
      );

      const database = createMockDatabase(vi.fn(async () => []));
      const result = await artifactGetTool.handler(
        { artifact_id: "analysis_plan__demo" },
        createToolContext(database)
      );

      const body = readStructured(result);
      expect(body.artifact_kind).toBe("analysis_plan");
      expect(body.public_label).toBe("Plan démo");
      expect(body.payload).toEqual({ steps: ["a"] });
    });

    it("documents required artifact_id in MCP schema", () => {
      const schema = artifactGetTool.definition.inputSchema as {
        required?: string[];
      };
      expect(schema.required).toEqual(expect.arrayContaining(["artifact_id"]));
      expect(ArtifactGetInput.safeParse({ artifact_id: "x" }).success).toBe(true);
    });
  });

  describe("ghostcrab_live_refresh", () => {
    it("refreshes live view and attaches answer_update_event", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: URL, init?: RequestInit) => {
          if (url.pathname.endsWith("/refresh")) {
            expect(init?.method).toBe("POST");
            return new Response(
              JSON.stringify({
                ok: true,
                artifact_id: "live_answer_view__weekly",
                artifact_kind: "live_answer_view",
                current_version: 5,
                state: "open"
              }),
              { status: 200, headers: { "content-type": "application/json" } }
            );
          }

          return new Response(
            JSON.stringify({
              artifact_id: "live_answer_view__weekly",
              event_kind: "answer_update_event",
              rows: [
                {
                  event_id: "evt_5",
                  artifact_id: "live_answer_view__weekly",
                  event_kind: "answer_update_event",
                  from_version: 4,
                  to_version: 5,
                  signal_json: '{"reason":"explicit_refresh"}',
                  created_at_unix: 400
                }
              ]
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        })
      );

      const database = createMockDatabase(vi.fn(async () => []));
      const result = await liveRefreshTool.handler(
        { artifact_id: "live_answer_view__weekly" },
        createToolContext(database)
      );

      const body = readStructured(result);
      expect(body.refreshed).toBe(true);
      expect(body.current_version).toBe(5);
      const event = body.answer_update_event as Record<string, unknown>;
      expect(event.event_kind).toBe("answer_update_event");
      expect(event.to_version).toBe(5);
    });

    it("returns invalid_artifact_kind for snapshot refresh attempts", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          new Response(
            JSON.stringify({
              ok: true,
              artifact_id: "answer_snapshot__x",
              artifact_kind: "answer_snapshot",
              current_version: 1,
              state: "closed"
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          )
        )
      );

      const database = createMockDatabase(vi.fn(async () => []));
      const result = await liveRefreshTool.handler(
        { artifact_id: "answer_snapshot__x" },
        createToolContext(database)
      );

      expect(result.isError).toBe(true);
      const body = readStructured(result);
      expect((body.error as Record<string, unknown>).code).toBe(
        "invalid_artifact_kind"
      );
    });

    it("documents include_latest_event default true", () => {
      const schema = liveRefreshTool.definition.inputSchema as {
        properties: { include_latest_event: { default?: boolean } };
      };
      expect(schema.properties.include_latest_event.default).toBe(true);
      expect(
        LiveRefreshInput.parse({ artifact_id: "live_answer_view__x" })
          .include_latest_event
      ).toBe(true);
    });
  });
});
