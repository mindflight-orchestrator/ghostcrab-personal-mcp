import { z } from "zod";

import {
  createToolErrorFromException,
  createToolSuccessResult,
  registerTool,
  type ToolExecutionContext,
  type ToolHandler
} from "../registry.js";
import { createLearningProposal } from "../business-query-learning/index.js";
import { DEFAULT_MATCH_LIMIT, MAX_MATCH_LIMIT } from "./router-thresholds.js";
import { loadRuntimeCapabilities } from "./loader.js";
import { rankCapabilities } from "./matcher.js";
import { normalizeBusinessQuestion } from "./normalizer.js";
import { buildPlan, chooseRouteFromScores } from "./planner.js";
import type { BusinessIntent, BusinessQueryResult } from "./types.js";
import { ACTIVE_FACT_WINDOW_SQL } from "../../db/temporal.js";

const LIVE_QUERY_FACET_WHITELIST = new Set([
  "demo_week",
  "status",
  "week_number",
  "project",
  "team",
  "owner",
  "object",
  "order",
  "limit",
  "artifact_id"
]);

const BusinessQueryAnswerInput = z
  .object({
    workspace_id: z.string().trim().min(1).optional(),
    question: z.string().trim().min(1).max(4096),
    explain_route: z.boolean().default(false),
    dry_run: z.boolean().default(false)
  })
  .strict();

type LiveFilterResult = {
  where: string;
  params: unknown[];
  applied: string[];
  skipped: string[];
  limit: number;
  order: "asc" | "desc";
};

function normalizeFacetValue(value: unknown): string | number | boolean | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) return null;
    if (trimmed.length > 80) return trimmed.slice(0, 80);
    return trimmed;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  return null;
}

export function composeIntentFacets(intent: BusinessIntent): {
  filters: Record<string, unknown>;
  applied: string[];
  skipped: string[];
} {
  const structured = intent.structured_facets ?? intent.slots;
  const filters: Record<string, unknown> = {};
  const applied: string[] = [];
  const skipped: string[] = [];

  for (const [key, value] of Object.entries(structured)) {
    if (!LIVE_QUERY_FACET_WHITELIST.has(key)) {
      skipped.push(key);
      continue;
    }

    if (key === "limit" || key === "order" || key === "scope") {
      continue;
    }

    if (Array.isArray(value)) {
      if (value.length === 0) {
        skipped.push(key);
        continue;
      }
      const first = value[0];
      if (!first) {
        skipped.push(key);
        continue;
      }
      const normalized = normalizeFacetValue(first);
      if (normalized === null) {
        skipped.push(key);
        continue;
      }
      filters[key] = normalized;
      applied.push(key);
      continue;
    }

    if (value === null || value === undefined) {
      skipped.push(key);
      continue;
    }

    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      const normalized = normalizeFacetValue(value);
      if (normalized === null) {
        skipped.push(key);
        continue;
      }
      filters[key] = normalized;
      applied.push(key);
      continue;
    }

    skipped.push(key);
  }

  return { filters, applied, skipped };
}

export function buildLiveFilterQuery(intent: BusinessIntent): LiveFilterResult {
  const { filters, applied, skipped } = composeIntentFacets(intent);
  const whereClauses: string[] = [
    ACTIVE_FACT_WINDOW_SQL
  ];
  const whereParams: unknown[] = [];

  for (const [key, value] of Object.entries(filters)) {
    whereClauses.push(`json_extract(facets_json, '$.${key}') = ?`);
    whereParams.push(value);
  }

  const structured = intent.structured_facets ?? intent.slots;
  const rawLimit =
    typeof structured.limit === "number" && Number.isFinite(structured.limit)
      ? structured.limit
      : DEFAULT_MATCH_LIMIT;
  const limit = Math.max(1, Math.min(MAX_MATCH_LIMIT, Math.trunc(rawLimit)));

  const order =
    typeof structured.order === "string" && /^asc$/i.test(structured.order)
      ? "asc"
      : "desc";

  return {
    where: whereClauses.join(" AND "),
    params: whereParams,
    applied,
    skipped,
    limit,
    order
  };
}

export async function readLiveRows(params: {
  context: ToolExecutionContext;
  intent: BusinessIntent;
  schemaId: string;
  dryRun: boolean;
}): Promise<{
  rows: Array<{
    id: string;
    content: string;
    schema_id: string;
    facets: Record<string, unknown>;
    created_at_unix: number;
    version: number;
  }>;
  applied_facets: string[];
  skipped_facets: string[];
}> {
  const { context, intent, schemaId, dryRun } = params;
  if (dryRun) {
    const prepared = buildLiveFilterQuery(intent);
    return {
      rows: [],
      applied_facets: prepared.applied,
      skipped_facets: prepared.skipped
    };
  }

  const built = buildLiveFilterQuery(intent);
  if (Object.keys(intent.structured_facets ?? intent.slots).length === 0) {
    return {
      rows: [],
      applied_facets: built.applied,
      skipped_facets: built.skipped
    };
  }

  if (schemaId === "unknown") {
    return {
      rows: [],
      applied_facets: built.applied,
      skipped_facets: built.skipped
    };
  }

  const query = `
    SELECT id, content, schema_id, facets_json, created_at_unix, version
    FROM agent_facts
    WHERE schema_id = ? AND ${built.where}
    ORDER BY created_at_unix ${built.order}
    LIMIT ?
  `;
  const queryParams = [schemaId, ...built.params, built.limit];

  const rows = await context.database.query<{
    id: string;
    content: string;
    schema_id: string;
    facets_json: string;
    created_at_unix: number;
    version: number;
  }>(query, queryParams);

  return {
    rows: rows.map((row) => ({
      id: row.id,
      content: row.content,
      schema_id: row.schema_id,
      facets: safeParse(row.facets_json),
      created_at_unix: row.created_at_unix,
      version: row.version
    })),
    applied_facets: built.applied,
    skipped_facets: built.skipped
  };
}

function safeParse(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return {};
  }
  return {};
}

export async function answerBusinessQuery(params: {
  context: ToolExecutionContext;
  input: z.infer<typeof BusinessQueryAnswerInput>;
}): Promise<BusinessQueryResult> {
  const { context, input } = params;
  const intent = normalizeBusinessQuestion(input.question);
  const workspaceId = input.workspace_id ?? context.session.workspace_id;
  if (!workspaceId) {
    throw new Error(
      "workspace_id is required when no workspace is active in the current session."
    );
  }

  const { capabilities, evidence } = await loadRuntimeCapabilities({
    context,
    workspaceId,
    limit: 120
  });
  const ranked = rankCapabilities(intent, capabilities, input.question);
  const { route, gaps, route_scores, alternative_routes } =
    chooseRouteFromScores({ intent, ranked });

  const liveQueryResult = await readLiveRows({
    context,
    intent,
    schemaId: route.schema_id ?? "unknown",
    dryRun: input.dry_run
  });

  const duplicateScore = ranked[0]?.score ?? 0;
  const learningProposal = createLearningProposal({
    workspaceId,
    question: input.question,
    intent,
    duplicateScore
  });

  const result: BusinessQueryResult = {
    intent,
    route,
    route_reason: route.reason,
    route_scores,
    alternative_routes,
    coverage_retained: route.coverage_retained,
    evidence: evidence.slice(0, input.explain_route ? 25 : 10),
    gaps,
    plan: buildPlan(route, intent)
  };

  if (route.mode === "live_query") {
    result.answer = {
      type: "list",
      rows: liveQueryResult.rows,
      summary: `${liveQueryResult.rows.length} matching work item(s) found.`
    };
    result.applied_live_facets = liveQueryResult.applied_facets;
    result.skipped_live_facets = liveQueryResult.skipped_facets;
  } else if (route.mode === "analysis_plan") {
    result.answer = {
      type: "projection_contract",
      summary: route.reason
    };
  } else if (route.mode === "gap_report" || route.mode === "clarification") {
    result.answer = {
      type: "gap_report",
      summary: gaps.map((gap) => gap.message).join(" ")
    };
  } else {
    result.answer = {
      type: "summary",
      summary: route.reason
    };
  }

  if (learningProposal) {
    result.learning_proposal = learningProposal;
  }

  return result;
}

export const businessQueryAnswerTool: ToolHandler = {
  definition: {
    name: "ghostcrab_business_query_answer",
    description:
      "Read. Route a natural-language business question to answer_snapshot, live_answer_view, analysis_plan, live_query, gap_report, or clarification using runtime inventories.",
    inputSchema: {
      type: "object",
      required: ["question"],
      properties: {
        workspace_id: {
          type: "string",
          description: "Target workspace id. Overrides session context."
        },
        question: {
          type: "string",
          description: "Business question to normalize and route."
        },
        explain_route: {
          type: "boolean",
          default: false,
          description: "When true, include more evidence references."
        },
        dry_run: {
          type: "boolean",
          default: false,
          description:
            "When true, plan and route without executing live fact reads."
        }
      },
      additionalProperties: false
    }
  },
  async handler(args, context) {
    const input = BusinessQueryAnswerInput.parse(args);
    try {
      const result = await answerBusinessQuery({ context, input });
      return createToolSuccessResult("ghostcrab_business_query_answer", {
        workspace_id: input.workspace_id ?? context.session.workspace_id,
        question: input.question,
        ...result
      });
    } catch (error) {
      return createToolErrorFromException(
        "ghostcrab_business_query_answer",
        error,
        "business_query_route_error",
        "Failed to route business query."
      );
    }
  }
};

registerTool(businessQueryAnswerTool);
