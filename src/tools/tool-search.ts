import { z } from "zod";

import {
  buildToolCatalog,
  getBasicToolNames,
  searchToolCatalog,
  type ToolAccess,
  type ToolSubsystem,
  type ToolVisibility
} from "./catalog.js";
import {
  createToolSuccessResult,
  listRegisteredTools,
  registerTool,
  type ToolHandler
} from "./registry.js";

const accessValues = [
  "bootstrap",
  "read",
  "write",
  "model",
  "guide",
  "session"
] as const satisfies readonly ToolAccess[];

const subsystemValues = [
  "facets",
  "graph",
  "loadout",
  "ontology",
  "pragma",
  "session",
  "workspace"
] as const satisfies readonly ToolSubsystem[];

const visibilityValues = ["basic", "extended"] as const satisfies readonly ToolVisibility[];

export const ToolSearchInput = z.object({
  query: z.string().max(200).default(""),
  limit: z.coerce.number().int().min(1).max(20).default(5),
  access: z.array(z.enum(accessValues)).max(accessValues.length).optional(),
  subsystem: z
    .array(z.enum(subsystemValues))
    .max(subsystemValues.length)
    .optional(),
  visibility: z
    .array(z.enum(visibilityValues))
    .max(visibilityValues.length)
    .optional(),
  name_prefix: z.string().max(64).optional(),
  include_input_schema: z.boolean().default(false)
});

export const toolSearchTool: ToolHandler = {
  definition: {
    name: "ghostcrab_tool_search",
    description:
      "Read. Search the full GhostCrab tool catalog by tool name, description, argument names, and argument descriptions. Use this when the default tool list is too small or when you need to discover specialized workspace, ontology, loadout, or graph tools.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          maxLength: 200,
          description:
            "Natural-language or keyword query over tool names, descriptions, and argument documentation. Empty string means faceted browsing only."
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 20,
          default: 5,
          description: "Maximum number of tools to return."
        },
        access: {
          type: "array",
          items: { type: "string", enum: [...accessValues] },
          description:
            "Optional access facet filter: bootstrap, read, write, model, guide, or session."
        },
        subsystem: {
          type: "array",
          items: { type: "string", enum: [...subsystemValues] },
          description:
            "Optional subsystem facet filter: facets, graph, workspace, ontology, loadout, pragma, or session."
        },
        visibility: {
          type: "array",
          items: { type: "string", enum: [...visibilityValues] },
          description:
            "Optional visibility facet filter. 'basic' matches the compact default list; 'extended' matches hidden-by-default tools."
        },
        name_prefix: {
          type: "string",
          maxLength: 64,
          description:
            "Optional tool-name prefix filter, for example 'ghostcrab_workspace_' or 'ghostcrab_ontology_'."
        },
        include_input_schema: {
          type: "boolean",
          default: false,
          description:
            "When true, include each matching tool's full MCP inputSchema in the results."
        }
      }
    }
  },
  async handler(args) {
    const input = ToolSearchInput.parse(args);
    const tools = listRegisteredTools();
    const toolDefinitions = new Map(tools.map((tool) => [tool.name, tool]));
    const catalog = buildToolCatalog(tools);
    const matches = searchToolCatalog(
      catalog,
      input.query,
      {
        access: input.access,
        name_prefix: input.name_prefix,
        subsystem: input.subsystem,
        visibility: input.visibility
      },
      input.limit
    );

    return createToolSuccessResult("ghostcrab_tool_search", {
      query: input.query,
      facets: {
        access: input.access ?? [],
        subsystem: input.subsystem ?? [],
        visibility: input.visibility ?? [],
        name_prefix: input.name_prefix ?? null
      },
      returned: matches.length,
      catalog_size: catalog.length,
      basic_tool_names: getBasicToolNames(),
      results: matches.map((entry) => {
        const definition = toolDefinitions.get(entry.name);
        return {
          name: entry.name,
          description: entry.description,
          access: entry.access,
          subsystem: entry.subsystem,
          visibility: entry.visibility,
          required_arguments: entry.required_arguments,
          arguments: entry.arguments,
          score: Number(entry.score.toFixed(4)),
          ...(input.include_input_schema && definition
            ? { inputSchema: definition.inputSchema }
            : {})
        };
      }),
      notes: [
        "The default MCP list is intentionally compact.",
        "Use this tool to discover the extended GhostCrab tool catalog on demand."
      ]
    });
  }
};

registerTool(toolSearchTool);
