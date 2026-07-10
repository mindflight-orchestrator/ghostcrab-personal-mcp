import { z } from "zod";

import { resolveGhostcrabConfig } from "../../config/env.js";
import { runStandaloneGraphSubgraph } from "../../db/standalone-mindbrain.js";
import {
  createToolErrorFromException,
  createToolSuccessResult,
  registerTool,
  type ToolHandler
} from "../registry.js";

export const GraphSubgraphInput = z.object({
  seed_ids: z.array(z.coerce.number().int().positive()).min(1).max(100),
  hops: z.coerce.number().int().min(1).max(10).default(2),
  edge_types: z.array(z.string().trim().min(1)).max(20).default([]),
  workspace_id: z.string().trim().min(1).optional()
});

export const graphSubgraphTool: ToolHandler = {
  definition: {
    name: "ghostcrab_graph_subgraph",
    description:
      "Read. Expand a subgraph around one or more seed entity IDs within a given number of hops. Returns the stream of graph events (nodes and edges) reachable from the seeds.",
    inputSchema: {
      type: "object",
      required: ["seed_ids"],
      properties: {
        workspace_id: {
          type: "string",
          description:
            "Target workspace id. Overrides session context for this call only."
        },
        seed_ids: {
          type: "array",
          items: { type: "integer", minimum: 1 },
          minItems: 1,
          maxItems: 100,
          description: "Entity IDs to use as seeds for subgraph expansion."
        },
        hops: {
          type: "integer",
          default: 2,
          minimum: 1,
          maximum: 10,
          description: "Number of hops to expand from each seed."
        },
        edge_types: {
          type: "array",
          items: { type: "string" },
          default: [],
          description:
            "Optional edge type filters. Empty array traverses all edge types."
        }
      }
    }
  },
  async handler(args, context) {
    const input = GraphSubgraphInput.parse(args);
    const workspaceId = input.workspace_id ?? context.session.workspace_id;
    const config = resolveGhostcrabConfig();

    let events;
    try {
      events = await runStandaloneGraphSubgraph({
        mindbrainUrl: config.mindbrainUrl,
        timeoutMs: config.mindbrainHttpTimeoutMs,
        workspaceId,
        seedIds: input.seed_ids,
        hops: input.hops,
        edgeTypes: input.edge_types.length > 0 ? input.edge_types : undefined
      });
    } catch (error) {
      return createToolErrorFromException(
        "ghostcrab_graph_subgraph",
        error,
        "backend_unavailable",
        "MindBrain graph-subgraph backend unavailable"
      );
    }

    const nodeCount = events.filter(
      (e) =>
        e.kind === "seed_node" ||
        e.kind === "neighbor_node" ||
        e.kind === "node"
    ).length;
    const edgeCount = events.filter((e) => e.kind === "edge").length;

    return createToolSuccessResult("ghostcrab_graph_subgraph", {
      workspace_id: workspaceId,
      seed_ids: input.seed_ids,
      hops: input.hops,
      edge_types: input.edge_types,
      node_count: nodeCount,
      edge_count: edgeCount,
      events
    });
  }
};

registerTool(graphSubgraphTool);
