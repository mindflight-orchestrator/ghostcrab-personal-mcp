import { z } from "zod";

import {
  createToolSuccessResult,
  registerTool,
  type ToolHandler
} from "../registry.js";
import { WorkspaceIdSchema } from "../../types/workspace.js";

const CreateWorkspaceInput = z.object({
  id: WorkspaceIdSchema,
  label: z.string().min(1).max(200),
  description: z.string().optional(),
  created_by: z.string().optional()
});

export const workspaceCreateTool: ToolHandler = {
  definition: {
    name: "ghostcrab_workspace_create",
    description:
      "Create a new logical workspace that scopes facets, entities, and DDL migrations. Idempotent: re-creating an existing workspace with the same id is a no-op.",
    inputSchema: {
      type: "object",
      required: ["id", "label"],
      properties: {
        id: {
          type: "string",
          description:
            "Workspace identifier: lowercase alphanum + hyphens, 2–64 chars, must start with a letter. Example: 'prod-eu', 'research-q1'."
        },
        label: {
          type: "string",
          description: "Human-readable name for the workspace.",
          maxLength: 200
        },
        description: {
          type: "string",
          description: "Optional longer description of the workspace purpose."
        },
        created_by: {
          type: "string",
          description:
            "Identity of the requester (agent name, user email, etc.)."
        }
      }
    }
  },
  async handler(args, context) {
    const input = CreateWorkspaceInput.parse(args);

    const existing = await context.database.query<{ id: string }>(
      `SELECT id FROM workspaces WHERE id = ?`,
      [input.id]
    );

    if (existing.length > 0) {
      return createToolSuccessResult("ghostcrab_workspace_create", {
        workspace_id: input.id,
        created: false,
        idempotent: true,
        message: `Workspace '${input.id}' already exists.`
      });
    }

    const pgSchema = `ws_${input.id.replace(/-/g, "_")}`;

    await context.database.query(
      `INSERT INTO workspaces (id, label, pg_schema, description, created_by, status, domain_profile)
       VALUES (?, ?, ?, ?, ?, 'active', ?)`,
      [
        input.id,
        input.label,
        pgSchema,
        input.description ?? null,
        input.created_by ?? null,
        input.id.split("-")[0] ?? null
      ]
    );

    return createToolSuccessResult("ghostcrab_workspace_create", {
      workspace_id: input.id,
      label: input.label,
      pg_schema: pgSchema,
      description: input.description ?? null,
      created_by: input.created_by ?? null,
      created: true,
      idempotent: false
    });
  }
};

registerTool(workspaceCreateTool);
