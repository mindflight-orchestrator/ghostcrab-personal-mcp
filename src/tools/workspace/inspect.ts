import { z } from "zod";

import {
  createToolErrorResult,
  createToolSuccessResult,
  registerTool,
  type ToolHandler
} from "../registry.js";
import { WorkspaceIdSchema } from "../../types/workspace.js";

const WorkspaceInspectInput = z.object({
  workspace_id: WorkspaceIdSchema,
  table_name: z.string().min(1).optional(),
  include_columns: z.boolean().optional().default(true),
  include_relations: z.boolean().optional().default(true)
});

export const workspaceInspectTool: ToolHandler = {
  definition: {
    name: "ghostcrab_workspace_inspect",
    description:
      "Inspect stored workspace semantics (table_semantics, column_semantics, relation_semantics) for a workspace. Optional filter by table name.",
    inputSchema: {
      type: "object",
      required: ["workspace_id"],
      properties: {
        workspace_id: {
          type: "string",
          description: "Target workspace id."
        },
        table_name: {
          type: "string",
          description:
            "If set, restrict to rows where table_name matches (case-sensitive substring on table_semantics; prefix match on column/relation tables)."
        },
        include_columns: {
          type: "boolean",
          description: "Include column_semantics rows (default true)."
        },
        include_relations: {
          type: "boolean",
          description: "Include relation_semantics rows (default true)."
        }
      }
    }
  },
  async handler(args, context) {
    const input = WorkspaceInspectInput.parse(args);

    const [ws] = await context.database.query<{ id: string }>(
      `SELECT id FROM workspaces WHERE id = ?`,
      [input.workspace_id]
    );

    if (!ws) {
      return createToolErrorResult(
        "ghostcrab_workspace_inspect",
        `Workspace '${input.workspace_id}' does not exist.`,
        "workspace_not_found"
      );
    }

    const tablePattern = input.table_name ? `%${input.table_name}%` : null;
    const relationPattern = input.table_name ? `%${input.table_name}%` : null;

    const tables = await context.database.query<Record<string, unknown>>(
      `
        SELECT table_schema, table_name, business_role, generation_strategy,
               emit_facets, emit_graph_entity, emit_graph_relation, notes, updated_at
        FROM table_semantics
        WHERE workspace_id = ?
          AND (? IS NULL OR table_name LIKE ?)
        ORDER BY table_schema, table_name
      `,
      [input.workspace_id, tablePattern, tablePattern]
    );

    const columns = input.include_columns
      ? await context.database.query<Record<string, unknown>>(
          `
            SELECT table_schema, table_name, column_name, column_role, updated_at
            FROM column_semantics
            WHERE workspace_id = ?
              AND (? IS NULL OR table_name LIKE ?)
            ORDER BY table_schema, table_name, column_name
          `,
          [input.workspace_id, tablePattern, tablePattern]
        )
      : [];

    const relations = input.include_relations
      ? await context.database.query<Record<string, unknown>>(
          `
            SELECT from_schema, from_table, to_schema, to_table, fk_column, relation_kind, updated_at
            FROM relation_semantics
            WHERE workspace_id = ?
              AND (? IS NULL OR from_table LIKE ? OR to_table LIKE ?)
            ORDER BY from_schema, from_table, to_schema, to_table
          `,
          [
            input.workspace_id,
            relationPattern,
            relationPattern,
            relationPattern
          ]
        )
      : [];

    return createToolSuccessResult("ghostcrab_workspace_inspect", {
      workspace_id: input.workspace_id,
      table_semantics: tables,
      column_semantics: columns,
      relation_semantics: relations,
      counts: {
        tables: tables.length,
        columns: columns.length,
        relations: relations.length
      }
    });
  }
};

registerTool(workspaceInspectTool);
