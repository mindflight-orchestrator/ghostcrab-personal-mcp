import { describe, expect, it } from "vitest";

import {
  buildToolCatalog,
  getBasicToolNames,
  listBasicRegisteredTools
} from "../../src/tools/catalog.js";

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
});
