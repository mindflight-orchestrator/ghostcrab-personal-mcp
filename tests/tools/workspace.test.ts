import { describe, it, expect, vi } from "vitest";

import { workspaceCreateTool } from "../../src/tools/workspace/create.js";
import { workspaceListTool } from "../../src/tools/workspace/list.js";
import type { ToolExecutionContext } from "../../src/tools/registry.js";

function makeContext(overrides?: Partial<{ rows: unknown[][] }>): ToolExecutionContext {
  let callIndex = 0;
  const rowSets = overrides?.rows ?? [[]];

  return {
    database: {
      kind: "sqlite",
      query: vi.fn().mockImplementation(() => {
        const result = rowSets[callIndex] ?? [];
        callIndex += 1;
        return Promise.resolve(result);
      }),
      transaction: vi.fn(),
      close: vi.fn(),
      ping: vi.fn()
    } as unknown as ToolExecutionContext["database"],
    embeddings: {} as ToolExecutionContext["embeddings"],
    extensions: { pgFacets: false, pgDgraph: false, pgPragma: false },
    nativeExtensionsMode: "sql-only",
    retrieval: { hybridBm25Weight: 0.5, hybridVectorWeight: 0.5 }
  };
}

describe("ghostcrab_workspace_create", () => {
  it("creates a new workspace", async () => {
    const ctx = makeContext({ rows: [[], []] });
    const result = await workspaceCreateTool.handler(
      { id: "my-ws", label: "My Workspace", created_by: "agent" },
      ctx
    );
    const data = JSON.parse((result.content[0] as { text: string }).text) as Record<string, unknown>;
    expect(data.ok).toBe(true);
    expect(data.created).toBe(true);
    expect(data.workspace_id).toBe("my-ws");
    expect(data.idempotent).toBe(false);
  });

  it("returns idempotent=true if workspace already exists", async () => {
    const ctx = makeContext({ rows: [[{ id: "my-ws" }]] });
    const result = await workspaceCreateTool.handler(
      { id: "my-ws", label: "My Workspace" },
      ctx
    );
    const data = JSON.parse((result.content[0] as { text: string }).text) as Record<string, unknown>;
    expect(data.ok).toBe(true);
    expect(data.created).toBe(false);
    expect(data.idempotent).toBe(true);
  });

  it("rejects invalid workspace id", async () => {
    const ctx = makeContext();
    await expect(
      workspaceCreateTool.handler({ id: "Bad_ID", label: "x" }, ctx)
    ).rejects.toThrow();
  });

  it("rejects id starting with digit", async () => {
    const ctx = makeContext();
    await expect(
      workspaceCreateTool.handler({ id: "1bad", label: "x" }, ctx)
    ).rejects.toThrow();
  });
});

describe("ghostcrab_workspace_list", () => {
  const fakeRow = {
    id: "default",
    label: "Default Workspace",
    pg_schema: "public",
    description: null,
    created_by: "system",
    status: "active",
    created_at: "2026-03-01T00:00:00Z",
    facets_count: "42",
    entities_count: "7"
  };

  it("lists workspaces with stats", async () => {
    const ctx = makeContext({ rows: [[fakeRow]] });
    const result = await workspaceListTool.handler({}, ctx);
    const data = JSON.parse((result.content[0] as { text: string }).text) as Record<string, unknown>;
    expect(data.ok).toBe(true);
    const workspaces = data.workspaces as unknown[];
    expect(workspaces).toHaveLength(1);
    const ws = workspaces[0] as Record<string, unknown>;
    expect(ws.id).toBe("default");
    expect(ws.facets_count).toBe(42);
    expect(ws.entities_count).toBe(7);
  });

  it("filters by status", async () => {
    const ctx = makeContext({ rows: [[fakeRow]] });
    const result = await workspaceListTool.handler({ status: "active" }, ctx);
    const data = JSON.parse((result.content[0] as { text: string }).text) as Record<string, unknown>;
    expect(data.filter_status).toBe("active");
    const dbQuery = (ctx.database.query as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(dbQuery).toContain("w.status = ?");
  });

  it("returns all when no status filter", async () => {
    const ctx = makeContext({ rows: [[]] });
    const result = await workspaceListTool.handler({}, ctx);
    const data = JSON.parse((result.content[0] as { text: string }).text) as Record<string, unknown>;
    expect(data.filter_status).toBe("all");
    const dbQuery = (ctx.database.query as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(dbQuery).not.toMatch(/FROM mindbrain\.workspaces w\s+WHERE\s+w\.status/);
  });
});
