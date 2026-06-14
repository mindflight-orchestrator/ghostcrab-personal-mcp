import type {
  AlternativeRoute,
  BusinessCapability,
  BusinessIntent,
  ExecutionStep,
  Gap,
  RankedCapabilityScore,
  RouteDecision,
  RouteMode,
  Availability
} from "./types.js";
import { ROUTE_THRESHOLDS } from "./router-thresholds.js";

type RankedRoute = { capability: BusinessCapability; score: number };

const MODE_ORDER: Record<RouteMode, number> = {
  answer_snapshot: 4,
  live_answer_view: 3,
  live_query: 5,
  analysis_plan: 2,
  gap_report: 1,
  clarification: 0
};

function toRouteMode(availability: Availability | undefined): RouteMode {
  if (
    availability === "analysis_plan" ||
    availability === "live_answer_view" ||
    availability === "answer_snapshot" ||
    availability === "live_query" ||
    availability === "gap_report"
  ) {
    return availability;
  }

  if (availability === "evidence_pack") {
    return "gap_report";
  }

  return "gap_report";
}

function parseScoreFreshness(value: BusinessCapability["version"]): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function selectExecutableSchema(
  intent: BusinessIntent,
  capability: BusinessCapability
): string {
  const schemas = capability.required_schemas ?? [];
  if (schemas.length === 0) return "unknown";

  if (intent.slots.object === "work_item") {
    const match = schemas.find((schema) => /tache|work[_-]?item/i.test(schema));
    if (match) return match;
  }

  return schemas[0];
}

function matchFacetsForExecution(
  intent: BusinessIntent,
  capability: BusinessCapability
): number {
  const intentFacets = new Set(
    Object.keys(intent.structured_facets ?? intent.slots).filter(
      (key) => key.length > 0
    )
  );
  const requiredFacets = new Set(capability.required_facets ?? []);

  if (requiredFacets.size === 0) return 0;

  const shared = [...intentFacets].filter((candidate) =>
    requiredFacets.has(candidate)
  ).length;

  return shared / Math.min(requiredFacets.size, 5);
}

function compareCandidates(left: RankedRoute, right: RankedRoute): number {
  const scoreDelta = right.score - left.score;
  if (Math.abs(scoreDelta) > 0.0001) return scoreDelta;

  const rightStatus = right.capability.status ?? "active";
  const leftStatus = left.capability.status ?? "active";
  const rightActive = rightStatus === "active" ? 1 : 0;
  const leftActive = leftStatus === "active" ? 1 : 0;
  if (rightActive !== leftActive) return rightActive - leftActive;

  const rightMode = right.capability.availability ?? "gap_report";
  const leftMode = left.capability.availability ?? "gap_report";
  const rightRouteMode = toRouteMode(rightMode);
  const leftRouteMode = toRouteMode(leftMode);
  const rightModeOrder = MODE_ORDER[rightRouteMode];
  const leftModeOrder = MODE_ORDER[leftRouteMode];
  if (rightModeOrder !== leftModeOrder) return rightModeOrder - leftModeOrder;

  const rightFreshness = parseScoreFreshness(right.capability.version);
  const leftFreshness = parseScoreFreshness(left.capability.version);
  if (rightFreshness !== leftFreshness) return rightFreshness - leftFreshness;

  const rightLabel = right.capability.label ?? "";
  const leftLabel = left.capability.label ?? "";
  if (rightLabel !== leftLabel) return rightLabel.localeCompare(leftLabel);

  return right.capability.capability_id.localeCompare(left.capability.capability_id);
}

function bestForMode(
  ranked: RankedRoute[],
  mode: RouteMode
): RankedRoute | undefined {
  return ranked
    .filter((entry) => toRouteMode(entry.capability.availability) === mode)
    .sort(compareCandidates)[0];
}

function buildRouteScores(ranked: RankedRoute[]): RankedCapabilityScore[] {
  return ranked.slice(0, 10).map((entry) => ({
    capability_id: entry.capability.capability_id,
    mode: toRouteMode(entry.capability.availability),
    score: entry.score,
    artifact_id: entry.capability.artifact_id,
    capability_label: entry.capability.label
  }));
}

function buildAlternativeRoutes(
  ranked: RankedRoute[],
  excludeId?: string
): AlternativeRoute[] {
  return ranked
    .filter((entry) => entry.capability.capability_id !== excludeId)
    .slice(0, 4)
    .map((entry) => ({
      mode: toRouteMode(entry.capability.availability),
      capability_id: entry.capability.capability_id,
      schema_id: entry.capability.required_schemas?.[0],
      artifact_id: entry.capability.artifact_id,
      score: entry.score,
      reason: `fallback-${toRouteMode(entry.capability.availability)}`
    }));
}

export function chooseRouteFromScores(params: {
  intent: BusinessIntent;
  ranked: Array<{ capability: BusinessCapability; score: number }>;
}): {
  route: RouteDecision;
  gaps: Gap[];
  route_scores: RankedCapabilityScore[];
  alternative_routes: AlternativeRoute[];
} {
  const { intent, ranked } = params;
  const rankedCandidates = [...ranked].sort(compareCandidates);
  const routeScores = buildRouteScores(rankedCandidates);

  if (intent.id === "ambiguous_fragment") {
    const route: RouteDecision = {
      mode: "clarification",
      suggested_capabilities: rankedCandidates
        .slice(0, 3)
        .map((entry) => entry.capability.capability_id),
      confidence: intent.confidence,
      reason: "The question is too short to route safely. Please add context."
    };

    return {
      route,
      gaps: [
        {
          code: "ambiguous_fragment",
          message:
            "The question does not contain enough information to identify a business domain."
        }
      ],
      route_scores: routeScores,
      alternative_routes: buildAlternativeRoutes(rankedCandidates)
    };
  }

  const snapshotMatch = bestForMode(rankedCandidates, "answer_snapshot");
  if (
    snapshotMatch &&
    snapshotMatch.score >= ROUTE_THRESHOLDS.execution_snapshot_min_score
  ) {
    const route: RouteDecision = {
      mode: "answer_snapshot",
      capability_id: snapshotMatch.capability.capability_id,
      scope: snapshotMatch.capability.scope,
      artifact_id: snapshotMatch.capability.artifact_id,
      schema_id: snapshotMatch.capability.required_schemas?.[0],
      confidence: Math.min(0.95, snapshotMatch.score + 0.2),
      reason: `Matched answer_snapshot capability ${snapshotMatch.capability.capability_id}.`,
      coverage_retained: 1
    };
    return {
      route,
      gaps: [],
      route_scores: routeScores,
      alternative_routes: buildAlternativeRoutes(rankedCandidates, route.capability_id)
    };
  }

  const liveAnswerMatch = bestForMode(rankedCandidates, "live_answer_view");
  if (
    liveAnswerMatch &&
    liveAnswerMatch.score >= ROUTE_THRESHOLDS.execution_live_view_min_score
  ) {
    const route: RouteDecision = {
      mode: "live_answer_view",
      capability_id: liveAnswerMatch.capability.capability_id,
      scope: liveAnswerMatch.capability.scope,
      artifact_id: liveAnswerMatch.capability.artifact_id,
      schema_id: liveAnswerMatch.capability.required_schemas?.[0],
      confidence: Math.min(0.95, liveAnswerMatch.score + 0.2),
      reason: `Matched live_answer_view capability ${liveAnswerMatch.capability.capability_id}.`,
      coverage_retained: 0.8
    };
    return {
      route,
      gaps: [],
      route_scores: routeScores,
      alternative_routes: buildAlternativeRoutes(rankedCandidates, route.capability_id)
    };
  }

  if (intent.id === "creation_request" || intent.id === "composite_request") {
    const route: RouteDecision = {
      mode: "gap_report",
      capability_id: rankedCandidates[0]?.capability.capability_id,
      confidence: 0.55,
      reason:
        "The request describes a new reusable view or composite surface. A structured proposal is needed."
    };
    return {
      route,
      gaps: [
        {
          code: "creation_or_composite_request",
          message:
            "Use the learning proposal to register a new capability."
        }
      ],
      route_scores: routeScores,
      alternative_routes: buildAlternativeRoutes(rankedCandidates, route.capability_id)
    };
  }

  const liveQueryMatch = rankedCandidates.find(({ score, capability }) => {
    if (score < ROUTE_THRESHOLDS.execution_live_query_min_score) return false;
    if ((capability.required_schemas ?? []).length === 0) return false;
    if (matchFacetsForExecution(intent, capability) < ROUTE_THRESHOLDS.live_query_min_coverage)
      return false;
    if (capability.activation_status === "pending_review") return false;
    return true;
  });

  if (liveQueryMatch) {
    return {
      route: {
        mode: "live_query",
        schema_id: selectExecutableSchema(intent, liveQueryMatch.capability),
        confidence: 0.78,
        reason: "Facts expose matching filters for a live execution path.",
        coverage_retained: matchFacetsForExecution(intent, liveQueryMatch.capability)
      },
      gaps: [],
      route_scores: routeScores,
      alternative_routes: buildAlternativeRoutes(rankedCandidates)
    };
  }

  const analysisPlanMatch = bestForMode(rankedCandidates, "analysis_plan");
  if (
    analysisPlanMatch &&
    analysisPlanMatch.score >= ROUTE_THRESHOLDS.analysis_plan_min_score
  ) {
    const route: RouteDecision = {
      mode: "analysis_plan",
      capability_id: analysisPlanMatch.capability.capability_id,
      scope: analysisPlanMatch.capability.scope,
      artifact_id: analysisPlanMatch.capability.artifact_id,
      schema_id: analysisPlanMatch.capability.required_schemas?.[0],
      confidence: Math.min(0.95, analysisPlanMatch.score + 0.2),
      reason: `Matched analysis_plan capability ${analysisPlanMatch.capability.capability_id}.`,
      coverage_retained: 0.55
    };
    return {
      route,
      gaps: [],
      route_scores: routeScores,
      alternative_routes: buildAlternativeRoutes(rankedCandidates, route.capability_id)
    };
  }

  if (analysisPlanMatch) {
    const route: RouteDecision = {
      mode: "gap_report",
      capability_id: analysisPlanMatch.capability.capability_id,
      scope: analysisPlanMatch.capability.scope,
      confidence: Math.max(0.52, analysisPlanMatch.score),
      reason:
        "An analysis plan exists, but no executable materialized answer or fact rows cover the requested slots.",
      coverage_retained: 0.25
    };

    return {
      route,
      gaps: [
        {
          code: "missing_materialized_answer",
          message: "No answer_snapshot, live_answer_view, or observable fact rows cover the requested slots.",
          missing: ["answer_snapshot", "live_answer_view", "live_query_rows"]
        }
      ],
      route_scores: routeScores,
      alternative_routes: buildAlternativeRoutes(rankedCandidates, route.capability_id)
    };
  }

  if (rankedCandidates.length === 0 && intent.confidence < 0.45) {
    const route: RouteDecision = {
      mode: "clarification",
      confidence: intent.confidence,
      reason: "The business intent is too ambiguous to route safely."
    };

    return {
      route,
      gaps: [
        {
          code: "ambiguous_intent",
          message: "Clarify the object, period, or expected answer shape."
        }
      ],
      route_scores: routeScores,
      alternative_routes: []
    };
  }

  return {
    route: {
      mode: "gap_report",
      confidence: ROUTE_THRESHOLDS.fallback_clarification_confidence,
      reason: "No matching business capability was found."
    },
    gaps: [
      {
        code: "missing_capability",
        message:
          "No registered capability covers this business question."
      }
    ],
    route_scores: routeScores,
    alternative_routes: buildAlternativeRoutes(rankedCandidates)
  };
}

export function buildPlan(
  route: RouteDecision,
  intent: BusinessIntent
): ExecutionStep[] {
  if (route.mode === "live_query") {
    const structured = intent.structured_facets ?? intent.slots;
    return [
      {
        id: "normalize_question",
        action: "Normalize question into deterministic intent and slots."
      },
      {
        id: "query_facts",
        action: "Read current facts by schema and exact facets.",
        tool: "ghostcrab_search",
        params: {
          schema_id: route.schema_id ?? "unknown",
          filters: {
            demo_week: structured.demo_week,
            week_number: structured.week_number,
            status: structured.status,
            owner: structured.owner,
            project: structured.project,
            team: structured.team
          }
        }
      }
    ];
  }

  return [
    {
      id: "normalize_question",
      action: "Normalize question into deterministic intent and slots."
    },
    {
      id: "select_route",
      action: `Select ${route.mode} route from runtime inventories.`
    }
  ];
}
