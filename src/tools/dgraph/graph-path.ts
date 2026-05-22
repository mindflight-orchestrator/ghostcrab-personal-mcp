import { z } from "zod";

import { resolveGhostcrabConfig } from "../../config/env.js";
import { runStandaloneGraphPath } from "../../db/standalone-mindbrain.js";
import {
  createToolErrorResult,
  createToolSuccessResult,
  registerTool,
  type ToolHandler
} from "../registry.js";

export const GraphPathInput = z.object({
  source: z.string().trim().min(1),
  target: z.string().trim().min(1),
  max_depth: z.coerce.number().int().min(1).max(20).default(4),
  edge_labels: z.array(z.string().trim().min(1)).max(20).default([])
});

export const graphPathTool: ToolHandler = {
  definition: {
    name: "ghostcrab_graph_path",
    description:
      "Read. Find the shortest path between two graph entities by node ID (source → target). Returns a human-readable path summary or an empty result when no path exists within max_depth hops.",
    inputSchema: {
      type: "object",
      required: ["source", "target"],
      properties: {
        source: {
          type: "string",
          description: "Source node ID (graph_entity.node_id or entity_id)."
        },
        target: {
          type: "string",
          description: "Target node ID (graph_entity.node_id or entity_id)."
        },
        max_depth: {
          type: "integer",
          default: 4,
          minimum: 1,
          maximum: 20,
          description: "Maximum number of hops to search."
        },
        edge_labels: {
          type: "array",
          items: { type: "string" },
          default: [],
          description:
            "Optional edge label filters. Empty array searches all edge types."
        }
      }
    }
  },
  async handler(args, _context) {
    const input = GraphPathInput.parse(args);
    const config = resolveGhostcrabConfig();

    let pathText: string;
    try {
      pathText = await runStandaloneGraphPath({
        mindbrainUrl: config.mindbrainUrl,
        timeoutMs: config.mindbrainHttpTimeoutMs,
        source: input.source,
        target: input.target,
        maxDepth: input.max_depth,
        edgeLabels: input.edge_labels
      });
    } catch (error) {
      return createToolErrorResult(
        "ghostcrab_graph_path",
        error instanceof Error
          ? error.message
          : "MindBrain graph-path backend unavailable",
        "backend_unavailable"
      );
    }

    return createToolSuccessResult("ghostcrab_graph_path", {
      source: input.source,
      target: input.target,
      max_depth: input.max_depth,
      edge_labels: input.edge_labels,
      path: pathText
    });
  }
};

registerTool(graphPathTool);
