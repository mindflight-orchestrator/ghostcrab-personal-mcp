import { describe, expect, it, vi } from "vitest";

import type { DatabaseClient, Queryable } from "../../src/db/client.js";
import { loadRuntimeCapabilities } from "../../src/tools/business-query-router/loader.js";
import { createToolContext } from "../helpers/tool-context.js";

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

describe("business-query runtime capability loader", () => {
  it("loads answer artifacts strictly by workspace_id, not scope fallback", async () => {
    const query = vi.fn<DatabaseClient["query"]>(async (sql, params = []) => {
      if (sql.includes("FROM mindbrain_answer_artifacts")) {
        expect(sql).toContain("workspace_id = ?");
        expect(sql).not.toContain("OR scope");
        expect(params).toEqual([
          "serenity-v4",
          "analysis_plan",
          "live_answer_view",
          "answer_snapshot",
          120
        ]);
        return [
          {
            artifact_id: "analysis_plan__copropriete_360",
            workspace_id: "serenity-v4",
            scope: "serenity-v4:production:copropriete_360",
            agent_id: "agent:self",
            artifact_kind: "analysis_plan",
            public_label: "Copropriete 360",
            lifecycle: "active",
            state: "open",
            slug: "copropriete_360",
            payload_json: JSON.stringify({
              business_question: "situation complete Aurora",
              example_queries: ["situation complete Aurora"]
            })
          }
        ];
      }

      if (sql.includes("ghostcrab:business-capability")) {
        return [];
      }

      return [];
    });

    const context = createToolContext(createMockDatabase(query));
    const { capabilities } = await loadRuntimeCapabilities({
      context,
      workspaceId: "serenity-v4"
    });

    expect(capabilities).toHaveLength(1);
    expect(capabilities[0]).toMatchObject({
      capability_id: "copropriete_360",
      workspace_id: "serenity-v4",
      scope: "serenity-v4:production:copropriete_360",
      artifact_id: "analysis_plan__copropriete_360"
    });
  });
});
