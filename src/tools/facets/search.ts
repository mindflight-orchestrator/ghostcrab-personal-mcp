import { z } from "zod";

import { resolveGhostcrabConfig } from "../../config/env.js";
import { FACETS_SEARCH_TABLE_ID } from "../../db/fact-store.js";
import {
  buildFtsMatchExpression,
  ensureSearchFtsCaughtUp
} from "../../db/facets-fts-search.js";
import {
  runStandaloneGhostcrabSearch,
  runStandaloneKnowledge,
  type StandaloneGhostcrabSearchMatch
} from "../../db/standalone-mindbrain.js";
import {
  knowledgeError,
  requireKnowledgeCapability
} from "../dgraph/native-knowledge.js";
import { isFactsFtsReady } from "../../runtime/facets-fts-state.js";
import {
  createToolSuccessResult,
  registerTool,
  type ToolHandler
} from "../registry.js";
import {
  ACTIVE_FACT_WINDOW_SQL,
  activeFactWindowSql
} from "../../db/temporal.js";

export const SearchInput = z.object({
  query: z.string().max(4_096).default(""),
  filters: z.record(z.string(), z.unknown()).default({}),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  mode: z.enum(["hybrid", "bm25", "semantic"]).default("hybrid"),
  execution: z.enum(["auto", "native_required"]).default("auto"),
  schema_id: z.string().min(1).optional(),
  workspace_id: z.string().min(1).optional()
});

interface FacetsSearchRow {
  content: string;
  created_at_unix: number;
  facets_json: string;
  id: string;
  schema_id: string;
  score: number;
  version: number;
}

const HYBRID_CANDIDATE_MULTIPLIER = 5;
const HYBRID_CANDIDATE_FLOOR = 50;

export const searchTool: ToolHandler = {
  definition: {
    name: "ghostcrab_search",
    description:
      "Read. Retrieve ranked facts from persistent memory using keyword search and exact facet filters. Prefer explicit schema_id and exact filters before broad free-text search. One zero-result exact read does not prove the whole domain is empty. On a first-turn fuzzy GhostCrab onboarding request, do not use this tool for broad surface exploration unless the user explicitly asked about available models or schema inventory.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Keyword query. Empty string means pure facet filtering."
        },
        filters: {
          type: "object",
          description:
            "Exact facet filters. Arrays are treated as OR. Keys are facet field names; values are strings, numbers, booleans, or arrays for OR.",
          additionalProperties: true
        },
        limit: {
          type: "integer",
          description: "Maximum number of rows to return.",
          default: 10,
          minimum: 1,
          maximum: 100
        },
        mode: {
          type: "string",
          enum: ["hybrid", "bm25", "semantic"],
          default: "hybrid"
        },
        execution: {
          type: "string",
          enum: ["auto", "native_required"],
          default: "auto",
          description:
            "native_required requires the native index and never falls back to SQL keyword search."
        },
        schema_id: {
          type: "string",
          description:
            "Optional schema filter. Overrides session schema_id for this call only."
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
    const input = SearchInput.parse(args);
    if (input.execution === "native_required")
      return runNativeSearch(input, context);
    const effectiveWorkspaceId =
      input.workspace_id ?? context.session.workspace_id;
    const effectiveSchemaId =
      input.schema_id ?? context.session.schema_id ?? undefined;
    const embeddingRuntime = context.embeddings.getStatus();
    const normalizedQuery = input.query.trim();
    const hasJsonbFilters = Object.keys(input.filters).length > 0;
    const isExactStructuredRead =
      normalizedQuery.length === 0 &&
      (effectiveSchemaId !== undefined || hasJsonbFilters);
    const notes: string[] = [];

    const facetWhereClauses: string[] = [];
    const facetWhereParams: unknown[] = [];

    if (effectiveSchemaId) {
      facetWhereClauses.push("schema_id = ?");
      facetWhereParams.push(effectiveSchemaId);
    }

    for (const [key, rawValue] of Object.entries(input.filters)) {
      if (Array.isArray(rawValue)) {
        if (rawValue.length === 0) {
          facetWhereClauses.push("0 = 1");
          continue;
        }

        const orClauses = rawValue.map(
          () => `json_extract(facets_json, '$.${key}') = ?`
        );
        facetWhereClauses.push(`(${orClauses.join(" OR ")})`);
        facetWhereParams.push(...rawValue);
        continue;
      }

      facetWhereClauses.push(`json_extract(facets_json, '$.${key}') = ?`);
      facetWhereParams.push(rawValue);
    }

    let modeApplied: "filter" | "keyword_sql" | "bm25" | "hybrid" | "semantic" =
      "filter";
    let searchBackend: "mindbrain" | "sql" = "sql";
    let rows: FacetsSearchRow[] = [];
    let semanticAvailable = false;

    // JavaScript obtains the query vector from the configured provider, then
    // delegates all candidate selection and scoring to MindBrain Zig.
    let queryVector: number[] | null = null;
    const wantsSemanticLayer =
      (input.mode === "semantic" || input.mode === "hybrid") &&
      normalizedQuery.length > 0 &&
      embeddingRuntime.vectorSearchReady;

    if (wantsSemanticLayer) {
      try {
        const embeddings = await context.embeddings.embedMany([
          normalizedQuery
        ]);
        const candidate = embeddings[0];
        if (Array.isArray(candidate) && candidate.length > 0) {
          queryVector = candidate;
        }
      } catch (error) {
        notes.push(
          `Query embedding failed (${error instanceof Error ? error.message : "unknown error"}); ranking without the semantic layer.`
        );
      }
    }

    const ftsReady = isFactsFtsReady();
    const ftsExpression =
      normalizedQuery.length > 0
        ? buildFtsMatchExpression(normalizedQuery)
        : null;
    const ftsRequested = input.mode === "bm25" || input.mode === "hybrid";

    // Path 1a — MindBrain native vector/hybrid search (preferred when MindBrain
    // is reachable). Pure semantic search sends an empty lexical query and a
    // vector weight of 1 so embeddings stay inside the Zig engine instead of
    // crossing the SQL/JSON boundary for TypeScript cosine ranking.
    // On failure, semantic mode falls back to keyword SQL and hybrid mode to
    // native SQLite BM25/keyword SQL. JavaScript never recomputes vector ranks.
    if (
      (input.mode === "hybrid" || input.mode === "semantic") &&
      queryVector !== null &&
      normalizedQuery.length > 0
    ) {
      try {
        // Sync recent facts into search_documents so the Zig BM25 engine
        // sees rows inserted since the last catch-up, same as Path 1b.
        await ensureSearchFtsCaughtUp(context.database);
        const config = resolveGhostcrabConfig();
        const totalWeight =
          context.retrieval.hybridBm25Weight +
          context.retrieval.hybridVectorWeight;
        const poolLimit = Math.max(
          HYBRID_CANDIDATE_FLOOR,
          input.limit * HYBRID_CANDIDATE_MULTIPLIER
        );
        const pool = await runStandaloneGhostcrabSearch({
          mindbrainUrl: config.mindbrainUrl,
          timeoutMs: config.mindbrainHttpTimeoutMs,
          workspaceId: effectiveWorkspaceId,
          tableId: FACETS_SEARCH_TABLE_ID,
          schemaId: effectiveSchemaId,
          filters: input.filters,
          query: input.mode === "semantic" ? "" : normalizedQuery,
          embedding: queryVector,
          vectorWeight:
            input.mode === "semantic"
              ? 1
              : context.retrieval.hybridVectorWeight / totalWeight,
          limit: poolLimit
        });
        if (pool.matches.length > 0) {
          const fetched = await fetchFacetsByDocIds(
            context.database,
            pool.matches,
            effectiveWorkspaceId,
            facetWhereClauses,
            facetWhereParams,
            input.limit
          );
          if (fetched.length > 0) {
            rows = fetched;
            modeApplied = input.mode;
            searchBackend = "mindbrain";
            semanticAvailable = pool.matches.some((m) => m.vector_score > 0);
          }
        }
      } catch (error) {
        notes.push(
          `Native ${input.mode} search failed (${error instanceof Error ? error.message : "unknown error"}); falling back without JavaScript vector scoring.`
        );
      }
    }

    // Path 3 — BM25 (also used as fallback for semantic/hybrid when their
    // preferred layer was unavailable).
    if (
      modeApplied === "filter" &&
      ftsReady &&
      ftsExpression !== null &&
      normalizedQuery.length > 0 &&
      ftsRequested
    ) {
      try {
        await ensureSearchFtsCaughtUp(context.database);
        rows = await runFtsSearch({
          database: context.database,
          ftsExpression,
          workspaceId: effectiveWorkspaceId,
          facetWhereClauses,
          facetWhereParams,
          limit: input.limit
        });
        modeApplied = "bm25";
      } catch (error) {
        rows = [];
        notes.push(
          `FTS5 BM25 path failed (${error instanceof Error ? error.message : "unknown error"}); falling back to keyword_sql.`
        );
      }
    }

    // Path 4 — keyword_sql fallback.
    if (modeApplied === "filter") {
      const fallback = await runKeywordSqlSearch({
        database: context.database,
        normalizedQuery,
        workspaceId: effectiveWorkspaceId,
        facetWhereClauses,
        facetWhereParams,
        limit: input.limit
      });
      rows = fallback.rows;
      modeApplied = fallback.modeApplied;

      if (normalizedQuery.length > 0) {
        if (ftsRequested && !ftsReady) {
          notes.push(
            "FTS5 BM25 not ready yet; using local keyword (substring) scoring. Run the FTS-sync bootstrap or restart the server to enable real BM25."
          );
        } else if (
          input.mode === "semantic" &&
          !embeddingRuntime.vectorSearchReady
        ) {
          notes.push(
            "Semantic mode unavailable: no embedding provider is configured. Set GHOSTCRAB_EMBEDDINGS_MODE to wire vectors; until then this call uses local keyword scoring."
          );
        } else if (
          input.mode === "hybrid" &&
          !embeddingRuntime.vectorSearchReady
        ) {
          notes.push(
            "Hybrid blend unavailable: no embedding provider is configured. This call uses BM25/keyword scoring only."
          );
        }
      }
    }

    if (isExactStructuredRead && rows.length === 0) {
      notes.push(
        "Zero rows returned for this exact structured read only. This does not prove that the wider domain has no data."
      );
    }

    return createToolSuccessResult("ghostcrab_search", {
      query: input.query,
      filters: input.filters,
      workspace_id: effectiveWorkspaceId,
      schema_id: effectiveSchemaId ?? null,
      returned: rows.length,
      exact_structured_read: isExactStructuredRead,
      mode_requested: input.mode,
      mode_applied: modeApplied,
      hybrid_weights: {
        bm25: context.retrieval.hybridBm25Weight,
        vector: context.retrieval.hybridVectorWeight
      },
      semantic_available: semanticAvailable,
      embedding_runtime: embeddingRuntime,
      backend: searchBackend,
      searched_layers: ["facets"],
      excluded_layers: ["graph_entity", "graph_relation", "projection_result"],
      suggested_tools: ["ghostcrab_graph_search", "ghostcrab_projection_get"],
      notes,
      results: rows.map((row) => ({
        id: row.id,
        schema_id: row.schema_id,
        content: row.content,
        facets: safeParseJsonObject(row.facets_json),
        created_at: new Date(Number(row.created_at_unix) * 1000).toISOString(),
        version: row.version,
        score: Number(row.score ?? 0)
      }))
    });
  }
};

registerTool(searchTool);

async function runNativeSearch(
  input: z.infer<typeof SearchInput>,
  context: Parameters<ToolHandler["handler"]>[1]
) {
  try {
    const config = await requireKnowledgeCapability("native_fact_index");
    if (!input.query.trim())
      throw new Error(
        "BadRequest: native retrieval requires a nonempty question"
      );
    const workspace = input.workspace_id ?? context.session.workspace_id;
    const schema = input.schema_id ?? context.session.schema_id ?? undefined;
    let embedding: number[] = [];
    if (input.mode !== "bm25") {
      if (!context.embeddings.getStatus().vectorSearchReady)
        throw new Error("CapabilityUnavailable: semantic search is not ready");
      embedding = (await context.embeddings.embedMany([input.query]))[0] ?? [];
      if (embedding.length === 0 || embedding.some((n) => !Number.isFinite(n)))
        throw new Error("BadRequest: invalid query embedding");
    }
    const response = await runStandaloneKnowledge<{
      facts: Array<{
        id: string;
        schema_id: string;
        content: string;
        facets: Record<string, unknown>;
        created_at_unix: number;
        version: number;
        source_ref: string | null;
        entity_ref: unknown;
        score: number;
      }>;
      index: Record<string, unknown>;
    }>({
      mindbrainUrl: config.mindbrainUrl,
      timeoutMs: config.mindbrainHttpTimeoutMs,
      operation: "search",
      workspaceId: workspace,
      input: {
        table_id: 1,
        query: input.mode === "semantic" ? "" : input.query,
        embedding,
        vector_weight:
          input.mode === "bm25"
            ? 0
            : input.mode === "semantic"
              ? 1
              : context.retrieval.hybridVectorWeight,
        limit: input.limit,
        schema_id: schema,
        filters: input.filters,
        require_ready: true
      }
    });
    if (!Array.isArray(response.facts))
      throw new Error("Native search response has no fact identities");
    return createToolSuccessResult("ghostcrab_search", {
      query: input.query,
      filters: input.filters,
      workspace_id: workspace,
      schema_id: schema ?? null,
      returned: response.facts.length,
      exact_structured_read: false,
      mode_requested: input.mode,
      mode_applied: input.mode,
      execution: input.execution,
      backend: "mindbrain",
      index: response.index,
      semantic_available: embedding.length > 0,
      searched_layers: ["facets"],
      results: response.facts.map(({ created_at_unix, ...row }) => ({
        ...row,
        created_at: new Date(created_at_unix * 1000).toISOString()
      }))
    });
  } catch (error) {
    return knowledgeError("ghostcrab_search", error);
  }
}

interface RunFtsSearchArgs {
  database: {
    query: <T>(sql: string, params?: readonly unknown[]) => Promise<T[]>;
  };
  ftsExpression: string;
  workspaceId: string;
  facetWhereClauses: string[];
  facetWhereParams: unknown[];
  limit: number;
}

async function runFtsSearch(
  args: RunFtsSearchArgs
): Promise<FacetsSearchRow[]> {
  const whereClauses = buildFAliasedWhere(args.facetWhereClauses);

  const sql = `
    SELECT
      f.id,
      f.schema_id,
      f.content,
      f.facets_json,
      f.created_at_unix,
      f.version,
      bm25(search_fts) AS score
    FROM agent_facts AS f
    JOIN search_fts_docs AS sd
      ON sd.table_id = ? AND sd.doc_id = f.doc_id
    JOIN search_fts AS sf
      ON sf.rowid = sd.fts_rowid
    WHERE search_fts MATCH ?
      AND ${whereClauses.join(" AND ")}
    ORDER BY score
    LIMIT ?
  `;

  const params: unknown[] = [
    FACETS_SEARCH_TABLE_ID,
    args.ftsExpression,
    args.workspaceId,
    ...args.facetWhereParams,
    args.limit
  ];

  return await args.database.query<FacetsSearchRow>(sql, params);
}

function buildFAliasedWhere(facetWhereClauses: string[]): string[] {
  return [
    "f.workspace_id = ?",
    activeFactWindowSql("f"),
    ...facetWhereClauses.map((clause) =>
      clause.replace(
        /json_extract\(facets_json,/g,
        "json_extract(f.facets_json,"
      )
    )
  ];
}

/**
 * Fetch full facet rows by numeric doc_id and re-order them by the combined
 * score returned from the MindBrain hybrid search engine.
 *
 * MindBrain returns a ranked list of `doc_id`s. This function translates those
 * back to full facet content while applying workspace_id and facet WHERE
 * filters. The pool passed in should be larger than `limit` so that filtered-
 * out rows leave enough results after the WHERE clause is applied.
 */
interface FacetsByDocIdRow extends FacetsSearchRow {
  doc_id: number;
}

/**
 * Fetch full facet rows by numeric doc_id and re-order them by the combined
 * score returned from the MindBrain hybrid search engine.
 *
 * MindBrain returns a ranked list of `doc_id`s. This function translates those
 * back to full facet content while applying workspace_id and facet WHERE
 * filters. The pool passed in should be larger than `limit` so that filtered-
 * out rows leave enough results after the WHERE clause is applied.
 */
async function fetchFacetsByDocIds(
  database: {
    query: <T>(sql: string, params?: readonly unknown[]) => Promise<T[]>;
  },
  matches: StandaloneGhostcrabSearchMatch[],
  workspaceId: string,
  facetWhereClauses: string[],
  facetWhereParams: unknown[],
  limit: number
): Promise<FacetsSearchRow[]> {
  if (matches.length === 0) return [];

  const placeholders = matches.map(() => "?").join(", ");
  const whereClauses = [
    ACTIVE_FACT_WINDOW_SQL,
    "workspace_id = ?",
    `doc_id IN (${placeholders})`,
    ...facetWhereClauses
  ];

  const params: unknown[] = [
    workspaceId,
    ...matches.map((m) => m.doc_id),
    ...facetWhereParams
  ];

  const rawRows = await database.query<FacetsByDocIdRow>(
    `
      SELECT
        id,
        schema_id,
        content,
        facets_json,
        created_at_unix,
        version,
        doc_id,
        0.0 AS score
      FROM agent_facts
      WHERE ${whereClauses.join(" AND ")}
    `,
    params
  );

  const rowByDocId = new Map(
    rawRows.map((row) => [Number(row.doc_id), row] as const)
  );
  return matches
    .flatMap((match) => {
      const row = rowByDocId.get(match.doc_id);
      return row ? [{ ...row, score: match.combined_score }] : [];
    })
    .slice(0, limit);
}

interface RunKeywordSqlSearchArgs {
  database: {
    query: <T>(sql: string, params?: readonly unknown[]) => Promise<T[]>;
  };
  normalizedQuery: string;
  workspaceId: string;
  facetWhereClauses: string[];
  facetWhereParams: unknown[];
  limit: number;
}

interface KeywordSqlSearchResult {
  rows: FacetsSearchRow[];
  modeApplied: "filter" | "keyword_sql";
}

async function runKeywordSqlSearch(
  args: RunKeywordSqlSearchArgs
): Promise<KeywordSqlSearchResult> {
  const whereClauses: string[] = [
    ACTIVE_FACT_WINDOW_SQL,
    "workspace_id = ?",
    ...args.facetWhereClauses
  ];
  const whereParams: unknown[] = [args.workspaceId, ...args.facetWhereParams];
  const scoreParams: unknown[] = [];

  let scoreSql = "1.0";
  let modeApplied: "filter" | "keyword_sql" = "filter";

  if (args.normalizedQuery.length > 0) {
    const terms = args.normalizedQuery.split(/\s+/).filter(Boolean);
    const matchClauses = terms.map(() => "instr(lower(content), lower(?)) > 0");
    whereClauses.push(`(${matchClauses.join(" OR ")})`);
    whereParams.push(...terms);
    scoreSql = terms
      .map(
        () => `
          (
            CAST(
              length(lower(content)) - length(replace(lower(content), lower(?), ''))
              AS REAL
            ) / NULLIF(length(?), 0)
          )
        `
      )
      .join(" + ");
    for (const term of terms) {
      scoreParams.push(term, term);
    }
    modeApplied = "keyword_sql";
  }

  const rows = await args.database.query<FacetsSearchRow>(
    `
      SELECT
        id,
        schema_id,
        content,
        facets_json,
        created_at_unix,
        version,
        ${scoreSql} AS score
      FROM agent_facts
      WHERE ${whereClauses.join(" AND ")}
      ORDER BY score DESC, created_at_unix DESC
      LIMIT ?
    `,
    [...scoreParams, ...whereParams, args.limit]
  );

  return { rows, modeApplied };
}

function safeParseJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
