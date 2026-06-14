import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { resolveGhostcrabConfig } from "../../../src/config/env.js";
import { createDatabaseClient } from "../../../src/db/client.js";
import {
  BASIC_TOOL_NAMES,
  EXPECTED_TOOL_NAMES,
  getExpectedToolManifest
} from "../../../src/tools/tool-manifest.js";
import {
  callToolJson,
  listToolNames,
  withMcpStdioClient
} from "../../helpers/mcp-stdio.js";

process.env.GHOSTCRAB_MINDBRAIN_URL =
  process.env.GHOSTCRAB_MINDBRAIN_URL ?? "http://127.0.0.1:8091";

const config = resolveGhostcrabConfig(process.env);
const database = createDatabaseClient(config);

describe.sequential("MCP server contract", () => {
  beforeEach(async ({ skip }) => {
    const reachable = await database.ping();
    if (!reachable) {
      skip(
        `Integration MindBrain backend is unreachable at ${config.mindbrainUrl}. Skipping server-contract suite.`
      );
    }
  });

  afterAll(async () => {
    await database.close();
  });

  it("starts on stdio and lists the full direct tool catalog", async () => {
    await withMcpStdioClient(
      "contract-list-tools",
      async ({ client, getStderrOutput }) => {
        const tools = await listToolNames(client);
        const manifest = getExpectedToolManifest();

        expect(tools).toHaveLength(manifest.total);
        expect(tools).toEqual([...EXPECTED_TOOL_NAMES].sort());
        expect(tools).toContain("ghostcrab_workspace_create");
        expect(tools).toContain("ghostcrab_workspace_list");
        expect(tools).toContain("ghostcrab_csearch");

        const stderr = getStderrOutput();
        expect(stderr).toContain("Starting MCP server");
        expect(stderr).toContain("MCP server connected on stdio");
      }
    );
  });

  it("labels listed tools as recommended defaults or extended tools", async () => {
    await withMcpStdioClient("contract-tool-titles", async ({ client }) => {
      const toolsResult = await client.listTools();
      const manifest = getExpectedToolManifest();
      const basic = toolsResult.tools.filter(
        (tool) => tool.title === "GhostCrab recommended default"
      );
      const extended = toolsResult.tools.filter(
        (tool) => tool.title === "GhostCrab extended tool"
      );

      expect(basic).toHaveLength(BASIC_TOOL_NAMES.length);
      expect(extended).toHaveLength(manifest.total - BASIC_TOOL_NAMES.length);
    });
  });

  it("discovers hidden workspace tools via ghostcrab_tool_search", async () => {
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

  it("calls an extended workspace tool via tools/call", async () => {
    await withMcpStdioClient("contract-call-extended", async ({ client }) => {
      const payload = await callToolJson(client, "ghostcrab_workspace_list", {});

      expect(payload.ok).toBe(true);
      expect(payload.tool).toBe("ghostcrab_workspace_list");
      expect(Array.isArray(payload.workspaces)).toBe(true);
    });
  });

  it("discovers ghostcrab_workspace_use via extended session tool search", async () => {
    await withMcpStdioClient("contract-tool-search-use", async ({ client }) => {
      const payload = await callToolJson(client, "ghostcrab_tool_search", {
        query: "",
        name_prefix: "ghostcrab_workspace_use",
        subsystem: ["session"],
        visibility: ["extended"]
      });

      expect(payload.ok).toBe(true);
      expect(payload.results).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "ghostcrab_workspace_use",
            visibility: "extended",
            subsystem: "session"
          })
        ])
      );
    });
  });

  it("discovers the combined search alias via ghostcrab_tool_search", async () => {
    await withMcpStdioClient(
      "contract-tool-search-alias",
      async ({ client }) => {
        const payload = await callToolJson(client, "ghostcrab_tool_search", {
          query: "combined search csearch",
          name_prefix: "ghostcrab_csearch",
          visibility: ["extended"]
        });

        expect(payload.ok).toBe(true);
        expect(payload.results).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              name: "ghostcrab_csearch",
              visibility: "extended"
            })
          ])
        );
      }
    );
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
        database_kind: "sqlite",
        sqlite_backing_store: true,
        capabilities: expect.any(Object)
      });
      expect(payload.runtime).not.toHaveProperty("native_extensions_mode");
      expect(payload.runtime).not.toHaveProperty("extensions_detected");
    });
  });

  it("returns structured validation errors for invalid inputs", async () => {
    await withMcpStdioClient(
      "contract-validation-error",
      async ({ client }) => {
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
      }
    );
  });

  it("returns a structured error for an unknown tool", async () => {
    await withMcpStdioClient("contract-unknown-tool", async ({ client }) => {
      const payload = await callToolJson(
        client,
        "ghostcrab_does_not_exist",
        {}
      );

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
