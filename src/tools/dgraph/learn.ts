import { z } from "zod";

import {
  resolveGraphEntityId,
  upsertGraphEntity
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
    edge: LearnEdgeInput.optional()
  })
  .refine((value) => value.node || value.edge, {
    message: "Provide at least one of node or edge."
  });

export const learnTool: ToolHandler = {
  definition: {
    name: "ghostcrab_learn",
    description:
      "Upsert knowledge nodes and write directed graph edges representing what the agent learned.",
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
        }
      }
    }
  },
  async handler(args, context) {
    const input = LearnInput.parse(args);

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

        const sourceId = await resolveGraphEntityId(database, input.edge.source);
        const targetId = await resolveGraphEntityId(database, input.edge.target);

        if (sourceId === null || targetId === null) {
          throw new Error("Could not resolve graph.entity rows for edge endpoints.");
        }

        if (database.kind === "sqlite") {
          const [existingEdge] = await database.query<{ relation_id: number }>(
            `
              SELECT relation_id
              FROM graph_relation
              WHERE source_id = ?
                AND target_id = ?
                AND relation_type = ?
              LIMIT 1
            `,
            [Number(sourceId), Number(targetId), input.edge.label]
          );

          const meta = {
            ...input.edge.properties,
            weight: input.edge.weight
          };

          if (existingEdge) {
            await database.query(
              `
                UPDATE graph_relation
                SET confidence = ?,
                    metadata_json = ?
                WHERE relation_id = ?
              `,
              [input.edge.weight, JSON.stringify(meta), existingEdge.relation_id]
            );

            output.edge = {
              learned: true,
              id: String(existingEdge.relation_id),
              label: input.edge.label,
              updated: true
            };
          } else {
            const [nextRelationRow] = await database.query<{ next_id: number }>(
              `
                SELECT COALESCE(MAX(relation_id), 0) + 1 AS next_id
                FROM graph_relation
              `
            );
            const relationId = nextRelationRow?.next_id ?? 1;
            await database.query(
              `
                INSERT INTO graph_relation (
                  relation_id,
                  relation_type,
                  source_id,
                  target_id,
                  confidence,
                  metadata_json
                )
                VALUES (?, ?, ?, ?, ?, ?)
              `,
              [
                relationId,
                input.edge.label,
                Number(sourceId),
                Number(targetId),
                input.edge.weight,
                JSON.stringify(meta)
              ]
            );

            output.edge = {
              learned: true,
              id: String(relationId),
              label: input.edge.label,
              created: true
            };
          }

          return output;
        }

        const [existingEdge] = await database.query<{ id: string }>(
          `
            SELECT id::text
            FROM graph.relation
            WHERE source_id = $1::bigint
              AND target_id = $2::bigint
              AND type = $3
              AND deprecated_at IS NULL
            LIMIT 1
          `,
          [sourceId.toString(), targetId.toString(), input.edge.label]
        );

        const meta = {
          ...input.edge.properties,
          weight: input.edge.weight
        };

        if (existingEdge) {
          await database.query(
            `
              UPDATE graph.relation
              SET confidence = $2::real,
                  metadata = COALESCE(graph.relation.metadata, '{}'::jsonb) || $3::jsonb
              WHERE id = $1::bigint
            `,
            [existingEdge.id, input.edge.weight, JSON.stringify(meta)]
          );

          output.edge = {
            learned: true,
            id: existingEdge.id,
            label: input.edge.label,
            updated: true
          };
        } else {
          const [createdEdge] = await database.query<{ id: string }>(
            `
              INSERT INTO graph.relation (
                type,
                source_id,
                target_id,
                confidence,
                metadata
              )
              VALUES ($1, $2::bigint, $3::bigint, $4::real, $5::jsonb)
              RETURNING id::text
            `,
            [
              input.edge.label,
              sourceId.toString(),
              targetId.toString(),
              input.edge.weight,
              JSON.stringify(meta)
            ]
          );

          if (!createdEdge?.id) {
            throw new Error(
              "INSERT returned no row — possible constraint violation"
            );
          }

          output.edge = {
            learned: true,
            id: createdEdge.id,
            label: input.edge.label,
            created: true
          };
        }
      }

      return output;
    });

    return createToolSuccessResult("ghostcrab_learn", result);
  }
};

registerTool(learnTool);
