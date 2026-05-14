import { z } from "zod";

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

        const orClauses = rawValue.map(
          () => `json_extract(facets_json, '$.${key}') = ?`
        );
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
};

registerTool(searchTool);

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
