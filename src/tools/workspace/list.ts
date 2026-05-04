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
      "List all workspaces with live statistics (facets count, entities count). Filter by status to see only active or archived workspaces.",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["active", "archived"],
          description: "Optional filter by workspace status. Omit to return all."
        }
      }
    }
  },
  async handler(args, context) {
    const input = ListWorkspacesInput.parse(args);

    if (context.database.kind === "sqlite") {
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
              (SELECT COUNT(*) FROM facets f WHERE f.workspace_id = w.id),
              0
            ) AS facets_count,
            0 AS entities_count
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

    const whereClauses: string[] = [];
    const params: unknown[] = [];

    if (input.status) {
      whereClauses.push(`w.status = $${params.length + 1}`);
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
      facets_count: string;
      entities_count: string;
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
            (SELECT COUNT(*)::bigint FROM facets f WHERE f.workspace_id = w.id),
            0
          )::text AS facets_count,
          COALESCE(
            (SELECT COUNT(*)::bigint FROM graph.entity e WHERE e.workspace_id = w.id),
            0
          )::text AS entities_count
        FROM mindbrain.workspaces w
        ${whereClause}
        ORDER BY w.created_at ASC
      `,
      params
    );

    const workspaces = rows.map((row) => ({
      id: row.id,
      label: row.label,
      pg_schema: row.pg_schema,
      description: row.description,
      created_by: row.created_by,
      status: row.status,
      created_at: row.created_at,
      facets_count: Number(row.facets_count),
      entities_count: Number(row.entities_count)
    }));

    return createToolSuccessResult("ghostcrab_workspace_list", {
      workspaces,
      total: workspaces.length,
      filter_status: input.status ?? "all"
    });
  }
};

registerTool(workspaceListTool);
