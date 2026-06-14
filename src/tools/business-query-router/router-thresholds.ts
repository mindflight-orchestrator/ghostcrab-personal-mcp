export const ROUTE_THRESHOLDS = {
  execution_snapshot_min_score: 0.36,
  execution_live_view_min_score: 0.36,
  execution_live_query_min_score: 0.36,
  analysis_plan_min_score: 0.36,
  live_query_min_coverage: 0.5,
  fallback_clarification_confidence: 0.42
} as const;

export const DEFAULT_MATCH_LIMIT = 25;
export const MAX_MATCH_LIMIT = 100;
