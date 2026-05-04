import { describe, expect, it, vi } from "vitest";

import type { DatabaseClient } from "../../src/db/client.js";
import { compareWorkspacesTool } from "../../src/tools/ontology/compare.js";
import { bridgeWorkspacesTool, findEntityBridgesTool } from "../../src/tools/ontology/bridge.js";
import { detectConflictsTool } from "../../src/tools/ontology/conflicts.js";
import { federatedSearchTool } from "../../src/tools/ontology/federated.js";
import { ontologyCoverageRefTool } from "../../src/tools/ontology/coverage-ref.js";
import { registerEntityTypeTool, registerRelationTypeTool } from "../../src/tools/ontology/register.js";
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

function nativeContext(db: DatabaseClient) {
  return createToolContext(db, {
    extensions: { pgFacets: false, pgDgraph: false, pgPragma: false, pgMindbrain: true },
    nativeExtensionsMode: "native"
  });
}

function sqlOnlyContext(db: DatabaseClient) {
  return createToolContext(db, {
    extensions: { pgFacets: false, pgDgraph: false, pgPragma: false, pgMindbrain: false },
    nativeExtensionsMode: "auto"
  });
}

function errorPayload(result: Awaited<ReturnType<typeof registerEntityTypeTool.handler>>) {
  return (result.structuredContent as Record<string, unknown>)?.error as Record<string, unknown>;
}

describe("ontology phase 2 tools", () => {
  it("gate on pg_mindbrain absence without issuing DB calls", async () => {
    const query = vi.fn(async () => []);
    const db = createMockDatabase(query);
    const tools = [
      () =>
        registerEntityTypeTool.handler(
          { workspace_id: "ws", entity_type: "Document" },
          sqlOnlyContext(db)
        ),
      () =>
        registerRelationTypeTool.handler(
          {
            workspace_id: "ws",
            relation_type: "owns",
            source_entity_type: "User",
            target_entity_type: "Document"
          },
          sqlOnlyContext(db)
        ),
      () =>
        compareWorkspacesTool.handler(
          { workspace_id_a: "a", workspace_id_b: "b" },
          sqlOnlyContext(db)
        ),
      () =>
        bridgeWorkspacesTool.handler(
          { workspace_id_a: "a", workspace_id_b: "b", bridge_label: "eq" },
          sqlOnlyContext(db)
        ),
      () =>
        findEntityBridgesTool.handler(
          { workspace_id_a: "a", workspace_id_b: "b" },
          sqlOnlyContext(db)
        ),
      () =>
        detectConflictsTool.handler({ workspace_ids: ["a", "b"] }, sqlOnlyContext(db)),
      () =>
        federatedSearchTool.handler(
          { query: "q", workspace_ids: ["w"] },
          sqlOnlyContext(db)
        ),
      () =>
        ontologyCoverageRefTool.handler(
          { workspace_id: "ws", reference_workspace_id: "ref" },
          sqlOnlyContext(db)
        )
    ];

    for (const run of tools) {
      const result = await run();
      expect(result.isError).toBe(true);
    }
    expect(query).not.toHaveBeenCalled();
  });

  it("delegates to mb_ontology functions in native mode", async () => {
    const query = vi
      .fn<DatabaseClient["query"]>()
      .mockResolvedValueOnce([{ result: { registered: true } }])
      .mockResolvedValueOnce([{ result: { registered: true } }])
      .mockResolvedValueOnce([{ result: { added: [], removed: [] } }])
      .mockResolvedValueOnce([{ result: { bridge_id: "br-99" } }])
      .mockResolvedValueOnce([{ result: [{ bridge_id: "br-1" }] }])
      .mockResolvedValueOnce([{ result: { conflicts: [] } }])
      .mockResolvedValueOnce([{ result: [{ entity_id: "e-1", score: 0.9 }] }])
      .mockResolvedValueOnce([{ result: { ratio: 0.85, gaps: [] } }]);
    const db = createMockDatabase(query);

    await registerEntityTypeTool.handler(
      { workspace_id: "ws-prod", entity_type: "Contract", metadata: { domain: "legal" } },
      nativeContext(db)
    );
    await registerRelationTypeTool.handler(
      {
        workspace_id: "ws-1",
        relation_type: "owns",
        source_entity_type: "Team",
        target_entity_type: "Project"
      },
      nativeContext(db)
    );
    await compareWorkspacesTool.handler(
      { workspace_id_a: "ws-alpha", workspace_id_b: "ws-beta" },
      nativeContext(db)
    );
    await bridgeWorkspacesTool.handler(
      { workspace_id_a: "ws-1", workspace_id_b: "ws-2", bridge_label: "extends" },
      nativeContext(db)
    );
    await findEntityBridgesTool.handler(
      { workspace_id_a: "ws-1", workspace_id_b: "ws-2" },
      nativeContext(db)
    );
    await detectConflictsTool.handler({ workspace_ids: ["ws-1", "ws-2"] }, nativeContext(db));
    await federatedSearchTool.handler(
      { query: "knowledge graph", workspace_ids: ["ws-1", "ws-2"], options: { limit: 5 } },
      nativeContext(db)
    );
    const coverage = await ontologyCoverageRefTool.handler(
      { workspace_id: "ws-child", reference_workspace_id: "ws-gold" },
      nativeContext(db)
    );

    const allSql = query.mock.calls.map((call) => String(call[0])).join("\n");
    expect(allSql).toContain("mb_ontology.register_entity_type");
    expect(allSql).toContain("mb_ontology.register_relation_type");
    expect(allSql).toContain("mb_ontology.compare_workspaces");
    expect(allSql).toContain("mb_ontology.bridge_workspaces");
    expect(allSql).toContain("mb_ontology.find_entity_bridges");
    expect(allSql).toContain("mb_ontology.detect_conflicts");
    expect(allSql).toContain("mb_ontology.federated_search");
    expect(allSql).toContain("mb_ontology.compute_ontology_coverage");
    expect(coverage.structuredContent).toMatchObject({
      workspace_id: "ws-child",
      reference_workspace_id: "ws-gold"
    });
  });

  it("returns extension_not_loaded details that mention the tool and pg_mindbrain", async () => {
    const result = await registerEntityTypeTool.handler(
      { workspace_id: "ws", entity_type: "X" },
      sqlOnlyContext(createMockDatabase())
    );

    const error = errorPayload(result) as { message: string; code: string };
    expect(error.code).toBe("extension_not_loaded");
    expect(error.message).toContain("pg_mindbrain");
    expect(error.message).toContain("ghostcrab_ontology_register_entity_type");
  });
});
