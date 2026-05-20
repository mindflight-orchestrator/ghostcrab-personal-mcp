import { z } from "zod";

import {
  findGraphRelationByEndpoints,
  resolveGraphEntityId,
  upsertGraphEntity,
  upsertGraphRelation,
  upsertGraphRelationProperties
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

const VALUE_TYPES = [
  "text",
  "number",
  "percentage_bp",
  "money_minor",
  "date_unix",
  "doc_ref",
  "uri"
] as const;

export const RelationPropertyInput = z
  .object({
    property_key: z.string().trim().min(1),
    value_type: z.enum(VALUE_TYPES),
    value_text: z.string().optional(),
    value_number: z.number().optional(),
    value_integer: z.number().int().optional(),
    ref_doc_id: z.number().int().positive().optional(),
    currency: z.string().trim().min(1).optional()
  })
  .superRefine((prop, ctx) => {
    if (prop.currency !== undefined && prop.value_type !== "money_minor") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "`currency` is only valid when value_type is `money_minor`",
        path: ["currency"]
      });
    }

    const hasText = prop.value_text !== undefined;
    const hasNumber = prop.value_number !== undefined;
    const hasInteger = prop.value_integer !== undefined;
    const hasRef = prop.ref_doc_id !== undefined;

    const textTypes = new Set<string>(["text", "uri"]);
    const numberTypes = new Set<string>(["number", "percentage_bp"]);
    const integerTypes = new Set<string>(["date_unix", "money_minor"]);

    if (textTypes.has(prop.value_type) && !hasText) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `value_text is required when value_type is \`${prop.value_type}\``,
        path: ["value_text"]
      });
    }
    if (numberTypes.has(prop.value_type) && !hasNumber) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `value_number is required when value_type is \`${prop.value_type}\``,
        path: ["value_number"]
      });
    }
    if (integerTypes.has(prop.value_type) && !hasInteger) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `value_integer is required when value_type is \`${prop.value_type}\``,
        path: ["value_integer"]
      });
    }
    if (prop.value_type === "doc_ref" && !hasRef) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "ref_doc_id is required when value_type is `doc_ref`",
        path: ["ref_doc_id"]
      });
    }

    const irrelevantText =
      hasText &&
      !textTypes.has(prop.value_type) &&
      prop.value_type !== "doc_ref";
    const irrelevantNumber = hasNumber && !numberTypes.has(prop.value_type);
    const irrelevantInteger = hasInteger && !integerTypes.has(prop.value_type);
    const irrelevantRef = hasRef && prop.value_type !== "doc_ref";

    if (irrelevantText) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `value_text is not applicable for value_type \`${prop.value_type}\``,
        path: ["value_text"]
      });
    }
    if (irrelevantNumber) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `value_number is not applicable for value_type \`${prop.value_type}\``,
        path: ["value_number"]
      });
    }
    if (irrelevantInteger) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `value_integer is not applicable for value_type \`${prop.value_type}\``,
        path: ["value_integer"]
      });
    }
    if (irrelevantRef) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `ref_doc_id is not applicable for value_type \`${prop.value_type}\``,
        path: ["ref_doc_id"]
      });
    }
  });

const LearnEdgeInput = z.object({
  source: z.string().trim().min(1),
  target: z.string().trim().min(1),
  label: z.string().trim().min(1),
  weight: z.coerce.number().min(0).max(1).default(1),
  properties: z.record(z.string(), z.unknown()).default({}),
  relation_properties: z.array(RelationPropertyInput).max(50).optional()
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
            properties: { type: "object" },
            relation_properties: {
              type: "array",
              maxItems: 50,
              description:
                "Optional typed edge properties stored canonically in relation_properties_raw and projected into graph_relation_property. Each item must carry a value column matching its value_type. `currency` is only valid with value_type `money_minor`.",
              items: {
                type: "object",
                required: ["property_key", "value_type"],
                properties: {
                  property_key: { type: "string" },
                  value_type: {
                    type: "string",
                    enum: [
                      "text",
                      "number",
                      "percentage_bp",
                      "money_minor",
                      "date_unix",
                      "doc_ref",
                      "uri"
                    ]
                  },
                  value_text: { type: "string" },
                  value_number: { type: "number" },
                  value_integer: { type: "integer" },
                  ref_doc_id: { type: "integer", minimum: 1 },
                  currency: { type: "string" }
                }
              }
            }
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

        if (input.edge.relation_properties?.length) {
          await upsertGraphRelationProperties(
            database,
            effectiveWorkspaceId,
            edgeId,
            {
              label: input.edge.label,
              properties: meta,
              sourceId,
              targetId,
              confidence: input.edge.weight
            },
            input.edge.relation_properties
          );
        }

        output.edge = {
          learned: true,
          id: edgeId,
          label: input.edge.label,
          ...(existingEdge ? { updated: true } : { created: true }),
          ...(input.edge.relation_properties?.length
            ? {
                relation_properties_count: input.edge.relation_properties.length
              }
            : {})
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
