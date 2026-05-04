import { describe, expect, it, vi } from "vitest";

import type { DatabaseClient, Queryable } from "../../src/db/client.js";
import {
  ingestBatchTool,
  projectCheckpointTool,
  projectInstantiateTool,
  projectTemplateCreateTool
} from "../../src/tools/ontology/batch.js";
import { createToolContext } from "../helpers/tool-context.js";

function createMockDatabase(queryImpl: DatabaseClient["query"]): DatabaseClient {
  return {
    kind: "sqlite",
    query: queryImpl,
    ping: async () => true,
    close: async () => undefined,
    transaction: async (operation) => {
      const queryable: Queryable = { kind: "sqlite", query: queryImpl };
      return operation(queryable);
    }
  };
}

const NATIVE_EXTENSIONS = {
  pgFacets: false,
  pgDgraph: false,
  pgPragma: false,
  pgMindbrain: true
} as const;

function nativeContext(database: DatabaseClient) {
  return createToolContext(database, {
    extensions: NATIVE_EXTENSIONS,
    nativeExtensionsMode: "native"
  });
}

describe("ontology phase 3 batch tools", () => {
  it("delegates all batch/template tools to mb_ontology", async () => {
    const query = vi
      .fn<DatabaseClient["query"]>()
      .mockResolvedValueOnce([{ result: { inserted: 2 } }])
      .mockResolvedValueOnce([{ result: { template_id: "tpl-1" } }])
      .mockResolvedValueOnce([{ result: { project_id: "proj-9" } }])
      .mockResolvedValueOnce([{ result: { checkpoint_id: "cp-1" } }]);
    const database = createMockDatabase(query);

    await ingestBatchTool.handler(
      { workspace_id: "ws-batch-1", chunks: [{ content: "a" }, { content: "b" }] },
      nativeContext(database)
    );
    await projectTemplateCreateTool.handler(
      {
        workspace_id: "ws-tpl",
        template_name: "sprint_board",
        template_spec: { columns: ["todo", "doing", "done"] }
      },
      nativeContext(database)
    );
    await projectInstantiateTool.handler(
      {
        workspace_id: "ws-inst",
        template_id: "tpl-42",
        options: { project_name: "Alpha" }
      },
      nativeContext(database)
    );
    const checkpoint = await projectCheckpointTool.handler(
      {
        workspace_id: "ws-cp",
        project_id: "proj-7",
        checkpoint_data: { progress: 0.5 }
      },
      nativeContext(database)
    );

    const allSql = query.mock.calls.map((call) => String(call[0])).join("\n");
    expect(allSql).toContain("mb_ontology.ingest_knowledge_batch");
    expect(allSql).toContain("mb_ontology.create_project_template");
    expect(allSql).toContain("mb_ontology.instantiate_project");
    expect(allSql).toContain("mb_ontology.checkpoint_project");
    expect(checkpoint.structuredContent).toMatchObject({
      workspace_id: "ws-cp",
      project_id: "proj-7",
      result: { checkpoint_id: "cp-1" }
    });
  });
});
