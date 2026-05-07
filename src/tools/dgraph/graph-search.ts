import { z } from "zod";

import { resolveGhostcrabConfig } from "../../config/env.js";
import type { Queryable } from "../../db/client.js";
import { runStandaloneGhostcrabGraphSearch } from "../../db/standalone-mindbrain.js";
import {
  createToolSuccessResult,
  registerTool,
  type ToolHandler
} from "../registry.js";

export const GraphSearchInput = z.object({
  query: z.string().trim().max(4_096).default(""),
  entity_types: z.array(z.string().trim().min(1)).max(50).default([]),
  metadata_filters: z.record(z.string(), z.unknown()).default({}),
  collection_id: z.preprocess(
    (value) => {
      if (value === null) return undefined;
      if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        if (normalized === "" || normalized === "null" || normalized === "nil") {
          return undefined;
        }
      }
      return value;
    },
    z.string().trim().min(1).optional()
  ),
  include_relations: z.boolean().default(false),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  workspace_id: z.string().trim().min(1).optional()
});

type GraphEntityResult = {
  entity_id: number;
  entity_type: string;
  name: string;
  confidence: number;
  metadata: Record<string, unknown>;
  score: number;
};

type GraphRelationResult = {
  relation_id: number;
  relation_type: string;
  source_id: number;
  target_id: number;
  metadata: Record<string, unknown>;
};

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  if (typeof value !== "string" || value.length === 0) {
    return {};
  }

  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function mapGraphEntity(row: {
  confidence: number;
  entity_id: number;
  entity_type: string;
  metadata_json: unknown;
  name: string;
  score: number;
}): GraphEntityResult {
  return {
    entity_id: Number(row.entity_id),
    entity_type: row.entity_type,
    name: row.name,
    confidence: Number(row.confidence ?? 0),
    metadata: parseJsonObject(row.metadata_json),
    score: Number(row.score ?? 0)
  };
}

export const graphSearchTool: ToolHandler = {
  definition: {
    name: "ghostcrab_graph_search",
    description:
      "Read. Search graph_entity runtime data by text, entity type, collection_id, and metadata filters. Use this for imported graph entities such as ProjectionResult, SEOIssue, or PageAuditSnapshot.",
    inputSchema: {
      type: "object",
      properties: {
        workspace_id: {
          type: "string",
          description: "Target workspace id. Overrides session context for this call only."
        },
        collection_id: {
          type: ["string", "null"],
          description:
            "Optional collection scope. Omit or pass null to search all collections in the workspace."
        },
        query: {
          type: "string",
          default: "",
          description:
            "Text query matched against entity name, entity type, and metadata_json. Empty string means filter-only search."
        },
        entity_types: {
          type: "array",
          items: { type: "string" },
          default: [],
          description:
            "Optional graph_entity.entity_type filters. Empty array searches all entity types."
        },
        metadata_filters: {
          type: "object",
          default: {},
          additionalProperties: true,
          description:
            "Exact metadata_json filters. Example: {\"projection_id\":\"proj_keyword_opportunities\"}."
        },
        include_relations: {
          type: "boolean",
          default: false,
          description:
            "Include graph_relation rows touching returned entities."
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          default: 20
        }
      }
    }
  },
  async handler(args, context) {
    const input = GraphSearchInput.parse(args);
    const workspaceId = input.workspace_id ?? context.session.workspace_id;
    const notes: string[] = [];
    let backend: "native" | "sql" = "native";
    let results: GraphEntityResult[];

    try {
      const response = await runStandaloneGhostcrabGraphSearch({
        mindbrainUrl: resolveGhostcrabConfig().mindbrainUrl,
        workspaceId,
        collectionId: input.collection_id,
        query: input.query,
        entityTypes: input.entity_types,
        metadataFilters: input.metadata_filters,
        limit: input.limit
      });
      results = response.rows.map(mapGraphEntity);
    } catch (error) {
      backend = "sql";
      notes.push(
        `MindBrain graph-search endpoint unavailable: ${error instanceof Error ? error.message : "Unknown backend error"} Falling back to local graph SQL.`
      );
      results = await loadGraphSearchSql(context.database, {
        workspaceId,
        collectionId: input.collection_id,
        query: input.query,
        entityTypes: input.entity_types,
        metadataFilters: input.metadata_filters,
        limit: input.limit
      });
    }

    const relations = input.include_relations
      ? await loadRelationsForEntitiesSql(
          context.database,
          results.map((row) => row.entity_id)
        )
      : [];

    return createToolSuccessResult("ghostcrab_graph_search", {
      workspace_id: workspaceId,
      collection_id: input.collection_id ?? null,
      query: input.query,
      entity_types: input.entity_types,
      metadata_filters: input.metadata_filters,
      include_relations: input.include_relations,
      returned: results.length,
      backend,
      searched_layers: ["graph_entity"],
      excluded_layers: ["facets", "projections", "memory_projections"],
      notes,
      results,
      relations
    });
  }
};

async function loadGraphSearchSql(
  database: Queryable,
  params: {
    workspaceId: string;
    collectionId: string | undefined;
    query: string;
    entityTypes: string[];
    metadataFilters: Record<string, unknown>;
    limit: number;
  }
): Promise<GraphEntityResult[]> {
  const whereClauses = [
    "workspace_id = ?",
    "deprecated_at IS NULL",
    "(? IS NULL OR json_extract(metadata_json, '$.collection_id') = ?)"
  ];
  const sqlParams: unknown[] = [
    params.workspaceId,
    params.collectionId ?? null,
    params.collectionId ?? null
  ];

  if (params.entityTypes.length > 0) {
    whereClauses.push(
      `entity_type IN (${params.entityTypes.map(() => "?").join(", ")})`
    );
    sqlParams.push(...params.entityTypes);
  }

  for (const [key, value] of Object.entries(params.metadataFilters)) {
    whereClauses.push(`json_extract(metadata_json, '$.${key}') = ?`);
    sqlParams.push(value);
  }

  const terms = params.query.split(/\s+/).filter(Boolean);
  let scoreSql = "confidence";
  if (terms.length > 0) {
    const termClauses = terms.map(
      () =>
        "(instr(lower(name), lower(?)) > 0 OR instr(lower(entity_type), lower(?)) > 0 OR instr(lower(metadata_json), lower(?)) > 0)"
    );
    whereClauses.push(`(${termClauses.join(" OR ")})`);
    sqlParams.push(...terms.flatMap((term) => [term, term, term]));
    scoreSql = terms
      .map(
        () =>
          "(CASE WHEN instr(lower(name), lower(?)) > 0 THEN 4 ELSE 0 END + CASE WHEN instr(lower(entity_type), lower(?)) > 0 THEN 3 ELSE 0 END + CASE WHEN instr(lower(metadata_json), lower(?)) > 0 THEN 1 ELSE 0 END)"
      )
      .join(" + ");
  }

  const scoreParams = terms.flatMap((term) => [term, term, term]);
  const rows = await database.query<{
    confidence: number;
    entity_id: number;
    entity_type: string;
    metadata_json: unknown;
    name: string;
    score: number;
  }>(
    `
      SELECT entity_id, entity_type, name, confidence, metadata_json, ${scoreSql} AS score
      FROM graph_entity
      WHERE ${whereClauses.join(" AND ")}
      ORDER BY score DESC, confidence DESC, entity_id ASC
      LIMIT ?
    `,
    [...scoreParams, ...sqlParams, params.limit]
  );

  return rows.map(mapGraphEntity);
}

async function loadRelationsForEntitiesSql(
  database: Queryable,
  entityIds: number[]
): Promise<GraphRelationResult[]> {
  if (entityIds.length === 0) {
    return [];
  }

  const rows = await database.query<{
    metadata_json: unknown;
    relation_id: number;
    relation_type: string;
    source_id: number;
    target_id: number;
  }>(
    `
      SELECT relation_id, relation_type, source_id, target_id, metadata_json
      FROM graph_relation
      WHERE deprecated_at IS NULL
        AND (
          source_id IN (${entityIds.map(() => "?").join(", ")})
          OR target_id IN (${entityIds.map(() => "?").join(", ")})
        )
      ORDER BY relation_id ASC
    `,
    [...entityIds, ...entityIds]
  );

  return rows.map((row) => ({
    relation_id: Number(row.relation_id),
    relation_type: row.relation_type,
    source_id: Number(row.source_id),
    target_id: Number(row.target_id),
    metadata: parseJsonObject(row.metadata_json)
  }));
}

registerTool(graphSearchTool);
