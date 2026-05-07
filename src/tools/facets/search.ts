import { z } from "zod";

import { callNativeOrFallback } from "../../db/dispatch.js";
import {
  areNativeFacetFiltersSupported,
  buildNativeFacetBitmapSql
} from "../../db/native-facets.js";
import { formatPgVector } from "../../embeddings/vector.js";
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
          description: "Optional schema filter. Overrides session schema_id for this call only."
        },
        workspace_id: {
          type: "string",
          description: "Target workspace id. Overrides session context for this call only."
        }
      }
    }
  },
  async handler(args, context) {
    const input = SearchInput.parse(args);
    const effectiveWorkspaceId = input.workspace_id ?? context.session.workspace_id;
    const effectiveSchemaId = input.schema_id ?? context.session.schema_id ?? undefined;
    let embeddingRuntime = context.embeddings.getStatus();
    const normalizedQuery = input.query.trim();
    const hasJsonbFilters = Object.keys(input.filters).length > 0;
    const isExactStructuredRead =
      normalizedQuery.length === 0 &&
      (effectiveSchemaId !== undefined || hasJsonbFilters);
    const notes: string[] = [];
    const nativeStructuredBitmap = buildNativeFacetBitmapSql({
      filters: input.filters,
      schemaId: effectiveSchemaId
    });

    if (context.database.kind === "sqlite") {
      const whereClauses: string[] = [
        "(valid_until_unix IS NULL OR valid_until_unix > strftime('%s','now'))",
        "workspace_id = ?"
      ];
      const whereParams: unknown[] = [effectiveWorkspaceId];
      const scoreParams: unknown[] = [];

      if (effectiveSchemaId) {
        whereClauses.push("schema_id = ?");
        whereParams.push(effectiveSchemaId);
      }

      for (const [key, rawValue] of Object.entries(input.filters)) {
        if (Array.isArray(rawValue)) {
          if (rawValue.length === 0) {
            whereClauses.push("0 = 1");
            continue;
          }

          const orClauses = rawValue.map(() => `json_extract(facets_json, '$.${key}') = ?`);
          whereClauses.push(`(${orClauses.join(" OR ")})`);
          whereParams.push(...rawValue);
          continue;
        }

        whereClauses.push(`json_extract(facets_json, '$.${key}') = ?`);
        whereParams.push(rawValue);
      }

      let scoreSql = "1.0";
      let modeApplied: "filter" | "bm25" | "hybrid" | "semantic" = "filter";

      if (normalizedQuery.length > 0) {
        const terms = normalizedQuery.split(/\s+/).filter(Boolean);
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
        modeApplied = input.mode === "semantic" ? "bm25" : input.mode;
        if (input.mode !== "bm25") {
          notes.push("SQLite mode currently applies fast local keyword scoring.");
        }
      }

      const rows = await context.database.query<{
        content: string;
        created_at_unix: number;
        facets_json: string;
        id: string;
        schema_id: string;
        score: number;
        version: number;
      }>(
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
        [...scoreParams, ...whereParams, input.limit]
      );

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
        semantic_available: false,
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

    // Native BM25 path via pg_facets: only when mode=bm25, query present, no JSONB
    // filters (schema_id is a registered column and handled by join), and extension loaded.
    // Hybrid and semantic modes cannot use pg_facets (no vector scoring support).
    const canUseNativeBm25 =
      input.mode === "bm25" &&
      normalizedQuery.length > 0 &&
      context.nativeExtensionsMode !== "sql-only" &&
      context.extensions.pgFacets &&
      !hasJsonbFilters;
    const canUseNativeStructured =
      isExactStructuredRead &&
      context.nativeExtensionsMode !== "sql-only" &&
      context.extensions.pgFacets &&
      areNativeFacetFiltersSupported(input.filters, effectiveSchemaId) &&
      nativeStructuredBitmap !== null;
    const canUseNative = canUseNativeBm25 || canUseNativeStructured;

    type SearchRow = {
      content: string;
      created_at: string;
      facets: Record<string, unknown>;
      id: string;
      schema_id: string;
      score: number;
      version: number;
    };

    const nativeBm25Search = async (): Promise<SearchRow[]> => {
      // facets.bm25_search returns (doc_id bigint, score float)
      // Join back to facets on doc_id (added by migration 008) to get full record.
      // Enforce valid_until in the join-back query.
      if (effectiveSchemaId) {
        return context.database.query<SearchRow>(
          `
            WITH bm25 AS (
              SELECT doc_id, score::float8
              FROM facets.bm25_search(
                'public.facets'::regclass,
                $1::text,
                'english',
                false, false, 0.3, 1.2, 0.75,
                $2::int
              )
            )
            SELECT
              f.id,
              f.schema_id,
              f.content,
              f.facets,
              f.created_at,
              f.version,
              b.score
            FROM bm25 b
            JOIN facets f ON f.doc_id = b.doc_id
            WHERE f.schema_id = $3
              AND f.workspace_id = $4
              AND (f.valid_until IS NULL OR f.valid_until > CURRENT_DATE)
            ORDER BY b.score DESC, f.created_at DESC
          `,
          [normalizedQuery, input.limit, effectiveSchemaId, effectiveWorkspaceId]
        );
      }

      return context.database.query<SearchRow>(
        `
          WITH bm25 AS (
            SELECT doc_id, score::float8
            FROM facets.bm25_search(
              'public.facets'::regclass,
              $1::text,
              'english',
              false, false, 0.3, 1.2, 0.75,
              $2::int
            )
          )
          SELECT
            f.id,
            f.schema_id,
            f.content,
            f.facets,
            f.created_at,
            f.version,
            b.score
          FROM bm25 b
          JOIN facets f ON f.doc_id = b.doc_id
          WHERE f.workspace_id = $3
            AND (f.valid_until IS NULL OR f.valid_until > CURRENT_DATE)
          ORDER BY b.score DESC, f.created_at DESC
        `,
        [normalizedQuery, input.limit, effectiveWorkspaceId]
      );
    };

    const nativeStructuredSearch = async (): Promise<SearchRow[]> => {
      if (!nativeStructuredBitmap) {
        throw new Error("Native structured bitmap plan is missing");
      }

      const bitmapAliases = Array.from(
        { length: nativeStructuredBitmap.params.length / 2 },
        (_, index) => `bitmap_${index + 1}`
      );
      const params: unknown[] = [...nativeStructuredBitmap.params, input.limit];
      const limitParam = params.length;

      return context.database.query<SearchRow>(
        `
          WITH ${nativeStructuredBitmap.ctesSql},
          combined_bitmap AS (
            SELECT ${nativeStructuredBitmap.bitmapExpr} AS bitmap
            FROM ${bitmapAliases.join(", ")}
          ),
          native_docs AS (
            SELECT unnest(rb_to_array(bitmap)) AS doc_id
            FROM combined_bitmap
          ),
          dedup_docs AS (
            SELECT DISTINCT doc_id
            FROM native_docs
          )
          SELECT
            f.id,
            f.schema_id,
            f.content,
            f.facets,
            f.created_at,
            f.version,
            1.0::float8 AS score
          FROM dedup_docs d
          JOIN facets f ON f.doc_id = d.doc_id
          WHERE (f.valid_until IS NULL OR f.valid_until > CURRENT_DATE)
          ORDER BY f.created_at DESC
          LIMIT $${limitParam}
        `,
        params
      );
    };

    // Shared state written by sqlFallback via closure so callNativeOrFallback
    // can remain generic (returns only SearchRow[]).
    let sqlModeApplied = "filter";
    let sqlSemanticReady = false;

    const sqlFallback = async (): Promise<SearchRow[]> => {
      const whereClauses = [
        "(valid_until IS NULL OR valid_until > CURRENT_DATE)",
        `workspace_id = $1`
      ];
      const params: unknown[] = [effectiveWorkspaceId];
      let paramIndex = 2;

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

      let scoreExpression = "1.0";
      let queryParam: number | null = null;
      let queryVectorParam: number | null = null;
      const shouldAttemptSemantic =
        normalizedQuery.length > 0 &&
        input.mode !== "bm25" &&
        embeddingRuntime.vectorSearchReady;

      if (shouldAttemptSemantic) {
        try {
          const [queryEmbedding] = await context.embeddings.embedMany([
            normalizedQuery
          ]);

          if (queryEmbedding.length > 0) {
            params.push(formatPgVector(queryEmbedding));
            queryVectorParam = paramIndex;
            paramIndex += 1;
          }
        } catch (error) {
          embeddingRuntime = context.embeddings.getStatus();
          notes.push(
            `Semantic retrieval unavailable: ${error instanceof Error ? error.message : "Unknown embeddings error"} Falling back to BM25.`
          );
        }
      }

      sqlSemanticReady = queryVectorParam !== null;
      const needsBm25Query =
        normalizedQuery.length > 0 &&
        (input.mode === "bm25" || input.mode === "hybrid" || !sqlSemanticReady);

      if (needsBm25Query) {
        params.push(normalizedQuery);
        queryParam = paramIndex;
        paramIndex += 1;
      }

      const bm25ScoreExpression =
        queryParam === null
          ? "0.0"
          : `COALESCE(ts_rank(bm25_vector, plainto_tsquery('english', $${queryParam}::text)), 0.0)`;
      const semanticScoreExpression =
        queryVectorParam === null
          ? "0.0"
          : `COALESCE(1 - (embedding <=> $${queryVectorParam}::vector), 0.0)`;

      if (normalizedQuery.length > 0) {
        if (input.mode === "semantic" && queryVectorParam !== null) {
          whereClauses.push("embedding IS NOT NULL");
          scoreExpression = semanticScoreExpression;
          sqlModeApplied = "semantic";
        } else if (input.mode === "hybrid" && queryVectorParam !== null) {
          whereClauses.push(
            `(embedding IS NOT NULL OR bm25_vector @@ plainto_tsquery('english', $${queryParam}::text))`
          );
          scoreExpression = `((${context.retrieval.hybridBm25Weight} * ${bm25ScoreExpression}) + (${context.retrieval.hybridVectorWeight} * ${semanticScoreExpression}))`;
          sqlModeApplied = "hybrid";
        } else {
          whereClauses.push(
            `bm25_vector @@ plainto_tsquery('english', $${queryParam}::text)`
          );
          scoreExpression = bm25ScoreExpression;
          sqlModeApplied = "bm25";

          if (input.mode !== "bm25") {
            notes.push(
              `${embeddingRuntime.note} The current implementation falls back to BM25.`
            );
          }
        }
      }

      params.push(input.limit);
      const limitParam = paramIndex;

      return context.database.query<SearchRow>(
        `
          SELECT
            id,
            schema_id,
            content,
            facets,
            created_at,
            version,
            ${scoreExpression} AS score
          FROM facets
          WHERE ${whereClauses.join(" AND ")}
          ORDER BY score DESC, created_at DESC
          LIMIT $${limitParam}
        `,
        params
      );
    };

    const { value: rows, backend } = await callNativeOrFallback({
      useNative: canUseNative,
      native: () =>
        canUseNativeStructured ? nativeStructuredSearch() : nativeBm25Search(),
      fallback: sqlFallback
    });

    const modeApplied = backend === "native" ? "bm25" : sqlModeApplied;
    const semanticReady = backend === "native" ? false : sqlSemanticReady;

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
      semantic_available: semanticReady,
      embedding_runtime: embeddingRuntime,
      backend,
      searched_layers: ["facets"],
      excluded_layers: ["graph_entity", "graph_relation", "projection_result"],
      suggested_tools: ["ghostcrab_graph_search", "ghostcrab_projection_get"],
      notes,
      results: rows
    });
  }
};

registerTool(searchTool);

function safeParseJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
