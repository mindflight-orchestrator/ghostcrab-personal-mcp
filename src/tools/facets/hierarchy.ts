import { z } from "zod";

import {
  createToolErrorResult,
  createToolSuccessResult,
  registerTool,
  type ToolHandler
} from "../registry.js";

export const HierarchyInput = z.object({
  top_n: z.coerce.number().int().min(1).max(50).default(5),
  facet_names: z.array(z.string()).optional(),
  schema_id: z.string().min(1).optional()
});

export const hierarchyTool: ToolHandler = {
  definition: {
    name: "ghostcrab_facet_tree",
    description:
      "Return a hierarchical facet tree for the facets table using the pg_facets native extension. Requires pg_facets to be loaded.",
    inputSchema: {
      type: "object",
      properties: {
        top_n: {
          type: "integer",
          minimum: 1,
          maximum: 50,
          default: 5,
          description: "Number of top values to return per facet level."
        },
        facet_names: {
          type: "array",
          items: { type: "string" },
          description:
            "Facet column names to include in the tree. Omit to include all registered facets."
        },
        schema_id: {
          type: "string",
          minLength: 1,
          description: "Restrict the tree to documents with this schema_id."
        }
      }
    }
  },
  async handler(args, context) {
    const input = HierarchyInput.parse(args);

    if (!context.extensions.pgFacets) {
      return createToolErrorResult(
        "ghostcrab_facet_tree",
        "pg_facets extension is not loaded; hierarchical facets require native pg_facets.",
        "extension_not_loaded"
      );
    }

    // Resolve table OID.
    const [tableOidRow] = await context.database.query<{ oid: string }>(
      `SELECT 'public.facets'::regclass::oid AS oid`
    );
    const tableOid = tableOidRow?.oid;
    if (!tableOid) {
      return createToolErrorResult(
        "ghostcrab_facet_tree",
        "Could not resolve OID for public.facets.",
        "internal_error"
      );
    }

    // Build optional schema_id filter bitmap.
    // facets.facet_filter composite: (facet_name text, facet_value text) -- scalar text, not text[]
    let filterBitmap: string | null = null;
    let bitmapBuilt = false;
    if (input.schema_id) {
      const [bitmapRow] = await context.database.query<{ bitmap: string }>(
        `SELECT build_filter_bitmap_native(
          $1::oid,
          ARRAY[ROW('schema_id', $2)::facets.facet_filter]
        ) AS bitmap`,
        [tableOid, input.schema_id]
      );
      bitmapBuilt = true;
      filterBitmap = bitmapRow?.bitmap ?? null;
    }

    // If schema_id was requested but produced no bitmap (no matching docs),
    // return an empty tree rather than falling through with null (which would
    // return the unfiltered tree and misrepresent the filter semantics).
    if (bitmapBuilt && filterBitmap === null) {
      return createToolSuccessResult("ghostcrab_facet_tree", {
        top_n: input.top_n,
        schema_id: input.schema_id ?? null,
        facet_names: input.facet_names ?? null,
        tree: null,
        backend: "native" as const
      });
    }

    // Resolve facet_ids from facet_names when provided.
    let facetIds: number[] | null = null;
    if (input.facet_names && input.facet_names.length > 0) {
      const rows = await context.database.query<{ facet_id: number }>(
        `SELECT facet_id
         FROM facets.list_table_facets($1::oid)
         WHERE facet_name = ANY($2::text[])`,
        [tableOid, input.facet_names]
      );
      facetIds = rows.map((r) => r.facet_id);
    }

    // Call hierarchical_facets; returns JSONB tree.
    const [treeRow] = await context.database.query<{ tree: unknown }>(
      `SELECT facets.hierarchical_facets($1::oid, $2::int, $3, $4) AS tree`,
      [tableOid, input.top_n, facetIds, filterBitmap]
    );

    return createToolSuccessResult("ghostcrab_facet_tree", {
      top_n: input.top_n,
      schema_id: input.schema_id ?? null,
      facet_names: input.facet_names ?? null,
      tree: treeRow?.tree ?? null,
      backend: "native" as const
    });
  }
};

registerTool(hierarchyTool);
