import { z } from "zod";

import {
  runStandaloneGhostcrabPack,
  runStandaloneGhostcrabSearch
} from "../../db/standalone-mindbrain.js";
import { FACETS_SEARCH_TABLE_ID } from "../../db/fact-store.js";
import { resolveGhostcrabConfig } from "../../config/env.js";
import {
  createToolSuccessResult,
  registerTool,
  type ToolHandler
} from "../registry.js";
import {
  withAnalysisPlanOverlay,
  type AnalysisPlanOverlay
} from "./answer-artifact-overlay.js";

interface FactRow {
  content: string;
  id: string;
  score: number;
}

export const PackInput = z.object({
  query: z.string().trim().min(1).max(4_096),
  agent_id: z.string().min(1).default("agent:self"),
  scope: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(15),
  workspace_id: z.string().min(1).optional(),
  schema_id: z.string().min(1).optional()
});

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
        },
        workspace_id: {
          type: "string",
          description:
            "Target workspace id. Overrides session context for this call only."
        },
        schema_id: {
          type: "string",
          description:
            "Schema filter for facts retrieval. Overrides session schema_id for this call only."
        }
      }
    }
  },
  async handler(args, context) {
    const input = PackInput.parse(args);
    const effectiveWorkspaceId =
      input.workspace_id ?? context.session.workspace_id;
    const effectiveSchemaId =
      input.schema_id ?? context.session.schema_id ?? undefined;
    const embeddingRuntime = context.embeddings.getStatus();
    const notes: string[] = [];

    const config = resolveGhostcrabConfig();
type PackRow = {
  id?: string;
  content: string;
  proj_type: string;
  source_ref: string | null;
  status: string;
  weight: number;
} & AnalysisPlanOverlay;

    let packBackend: "native" | "sql" = "native";
    let packRows: PackRow[];

    try {
      const nativeRows = await runStandaloneGhostcrabPack({
        mindbrainUrl: config.mindbrainUrl,
        agentId: input.agent_id,
        query: input.query,
        scope: input.scope,
        limit: input.limit
      });
      packRows = nativeRows.map((row) =>
        row.artifact_kind ? (row as PackRow) : withAnalysisPlanOverlay(row)
      );
    } catch (error) {
      packBackend = "sql";
      notes.push(
        `MindBrain native pack endpoint unavailable: ${error instanceof Error ? error.message : "Unknown backend error"} Falling back to SQL pack queries.`
      );
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
      const sqlRows = await context.database.query<{
        content: string;
        proj_type: string;
        source_ref: string | null;
        status: string;
        weight: number;
      }>(
        `
          SELECT proj_type, content, weight, source_ref, status
          FROM mb_pragma.projections
          WHERE ${projectionWhereClauses.join(" AND ")}
          ORDER BY
            CASE proj_type WHEN 'CONSTRAINT' THEN 0 ELSE 1 END,
            weight DESC,
            created_at_unix DESC
          LIMIT ?
        `,
        projectionParams
      );
      packRows = sqlRows.map((row) => withAnalysisPlanOverlay(row));
    }

    // Phase 2: hybrid BM25+vector fact retrieval via MindBrain ghostcrab/search.
    // Attempt to compute a query embedding for richer vector scoring; fall back
    // to BM25-only (empty embedding) when embeddings are unavailable.
    let queryEmbedding: number[] = [];
    if (embeddingRuntime.writeEmbeddingsEnabled) {
      try {
        const [vec] = await context.embeddings.embedMany([input.query]);
        if (vec && vec.length > 0) queryEmbedding = vec;
      } catch {
        // non-fatal: BM25-only search will still run
      }
    }

    let factRows: FactRow[] = [];
    const factsModeApplied = "mindbrain_hybrid";

    try {
      const searchResponse = await runStandaloneGhostcrabSearch({
        mindbrainUrl: config.mindbrainUrl,
        workspaceId: effectiveWorkspaceId,
        tableId: FACETS_SEARCH_TABLE_ID,
        query: input.query,
        embedding: queryEmbedding,
        vectorWeight: context.retrieval.hybridVectorWeight,
        limit: 5
      });

      if (searchResponse.matches.length > 0) {
        factRows = await fetchFacetsByDocIds(
          context.database,
          searchResponse.matches,
          effectiveSchemaId
        );
      }
    } catch (error) {
      notes.push(
        `Pack facts: ghostcrab/search failed (${error instanceof Error ? error.message : "unknown error"}); no facts added.`
      );
    }

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
      workspace_id: effectiveWorkspaceId,
      schema_id: effectiveSchemaId ?? null,
      backend: packBackend,
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
      facts_mode_applied: factsModeApplied,
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

async function fetchFacetsByDocIds(
  database: import("../../db/client.js").Queryable,
  matches: Array<{ doc_id: number; combined_score: number }>,
  schemaId: string | undefined
): Promise<FactRow[]> {
  const docIds = matches.map((m) => m.doc_id);
  const scoreByDocId = new Map(
    matches.map((m) => [m.doc_id, m.combined_score])
  );

  const whereClauses = [
    `doc_id IN (${docIds.map(() => "?").join(", ")})`,
    "(valid_until_unix IS NULL OR valid_until_unix > strftime('%s','now'))"
  ];
  const sqlParams: unknown[] = [...docIds];

  if (schemaId) {
    whereClauses.push("schema_id = ?");
    sqlParams.push(schemaId);
  }

  const rows = await database.query<{
    id: string;
    content: string;
    doc_id: number;
  }>(
    `SELECT id, content, doc_id FROM mb_pragma.agent_facts WHERE ${whereClauses.join(" AND ")}`,
    sqlParams
  );

  return rows
    .map((row) => ({
      id: row.id,
      content: row.content,
      score: scoreByDocId.get(Number(row.doc_id)) ?? 0
    }))
    .sort((a, b) => b.score - a.score);
}

registerTool(packTool);
