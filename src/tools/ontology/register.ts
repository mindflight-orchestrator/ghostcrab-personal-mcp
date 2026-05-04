import { z } from "zod";

import {
  createToolErrorResult,
  createToolSuccessResult,
  registerTool,
  type ToolHandler
} from "../registry.js";

// ── ghostcrab_ontology_register_entity_type ──────────────────────────────────

const RegisterEntityTypeInput = z.object({
  workspace_id: z.string().trim().min(1),
  entity_type: z.string().trim().min(1),
  metadata: z.record(z.string(), z.unknown()).optional()
});

export const registerEntityTypeTool: ToolHandler = {
  definition: {
    name: "ghostcrab_ontology_register_entity_type",
    description:
      "Write. Register a new entity type in the mb_ontology schema for a given workspace. Requires pg_mindbrain.",
    inputSchema: {
      type: "object",
      required: ["workspace_id", "entity_type"],
      properties: {
        workspace_id: {
          type: "string",
          minLength: 1,
          description: "Target workspace identifier."
        },
        entity_type: {
          type: "string",
          minLength: 1,
          description: "Name of the entity type to register."
        },
        metadata: {
          type: "object",
          description: "Optional JSONB metadata attached to the entity type definition.",
          additionalProperties: true
        }
      }
    }
  },
  async handler(args, context) {
    if (!context.extensions.pgMindbrain) {
      return createToolErrorResult(
        "ghostcrab_ontology_register_entity_type",
        "pg_mindbrain extension is not loaded; ghostcrab_ontology_register_entity_type requires pg_mindbrain.",
        "extension_not_loaded"
      );
    }

    const input = RegisterEntityTypeInput.parse(args);

    const rows = await context.database.query<{ result: unknown }>(
      `SELECT mb_ontology.register_entity_type($1::text, $2::text, $3::jsonb) AS result`,
      [input.workspace_id, input.entity_type, input.metadata ?? null]
    );

    return createToolSuccessResult("ghostcrab_ontology_register_entity_type", {
      workspace_id: input.workspace_id,
      entity_type: input.entity_type,
      result: rows[0]?.result ?? null
    });
  }
};

// ── ghostcrab_ontology_register_relation_type ────────────────────────────────

const RegisterRelationTypeInput = z.object({
  workspace_id: z.string().trim().min(1),
  relation_type: z.string().trim().min(1),
  source_entity_type: z.string().trim().min(1),
  target_entity_type: z.string().trim().min(1),
  metadata: z.record(z.string(), z.unknown()).optional()
});

export const registerRelationTypeTool: ToolHandler = {
  definition: {
    name: "ghostcrab_ontology_register_relation_type",
    description:
      "Write. Register a new relation type between two entity types in the mb_ontology schema. Requires pg_mindbrain.",
    inputSchema: {
      type: "object",
      required: ["workspace_id", "relation_type", "source_entity_type", "target_entity_type"],
      properties: {
        workspace_id: {
          type: "string",
          minLength: 1,
          description: "Target workspace identifier."
        },
        relation_type: {
          type: "string",
          minLength: 1,
          description: "Name of the relation type to register (e.g. 'owns', 'depends_on')."
        },
        source_entity_type: {
          type: "string",
          minLength: 1,
          description: "Entity type that is the source of the relation."
        },
        target_entity_type: {
          type: "string",
          minLength: 1,
          description: "Entity type that is the target of the relation."
        },
        metadata: {
          type: "object",
          description: "Optional JSONB metadata attached to the relation type definition.",
          additionalProperties: true
        }
      }
    }
  },
  async handler(args, context) {
    if (!context.extensions.pgMindbrain) {
      return createToolErrorResult(
        "ghostcrab_ontology_register_relation_type",
        "pg_mindbrain extension is not loaded; ghostcrab_ontology_register_relation_type requires pg_mindbrain.",
        "extension_not_loaded"
      );
    }

    const input = RegisterRelationTypeInput.parse(args);

    const rows = await context.database.query<{ result: unknown }>(
      `SELECT mb_ontology.register_relation_type($1::text, $2::text, $3::text, $4::text, $5::jsonb) AS result`,
      [
        input.workspace_id,
        input.relation_type,
        input.source_entity_type,
        input.target_entity_type,
        input.metadata ?? null
      ]
    );

    return createToolSuccessResult("ghostcrab_ontology_register_relation_type", {
      workspace_id: input.workspace_id,
      relation_type: input.relation_type,
      source_entity_type: input.source_entity_type,
      target_entity_type: input.target_entity_type,
      result: rows[0]?.result ?? null
    });
  }
};

registerTool(registerEntityTypeTool);
registerTool(registerRelationTypeTool);
