import { describe, expect, it } from "vitest";

import { registerAllTools } from "../../src/tools/register-all.js";
import { listRegisteredTools } from "../../src/tools/registry.js";
import {
  BASIC_TOOL_NAMES,
  diffToolNames,
  EXPECTED_TOOL_NAMES,
  getExpectedToolManifest
} from "../../src/tools/tool-manifest.js";
import {
  annotateToolForMcpList,
  getToolVisibility,
  listAllRegisteredToolsForMcp
} from "../../src/tools/catalog.js";

describe("tool manifest", () => {
  it("matches the live registry after registerAllTools()", () => {
    registerAllTools();
    const registered = listRegisteredTools()
      .map((tool) => tool.name)
      .sort();
    const { missing, extra } = diffToolNames(registered);

    expect(missing).toEqual([]);
    expect(extra).toEqual([]);
    expect(registered).toHaveLength(EXPECTED_TOOL_NAMES.length);
  });

  it("reports 14 basic and the rest extended", () => {
    const manifest = getExpectedToolManifest();
    expect(manifest.basic).toBe(14);
    expect(manifest.basic_names).toEqual([...BASIC_TOOL_NAMES]);
    expect(manifest.total).toBe(manifest.basic + manifest.extended);
  });

  it("labels MCP-listed tools with title hints for basic vs extended", () => {
    registerAllTools();
    const listed = listAllRegisteredToolsForMcp(listRegisteredTools());

    expect(listed).toHaveLength(EXPECTED_TOOL_NAMES.length);
    for (const tool of listed) {
      if (getToolVisibility(tool.name) === "basic") {
        expect(tool.title).toBe("GhostCrab recommended default");
      } else {
        expect(tool.title).toBe("GhostCrab extended tool");
      }
    }
  });

  it("keeps basic tools in the recommended default set", () => {
    registerAllTools();
    const byName = new Map(
      listAllRegisteredToolsForMcp(listRegisteredTools()).map((tool) => [
        tool.name,
        tool
      ])
    );

    for (const name of BASIC_TOOL_NAMES) {
      const tool = byName.get(name);
      expect(tool).toBeDefined();
      expect(tool?.title).toBe("GhostCrab recommended default");
    }
  });

  it("marks extended-only tools with extended title", () => {
    const extended = annotateToolForMcpList({
      name: "ghostcrab_workspace_create",
      description: "create",
      inputSchema: { type: "object", properties: {} }
    });
    expect(extended.title).toBe("GhostCrab extended tool");
  });
});
