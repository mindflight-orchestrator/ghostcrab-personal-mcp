import { z } from "zod";

import { getSessionContext, setSessionContext } from "../../mcp/session-context.js";
import {
  createToolErrorResult,
  createToolSuccessResult,
  registerTool,
  type ToolHandler
} from "../registry.js";

const WorkspaceUseInput = z.object({
  workspace_id: z.string().min(1).max(64).optional(),
  schema_id: z.string().min(1).optional().nullable()
});

export const workspaceUseTool: ToolHandler = {
  definition: {
    name: "ghostcrab_workspace_use",
    description:
      "Set the active workspace and/or schema filter for this MCP server session. All subsequent tool calls will use these defaults unless they pass explicit workspace_id / schema_id overrides. Call ghostcrab_workspace_list first to see available workspaces. Note: session context is shared across all chats in the same MCP server process — use per-call overrides or separate MCP server entries for isolation between parallel chats.",
    inputSchema: {
      type: "object",
      properties: {
        workspace_id: {
          type: "string",
          description:
            "Workspace id to activate for this session. Omit to keep the current workspace_id unchanged."
        },
        schema_id: {
          type: ["string", "null"],
          description:
            "Schema filter to activate (e.g. 'ghostcrab:task'). Pass null to clear the schema filter. Omit to keep the current schema_id unchanged."
        }
      }
    }
  },
  async handler(args, context) {
    const input = WorkspaceUseInput.parse(args);

    if (input.workspace_id === undefined && input.schema_id === undefined) {
      return createToolErrorResult(
        "ghostcrab_workspace_use",
        "Provide at least one of workspace_id or schema_id.",
        "missing_arguments"
      );
    }

    const current = getSessionContext();

    // Verify workspace_id exists in the DB when switching
    if (input.workspace_id !== undefined && input.workspace_id !== current.workspace_id) {
      const [ws] = await context.database.query<{ id: string }>(
        context.database.kind === "sqlite"
          ? `SELECT id FROM workspaces WHERE id = ?`
          : `SELECT id FROM mindbrain.workspaces WHERE id = $1`,
        [input.workspace_id]
      );

      if (!ws) {
        return createToolErrorResult(
          "ghostcrab_workspace_use",
          `Workspace '${input.workspace_id}' does not exist. Call ghostcrab_workspace_list to see available workspaces, or ghostcrab_workspace_create to create a new one.`,
          "workspace_not_found",
          { workspace_id: input.workspace_id }
        );
      }
    }

    const next = setSessionContext(
      input.workspace_id ?? current.workspace_id,
      input.schema_id !== undefined ? input.schema_id : current.schema_id
    );

    return createToolSuccessResult("ghostcrab_workspace_use", {
      active_workspace_id: next.workspace_id,
      active_schema_id: next.schema_id,
      changed: {
        workspace_id: input.workspace_id !== undefined,
        schema_id: input.schema_id !== undefined
      },
      note: "Session context is shared across all chats in this MCP server process. Use per-call workspace_id / schema_id overrides for parallel-chat isolation."
    });
  }
};

registerTool(workspaceUseTool);
