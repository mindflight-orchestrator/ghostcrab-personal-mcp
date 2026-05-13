import { z } from "zod";

import {
  createToolSuccessResult,
  registerTool,
  type ToolHandler
} from "../registry.js";

export const CountInput = z.object({
  schema_id: z.string().min(1).optional(),
  group_by: z.array(z.string().min(1)).min(1).max(5),
  filters: z.record(z.string(), z.unknown()).default({}),
  workspace_id: z.string().min(1).optional()
});

export const countTool: ToolHandler = {
  definition: {
    name: "ghostcrab_count",
    description:
      "Count items grouped by facet dimensions without loading the full content.",
    inputSchema: {
      type: "object",
      required: ["group_by"],
      properties: {
        schema_id: {
          type: "string"
        },
        group_by: {
          type: "array",
          minItems: 1,
          maxItems: 5,
          items: {
            type: "string"
          }
        },
        filters: {
          type: "object",
          description: "Optional facet filters applied before counting.",
          additionalProperties: true
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
    const input = CountInput.parse(args);
    const effectiveWorkspaceId =
      input.workspace_id ?? context.session.workspace_id;
    const effectiveSchemaId =
      input.schema_id ?? context.session.schema_id ?? undefined;

    const counts: Record<string, Record<string, number>> = {};

    for (const dimension of input.group_by) {
      const whereClauses: string[] = ["workspace_id = ?"];
      const params: unknown[] = [effectiveWorkspaceId];

      if (effectiveSchemaId) {
        whereClauses.push("schema_id = ?");
        params.push(effectiveSchemaId);
      }

      whereClauses.push(
        "(valid_until_unix IS NULL OR valid_until_unix > strftime('%s','now'))"
      );
      whereClauses.push(`json_type(facets_json, '$.${dimension}') IS NOT NULL`);

      for (const [key, rawValue] of Object.entries(input.filters)) {
        if (Array.isArray(rawValue)) {
          if (rawValue.length === 0) {
            whereClauses.push("0 = 1");
            continue;
          }

          const orClauses = rawValue.map(
            () => `json_extract(facets_json, '$.${key}') = ?`
          );
          whereClauses.push(`(${orClauses.join(" OR ")})`);
          params.push(...rawValue);
          continue;
        }

        whereClauses.push(`json_extract(facets_json, '$.${key}') = ?`);
        params.push(rawValue);
      }

      const rows = await context.database.query<{
        count: number;
        val: string | number | null;
      }>(
        `
          SELECT
            json_extract(facets_json, '$.${dimension}') AS val,
            COUNT(*) AS count
          FROM facets
          WHERE ${whereClauses.join(" AND ")}
          GROUP BY val
          ORDER BY count DESC, val ASC
        `,
        params
      );

      counts[dimension] = Object.fromEntries(
        rows.map((row) => [
          row.val === null ? "null" : String(row.val),
          Number(row.count)
        ])
      );
    }

    return createToolSuccessResult("ghostcrab_count", {
      counts,
      workspace_id: effectiveWorkspaceId,
      schema_id: effectiveSchemaId ?? "all",
      filters: input.filters,
      backend: "sql"
    });
  }
};

registerTool(countTool);
