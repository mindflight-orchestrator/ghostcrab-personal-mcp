import { describe, it, expect, vi } from "vitest";

import { ddlProposeTool, ddlListPendingTool, ddlExecuteTool } from "../../src/tools/workspace/ddl.js";
import type { ToolExecutionContext } from "../../src/tools/registry.js";

function makeContext(rowSets: unknown[][]): ToolExecutionContext {
  let callIndex = 0;
  return {
    database: {
      kind: "sqlite",
      query: vi.fn().mockImplementation(() => {
        const result = rowSets[callIndex] ?? [];
        callIndex += 1;
        return Promise.resolve(result);
      }),
      transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
        const tx = {
          kind: "sqlite",
          query: vi.fn().mockResolvedValue([])
        };
        await fn(tx);
      }),
      close: vi.fn(),
      ping: vi.fn()
    } as unknown as ToolExecutionContext["database"],
    embeddings: {} as ToolExecutionContext["embeddings"],
    retrieval: { hybridBm25Weight: 0.5, hybridVectorWeight: 0.5 }
  } as unknown as ToolExecutionContext;
}

describe("ghostcrab_ddl_propose", () => {
  it("rejects DROP TABLE", async () => {
    const ctx = makeContext([]);
    const result = await ddlProposeTool.handler(
      { workspace_id: "default", sql: "DROP TABLE foo" },
      ctx
    );
    expect(result.isError).toBe(true);
    const data = JSON.parse((result.content[0] as { text: string }).text) as Record<string, unknown>;
    const err = data.error as Record<string, unknown>;
    expect(err.code).toBe("blocked_ddl_pattern");
  });

  it("rejects TRUNCATE", async () => {
    const ctx = makeContext([]);
    const result = await ddlProposeTool.handler(
      { workspace_id: "default", sql: "TRUNCATE TABLE foo" },
      ctx
    );
    expect(result.isError).toBe(true);
  });

  it("rejects missing workspace", async () => {
    const ctx = makeContext([[/* workspace lookup returns empty */]]);
    const result = await ddlProposeTool.handler(
      { workspace_id: "nonexistent", sql: "CREATE TABLE foo (id INT)" },
      ctx
    );
    expect(result.isError).toBe(true);
    const data = JSON.parse((result.content[0] as { text: string }).text) as Record<string, unknown>;
    const err = data.error as Record<string, unknown>;
    expect(err.code).toBe("workspace_not_found");
  });

  it("stores migration and returns migration_id", async () => {
    const ctx = makeContext([
      [{ id: "default" }],
      []
    ]);
    const result = await ddlProposeTool.handler(
      {
        workspace_id: "default",
        sql: "CREATE TABLE foo (id SERIAL PRIMARY KEY)",
        rationale: "Need this table"
      },
      ctx
    );
    expect(result.isError).toBeFalsy();
    const data = JSON.parse((result.content[0] as { text: string }).text) as Record<string, unknown>;
    expect(data.ok).toBe(true);
    expect(typeof data.migration_id).toBe("string");
    expect(data.status).toBe("pending");
  });

  it("generates trigger preview when sync_spec provided", async () => {
    const ctx = makeContext([
      [{ id: "default" }],
      [{ id: "abc-123" }]
    ]);
    const result = await ddlProposeTool.handler(
      {
        workspace_id: "default",
        sql: "CREATE TABLE articles (id SERIAL PRIMARY KEY, title TEXT)",
        sync_spec: {
          source_table: "public.articles",
          fields: [
            { column_name: "title", facet_key: "title", index_in_bm25: true, facet_type: "term" }
          ]
        }
      },
      ctx
    );
    const data = JSON.parse((result.content[0] as { text: string }).text) as Record<string, unknown>;
    expect(data.has_trigger_preview).toBe(true);
  });

  it("stores semantic_proposal (inferred) on propose", async () => {
    const ctx = makeContext([
      [{ id: "default" }],
      [{ id: "550e8400-e29b-41d4-a716-446655440000" }]
    ]);
    const result = await ddlProposeTool.handler(
      {
        workspace_id: "default",
        sql: "CREATE TABLE IF NOT EXISTS t_sem (id INT PRIMARY KEY);"
      },
      ctx
    );
    const data = JSON.parse((result.content[0] as { text: string }).text) as Record<string, unknown>;
    expect(data.semantic_proposal).toBeDefined();
    const sem = data.semantic_proposal as { table_semantics?: unknown[] };
    expect(Array.isArray(sem.table_semantics)).toBe(true);
  });

});

describe("ghostcrab_ddl_list_pending", () => {
  const fakeMigration = {
    id: "550e8400-e29b-41d4-a716-446655440000",
    workspace_id: "default",
    sql: "CREATE TABLE foo (id INT)",
    rationale: null,
    preview_trigger: null,
    status: "pending",
    proposed_by: null,
    approved_by: null,
    proposed_at: "2026-03-01T00:00:00Z",
    approved_at: null,
    executed_at: null
  };

  it("lists migrations", async () => {
    const ctx = makeContext([[fakeMigration]]);
    const result = await ddlListPendingTool.handler({}, ctx);
    const data = JSON.parse((result.content[0] as { text: string }).text) as Record<string, unknown>;
    expect(data.ok).toBe(true);
    expect((data.migrations as unknown[]).length).toBe(1);
    expect(data.total).toBe(1);
  });

  it("filters by workspace_id", async () => {
    const ctx = makeContext([[fakeMigration]]);
    await ddlListPendingTool.handler({ workspace_id: "default" }, ctx);
    const dbQuery = (ctx.database.query as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(dbQuery).toContain("workspace_id = ?");
  });

  it("filters by status", async () => {
    const ctx = makeContext([[]]);
    await ddlListPendingTool.handler({ status: "approved" }, ctx);
    const dbQuery = (ctx.database.query as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(dbQuery).toContain("status = ?");
  });
});

describe("ghostcrab_ddl_execute", () => {
  it("rejects non-existent migration", async () => {
    const ctx = makeContext([[/* empty: migration not found */]]);
    const result = await ddlExecuteTool.handler(
      { migration_id: "550e8400-e29b-41d4-a716-446655440000" },
      ctx
    );
    expect(result.isError).toBe(true);
    const data = JSON.parse((result.content[0] as { text: string }).text) as Record<string, unknown>;
    expect((data.error as Record<string, unknown>).code).toBe("migration_not_found");
  });

  it("rejects migration with status != approved", async () => {
    const ctx = makeContext([[{
      id: "550e8400-e29b-41d4-a716-446655440000",
      workspace_id: "default",
      sql: "CREATE TABLE foo (id INT)",
      preview_trigger: null,
      status: "pending"
    }]]);
    const result = await ddlExecuteTool.handler(
      { migration_id: "550e8400-e29b-41d4-a716-446655440000" },
      ctx
    );
    expect(result.isError).toBe(true);
    const data = JSON.parse((result.content[0] as { text: string }).text) as Record<string, unknown>;
    expect((data.error as Record<string, unknown>).code).toBe("migration_not_approved");
  });

  it("executes approved migration", async () => {
    const ctx = makeContext([[{
      id: "550e8400-e29b-41d4-a716-446655440000",
      workspace_id: "default",
      sql: "CREATE TABLE foo (id INT)",
      preview_trigger: null,
      status: "approved"
    }]]);
    const result = await ddlExecuteTool.handler(
      { migration_id: "550e8400-e29b-41d4-a716-446655440000" },
      ctx
    );
    expect(result.isError).toBeFalsy();
    const data = JSON.parse((result.content[0] as { text: string }).text) as Record<string, unknown>;
    expect(data.ok).toBe(true);
    expect(data.status).toBe("executed");
    expect(ctx.database.transaction).toHaveBeenCalled();
  });

  it("applies trigger when preview_trigger is set", async () => {
    const ctx = makeContext([[{
      id: "550e8400-e29b-41d4-a716-446655440000",
      workspace_id: "default",
      sql: "CREATE TABLE foo (id INT)",
      preview_trigger: "CREATE OR REPLACE FUNCTION trg_test() ...",
      status: "approved"
    }]]);
    const result = await ddlExecuteTool.handler(
      { migration_id: "550e8400-e29b-41d4-a716-446655440000" },
      ctx
    );
    const data = JSON.parse((result.content[0] as { text: string }).text) as Record<string, unknown>;
    expect(data.trigger_applied).toBe(true);
  });

  it("rejects invalid UUID format", async () => {
    const ctx = makeContext([]);
    await expect(
      ddlExecuteTool.handler({ migration_id: "not-a-uuid" }, ctx)
    ).rejects.toThrow();
  });
});
