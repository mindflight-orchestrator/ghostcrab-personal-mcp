import { z } from "zod";

import { resetWorkspaceData } from "../../db/workspace-lifecycle.js";
import {
  createToolErrorResult,
  createToolSuccessResult,
  registerTool,
  type ToolHandler
} from "../registry.js";
import { WorkspaceIdSchema } from "../../types/workspace.js";

const ResetWorkspaceInput = z.object({
  workspace_id: WorkspaceIdSchema,
  confirm: z.literal(true, {
    message:
      "Destructive reset requires confirm: true. This wipes all workspace-scoped data but keeps the workspace row."
  })
});

export const workspaceResetTool: ToolHandler = {
  definition: {
    name: "ghostcrab_workspace_reset",
    description:
      "Write. Wipe all data scoped to a workspace (facets, graph, raw imports, semantics, pending migrations, projections) without deleting the workspace metadata row. Idempotent. Refuses the default workspace.",
    inputSchema: {
      type: "object",
      required: ["workspace_id", "confirm"],
      properties: {
        workspace_id: {
          type: "string",
          description: "Target workspace id to reset."
        },
        confirm: {
          type: "boolean",
          const: true,
          description: "Must be true to confirm destructive reset."
        }
      }
    }
  },
  async handler(args, context) {
    const input = ResetWorkspaceInput.parse(args);

    if (input.workspace_id === "default") {
      return createToolErrorResult(
        "ghostcrab_workspace_reset",
        "The default workspace cannot be reset.",
        "protected_workspace"
      );
    }

    const [existing] = await context.database.query<{ id: string }>(
      `SELECT id FROM workspaces WHERE id = ?`,
      [input.workspace_id]
    );

    if (!existing) {
      return createToolErrorResult(
        "ghostcrab_workspace_reset",
        `Workspace '${input.workspace_id}' does not exist.`,
        "workspace_not_found"
      );
    }

    const report = await resetWorkspaceData(
      context.database,
      input.workspace_id
    );

    return createToolSuccessResult("ghostcrab_workspace_reset", {
      reset: true,
      ...report
    });
  }
};

registerTool(workspaceResetTool);
