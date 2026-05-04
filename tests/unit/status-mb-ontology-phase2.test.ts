import { describe, expect, it, vi } from "vitest";

import type { DatabaseClient } from "../../src/db/client.js";
import { createToolContext } from "../helpers/tool-context.js";

function createMockDatabase(queryImpl?: DatabaseClient["query"]): DatabaseClient {
  const query = queryImpl ?? vi.fn(async () => []);
  return {
    kind: "sqlite",
    query,
    ping: async () => true,
    close: async () => undefined,
    transaction: async (operation) => operation({ kind: "sqlite", query })
  };
}

describe("ghostcrab_status mb_ontology capability flags", () => {
  it("surfaces phase 2 and phase 3 capability keys in sqlite mode", async () => {
    const database = createMockDatabase(
      vi.fn(async (sql) => {
        const statement = String(sql);
        if (statement.includes("FROM mb_pragma.agent_state")) {
          return [{ health: "GREEN", state: "IDLE", metrics_json: "{}" }];
        }
        if (statement.includes("COUNT(*) AS count")) {
          return [{ count: 0 }];
        }
        return [];
      })
    );

    const { statusTool } = await import("../../src/tools/pragma/status.js");
    const result = await statusTool.handler(
      {},
      createToolContext(database, {
        extensions: {
          pgFacets: false,
          pgDgraph: false,
          pgPragma: false,
          pgMindbrain: true
        },
        nativeExtensionsMode: "native"
      })
    );

    const payload = result.structuredContent as Record<string, unknown>;
    const runtime = payload.runtime as Record<string, unknown>;
    const capabilities = runtime.capabilities as Record<string, unknown>;
    const mbOntology = capabilities.mb_ontology as Record<string, boolean>;
    const extensionsDetected = runtime.extensions_detected as Record<string, boolean>;

    expect(capabilities.mb_ontology_available).toBe(true);
    expect(extensionsDetected.pg_mindbrain).toBe(true);
    expect(mbOntology).toMatchObject({
      resolve_workspace: true,
      coverage_by_domain: true,
      marketplace_by_domain: true,
      export_workspace_model: true,
      validate_ddl_proposal: true,
      register_entity_type: true,
      register_relation_type: true,
      compare_workspaces: true,
      bridge_workspaces: true,
      find_entity_bridges: true,
      detect_conflicts: true,
      federated_search: true,
      ontology_coverage_ref: true,
      ingest_knowledge_chunk: true,
      ingest_knowledge_batch: true,
      create_project_template: true,
      instantiate_project: true,
      checkpoint_project: true
    });
  });
});
