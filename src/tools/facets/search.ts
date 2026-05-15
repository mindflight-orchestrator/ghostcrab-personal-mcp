import { z } from "zod";

import { cosineSimilarity, decodeEmbedding } from "../../embeddings/blob.js";
import { FACETS_SEARCH_TABLE_ID } from "../../db/fact-store.js";
import {
  buildFtsMatchExpression,
  ensureSearchFtsCaughtUp
} from "../../db/facets-fts-search.js";
import { isFactsFtsReady } from "../../runtime/facets-fts-state.js";
import {
  createToolSuccessResult,
  registerTool,
  type ToolHandler
} from "../registry.js";

export const SearchInput = z.object({
  query: z.string().max(4_096).default(""),
  filters: z.record(z.string(), z.unknown()).default({}),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  mode: z.enum(["hybrid", "bm25", "semantic"]).default("hybrid"),
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

interface FacetsCandidateRow extends FacetsSearchRow {
  embedding_blob: unknown;
}

/**
 * Upper bound on the BM25 / semantic candidate pool. Phase 3 cosine ranking
 * runs in Node, so the pool size directly maps to memory + latency. 200 keeps
 * it fast while leaving plenty of headroom for hybrid re-ranking.
 */
const SEMANTIC_CANDIDATE_LIMIT = 200;
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
    let rows: FacetsSearchRow[] = [];
    let semanticAvailable = false;

    // Phase 3: when the embedding provider is configured AND the caller asks
    // for semantic or hybrid, embed the query once and reuse it across both
    // the standalone semantic path and the hybrid blend.
    let queryVector: number[] | null = null;
    const wantsSemanticLayer =
      (input.mode === "semantic" || input.mode === "hybrid") &&
      normalizedQuery.length > 0 &&
      embeddingRuntime.vectorSearchReady;

    if (wantsSemanticLayer) {
      try {
        const embeddings = await context.embeddings.embedMany([normalizedQuery]);
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
      normalizedQuery.length > 0 ? buildFtsMatchExpression(normalizedQuery) : null;
    const ftsRequested = input.mode === "bm25" || input.mode === "hybrid";

    // Path 1 — hybrid: FTS5 candidate pool re-ranked with cosine.
    if (
      input.mode === "hybrid" &&
      ftsReady &&
      ftsExpression !== null &&
      queryVector !== null
    ) {
      try {
        await ensureSearchFtsCaughtUp(context.database);
        const poolLimit = Math.max(
          HYBRID_CANDIDATE_FLOOR,
          input.limit * HYBRID_CANDIDATE_MULTIPLIER
        );
        const candidates = await runFtsCandidatePool({
          database: context.database,
          ftsExpression,
          workspaceId: effectiveWorkspaceId,
          facetWhereClauses,
          facetWhereParams,
          limit: poolLimit
        });
        const blended = blendBm25AndCosine(candidates, queryVector, {
          bm25: context.retrieval.hybridBm25Weight,
          vector: context.retrieval.hybridVectorWeight
        });
        rows = blended.rows.slice(0, input.limit);
        modeApplied = "hybrid";
        semanticAvailable = blended.semanticHits > 0;
        if (blended.semanticHits === 0) {
          notes.push(
            "Hybrid blend ran but no candidate row had a usable embedding; results are BM25-only."
          );
        }
      } catch (error) {
        rows = [];
        notes.push(
          `Hybrid path failed (${error instanceof Error ? error.message : "unknown error"}); falling back to bm25/keyword_sql.`
        );
      }
    }

    // Path 2 — pure semantic: cosine over candidate pool.
    if (
      modeApplied === "filter" &&
      input.mode === "semantic" &&
      queryVector !== null
    ) {
      try {
        const candidates = await runSemanticCandidatePool({
          database: context.database,
          workspaceId: effectiveWorkspaceId,
          facetWhereClauses,
          facetWhereParams,
          limit: SEMANTIC_CANDIDATE_LIMIT
        });
        const ranked = rankByCosine(candidates, queryVector);
        if (ranked.semanticHits > 0) {
          rows = ranked.rows.slice(0, input.limit);
          modeApplied = "semantic";
          semanticAvailable = true;
        } else {
          notes.push(
            "Semantic ranking found no rows with usable embeddings; falling back to BM25/keyword_sql. Run `ghostcrab-embeddings backfill` to populate embeddings."
          );
        }
      } catch (error) {
        notes.push(
          `Semantic path failed (${error instanceof Error ? error.message : "unknown error"}); falling back to BM25/keyword_sql.`
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
        } else if (input.mode === "semantic" && !embeddingRuntime.vectorSearchReady) {
          notes.push(
            "Semantic mode unavailable: no embedding provider is configured. Set GHOSTCRAB_EMBEDDINGS_MODE to wire vectors; until then this call uses local keyword scoring."
          );
        } else if (input.mode === "hybrid" && !embeddingRuntime.vectorSearchReady) {
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
      backend: "sql",
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

interface RunFtsSearchArgs {
  database: { query: <T>(sql: string, params?: readonly unknown[]) => Promise<T[]> };
  ftsExpression: string;
  workspaceId: string;
  facetWhereClauses: string[];
  facetWhereParams: unknown[];
  limit: number;
}

async function runFtsSearch(args: RunFtsSearchArgs): Promise<FacetsSearchRow[]> {
  const whereClauses = buildFAliasedWhere(
    args.facetWhereClauses
  );

  const sql = `
    SELECT
      f.id,
      f.schema_id,
      f.content,
      f.facets_json,
      f.created_at_unix,
      f.version,
      bm25(search_fts) AS score
    FROM facets AS f
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

async function runFtsCandidatePool(
  args: RunFtsSearchArgs
): Promise<FacetsCandidateRow[]> {
  const whereClauses = buildFAliasedWhere(args.facetWhereClauses);

  const sql = `
    SELECT
      f.id,
      f.schema_id,
      f.content,
      f.facets_json,
      f.created_at_unix,
      f.version,
      f.embedding_blob AS embedding_blob,
      bm25(search_fts) AS score
    FROM facets AS f
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

  return await args.database.query<FacetsCandidateRow>(sql, params);
}

interface RunSemanticCandidatePoolArgs {
  database: { query: <T>(sql: string, params?: readonly unknown[]) => Promise<T[]> };
  workspaceId: string;
  facetWhereClauses: string[];
  facetWhereParams: unknown[];
  limit: number;
}

async function runSemanticCandidatePool(
  args: RunSemanticCandidatePoolArgs
): Promise<FacetsCandidateRow[]> {
  const whereClauses: string[] = [
    "(valid_until_unix IS NULL OR valid_until_unix > strftime('%s','now'))",
    "workspace_id = ?",
    "embedding_blob IS NOT NULL",
    ...args.facetWhereClauses
  ];

  const sql = `
    SELECT
      id,
      schema_id,
      content,
      facets_json,
      created_at_unix,
      version,
      embedding_blob AS embedding_blob,
      0.0 AS score
    FROM facets
    WHERE ${whereClauses.join(" AND ")}
    ORDER BY created_at_unix DESC
    LIMIT ?
  `;

  const params: unknown[] = [
    args.workspaceId,
    ...args.facetWhereParams,
    args.limit
  ];

  return await args.database.query<FacetsCandidateRow>(sql, params);
}

function buildFAliasedWhere(facetWhereClauses: string[]): string[] {
  return [
    "f.workspace_id = ?",
    "(f.valid_until_unix IS NULL OR f.valid_until_unix > strftime('%s','now'))",
    ...facetWhereClauses.map((clause) =>
      clause.replace(/json_extract\(facets_json,/g, "json_extract(f.facets_json,")
    )
  ];
}

interface BlendResult {
  rows: FacetsSearchRow[];
  semanticHits: number;
}

interface HybridWeights {
  bm25: number;
  vector: number;
}

function blendBm25AndCosine(
  candidates: FacetsCandidateRow[],
  queryVector: number[],
  weights: HybridWeights
): BlendResult {
  if (candidates.length === 0) {
    return { rows: [], semanticHits: 0 };
  }

  // SQLite's bm25() returns a negative number where smaller is better. Flip
  // the sign so larger == better and min-max scale within the candidate pool.
  const invertedBm25 = candidates.map((row) => -Number(row.score ?? 0));
  const minBm25 = Math.min(...invertedBm25);
  const maxBm25 = Math.max(...invertedBm25);
  const bm25Range = maxBm25 - minBm25;

  let semanticHits = 0;
  const scored = candidates.map((row, index) => {
    const normalizedBm25 =
      bm25Range > 0 ? (invertedBm25[index] - minBm25) / bm25Range : 1;
    const decoded = decodeEmbedding(row.embedding_blob);
    let cosineUnit = 0;
    if (decoded !== null && decoded.length > 0) {
      semanticHits += 1;
      const cos = cosineSimilarity(decoded, queryVector);
      // Map cosine from [-1,1] to [0,1] so it stays commensurate with the
      // normalised BM25 score.
      cosineUnit = Math.max(0, Math.min(1, (cos + 1) / 2));
    }
    return {
      row,
      normalizedBm25,
      cosineUnit
    };
  });

  // Hybrid scoring formula:
  //   blended = bm25_weight * norm_bm25 + vector_weight * cosine_unit
  // Both terms live in [0,1], so the blend stays in [0,1] regardless of how
  // the caller balances the weights. Rows without a usable embedding receive
  // cosineUnit=0 and rely entirely on their normalised BM25 share.
  return {
    rows: scored
      .map((entry) => ({
        ...entry.row,
        score:
          weights.bm25 * entry.normalizedBm25 +
          weights.vector * entry.cosineUnit
      }))
      .sort((a, b) => b.score - a.score),
    semanticHits
  };
}

function rankByCosine(
  candidates: FacetsCandidateRow[],
  queryVector: number[]
): BlendResult {
  let semanticHits = 0;
  const scored: FacetsSearchRow[] = [];
  for (const candidate of candidates) {
    const decoded = decodeEmbedding(candidate.embedding_blob);
    if (decoded === null || decoded.length === 0) {
      continue;
    }
    semanticHits += 1;
    const cos = cosineSimilarity(decoded, queryVector);
    scored.push({
      ...candidate,
      score: cos
    });
  }
  scored.sort((a, b) => b.score - a.score);
  return { rows: scored, semanticHits };
}

interface RunKeywordSqlSearchArgs {
  database: { query: <T>(sql: string, params?: readonly unknown[]) => Promise<T[]> };
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
    "(valid_until_unix IS NULL OR valid_until_unix > strftime('%s','now'))",
    "workspace_id = ?",
    ...args.facetWhereClauses
  ];
  const whereParams: unknown[] = [args.workspaceId, ...args.facetWhereParams];
  const scoreParams: unknown[] = [];

  let scoreSql = "1.0";
  let modeApplied: "filter" | "keyword_sql" = "filter";

  if (args.normalizedQuery.length > 0) {
    const terms = args.normalizedQuery.split(/\s+/).filter(Boolean);
    const matchClauses = terms.map(
      () => "instr(lower(content), lower(?)) > 0"
    );
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
      FROM facets
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
