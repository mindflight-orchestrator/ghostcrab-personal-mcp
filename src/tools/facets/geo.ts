import { z } from "zod";

import {
  createToolErrorResult,
  createToolSuccessResult,
  registerTool,
  type ToolHandler
} from "../registry.js";

const GeoQueryInput = z.object({
  workspace_id: z.string().min(1).optional(),
  schema_id: z.string().min(1).optional(),
  mode: z.enum(["distance", "bbox"]).default("distance"),
  lat: z.number().min(-90).max(90).optional(),
  lon: z.number().min(-180).max(180).optional(),
  radius_m: z.number().positive().optional(),
  bbox: z
    .object({
      min_lon: z.number().min(-180).max(180),
      min_lat: z.number().min(-90).max(90),
      max_lon: z.number().min(-180).max(180),
      max_lat: z.number().min(-90).max(90)
    })
    .optional(),
  limit: z.coerce.number().int().min(1).max(200).default(20)
});

/**
 * Geo feature status: OPTIONAL (PostGIS required).
 *
 * geo_entities table is created only when PostGIS is installed (migration 010).
 * In deployments without PostGIS, this tool returns a structured error with
 * clear setup instructions rather than crashing.
 *
 * To enable: install PostGIS, re-run migrations (010 will create geo_entities),
 * then use ghostcrab_query_geo normally.
 */
export const GEO_FEATURE_STATUS = "optional" as const;
export const GEO_REQUIRES = "PostGIS extension + migration 010_specialized_layer2.sql" as const;

export const geoQueryTool: ToolHandler = {
  definition: {
    name: "ghostcrab_query_geo",
    description:
      "Query geo_entities by distance from a point or by bounding box. Requires PostGIS (migration 010).",
    inputSchema: {
      type: "object",
      properties: {
        workspace_id: {
          type: "string",
          description: "Restrict results to this workspace."
        },
        schema_id: {
          type: "string",
          description: "Restrict results to this schema_id."
        },
        mode: {
          type: "string",
          enum: ["distance", "bbox"],
          default: "distance",
          description:
            "Query mode: 'distance' requires lat/lon/radius_m; 'bbox' requires bbox."
        },
        lat: {
          type: "number",
          minimum: -90,
          maximum: 90,
          description: "Latitude of the reference point (distance mode)."
        },
        lon: {
          type: "number",
          minimum: -180,
          maximum: 180,
          description: "Longitude of the reference point (distance mode)."
        },
        radius_m: {
          type: "number",
          exclusiveMinimum: 0,
          description: "Search radius in metres (distance mode)."
        },
        bbox: {
          type: "object",
          description: "Bounding box (bbox mode).",
          required: ["min_lon", "min_lat", "max_lon", "max_lat"],
          properties: {
            min_lon: { type: "number" },
            min_lat: { type: "number" },
            max_lon: { type: "number" },
            max_lat: { type: "number" }
          }
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 200,
          default: 20
        }
      }
    }
  },
  async handler(args, context) {
    const input = GeoQueryInput.parse(args);

    const tableCheck = await context.database.query<{ exists: boolean }>(
      `SELECT to_regclass('public.geo_entities') IS NOT NULL AS exists`
    );
    if (!tableCheck[0]?.exists) {
      return createToolErrorResult(
        "ghostcrab_query_geo",
        "Geo feature is not available in this deployment. geo_entities table does not exist. " +
        "This is an optional feature that requires PostGIS. " +
        "To enable: (1) install PostGIS on your PostgreSQL instance, " +
        "(2) re-run migrations (migration 010 will create geo_entities automatically). " +
        "See docs/v3/RUNBOOK_V3.md for setup instructions.",
        "geo_feature_not_available",
        {
          requires: GEO_REQUIRES,
          feature_status: GEO_FEATURE_STATUS,
          setup_doc: "docs/v3/RUNBOOK_V3.md"
        }
      );
    }

    const whereClauses: string[] = [];
    const params: unknown[] = [];

    if (input.workspace_id) {
      whereClauses.push(`workspace_id = $${params.length + 1}`);
      params.push(input.workspace_id);
    }
    if (input.schema_id) {
      whereClauses.push(`schema_id = $${params.length + 1}`);
      params.push(input.schema_id);
    }

    type GeoRow = {
      source_ref: string;
      workspace_id: string;
      schema_id: string | null;
      distance_m: number | null;
      geom_geojson: string | null;
    };

    let rows: GeoRow[];

    if (input.mode === "distance") {
      if (input.lat === undefined || input.lon === undefined || input.radius_m === undefined) {
        return createToolErrorResult(
          "ghostcrab_query_geo",
          "Distance mode requires lat, lon, and radius_m.",
          "missing_parameters"
        );
      }

      const refPointParam = params.length + 1;
      params.push(`SRID=4326;POINT(${input.lon} ${input.lat})`);
      const radiusParam = params.length + 1;
      params.push(input.radius_m);
      const limitParam = params.length + 1;
      params.push(input.limit);

      const distFilter = `ST_DWithin(
        geom::geography,
        ST_GeomFromEWKT($${refPointParam})::geography,
        $${radiusParam}
      )`;
      whereClauses.push(distFilter);

      const whereClause =
        whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

      rows = await context.database.query<GeoRow>(
        `
          SELECT
            source_ref,
            workspace_id,
            schema_id,
            ST_Distance(geom::geography, ST_GeomFromEWKT($${refPointParam})::geography)::float AS distance_m,
            ST_AsGeoJSON(geom) AS geom_geojson
          FROM public.geo_entities
          ${whereClause}
          ORDER BY distance_m ASC
          LIMIT $${limitParam}
        `,
        params
      );
    } else {
      if (!input.bbox) {
        return createToolErrorResult(
          "ghostcrab_query_geo",
          "Bbox mode requires the bbox parameter.",
          "missing_parameters"
        );
      }

      const { min_lon, min_lat, max_lon, max_lat } = input.bbox;
      const bboxParam = params.length + 1;
      params.push(
        `SRID=4326;POLYGON((${min_lon} ${min_lat}, ${max_lon} ${min_lat}, ${max_lon} ${max_lat}, ${min_lon} ${max_lat}, ${min_lon} ${min_lat}))`
      );
      const limitParam = params.length + 1;
      params.push(input.limit);

      whereClauses.push(`ST_Intersects(geom, ST_GeomFromEWKT($${bboxParam}))`);
      const whereClause =
        whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

      rows = await context.database.query<GeoRow>(
        `
          SELECT
            source_ref,
            workspace_id,
            schema_id,
            NULL::float AS distance_m,
            ST_AsGeoJSON(geom) AS geom_geojson
          FROM public.geo_entities
          ${whereClause}
          ORDER BY source_ref ASC
          LIMIT $${limitParam}
        `,
        params
      );
    }

    const results = rows.map((row) => ({
      source_ref: row.source_ref,
      workspace_id: row.workspace_id,
      schema_id: row.schema_id,
      distance_m: row.distance_m,
      geometry: row.geom_geojson ? (JSON.parse(row.geom_geojson) as unknown) : null
    }));

    return createToolSuccessResult("ghostcrab_query_geo", {
      mode: input.mode,
      workspace_id: input.workspace_id ?? null,
      schema_id: input.schema_id ?? null,
      returned: results.length,
      results
    });
  }
};

registerTool(geoQueryTool);
