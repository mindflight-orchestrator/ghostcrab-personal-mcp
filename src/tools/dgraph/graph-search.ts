import { z } from "zod";

import { resolveGhostcrabConfig } from "../../config/env.js";
import type { Queryable } from "../../db/client.js";
import { runStandaloneGhostcrabGraphSearch } from "../../db/standalone-mindbrain.js";
import {
  createToolErrorFromException,
  createToolErrorResult,
  createToolSuccessResult,
  registerTool,
  type ToolHandler
} from "../registry.js";

export const GraphSearchInput = z.object({
  query: z.string().trim().max(4_096).default(""),
  entity_types: z.array(z.string().trim().min(1)).max(50).default([]),
  metadata_filters: z.record(z.string(), z.unknown()).default({}),
  collection_id: z.preprocess((value) => {
    if (value === null) return undefined;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (normalized === "" || normalized === "null" || normalized === "nil") {
        return undefined;
      }
    }
    return value;
  }, z.string().trim().min(1).optional()),
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

type RelationPropertyResult = {
  property_key: string;
  value_type: string;
  value_text: string | null;
  value_number: number | null;
  value_integer: number | null;
  ref_doc_id: number | null;
  currency: string | null;
};

type GraphRelationResult = {
  relation_id: string;
  relation_type: string;
  source_id: number;
  target_id: number;
  metadata: Record<string, unknown>;
  relation_properties: RelationPropertyResult[];
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
    return typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
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
          description:
            "Target workspace id. Overrides session context for this call only."
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
            'Exact metadata_json filters. Example: {"projection_id":"proj_keyword_opportunities"}.'
        },
        include_relations: {
          type: "boolean",
          default: false,
          description: "Include graph_relation rows touching returned entities."
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

    let response;
    try {
      response = await runStandaloneGhostcrabGraphSearch({
        mindbrainUrl: resolveGhostcrabConfig().mindbrainUrl,
        workspaceId,
        collectionId: input.collection_id,
        query: input.query,
        entityTypes: input.entity_types,
        metadataFilters: input.metadata_filters,
        limit: input.limit
      });
    } catch (error) {
      return createToolErrorFromException(
        "ghostcrab_graph_search",
        error,
        "backend_unavailable",
        "MindBrain graph-search backend unavailable"
      );
    }

    const results = response.rows.map(mapGraphEntity);

    const relations = input.include_relations
      ? await loadRelationsForEntitiesSql(
          context.database,
          results.map((row) => row.entity_id),
          Math.min(500, input.limit * 10)
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
      backend: "native",
      searched_layers: ["graph_entity"],
      excluded_layers: ["facets", "projections", "memory_projections"],
      notes: [],
      results,
      relations
    });
  }
};

async function loadRelationsForEntitiesSql(
  database: Queryable,
  entityIds: number[],
  relationLimit: number = 500
): Promise<GraphRelationResult[]> {
  if (entityIds.length === 0) {
    return [];
  }

  const rows = await database.query<{
    metadata_json: unknown;
    relation_id: string;
    relation_type: string;
    source_id: number;
    target_id: number;
  }>(
    `
      SELECT CAST(relation_id AS TEXT) AS relation_id,
             relation_type, source_id, target_id, metadata_json
      FROM graph_relation
      WHERE deprecated_at IS NULL
        AND (
          source_id IN (${entityIds.map(() => "?").join(", ")})
          OR target_id IN (${entityIds.map(() => "?").join(", ")})
        )
      ORDER BY relation_id ASC
      LIMIT ?
    `,
    [...entityIds, ...entityIds, relationLimit]
  );

  if (rows.length === 0) {
    return [];
  }

  const relationIds = rows.map((r) => r.relation_id);
  const propRows = await database.query<{
    relation_id: string;
    property_key: string;
    value_type: string;
    value_text: string | null;
    value_number: number | null;
    value_integer: number | null;
    ref_doc_id: number | null;
    currency: string | null;
  }>(
    `
      SELECT CAST(relation_id AS TEXT) AS relation_id,
             property_key, value_type,
             value_text, value_number, value_integer, ref_doc_id, currency
      FROM graph_relation_property
      WHERE relation_id IN (${relationIds.map(() => "?").join(", ")})
      ORDER BY relation_id ASC, property_key ASC
    `,
    relationIds
  );

  const propsByRelation = new Map<string, RelationPropertyResult[]>();
  for (const prop of propRows) {
    const id = prop.relation_id;
    let bucket = propsByRelation.get(id);
    if (!bucket) {
      bucket = [];
      propsByRelation.set(id, bucket);
    }
    bucket.push({
      property_key: prop.property_key,
      value_type: prop.value_type,
      value_text: prop.value_text ?? null,
      value_number: prop.value_number ?? null,
      value_integer: prop.value_integer ?? null,
      ref_doc_id: prop.ref_doc_id ?? null,
      currency: prop.currency ?? null
    });
  }

  return rows.map((row) => ({
    relation_id: row.relation_id,
    relation_type: row.relation_type,
    source_id: Number(row.source_id),
    target_id: Number(row.target_id),
    metadata: parseJsonObject(row.metadata_json),
    relation_properties: propsByRelation.get(row.relation_id) ?? []
  }));
}

registerTool(graphSearchTool);
