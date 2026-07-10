import { afterEach, describe, expect, it } from "vitest";

import {
  getSessionContext,
  getSessionPinMetadata,
  resetSessionContext,
  setSessionPinMetadata
} from "../../src/mcp/session-context.js";
import { buildWorkspaceContextDirectives } from "../../src/mcp/workspace-context-status.js";
import { workspaceUseTool } from "../../src/tools/workspace/use.js";
import { createToolContext } from "../helpers/tool-context.js";

describe("ghostcrab_workspace_use", () => {
  afterEach(() => {
    resetSessionContext();
  });

  function mockCtx(existingIds: string[] = ["default"]) {
    return createToolContext({
      query: async (sql: string, params?: unknown[]) => {
        if (sql.includes("FROM workspaces WHERE id")) {
          const id = params?.[0] as string;
          return existingIds.includes(id) ? [{ id }] : [];
        }
        return [];
      },
      ping: async () => true,
      close: async () => {}
    } as never);
  }

  it("returns MCP-oriented error without workspace_create hint", async () => {
    const result = await workspaceUseTool.handler(
      { workspace_id: "nonexistent-ws" },
      mockCtx(["default"])
    );
    expect(result.isError).toBe(true);
    const text =
      result.content[0]?.type === "text" ? result.content[0].text : "";
    expect(text).toContain("ghostcrab_workspace_list");
    expect(text).not.toContain("ghostcrab_workspace_create");
    expect(text).toContain("Do not open the SQLite file directly");
  });

  it("tracks workspace switch away from pinned id", async () => {
    setSessionPinMetadata({
      source: "env",
      requested_workspace_id: "default",
      resolved_workspace_id: "default",
      pinned_workspace_id: "default",
      pin_status: "resolved",
      cli_workspace_name: null
    });

    const ctx = mockCtx(["default", "other-ws"]);
    await workspaceUseTool.handler({ workspace_id: "other-ws" }, ctx);

    expect(getSessionPinMetadata().workspace_switched_at).toBeTruthy();
    const directives = buildWorkspaceContextDirectives();
    expect(directives.some((d) => d.includes("other-ws"))).toBe(true);
  });

  it("switches to another workspace and back to the pinned default", async () => {
    setSessionPinMetadata({
      source: "env",
      requested_workspace_id: "default",
      resolved_workspace_id: "default",
      pinned_workspace_id: "default",
      pin_status: "resolved",
      cli_workspace_name: null
    });

    const ctx = mockCtx(["default", "serenity-coproprietes"]);

    const switched = await workspaceUseTool.handler(
      { workspace_id: "serenity-coproprietes" },
      ctx
    );
    expect(switched.isError).toBeFalsy();
    expect(getSessionContext().workspace_id).toBe("serenity-coproprietes");

    const back = await workspaceUseTool.handler(
      { workspace_id: "default" },
      ctx
    );
    expect(back.isError).toBeFalsy();
    expect(getSessionContext().workspace_id).toBe("default");
  });

  it("keeps the schema filter when only the workspace switches, then back", async () => {
    const ctx = mockCtx(["default", "serenity-coproprietes"]);

    await workspaceUseTool.handler(
      { workspace_id: "default", schema_id: "ghostcrab:task" },
      ctx
    );
    expect(getSessionContext().schema_id).toBe("ghostcrab:task");

    await workspaceUseTool.handler(
      { workspace_id: "serenity-coproprietes" },
      ctx
    );
    expect(getSessionContext().workspace_id).toBe("serenity-coproprietes");
    expect(getSessionContext().schema_id).toBe("ghostcrab:task");

    await workspaceUseTool.handler({ workspace_id: "default" }, ctx);
    expect(getSessionContext().workspace_id).toBe("default");
    expect(getSessionContext().schema_id).toBe("ghostcrab:task");
  });
});
