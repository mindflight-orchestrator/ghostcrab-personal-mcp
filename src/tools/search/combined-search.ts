import { z } from "zod";

import { FACETS_SEARCH_TABLE_ID } from "../../db/fact-store.js";
import { resolveGhostcrabConfig } from "../../config/env.js";
import { runStandaloneCollectionFacetSearch } from "../../db/standalone-mindbrain.js";
import { graphSearchTool } from "../dgraph/graph-search.js";
import { searchTool } from "../facets/search.js";
import {
  createToolSuccessResult,
  registerTool,
  type ToolExecutionContext,
  type ToolHandler
} from "../registry.js";

export const CombinedSearchInput = z.object({
  query: z.string().trim().max(4_096).default(""),
  workspace_id: z.string().trim().min(1).optional(),
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
  limit: z.coerce.number().int().min(1).max(50).default(10),
  graph_limit: z.coerce.number().int().min(1).max(100).optional(),
  facet_limit: z.coerce.number().int().min(1).max(100).optional(),
  entity_types: z.array(z.string().trim().min(1)).max(50).default([]),
  metadata_filters: z.record(z.string(), z.unknown()).default({}),
  facet_schema_id: z.string().trim().min(1).optional(),
  facet_filters: z.record(z.string(), z.unknown()).default({}),
  facet_mode: z.enum(["hybrid", "bm25", "semantic"]).default("hybrid"),
  include_relations: z.boolean().default(false),
  include_chunks: z.boolean().default(false),
  chunk_limit: z.coerce.number().int().min(1).max(200).optional()
});

type GraphEntity = {
  confidence?: number;
  entity_id: number;
  entity_type: string;
  metadata?: Record<string, unknown>;
  name: string;
  score?: number;
};

type LinkedFactRow = {
  content: string;
  created_at_unix: number;
  doc_id: number;
  entity_id: number;
  facets_json: string;
  id: string;
  link_confidence: number;
  schema_id: string;
  version: number;
};

type CombinedFact = {
  content: string;
  created_at: string;
  doc_id: number;
  facets: Record<string, unknown>;
  id: string;
  linked_entity_ids: number[];
  match_origin: "linked_graph_fact" | "facet_fallback" | "collection_facet_fallback";
  schema_id: string;
  score: number;
  version: number;
};

type ChunkEvidenceRow = {
  chunk_content: string | null;
  chunk_index: number;
  collection_id: string;
  confidence: number;
  doc_id: number;
  entity_id: number;
  role: string | null;
};

const combinedSearchInputSchema = {
  type: "object",
  properties: {
    query: {
      type: "string",
      description:
        "Text query used first against graph entities, then against facets as fallback."
    },
    workspace_id: {
      type: "string",
      description:
        "Target workspace id. Overrides session context for this call only."
    },
    collection_id: {
      type: ["string", "null"],
      description:
        "Optional graph collection scope. Omit or pass null to search all collections in the workspace."
    },
    limit: {
      type: "integer",
      minimum: 1,
      maximum: 50,
      default: 10,
      description: "Maximum number of combined ranked results to return."
    },
    graph_limit: {
      type: "integer",
      minimum: 1,
      maximum: 100,
      description:
        "Maximum graph entities to inspect before linked facet lookup. Defaults to max(20, limit * 2)."
    },
    facet_limit: {
      type: "integer",
      minimum: 1,
      maximum: 100,
      description:
        "Maximum linked or fallback facet facts to retrieve. Defaults to max(20, limit * 2)."
    },
    entity_types: {
      type: "array",
      items: { type: "string" },
      default: [],
      description:
        "Optional graph_entity.entity_type filters. Empty array searches all graph entity types."
    },
    metadata_filters: {
      type: "object",
      default: {},
      additionalProperties: true,
      description: "Exact graph metadata filters."
    },
    facet_schema_id: {
      type: "string",
      description:
        "Optional schema_id filter applied to linked and fallback facets."
    },
    facet_filters: {
      type: "object",
      default: {},
      additionalProperties: true,
      description:
        "Exact facet filters applied to linked and fallback facet facts. Arrays are treated as OR."
    },
    facet_mode: {
      type: "string",
      enum: ["hybrid", "bm25", "semantic"],
      default: "hybrid",
      description: "Ranking mode used by the facet fallback search."
    },
    include_relations: {
      type: "boolean",
      default: false,
      description:
        "Include graph_relation rows touching returned graph entities. Off by default to keep payloads bounded; set true when relation topology is needed."
    },
    include_chunks: {
      type: "boolean",
      default: false,
      description:
        "Include graph_entity_chunk evidence for returned graph entities when available."
    },
    chunk_limit: {
      type: "integer",
      minimum: 1,
      maximum: 200,
      description:
        "Maximum chunk evidence rows to return when include_chunks is true. Defaults to min(50, limit * 5)."
    }
  }
} as const;

export const combinedSearchTool: ToolHandler = {
  definition: {
    name: "ghostcrab_combined_search",
    description:
      "Read. Graph-first combined search across graph entities/relations and linked facet facts. Use when the caller does not know whether data lives in graph or facets.",
    inputSchema: combinedSearchInputSchema
  },
  async handler(args, context) {
    return runCombinedSearch("ghostcrab_combined_search", args, context);
  }
};

export const combinedSearchAliasTool: ToolHandler = {
  definition: {
    name: "ghostcrab_csearch",
    description:
      "Read. Alias for ghostcrab_combined_search. Graph-first combined search across graph entities/relations and linked facet facts.",
    inputSchema: combinedSearchInputSchema
  },
  async handler(args, context) {
    return runCombinedSearch("ghostcrab_csearch", args, context, {
      canonicalTool: "ghostcrab_combined_search"
    });
  }
};

async function runCombinedSearch(
  toolName: string,
  args: Record<string, unknown>,
  context: ToolExecutionContext,
  options: { canonicalTool?: string } = {}
) {
  const input = CombinedSearchInput.parse(args);
  const workspaceId = input.workspace_id ?? context.session.workspace_id;
  const graphLimit = input.graph_limit ?? Math.max(20, input.limit * 2);
  const facetLimit = input.facet_limit ?? Math.max(20, input.limit * 2);
  const partialErrors: Array<{ layer: string; message: string }> = [];

  let graphPayload: Record<string, unknown> | null = null;
  const graphResult = await graphSearchTool.handler(
    {
      workspace_id: workspaceId,
      collection_id: input.collection_id,
      query: input.query,
      entity_types: input.entity_types,
      metadata_filters: input.metadata_filters,
      include_relations: input.include_relations,
      limit: graphLimit
    },
    context
  );

  if (graphResult.isError) {
    partialErrors.push({
      layer: "graph",
      message: readErrorMessage(graphResult.structuredContent)
    });
  } else {
    graphPayload = asObject(graphResult.structuredContent);
  }

  const graphEntities = readGraphEntities(graphPayload);
  const graphScores = normalizedGraphScores(graphEntities);
  const linkedFacts =
    graphEntities.length > 0
      ? await loadLinkedFacetFacts({
          context,
          workspaceId,
          entityIds: graphEntities.map((entity) => entity.entity_id),
          graphScores,
          facetSchemaId: input.facet_schema_id,
          facetFilters: input.facet_filters,
          limit: facetLimit
        })
      : [];

  let fallbackFacts: CombinedFact[] = [];
  if (graphEntities.length === 0 || linkedFacts.length === 0) {
    const fallbackResult = await searchTool.handler(
      {
        query: input.query,
        filters: input.facet_filters,
        limit: facetLimit,
        mode: input.facet_mode,
        schema_id: input.facet_schema_id,
        workspace_id: workspaceId
      },
      context
    );
    if (fallbackResult.isError) {
      partialErrors.push({
        layer: "facets",
        message: readErrorMessage(fallbackResult.structuredContent)
      });
    } else {
      fallbackFacts = readFallbackFacts(fallbackResult.structuredContent);
    }

    if (
      fallbackFacts.length === 0 &&
      input.collection_id &&
      input.query.trim().length > 0
    ) {
      try {
        const config = resolveGhostcrabConfig();
        const collectionFacets = await runStandaloneCollectionFacetSearch({
          mindbrainUrl: config.mindbrainUrl,
          timeoutMs: config.mindbrainHttpTimeoutMs,
          workspaceId,
          collectionId: input.collection_id,
          value: input.query,
          limit: facetLimit
        });
        if (collectionFacets.matches.length > 0) {
          fallbackFacts = collectionFacets.matches.map((match) => ({
            id: `collection:${match.doc_id}:${match.namespace}.${match.dimension}`,
            content: `${match.namespace}.${match.dimension}=${match.value}`,
            score: match.weight,
            schema_id: "collection:facet_assignment",
            facets: {
              doc_id: match.doc_id,
              chunk_index: match.chunk_index,
              namespace: match.namespace,
              dimension: match.dimension,
              value: match.value
            },
            created_at: new Date(0).toISOString(),
            doc_id: match.doc_id,
            linked_entity_ids: [],
            match_origin: "collection_facet_fallback" as const,
            version: 1
          }));
        }
      } catch (error) {
        partialErrors.push({
          layer: "collection_facets",
          message:
            error instanceof Error
              ? error.message
              : "collection facet search unavailable"
        });
      }
    }
  }

  const chunkLimit = input.chunk_limit ?? Math.min(50, input.limit * 5);
  const chunkEvidence =
    input.include_chunks && graphEntities.length > 0
      ? await loadChunkEvidence(
          context,
          graphEntities.map((entity) => entity.entity_id),
          chunkLimit
        )
      : [];

  const combinedResults = buildCombinedResults(
    graphEntities,
    linkedFacts,
    fallbackFacts,
    input.limit,
    graphScores
  );

  return createToolSuccessResult(toolName, {
    ...(options.canonicalTool ? { canonical_tool: options.canonicalTool } : {}),
    strategy: "graph_first",
    query: input.query,
    workspace_id: workspaceId,
    collection_id: input.collection_id ?? null,
    limits: {
      requested: input.limit,
      graph: graphLimit,
      facets: facetLimit
    },
    searched_layers: ["graph_entity", "graph_relation", "facets"],
    graph: {
      returned: graphEntities.length,
      entities: graphEntities,
      relations: Array.isArray(graphPayload?.relations)
        ? graphPayload.relations
        : []
    },
    facets: {
      linked_returned: linkedFacts.length,
      fallback_returned: fallbackFacts.length,
      linked_facts: linkedFacts,
      fallback_facts: fallbackFacts
    },
    chunks: {
      included: input.include_chunks,
      limit: chunkLimit,
      returned: chunkEvidence.length,
      results: chunkEvidence
    },
    returned: combinedResults.length,
    partial_errors: partialErrors,
    results: combinedResults
  });
}

async function loadLinkedFacetFacts(args: {
  context: ToolExecutionContext;
  entityIds: number[];
  facetFilters: Record<string, unknown>;
  facetSchemaId: string | undefined;
  graphScores: Map<number, number>;
  limit: number;
  workspaceId: string;
}): Promise<CombinedFact[]> {
  if (args.entityIds.length === 0) return [];

  const facetWhereClauses: string[] = [];
  const facetWhereParams: unknown[] = [];
  if (args.facetSchemaId) {
    facetWhereClauses.push("f.schema_id = ?");
    facetWhereParams.push(args.facetSchemaId);
  }
  appendFacetFilterClauses(
    "f.facets_json",
    args.facetFilters,
    facetWhereClauses,
    facetWhereParams
  );

  const rows = await args.context.database.query<LinkedFactRow>(
    `
      SELECT
        ged.entity_id,
        ged.confidence AS link_confidence,
        f.id,
        f.schema_id,
        f.content,
        f.facets_json,
        f.created_at_unix,
        f.version,
        f.doc_id
      FROM graph_entity_document AS ged
      JOIN agent_facts AS f
        ON f.doc_id = ged.doc_id
      WHERE ged.table_id = ?
        AND ged.entity_id IN (${args.entityIds.map(() => "?").join(", ")})
        AND f.workspace_id = ?
        AND (f.valid_until_unix IS NULL OR f.valid_until_unix > strftime('%s','now'))
        ${facetWhereClauses.length > 0 ? `AND ${facetWhereClauses.join(" AND ")}` : ""}
      ORDER BY ged.confidence DESC, f.created_at_unix DESC
      LIMIT ?
    `,
    [
      FACETS_SEARCH_TABLE_ID,
      ...args.entityIds,
      args.workspaceId,
      ...facetWhereParams,
      Math.max(args.limit * 3, args.limit)
    ]
  );

  const byFact = new Map<string, CombinedFact>();
  for (const row of rows) {
    const entityId = Number(row.entity_id);
    const score =
      (args.graphScores.get(entityId) ?? 0) * Number(row.link_confidence ?? 1);
    const current = byFact.get(row.id);
    if (current) {
      current.linked_entity_ids.push(entityId);
      current.score = Math.max(current.score, score);
      continue;
    }

    byFact.set(row.id, {
      id: row.id,
      schema_id: row.schema_id,
      content: row.content,
      facets: safeParseJsonObject(row.facets_json),
      created_at: new Date(Number(row.created_at_unix) * 1000).toISOString(),
      version: Number(row.version ?? 1),
      doc_id: Number(row.doc_id),
      score,
      linked_entity_ids: [entityId],
      match_origin: "linked_graph_fact"
    });
  }

  return [...byFact.values()]
    .sort((left, right) => right.score - left.score)
    .slice(0, args.limit);
}

async function loadChunkEvidence(
  context: ToolExecutionContext,
  entityIds: number[],
  chunkLimit: number
): Promise<Array<Record<string, unknown>>> {
  if (entityIds.length === 0) return [];

  const rows = await context.database.query<ChunkEvidenceRow>(
    `
      SELECT
        c.entity_id,
        c.collection_id,
        c.doc_id,
        c.chunk_index,
        c.role,
        c.confidence,
        ch.content AS chunk_content
      FROM graph_entity_chunk AS c
      LEFT JOIN chunks_raw AS ch
        ON ch.workspace_id = c.workspace_id
       AND ch.collection_id = c.collection_id
       AND ch.doc_id = c.doc_id
       AND ch.chunk_index = c.chunk_index
      WHERE c.entity_id IN (${entityIds.map(() => "?").join(", ")})
      ORDER BY c.confidence DESC, c.collection_id ASC, c.doc_id ASC, c.chunk_index ASC
      LIMIT ?
    `,
    [...entityIds, chunkLimit]
  );

  return rows.map((row) => ({
    entity_id: Number(row.entity_id),
    collection_id: row.collection_id,
    doc_id: Number(row.doc_id),
    chunk_index: Number(row.chunk_index),
    role: row.role,
    confidence: Number(row.confidence ?? 0),
    content: row.chunk_content
  }));
}

function buildCombinedResults(
  graphEntities: GraphEntity[],
  linkedFacts: CombinedFact[],
  fallbackFacts: CombinedFact[],
  limit: number,
  graphScores: Map<number, number>
): Array<Record<string, unknown>> {
  const graphItems = graphEntities.map((entity) => ({
    kind: "graph_entity",
    match_origin: "graph_search",
    score: graphScores.get(entity.entity_id) ?? 0,
    entity
  }));
  const linkedFactItems = linkedFacts.map((fact) => ({
    kind: "facet_fact",
    match_origin: fact.match_origin,
    score: fact.score,
    fact
  }));
  const fallbackFactItems = fallbackFacts.map((fact) => ({
    kind: "facet_fact",
    match_origin: fact.match_origin,
    score: fact.score,
    fact
  }));

  return [...graphItems, ...linkedFactItems, ...fallbackFactItems]
    .sort((left, right) => Number(right.score) - Number(left.score))
    .slice(0, limit);
}

function normalizedGraphScores(entities: GraphEntity[]): Map<number, number> {
  const max = Math.max(
    1,
    ...entities.map((entity) => Number(entity.score ?? 0))
  );
  return new Map(
    entities.map((entity) => [
      entity.entity_id,
      Math.max(0, Number(entity.score ?? 0) / max)
    ])
  );
}

function readGraphEntities(
  payload: Record<string, unknown> | null
): GraphEntity[] {
  if (!payload || !Array.isArray(payload.results)) return [];
  return payload.results
    .filter((value): value is Record<string, unknown> => isObject(value))
    .map((value) => ({
      entity_id: Number(value.entity_id),
      entity_type: String(value.entity_type ?? ""),
      name: String(value.name ?? ""),
      confidence: Number(value.confidence ?? 0),
      metadata: isObject(value.metadata) ? value.metadata : {},
      score: Number(value.score ?? 0)
    }))
    .filter((entity) => Number.isFinite(entity.entity_id));
}

function readFallbackFacts(payload: unknown): CombinedFact[] {
  const body = asObject(payload);
  if (!Array.isArray(body.results)) return [];
  return body.results
    .filter((value): value is Record<string, unknown> => isObject(value))
    .map((row) => ({
      id: String(row.id ?? ""),
      schema_id: String(row.schema_id ?? ""),
      content: String(row.content ?? ""),
      facets: isObject(row.facets) ? row.facets : {},
      created_at: String(row.created_at ?? ""),
      version: Number(row.version ?? 1),
      doc_id: 0,
      score: Number(row.score ?? 0),
      linked_entity_ids: [],
      match_origin: "facet_fallback" as const
    }));
}

function appendFacetFilterClauses(
  column: string,
  filters: Record<string, unknown>,
  clauses: string[],
  params: unknown[]
): void {
  for (const [key, rawValue] of Object.entries(filters)) {
    if (Array.isArray(rawValue)) {
      if (rawValue.length === 0) {
        clauses.push("0 = 1");
        continue;
      }
      clauses.push(
        `(${rawValue.map(() => `json_extract(${column}, '$.${key}') = ?`).join(" OR ")})`
      );
      params.push(...rawValue);
      continue;
    }

    clauses.push(`json_extract(${column}, '$.${key}') = ?`);
    params.push(rawValue);
  }
}

function readErrorMessage(payload: unknown): string {
  const body = asObject(payload);
  const error = isObject(body.error) ? body.error : {};
  return typeof error.message === "string" ? error.message : "unknown error";
}

function asObject(value: unknown): Record<string, unknown> {
  return isObject(value) ? value : {};
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeParseJsonObject(value: unknown): Record<string, unknown> {
  if (isObject(value)) return value;
  if (typeof value !== "string" || value.length === 0) return {};
  try {
    const parsed = JSON.parse(value);
    return isObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

registerTool(combinedSearchTool);
registerTool(combinedSearchAliasTool);
