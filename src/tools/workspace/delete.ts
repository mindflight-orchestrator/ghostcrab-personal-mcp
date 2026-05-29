import { z } from "zod";

import {
  archiveWorkspaceRow,
  deleteWorkspaceRow,
  resetWorkspaceData
} from "../../db/workspace-lifecycle.js";
import {
  createToolErrorResult,
  createToolSuccessResult,
  registerTool,
  type ToolHandler
} from "../registry.js";
import { WorkspaceIdSchema } from "../../types/workspace.js";

const DeleteWorkspaceInput = z.object({
  workspace_id: WorkspaceIdSchema,
  confirm: z.literal(true, {
    message:
      "Destructive delete requires confirm: true. This resets workspace data and removes or archives the workspace row."
  }),
  mode: z.enum(["hard", "soft"]).optional().default("hard")
});

export const workspaceDeleteTool: ToolHandler = {
  definition: {
    name: "ghostcrab_workspace_delete",
    description:
      "Write. Delete a workspace: wipe scoped data, then remove the workspace row (mode=hard) or mark it archived (mode=soft). Refuses the default workspace.",
    inputSchema: {
      type: "object",
      required: ["workspace_id", "confirm"],
      properties: {
        workspace_id: {
          type: "string",
          description: "Target workspace id to delete."
        },
        confirm: {
          type: "boolean",
          const: true,
          description: "Must be true to confirm destructive delete."
        },
        mode: {
          type: "string",
          enum: ["hard", "soft"],
          default: "hard",
          description:
            "hard removes the workspace row after reset; soft archives it."
        }
      }
    }
  },
  async handler(args, context) {
    const input = DeleteWorkspaceInput.parse(args);

    if (input.workspace_id === "default") {
      return createToolErrorResult(
        "ghostcrab_workspace_delete",
        "The default workspace cannot be deleted.",
        "protected_workspace"
      );
    }

    const [existing] = await context.database.query<{ id: string }>(
      `SELECT id FROM workspaces WHERE id = ?`,
      [input.workspace_id]
    );

    if (!existing) {
      return createToolErrorResult(
        "ghostcrab_workspace_delete",
        `Workspace '${input.workspace_id}' does not exist.`,
        "workspace_not_found"
      );
    }

    const resetReport = await resetWorkspaceData(
      context.database,
      input.workspace_id
    );

    if (input.mode === "soft") {
      await archiveWorkspaceRow(context.database, input.workspace_id);
      return createToolSuccessResult("ghostcrab_workspace_delete", {
        deleted: false,
        archived: true,
        mode: "soft",
        ...resetReport
      });
    }

    const workspace_rows_deleted = await deleteWorkspaceRow(
      context.database,
      input.workspace_id
    );

    return createToolSuccessResult("ghostcrab_workspace_delete", {
      deleted: workspace_rows_deleted > 0,
      archived: false,
      mode: "hard",
      workspace_rows_deleted,
      ...resetReport
    });
  }
};

registerTool(workspaceDeleteTool);
