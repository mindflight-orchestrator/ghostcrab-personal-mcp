import { z } from "zod";

import {
  findGraphRelationByEndpoints,
  resolveGraphEntityId,
  upsertGraphEntity,
  upsertGraphRelation
} from "../../db/graph.js";
import {
  createToolSuccessResult,
  registerTool,
  type ToolHandler
} from "../registry.js";

const LearnNodeInput = z.object({
  id: z.string().trim().min(1),
  node_type: z.string().trim().min(1),
  label: z.string().trim().min(1),
  properties: z.record(z.string(), z.unknown()).default({})
});

const LearnEdgeInput = z.object({
  source: z.string().trim().min(1),
  target: z.string().trim().min(1),
  label: z.string().trim().min(1),
  weight: z.coerce.number().min(0).max(1).default(1),
  properties: z.record(z.string(), z.unknown()).default({})
});

export const LearnInput = z
  .object({
    node: LearnNodeInput.optional(),
    edge: LearnEdgeInput.optional(),
    workspace_id: z.string().min(1).optional()
  })
  .refine((value) => value.node || value.edge, {
    message: "Provide at least one of node or edge."
  });

export const learnTool: ToolHandler = {
  definition: {
    name: "ghostcrab_learn",
    description:
      "Write. Upsert knowledge graph nodes and directed edges for durable structural relations (blockers, dependencies, conceptual links). Do not create graph structure before the user intent is clarified on the first fuzzy onboarding turn.",
    inputSchema: {
      type: "object",
      properties: {
        node: {
          type: "object",
          required: ["id", "node_type", "label"],
          properties: {
            id: { type: "string" },
            node_type: { type: "string" },
            label: { type: "string" },
            properties: { type: "object" }
          }
        },
        edge: {
          type: "object",
          required: ["source", "target", "label"],
          properties: {
            source: { type: "string" },
            target: { type: "string" },
            label: { type: "string" },
            weight: { type: "number", minimum: 0, maximum: 1, default: 1 },
            properties: { type: "object" }
          }
        },
        workspace_id: {
          type: "string",
          description:
            "Target workspace id. Overrides session context for this call only."
        }
      }
    }
  },
  async handler(args, context) {
    const input = LearnInput.parse(args);
    const effectiveWorkspaceId =
      input.workspace_id ?? context.session.workspace_id;

    const result = await context.database.transaction(async (database) => {
      const output: Record<string, unknown> = {};

      if (input.node) {
        await upsertGraphEntity(database, {
          nodeId: input.node.id,
          nodeType: input.node.node_type,
          label: input.node.label,
          properties: input.node.properties,
          schemaId: null
        });

        output.node = {
          learned: true,
          id: input.node.id
        };
      }

      if (input.edge) {
        for (const nodeId of [input.edge.source, input.edge.target]) {
          await upsertGraphEntity(database, {
            nodeId,
            nodeType: "unknown",
            label: nodeId,
            properties: {},
            schemaId: null
          });
        }

        const sourceId = await resolveGraphEntityId(
          database,
          input.edge.source
        );
        const targetId = await resolveGraphEntityId(
          database,
          input.edge.target
        );

        if (sourceId === null || targetId === null) {
          throw new Error(
            "Could not resolve graph.entity rows for edge endpoints."
          );
        }

        const meta = {
          ...input.edge.properties,
          weight: input.edge.weight
        };
        const existingEdge = await findGraphRelationByEndpoints(database, {
          sourceName: input.edge.source,
          targetName: input.edge.target,
          label: input.edge.label
        });
        const edgeId = await upsertGraphRelation(database, {
          label: input.edge.label,
          properties: meta,
          sourceId,
          targetId,
          confidence: input.edge.weight
        });

        output.edge = {
          learned: true,
          id: edgeId,
          label: input.edge.label,
          ...(existingEdge ? { updated: true } : { created: true })
        };
      }

      return output;
    });

    return createToolSuccessResult("ghostcrab_learn", {
      ...result,
      workspace_id: effectiveWorkspaceId
    });
  }
};

registerTool(learnTool);
