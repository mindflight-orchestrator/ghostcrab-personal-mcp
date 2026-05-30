import { z } from "zod";

import {
  createToolSuccessResult,
  registerTool,
  type ToolHandler
} from "../registry.js";
import { WorkspaceStatusSchema } from "../../types/workspace.js";

const ListWorkspacesInput = z.object({
  status: WorkspaceStatusSchema.optional()
});

export const workspaceListTool: ToolHandler = {
  definition: {
    name: "ghostcrab_workspace_list",
    description:
      "List all MindBrain workspace_ids in this database with live statistics. Call before switching workspace context; echo the chosen workspace_id to the user when changing context.",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["active", "archived"],
          description:
            "Optional filter by workspace status. Omit to return all."
        }
      }
    }
  },
  async handler(args, context) {
    const input = ListWorkspacesInput.parse(args);

    const whereClauses: string[] = [];
    const params: unknown[] = [];

    if (input.status) {
      whereClauses.push(`w.status = ?`);
      params.push(input.status);
    }

    const whereClause =
      whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const rows = await context.database.query<{
      id: string;
      label: string;
      pg_schema: string;
      description: string | null;
      created_by: string | null;
      status: string;
      created_at: string;
      facets_count: number;
      entities_count: number;
    }>(
      `
        SELECT
          w.id,
          w.label,
          w.pg_schema,
          w.description,
          w.created_by,
          w.status,
          w.created_at,
          COALESCE(
            (SELECT COUNT(*) FROM agent_facts f WHERE f.workspace_id = w.id),
            0
          ) AS facets_count,
          COALESCE(
            (SELECT COUNT(*) FROM graph_entity ge WHERE ge.workspace_id = w.id),
            0
          ) AS entities_count
        FROM workspaces w
        ${whereClause}
        ORDER BY w.created_at ASC
      `,
      params
    );

    return createToolSuccessResult("ghostcrab_workspace_list", {
      workspaces: rows.map((row) => ({
        ...row,
        facets_count: Number(row.facets_count),
        entities_count: Number(row.entities_count)
      })),
      total: rows.length,
      filter_status: input.status ?? "all"
    });
  }
};

registerTool(workspaceListTool);
