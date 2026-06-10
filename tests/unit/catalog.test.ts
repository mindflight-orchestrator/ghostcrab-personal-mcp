import { describe, expect, it } from "vitest";

import {
  buildToolCatalog,
  classifyToolAccess,
  getBasicToolNames,
  listBasicRegisteredTools,
  searchToolCatalog
} from "../../src/tools/catalog.js";
import { workspaceUseTool } from "../../src/tools/workspace/use.js";

describe("tool catalog", () => {
  it("lists combined search as basic and csearch as extended", () => {
    const tools = [
      {
        name: "ghostcrab_combined_search",
        description: "Combined search",
        inputSchema: { type: "object", properties: {} }
      },
      {
        name: "ghostcrab_csearch",
        description: "Combined search alias",
        inputSchema: { type: "object", properties: {} }
      }
    ];

    expect(getBasicToolNames()).toContain("ghostcrab_combined_search");
    expect(getBasicToolNames()).not.toContain("ghostcrab_csearch");
    expect(listBasicRegisteredTools(tools).map((tool) => tool.name)).toEqual([
      "ghostcrab_combined_search"
    ]);

    expect(buildToolCatalog(tools)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "ghostcrab_combined_search",
          visibility: "basic"
        }),
        expect.objectContaining({
          name: "ghostcrab_csearch",
          visibility: "extended"
        })
      ])
    );
  });

  it("classifies graph grounding reads under the graph subsystem", () => {
    const catalog = buildToolCatalog([
      {
        name: "ghostcrab_entity_chunks",
        description: "Graph entity grounding",
        inputSchema: { type: "object", properties: {} }
      }
    ]);

    expect(catalog[0]).toMatchObject({
      name: "ghostcrab_entity_chunks",
      subsystem: "graph"
    });
  });

  it("classifies workspace session tools as extended", () => {
    const catalog = buildToolCatalog([workspaceUseTool.definition]);
    expect(catalog[0]).toMatchObject({
      name: "ghostcrab_workspace_use",
      subsystem: "session",
      visibility: "extended",
      access: "session"
    });

    const matches = searchToolCatalog(
      catalog,
      "",
      { subsystem: ["session"], visibility: ["extended"] },
      5
    );
    expect(matches.map((m) => m.name)).toContain("ghostcrab_workspace_use");
  });

  it("classifies mutating extended tools as write access", () => {
    for (const name of [
      "ghostcrab_graph_reindex",
      "ghostcrab_collection_reindex",
      "ghostcrab_graph_gap_rules_delete",
      "ghostcrab_workspace_delete",
      "ghostcrab_workspace_reset",
      "ghostcrab_live_refresh"
    ]) {
      expect(classifyToolAccess(name)).toBe("write");
    }
  });

  it("classifies ghostcrab_projections_list as read despite _projections prefix", () => {
    expect(classifyToolAccess("ghostcrab_projections_list")).toBe("read");
    expect(classifyToolAccess("ghostcrab_projection_get")).toBe("model");
  });
});
