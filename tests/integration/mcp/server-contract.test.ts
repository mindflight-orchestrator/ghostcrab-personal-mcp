import { describe, expect, it } from "vitest";

import { callToolJson, listToolNames, withMcpStdioClient } from "../../helpers/mcp-stdio.js";

describe.sequential("MCP server contract", () => {
  it("starts on stdio and lists the critical tool surface", async () => {
    await withMcpStdioClient("contract-list-tools", async ({ client, getStderrOutput }) => {
      const tools = await listToolNames(client);

      expect(tools).toEqual(expect.arrayContaining([
        "ghostcrab_status",
        "ghostcrab_search",
        "ghostcrab_count",
        "ghostcrab_remember",
        "ghostcrab_upsert",
        "ghostcrab_schema_list",
        "ghostcrab_schema_inspect",
        "ghostcrab_pack",
        "ghostcrab_project",
        "ghostcrab_modeling_guidance",
        "ghostcrab_tool_search"
      ]));
      expect(tools).toHaveLength(11);
      expect(tools).not.toContain("ghostcrab_workspace_list");
      expect(tools).not.toContain("ghostcrab_workspace_use");

      const stderr = getStderrOutput();
      expect(stderr).toContain("Starting MCP server");
      expect(stderr).toContain("MCP server connected on stdio");
    });
  });

  it("discovers hidden tools via ghostcrab_tool_search", async () => {
    await withMcpStdioClient("contract-tool-search", async ({ client }) => {
      const payload = await callToolJson(client, "ghostcrab_tool_search", {
        query: "workspace list inspect export model",
        subsystem: ["workspace"]
      });

      expect(payload.ok).toBe(true);
      expect(payload.tool).toBe("ghostcrab_tool_search");
      expect(payload.results).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "ghostcrab_workspace_list" }),
          expect.objectContaining({ name: "ghostcrab_workspace_inspect" })
        ])
      );
    });
  });

  it("returns a stable runtime payload from ghostcrab_status", async () => {
    await withMcpStdioClient("contract-status", async ({ client }) => {
      const payload = await callToolJson(client, "ghostcrab_status", {
        agent_id: "agent:self"
      });

      expect(payload.ok).toBe(true);
      expect(payload.tool).toBe("ghostcrab_status");
      expect(typeof payload.surface_version).toBe("string");
      expect(payload.runtime).toMatchObject({
        native_extensions_mode: expect.any(String),
        extensions_detected: expect.any(Object),
        capabilities: expect.any(Object)
      });
    });
  });

  it("returns structured validation errors for invalid inputs", async () => {
    await withMcpStdioClient("contract-validation-error", async ({ client }) => {
      const payload = await callToolJson(client, "ghostcrab_search", {
        query: "hello",
        limit: 0
      });

      expect(payload.ok).toBe(false);
      expect(payload.tool).toBe("ghostcrab_search");
      expect(payload.error).toMatchObject({
        code: "validation_error",
        message: expect.any(String)
      });
    });
  });

  it("returns a structured error for an unknown tool", async () => {
    await withMcpStdioClient("contract-unknown-tool", async ({ client }) => {
      const payload = await callToolJson(client, "ghostcrab_does_not_exist", {});

      expect(payload.ok).toBe(false);
      expect(payload.tool).toBe("ghostcrab_does_not_exist");
      expect(payload.error).toMatchObject({
        code: "unknown_tool"
      });
      expect(payload.error).toMatchObject({
        details: {
          available_tools: expect.any(Array)
        }
      });
    });
  });
});
