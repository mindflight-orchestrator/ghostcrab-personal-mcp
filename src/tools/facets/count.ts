import { z } from "zod";

import { callNativeOrFallback } from "../../db/dispatch.js";
import {
  areNativeFacetFiltersSupported,
  buildNativeFacetBitmapSql,
  isRegisteredNativeFacetName
} from "../../db/native-facets.js";
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
          description: "Target workspace id. Overrides session context for this call only."
        }
      }
    }
  },
  async handler(args, context) {
    const input = CountInput.parse(args);
    const effectiveWorkspaceId = input.workspace_id ?? context.session.workspace_id;
    const effectiveSchemaId = input.schema_id ?? context.session.schema_id ?? undefined;

    if (context.database.kind === "sqlite") {
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

            const orClauses = rawValue.map(() => `json_extract(facets_json, '$.${key}') = ?`);
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
          rows.map((row) => [row.val === null ? "null" : String(row.val), Number(row.count)])
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

    // Determine if all requested dimensions have registered pg_facets columns.
    // Native path is only available when registration is in place (migration 008 + CLI register-pg-facets).
    const allDimensionsRegistered = input.group_by.every((dimension) =>
      isRegisteredNativeFacetName(dimension)
    );

    // Native count can use pg_facets only when all dimensions are registered and
    // the filters are expressible through registered native facets.
    const canUseNative =
      context.nativeExtensionsMode !== "sql-only" &&
      context.extensions.pgFacets &&
      allDimensionsRegistered &&
      areNativeFacetFiltersSupported(input.filters, effectiveSchemaId);

    const sqlFallback = async (): Promise<Record<string, Record<string, number>>> => {
      const counts: Record<string, Record<string, number>> = {};

      for (const dimension of input.group_by) {
        const params: unknown[] = [dimension, effectiveWorkspaceId];
        const whereClauses = [
          "facets ? $1",
          "(valid_until IS NULL OR valid_until > CURRENT_DATE)",
          "workspace_id = $2"
        ];
        let paramIndex = 3;

        if (effectiveSchemaId) {
          whereClauses.push(`schema_id = $${paramIndex}`);
          params.push(effectiveSchemaId);
          paramIndex += 1;
        }

        for (const [key, value] of Object.entries(input.filters)) {
          if (Array.isArray(value)) {
            if (value.length === 0) {
              whereClauses.push("FALSE");
              continue;
            }

            const orClauses = value.map((candidate) => {
              params.push(JSON.stringify({ [key]: candidate }));
              const clause = `facets @> $${paramIndex}::jsonb`;
              paramIndex += 1;
              return clause;
            });

            whereClauses.push(`(${orClauses.join(" OR ")})`);
            continue;
          }

          params.push(JSON.stringify({ [key]: value }));
          whereClauses.push(`facets @> $${paramIndex}::jsonb`);
          paramIndex += 1;
        }

        const rows = await context.database.query<{
          count: number;
          val: string | null;
        }>(
          `
            SELECT
              jsonb_extract_path_text(facets, $1) AS val,
              COUNT(*)::integer AS count
            FROM facets
            WHERE ${whereClauses.join(" AND ")}
            GROUP BY val
            ORDER BY count DESC, val ASC NULLS LAST
          `,
          params
        );

        counts[dimension] = Object.fromEntries(
          rows.map((row) => [row.val ?? "null", Number(row.count)])
        );
      }

      return counts;
    };

    const nativeCount = async (): Promise<Record<string, Record<string, number>>> => {
      const counts: Record<string, Record<string, number>> = {};
      const bitmapSql = buildNativeFacetBitmapSql({
        filters: input.filters,
        schemaId: effectiveSchemaId
      });

      for (const dimension of input.group_by) {
        const queryParams = [...(bitmapSql?.params ?? []), dimension];
        const dimensionParam = queryParams.length;
        const rows = await context.database.query<{
          facet_value: string | null;
          cardinality: string;
        }>(
          bitmapSql
            ? `
              WITH ${bitmapSql.ctesSql},
              combined_bitmap AS (
                SELECT ${bitmapSql.bitmapExpr} AS bitmap
                FROM ${Array.from(
                  { length: bitmapSql.params.length / 2 },
                  (_, index) => `bitmap_${index + 1}`
                ).join(", ")}
              )
              SELECT facet_value, cardinality
              FROM facets.get_facet_counts(
                'public.facets'::regclass::oid,
                $${dimensionParam}::text,
                (SELECT bitmap FROM combined_bitmap),
                100
              )
            `
            : `
              SELECT facet_value, cardinality
              FROM facets.get_facet_counts(
                'public.facets'::regclass::oid,
                $1::text,
                NULL,
                100
              )
            `,
          bitmapSql ? queryParams : [dimension]
        );

        counts[dimension] = Object.fromEntries(
          rows.map((row) => [row.facet_value ?? "null", Number(row.cardinality)])
        );
      }

      return counts;
    };

    const { value: counts, backend } = await callNativeOrFallback({
      useNative: canUseNative,
      native: nativeCount,
      fallback: sqlFallback
    });

    return createToolSuccessResult("ghostcrab_count", {
      counts,
      workspace_id: effectiveWorkspaceId,
      schema_id: effectiveSchemaId ?? "all",
      filters: input.filters,
      backend
    });
  }
};

registerTool(countTool);
