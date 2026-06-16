import { describe, expect, it, vi } from "vitest";

import { resetWorkspaceData } from "../../src/db/workspace-lifecycle.js";
import { workspaceDeleteTool } from "../../src/tools/workspace/delete.js";
import { workspaceResetTool } from "../../src/tools/workspace/reset.js";
import type { ToolExecutionContext } from "../../src/tools/registry.js";

function makeContext(
  rows: unknown[][] = [[{ id: "test-ws" }]]
): ToolExecutionContext {
  let callIndex = 0;

  return {
    database: {
      kind: "sqlite",
      query: vi.fn().mockImplementation(() => {
        const result = rows[callIndex] ?? [];
        callIndex += 1;
        return Promise.resolve(result);
      }),
      transaction: vi.fn(),
      close: vi.fn(),
      ping: vi.fn()
    } as unknown as ToolExecutionContext["database"],
    embeddings: {} as ToolExecutionContext["embeddings"],
    retrieval: { hybridBm25Weight: 0.5, hybridVectorWeight: 0.5 },
    session: { workspace_id: "default", schema_id: null }
  } as unknown as ToolExecutionContext;
}

describe("ghostcrab_workspace_reset", () => {
  it("requires confirm: true", async () => {
    const ctx = makeContext();
    await expect(
      workspaceResetTool.handler({ workspace_id: "test-ws" }, ctx)
    ).rejects.toThrow();
  });

  it("refuses the default workspace", async () => {
    const ctx = makeContext();
    const result = await workspaceResetTool.handler(
      { workspace_id: "default", confirm: true },
      ctx
    );
    const data = JSON.parse(
      (result.content[0] as { text: string }).text
    ) as Record<string, unknown>;
    expect(data.ok).toBe(false);
    expect((data.error as { code: string }).code).toBe("protected_workspace");
  });

  it("returns workspace_not_found when missing", async () => {
    const ctx = makeContext([[]]);
    const result = await workspaceResetTool.handler(
      { workspace_id: "missing-ws", confirm: true },
      ctx
    );
    const data = JSON.parse(
      (result.content[0] as { text: string }).text
    ) as Record<string, unknown>;
    expect(data.ok).toBe(false);
    expect((data.error as { code: string }).code).toBe("workspace_not_found");
  });

  it("clears analysis plans and legacy projections by workspace scope prefix", async () => {
    const query = vi.fn().mockResolvedValue([{ count: 0 }]);

    await resetWorkspaceData(
      {
        query
      } as unknown as Parameters<typeof resetWorkspaceData>[0],
      "serenity-v4"
    );

    const calls = query.mock.calls as Array<[string, readonly unknown[]]>;
    const answerArtifactCount = calls.find(([sql]) =>
      sql.includes("FROM mindbrain_answer_artifacts")
    );
    expect(answerArtifactCount?.[0]).toContain("workspace_id = ?");
    expect(answerArtifactCount?.[0]).not.toContain("scope LIKE ?");
    expect(answerArtifactCount?.[1]).toEqual(["serenity-v4"]);

    const projectionCount = calls.find(([sql]) =>
      sql.includes("FROM projections")
    );
    expect(projectionCount?.[0]).toContain("scope = ? OR scope LIKE ?");
    expect(projectionCount?.[1]).toEqual(["serenity-v4", "serenity-v4:%"]);
  });
});

describe("ghostcrab_workspace_delete", () => {
  it("requires confirm: true", async () => {
    const ctx = makeContext();
    await expect(
      workspaceDeleteTool.handler({ workspace_id: "test-ws" }, ctx)
    ).rejects.toThrow();
  });

  it("refuses the default workspace", async () => {
    const ctx = makeContext();
    const result = await workspaceDeleteTool.handler(
      { workspace_id: "default", confirm: true },
      ctx
    );
    const data = JSON.parse(
      (result.content[0] as { text: string }).text
    ) as Record<string, unknown>;
    expect(data.ok).toBe(false);
    expect((data.error as { code: string }).code).toBe("protected_workspace");
  });
});
