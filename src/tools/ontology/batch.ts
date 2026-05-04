import { z } from "zod";

import {
  createToolErrorResult,
  createToolSuccessResult,
  registerTool,
  type ToolHandler
} from "../registry.js";

// ── ghostcrab_ingest_batch ────────────────────────────────────────────────────

const IngestBatchInput = z.object({
  workspace_id: z.string().trim().min(1),
  chunks: z
    .array(z.record(z.string(), z.unknown()))
    .min(1)
    .describe(
      "Array of knowledge chunk objects. Each chunk should follow the same shape as a single ingest_knowledge_chunk call (content, entity_id, metadata, etc.)."
    )
});

export const ingestBatchTool: ToolHandler = {
  definition: {
    name: "ghostcrab_ingest_batch",
    description:
      "Write. Ingest multiple knowledge chunks into a workspace in a single atomic call. Requires pg_mindbrain Phase 3.",
    inputSchema: {
      type: "object",
      required: ["workspace_id", "chunks"],
      properties: {
        workspace_id: {
          type: "string",
          minLength: 1,
          description: "Target workspace identifier."
        },
        chunks: {
          type: "array",
          minItems: 1,
          items: { type: "object", additionalProperties: true },
          description:
            "Array of knowledge chunk objects to ingest atomically. Each element mirrors the payload of a single ghostcrab_remember / ghostcrab_learn call."
        }
      }
    }
  },
  async handler(args, context) {
    if (!context.extensions.pgMindbrain) {
      return createToolErrorResult(
        "ghostcrab_ingest_batch",
        "pg_mindbrain extension is not loaded; ghostcrab_ingest_batch requires pg_mindbrain Phase 3.",
        "extension_not_loaded"
      );
    }

    const input = IngestBatchInput.parse(args);

    const rows = await context.database.query<{ result: unknown }>(
      `SELECT mb_ontology.ingest_knowledge_batch($1::text, $2::jsonb) AS result`,
      [input.workspace_id, input.chunks]
    );

    return createToolSuccessResult("ghostcrab_ingest_batch", {
      workspace_id: input.workspace_id,
      chunk_count: input.chunks.length,
      result: rows[0]?.result ?? null
    });
  }
};

// ── ghostcrab_project_template_create ────────────────────────────────────────

const ProjectTemplateCreateInput = z.object({
  workspace_id: z.string().trim().min(1),
  template_name: z.string().trim().min(1),
  template_spec: z.record(z.string(), z.unknown()).optional()
});

export const projectTemplateCreateTool: ToolHandler = {
  definition: {
    name: "ghostcrab_project_template_create",
    description:
      "Write. Create a reusable project template in a workspace. Requires pg_mindbrain Phase 3.",
    inputSchema: {
      type: "object",
      required: ["workspace_id", "template_name"],
      properties: {
        workspace_id: {
          type: "string",
          minLength: 1,
          description: "Target workspace identifier."
        },
        template_name: {
          type: "string",
          minLength: 1,
          description: "Unique name for the project template."
        },
        template_spec: {
          type: "object",
          description:
            "Optional JSONB template specification (entity types, relation types, default facets, lifecycle stages, etc.).",
          additionalProperties: true
        }
      }
    }
  },
  async handler(args, context) {
    if (!context.extensions.pgMindbrain) {
      return createToolErrorResult(
        "ghostcrab_project_template_create",
        "pg_mindbrain extension is not loaded; ghostcrab_project_template_create requires pg_mindbrain Phase 3.",
        "extension_not_loaded"
      );
    }

    const input = ProjectTemplateCreateInput.parse(args);

    const rows = await context.database.query<{ result: unknown }>(
      `SELECT mb_ontology.create_project_template($1::text, $2::text, $3::jsonb) AS result`,
      [input.workspace_id, input.template_name, input.template_spec ?? null]
    );

    return createToolSuccessResult("ghostcrab_project_template_create", {
      workspace_id: input.workspace_id,
      template_name: input.template_name,
      result: rows[0]?.result ?? null
    });
  }
};

// ── ghostcrab_project_instantiate ─────────────────────────────────────────────

const ProjectInstantiateInput = z.object({
  workspace_id: z.string().trim().min(1),
  template_id: z.string().trim().min(1),
  options: z.record(z.string(), z.unknown()).optional()
});

export const projectInstantiateTool: ToolHandler = {
  definition: {
    name: "ghostcrab_project_instantiate",
    description:
      "Write. Instantiate a new project from a template in a workspace. Requires pg_mindbrain Phase 3.",
    inputSchema: {
      type: "object",
      required: ["workspace_id", "template_id"],
      properties: {
        workspace_id: {
          type: "string",
          minLength: 1,
          description: "Target workspace identifier."
        },
        template_id: {
          type: "string",
          minLength: 1,
          description: "Identifier of the project template to instantiate."
        },
        options: {
          type: "object",
          description:
            "Optional JSONB instantiation options (e.g. project_name, owner, start_date, initial_facets).",
          additionalProperties: true
        }
      }
    }
  },
  async handler(args, context) {
    if (!context.extensions.pgMindbrain) {
      return createToolErrorResult(
        "ghostcrab_project_instantiate",
        "pg_mindbrain extension is not loaded; ghostcrab_project_instantiate requires pg_mindbrain Phase 3.",
        "extension_not_loaded"
      );
    }

    const input = ProjectInstantiateInput.parse(args);

    const rows = await context.database.query<{ result: unknown }>(
      `SELECT mb_ontology.instantiate_project($1::text, $2::text, $3::jsonb) AS result`,
      [input.workspace_id, input.template_id, input.options ?? null]
    );

    return createToolSuccessResult("ghostcrab_project_instantiate", {
      workspace_id: input.workspace_id,
      template_id: input.template_id,
      result: rows[0]?.result ?? null
    });
  }
};

// ── ghostcrab_project_checkpoint ──────────────────────────────────────────────

const ProjectCheckpointInput = z.object({
  workspace_id: z.string().trim().min(1),
  project_id: z.string().trim().min(1),
  checkpoint_data: z.record(z.string(), z.unknown()).optional()
});

export const projectCheckpointTool: ToolHandler = {
  definition: {
    name: "ghostcrab_project_checkpoint",
    description:
      "Write. Record a checkpoint snapshot for a running project. Requires pg_mindbrain Phase 3.",
    inputSchema: {
      type: "object",
      required: ["workspace_id", "project_id"],
      properties: {
        workspace_id: {
          type: "string",
          minLength: 1,
          description: "Target workspace identifier."
        },
        project_id: {
          type: "string",
          minLength: 1,
          description: "Identifier of the project to checkpoint."
        },
        checkpoint_data: {
          type: "object",
          description:
            "Optional JSONB payload for this checkpoint (progress metrics, milestone notes, state snapshot, etc.).",
          additionalProperties: true
        }
      }
    }
  },
  async handler(args, context) {
    if (!context.extensions.pgMindbrain) {
      return createToolErrorResult(
        "ghostcrab_project_checkpoint",
        "pg_mindbrain extension is not loaded; ghostcrab_project_checkpoint requires pg_mindbrain Phase 3.",
        "extension_not_loaded"
      );
    }

    const input = ProjectCheckpointInput.parse(args);

    const rows = await context.database.query<{ result: unknown }>(
      `SELECT mb_ontology.checkpoint_project($1::text, $2::text, $3::jsonb) AS result`,
      [input.workspace_id, input.project_id, input.checkpoint_data ?? null]
    );

    return createToolSuccessResult("ghostcrab_project_checkpoint", {
      workspace_id: input.workspace_id,
      project_id: input.project_id,
      result: rows[0]?.result ?? null
    });
  }
};

registerTool(ingestBatchTool);
registerTool(projectTemplateCreateTool);
registerTool(projectInstantiateTool);
registerTool(projectCheckpointTool);
