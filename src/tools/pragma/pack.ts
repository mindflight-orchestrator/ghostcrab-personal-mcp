import { z } from "zod";

import { callNativeOrFallback } from "../../db/dispatch.js";
import { formatPgVector } from "../../embeddings/vector.js";
import {
  createToolSuccessResult,
  registerTool,
  type ToolHandler
} from "../registry.js";

export const PackInput = z.object({
  query: z.string().trim().min(1).max(4_096),
  agent_id: z.string().min(1).default("agent:self"),
  scope: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(15)
});

const SAFE_FACET_KEY_PATTERN = /^[A-Za-z0-9_:-]+$/;
const DEMO_PROFILE_IDS = new Set([
  "project-delivery",
  "software-delivery",
  "incident-response",
  "compliance-audit",
  "crm-pipeline",
  "knowledge-base"
]);

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function detectActivityFamily(params: {
  families: Array<{
    activity_family: string | null | undefined;
    keywords: string[];
    title: string | null;
  }>;
  query: string;
  scope?: string;
}): string | null {
  const query = params.query.toLowerCase();
  const scope = params.scope?.toLowerCase() ?? "";
  let best: { activity_family: string; score: number } | null = null;

  for (const family of params.families) {
    if (!family.activity_family) {
      continue;
    }

    let score = 0;
    const id = family.activity_family.toLowerCase();
    const title = family.title?.toLowerCase() ?? "";

    if (scope.includes(id) || query.includes(id)) {
      score += 4;
    }

    if (title && (scope.includes(title) || query.includes(title))) {
      score += 3;
    }

    for (const keyword of family.keywords) {
      const normalized = keyword.toLowerCase();
      if (
        normalized.length > 0 &&
        (query.includes(normalized) || scope.includes(normalized))
      ) {
        score += 1;
      }
    }

    if (!best || score > best.score) {
      best = { activity_family: family.activity_family, score };
    }
  }

  return best && best.score > 0 ? best.activity_family : null;
}

function detectDemoProfileId(params: {
  query: string;
  scope?: string;
}): string | null {
  const haystack = `${params.scope ?? ""} ${params.query}`.toLowerCase();

  for (const profileId of DEMO_PROFILE_IDS) {
    if (haystack.includes(profileId)) {
      return profileId;
    }
  }

  return null;
}

function resolveScopedSchemaId(
  schemaId: string | null,
  demoProfileId: string | null
): string | null {
  if (!schemaId) {
    return null;
  }

  if (!demoProfileId || !schemaId.startsWith("ghostcrab:")) {
    return schemaId;
  }

  const entityName = schemaId.split(":")[1];
  return entityName ? `demo:${demoProfileId}:${entityName}` : schemaId;
}

export const packTool: ToolHandler = {
  definition: {
    name: "ghostcrab_pack",
    description:
      "Read. Build a compact working-memory pack from active projections plus top matching facts for a query.",
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: {
        query: {
          type: "string"
        },
        agent_id: {
          type: "string",
          default: "agent:self"
        },
        scope: {
          type: "string"
        },
        limit: {
          type: "integer",
          default: 15,
          minimum: 1,
          maximum: 50
        }
      }
    }
  },
  async handler(args, context) {
    const input = PackInput.parse(args);
    let embeddingRuntime = context.embeddings.getStatus();
    const notes: string[] = [];

    if (context.database.kind === "sqlite") {
      const projectionParams: unknown[] = [input.agent_id];
      const projectionWhereClauses = [
        "agent_id = ?",
        "status IN ('active', 'blocking')",
        "(expires_at_unix IS NULL OR expires_at_unix > strftime('%s','now'))"
      ];

      if (input.scope) {
        projectionWhereClauses.push("(scope = ? OR scope IS NULL)");
        projectionParams.push(input.scope);
      }

      projectionParams.push(input.limit);
      const packRows = await context.database.query<{
        content: string;
        proj_type: string;
        source_ref: string | null;
        status: string;
        weight: number;
      }>(
        `
          SELECT proj_type, content, weight, source_ref, status
          FROM mfo_projections
          WHERE ${projectionWhereClauses.join(" AND ")}
          ORDER BY
            CASE proj_type WHEN 'CONSTRAINT' THEN 0 ELSE 1 END,
            weight DESC,
            created_at_unix DESC
          LIMIT ?
        `,
        projectionParams
      );

      const factTerms = input.query.split(/\s+/).filter(Boolean);
      const factWhereClause =
        factTerms.length > 0
          ? `(${factTerms.map(() => "instr(lower(content), lower(?)) > 0").join(" OR ")})`
          : "1 = 0";
      const factScoreSql =
        factTerms.length > 0
          ? factTerms
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
              .join(" + ")
          : "0.0";
      const factScoreParams: unknown[] = [];
      for (const term of factTerms) {
        factScoreParams.push(term, term);
      }

      const factRows = await context.database.query<{
        content: string;
        id: string;
        score: number;
      }>(
        `
          SELECT
            id,
            content,
            ${factScoreSql} AS score
          FROM mfo_facets
          WHERE ${factWhereClause}
            AND (valid_until_unix IS NULL OR valid_until_unix > strftime('%s','now'))
          ORDER BY score DESC, created_at_unix DESC
          LIMIT 5
        `,
        [...factScoreParams, ...factTerms]
      );

      const hasBlockingConstraint = packRows.some(
        (row) => row.proj_type === "CONSTRAINT" && row.status === "blocking"
      );
      const isEmptyPack = packRows.length === 0 && factRows.length === 0;
      const packTextLines = [
        ...packRows.map(
          (row) =>
            `${row.proj_type}${row.status === "blocking" ? "[blocking]" : ""}: ${row.content}`
        ),
        ...factRows.map((row) => `FACT: ${row.content}`)
      ];
      const packText = packTextLines.join("\n");

      let recommendedNextStep: string;
      if (hasBlockingConstraint) {
        recommendedNextStep =
          "Resolve blocking constraints before proceeding. Review the constraint entries in the pack and address each one.";
      } else if (isEmptyPack) {
        recommendedNextStep =
          "No projections or facts were found for this query. " +
          "Call ghostcrab_status to discover your workspace and get routing guidance, " +
          "then build a domain model (ghostcrab_schema_inspect, ghostcrab_ddl_propose) before packing.";
        notes.push(
          "The pack is empty — no projections or matching facts exist for this query and workspace. " +
            "This often means the domain model has not been created yet. " +
            "Call ghostcrab_status for onboarding guidance."
        );
      } else if (factRows.length > 0) {
        recommendedNextStep = "reason_with_pack";
      } else {
        recommendedNextStep =
          "No matching facts were found. Consider adding domain facts with ghostcrab_remember or ghostcrab_upsert, " +
          "or call ghostcrab_status to verify your workspace and schema setup.";
      }

      return createToolSuccessResult("ghostcrab_pack", {
        agent_id: input.agent_id,
        query: input.query,
        backend: "sql",
        scope: input.scope ?? null,
        scope_profile_id_detected: null,
        pack: packRows,
        facts: factRows,
        pack_text: packText,
        token_estimate: Math.ceil(packText.length / 4),
        has_blocking_constraint: hasBlockingConstraint,
        recommended_next_step: recommendedNextStep,
        activity_family_detected: null,
        projection_recipe_used: null,
        kpi_patterns_used: [],
        kpi_snapshots: [],
        facts_mode_applied: "bm25",
        hybrid_weights: {
          bm25: context.retrieval.hybridBm25Weight,
          vector: context.retrieval.hybridVectorWeight
        },
        embedding_runtime: embeddingRuntime,
        item_count: packTextLines.length,
        notes
      });
    }

    const params: unknown[] = [input.agent_id];
    const whereClauses = [
      "agent_id = $1",
      "status IN ('active', 'blocking')",
      "(expires_at IS NULL OR expires_at > now())"
    ];

    if (input.scope) {
      whereClauses.push(
        `(scope = $${params.push(input.scope)} OR scope IS NULL)`
      );
    }

    const limitParam = params.push(input.limit);
    const usePragmaNative =
      context.nativeExtensionsMode !== "sql-only" &&
      context.extensions.pgPragma &&
      input.scope === undefined;

    const fallbackPackQuery = () =>
      context.database.query<{
        content: string;
        proj_type: string;
        source_ref: string | null;
        status: string;
        weight: number;
      }>(
        `
          SELECT proj_type, content, weight, source_ref, status
          FROM mfo_projections
          WHERE ${whereClauses.join(" AND ")}
          ORDER BY
            CASE proj_type WHEN 'CONSTRAINT' THEN 0 ELSE 1 END,
            weight DESC,
            created_at DESC
          LIMIT $${limitParam}
        `,
        params
      );

    const { value: packRows, backend: packBackend } =
      await callNativeOrFallback({
        useNative: usePragmaNative,
        native: () =>
          context.database.query<{
            content: string;
            proj_type: string;
            source_ref: string | null;
            status: string;
            weight: number;
          }>(
            `
            SELECT mp.proj_type,
                   mp.content,
                   mp.weight,
                   mp.source_ref,
                   mp.status
            FROM pragma_pack_context($1::text, $2::text, $3::int) p
            JOIN mfo_projections mp ON mp.id = p.id::uuid
          `,
            [input.agent_id, input.query, input.limit]
          ),
        fallback: fallbackPackQuery
      });

    const activityFamilyRows = await context.database.query<{
      activity_family: string;
      keywords: unknown;
      title: string | null;
    }>(
      `
        SELECT
          facets->>'activity_family' AS activity_family,
          facets->'keywords' AS keywords,
          facets->>'title' AS title
        FROM mfo_facets
        WHERE schema_id = 'ghostcrab:activity-family'
      `
    );

    const detectedActivityFamily = detectActivityFamily({
      families: activityFamilyRows.map((row) => ({
        activity_family: row.activity_family,
        title: row.title,
        keywords: readStringArray(row.keywords)
      })),
      query: input.query,
      scope: input.scope
    });
    const detectedDemoProfileId = detectDemoProfileId({
      query: input.query,
      scope: input.scope
    });

    let projectionRecipe:
      | {
          content: string;
          preferred_kpis: unknown;
          preferred_proj_type: string | null;
          projection_kind: string | null;
        }
      | undefined;
    let kpiPatterns: Array<{
      content: string;
      facet_key: string | null;
      filter_key: string | null;
      filter_value: string | null;
      metric_name: string;
      schema_id: string | null;
    }> = [];
    const kpiSnapshots: Array<{
      buckets: Array<{ bucket: string; count: number }>;
      metric_name: string;
      schema_id: string | null;
      facet_key: string | null;
    }> = [];

    if (detectedActivityFamily) {
      const [projectionRecipeRow] = await context.database.query<{
        content: string;
        preferred_kpis: unknown;
        preferred_proj_type: string | null;
        projection_kind: string | null;
      }>(
        `
          SELECT
            content,
            facets->'preferred_kpis' AS preferred_kpis,
            facets->>'preferred_proj_type' AS preferred_proj_type,
            facets->>'projection_kind' AS projection_kind
          FROM mfo_facets
          WHERE schema_id = 'ghostcrab:projection-recipe'
            AND facets @> $1::jsonb
          ORDER BY created_at DESC
          LIMIT 1
        `,
        [JSON.stringify({ activity_family: detectedActivityFamily })]
      );

      projectionRecipe = projectionRecipeRow;
      kpiPatterns = await context.database.query<{
        content: string;
        facet_key: string | null;
        filter_key: string | null;
        filter_value: string | null;
        metric_name: string;
        schema_id: string | null;
      }>(
        `
          SELECT
            content,
            facets->>'metric_name' AS metric_name,
            facets->>'schema_id' AS schema_id,
            facets->>'facet_key' AS facet_key,
            facets->>'filter_key' AS filter_key,
            facets->>'filter_value' AS filter_value
          FROM mfo_facets
          WHERE schema_id = 'ghostcrab:kpi-pattern'
            AND facets @> $1::jsonb
          ORDER BY created_at ASC
        `,
        [JSON.stringify({ activity_family: detectedActivityFamily })]
      );

      for (const pattern of kpiPatterns) {
        const scopedSchemaId = resolveScopedSchemaId(
          pattern.schema_id,
          detectedDemoProfileId
        );

        if (
          !scopedSchemaId ||
          !pattern.facet_key ||
          !SAFE_FACET_KEY_PATTERN.test(pattern.facet_key)
        ) {
          continue;
        }

        const filterClause =
          pattern.filter_key &&
          pattern.filter_value &&
          SAFE_FACET_KEY_PATTERN.test(pattern.filter_key)
            ? `AND facets @> $2::jsonb`
            : "";
        const snapshotParams: unknown[] = [scopedSchemaId];

        if (filterClause) {
          snapshotParams.push(
            JSON.stringify({ [pattern.filter_key as string]: pattern.filter_value })
          );
        }

        const buckets = await context.database.query<{
          bucket: string;
          count: number;
        }>(
          `
            SELECT
              COALESCE(facets->>'${pattern.facet_key}', 'unknown') AS bucket,
              COUNT(*)::int AS count
            FROM mfo_facets
            WHERE schema_id = $1
              AND (valid_until IS NULL OR valid_until > CURRENT_DATE)
              ${filterClause}
            GROUP BY bucket
            ORDER BY count DESC, bucket ASC
            LIMIT 10
          `,
          snapshotParams
        );

        kpiSnapshots.push({
          metric_name: pattern.metric_name,
          schema_id: scopedSchemaId,
          facet_key: pattern.facet_key,
          buckets
        });
      }
    }

    const factQueryParams: unknown[] = [input.query];
    let factScoreExpression = `ts_rank(bm25_vector, plainto_tsquery('english', $1))`;
    let factWhereClause = `
        WHERE bm25_vector @@ plainto_tsquery('english', $1)
          AND (valid_until IS NULL OR valid_until > CURRENT_DATE)
      `;
    let modeApplied = "bm25";

    if (embeddingRuntime.vectorSearchReady) {
      try {
        const [queryEmbedding] = await context.embeddings.embedMany([
          input.query
        ]);

        if (queryEmbedding.length > 0) {
          factQueryParams.push(formatPgVector(queryEmbedding));
          factScoreExpression = `((${context.retrieval.hybridBm25Weight} * COALESCE(ts_rank(bm25_vector, plainto_tsquery('english', $1)), 0.0)) + (${context.retrieval.hybridVectorWeight} * COALESCE(1 - (embedding <=> $2::vector), 0.0)))`;
          factWhereClause = `
        WHERE (bm25_vector @@ plainto_tsquery('english', $1) OR embedding IS NOT NULL)
          AND (valid_until IS NULL OR valid_until > CURRENT_DATE)
      `;
          modeApplied = "hybrid";
        }
      } catch (error) {
        embeddingRuntime = context.embeddings.getStatus();
        notes.push(
          `Semantic pack ranking unavailable: ${error instanceof Error ? error.message : "Unknown embeddings error"} Falling back to BM25 facts.`
        );
      }
    }

    const factRows = await context.database.query<{
      content: string;
      id: string;
      score: number;
    }>(
      `
        SELECT
          id,
          content,
          ${factScoreExpression} AS score
        FROM mfo_facets
        ${factWhereClause}
        ORDER BY score DESC, created_at DESC
        LIMIT 5
      `,
      factQueryParams
    );

    const hasBlockingConstraint = packRows.some(
      (row) => row.proj_type === "CONSTRAINT" && row.status === "blocking"
    );
    const isEmptyPack = packRows.length === 0 && factRows.length === 0;

    const packTextLines = [
      ...packRows.map(
        (row) =>
          `${row.proj_type}${row.status === "blocking" ? "[blocking]" : ""}: ${row.content}`
      ),
      ...factRows.map((row) => `FACT: ${row.content}`)
    ];

    const packText = packTextLines.join("\n");

    let recommendedNextStep: string;
    if (hasBlockingConstraint) {
      recommendedNextStep =
        "Resolve blocking constraints before proceeding. Review the constraint entries in the pack and address each one.";
    } else if (isEmptyPack) {
      recommendedNextStep =
        "No projections or facts were found for this query. " +
        "Call ghostcrab_status to discover your workspace and get routing guidance, " +
        "then build a domain model (ghostcrab_schema_inspect, ghostcrab_ddl_propose) before packing.";
      notes.push(
        "The pack is empty — no projections or matching facts exist for this query and workspace. " +
          "This often means the domain model has not been created yet. " +
          "Call ghostcrab_status for onboarding guidance."
      );
    } else if (factRows.length > 0) {
      recommendedNextStep = "reason_with_pack";
    } else {
      recommendedNextStep =
        "No matching facts were found. Consider adding domain facts with ghostcrab_remember or ghostcrab_upsert, " +
        "or call ghostcrab_status to verify your workspace and schema setup.";
    }

    return createToolSuccessResult("ghostcrab_pack", {
      agent_id: input.agent_id,
      query: input.query,
      backend: packBackend,
      scope: input.scope ?? null,
      scope_profile_id_detected: detectedDemoProfileId,
      pack: packRows,
      facts: factRows,
      pack_text: packText,
      token_estimate: Math.ceil(packText.length / 4),
      has_blocking_constraint: hasBlockingConstraint,
      recommended_next_step: recommendedNextStep,
      activity_family_detected: detectedActivityFamily,
      projection_recipe_used: projectionRecipe
        ? {
            projection_kind: projectionRecipe.projection_kind,
            preferred_proj_type: projectionRecipe.preferred_proj_type,
            preferred_kpis: readStringArray(projectionRecipe.preferred_kpis),
            content: projectionRecipe.content
          }
        : null,
      kpi_patterns_used: kpiPatterns.map((pattern) => ({
        metric_name: pattern.metric_name,
        schema_id: pattern.schema_id,
        facet_key: pattern.facet_key,
        description: pattern.content
      })),
      kpi_snapshots: kpiSnapshots,
      facts_mode_applied: modeApplied,
      hybrid_weights: {
        bm25: context.retrieval.hybridBm25Weight,
        vector: context.retrieval.hybridVectorWeight
      },
      embedding_runtime: embeddingRuntime,
      item_count: packTextLines.length,
      notes
    });
  }
};

registerTool(packTool);
