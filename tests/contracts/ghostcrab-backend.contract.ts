/**
 * Single source of truth for the GhostCrab production backend HTTP surface.
 *
 * Tests and CLI usage drift guards read this contract — lab-only MindBrain routes
 * belong in ../mindbrain tests, not here.
 */

export type HttpMethod = "GET" | "POST";

export interface BackendRouteSpec {
  method: HttpMethod;
  /** Path only; query strings belong in docs as `path?param=...` on documented routes. */
  path: string;
}

export interface GhostcrabBackendContract {
  service: "ghostcrab-backend";
  enableLabRoutes: false;
  /** Routes listed in `ghostcrab-backend` CLI usage (operator-facing docs). */
  documentedRoutes: readonly BackendRouteSpec[];
  /** Routes the GhostCrab TS/MCP stack requires from MindBrain at runtime. */
  requiredRoutes: readonly BackendRouteSpec[];
  /** MindBrain lab routes that must never appear on the GhostCrab embedder surface. */
  forbiddenRoutes: readonly BackendRouteSpec[];
  /** Substrings that must not appear under `cmd/backend/`. */
  forbiddenEmbedderPatterns: readonly string[];
  requiredCapabilities: {
    kind: "mindbrain_capabilities";
    features: Readonly<Record<string, true>>;
  };
}

const route = (method: HttpMethod, path: string): BackendRouteSpec => ({
  method,
  path
});

/** Routes echoed in `cmd/backend/http_server.zig` printUsage(). */
const DOCUMENTED_ROUTES = [
  route("POST", "/api/mindbrain/sql"),
  route("POST", "/api/mindbrain/sql/session/open"),
  route("POST", "/api/mindbrain/sql/session/query"),
  route("POST", "/api/mindbrain/sql/session/close"),
  route("GET", "/api/mindbrain/sql/write-status"),
  route("GET", "/api/mindbrain/search-compact-info"),
  route("GET", "/api/mindbrain/coverage"),
  route("GET", "/api/mindbrain/coverage-by-domain"),
  route("GET", "/api/mindbrain/workspace-export"),
  route("GET", "/api/mindbrain/workspace-export-by-domain"),
  route("GET", "/api/mindbrain/graph-path"),
  route("GET", "/api/mindbrain/traverse"),
  route("GET", "/api/mindbrain/pack"),
  route("GET", "/api/mindbrain/ghostcrab/pack-projections"),
  route("POST", "/api/mindbrain/ghostcrab/artifact"),
  route("GET", "/api/mindbrain/ghostcrab/artifact/{artifact_id}"),
  route("POST", "/api/mindbrain/ghostcrab/artifact/{artifact_id}/refresh"),
  route("GET", "/api/mindbrain/ghostcrab/artifact/{artifact_id}/events")
] as const satisfies readonly BackendRouteSpec[];

/** Runtime routes used by GhostCrab TS beyond the CLI usage block. */
const ADDITIONAL_REQUIRED_ROUTES = [
  route("GET", "/api/mindbrain/capabilities"),
  route("GET", "/api/mindbrain/graph/diagnostics"),
  route("GET", "/api/mindbrain/graph/gap-rules"),
  route("POST", "/api/mindbrain/graph/gap-rules/import"),
  route("POST", "/api/mindbrain/graph/gap-rules/delete"),
  route("POST", "/api/mindbrain/graph/rule-evaluations/run"),
  route("GET", "/api/mindbrain/graph/rule-evaluations"),
  route("GET", "/api/mindbrain/graph/rule-events"),
  route("GET", "/api/mindbrain/graph/subgraph"),
  route("POST", "/api/mindbrain/facts/write"),
  route("POST", "/api/mindbrain/search-embedding-upsert"),
  route("POST", "/api/mindbrain/ghostcrab/search"),
  route("GET", "/api/mindbrain/ghostcrab/projection-get"),
  route("GET", "/api/mindbrain/ghostcrab/graph-search"),
  route("GET", "/api/mindbrain/ghostcrab/projections/relevance"),
  route("GET", "/api/mindbrain/collections/facet-search"),
  route("GET", "/api/mindbrain/ontology/inspect"),
  route("POST", "/api/mindbrain/reindex/graph"),
  route("POST", "/api/mindbrain/reindex/all")
] as const satisfies readonly BackendRouteSpec[];

export const GHOSTCRAB_BACKEND_CONTRACT = {
  service: "ghostcrab-backend",
  enableLabRoutes: false,
  documentedRoutes: DOCUMENTED_ROUTES,
  requiredRoutes: [...DOCUMENTED_ROUTES, ...ADDITIONAL_REQUIRED_ROUTES],
  forbiddenRoutes: [
    route("GET", "/api/events"),
    route("GET", "/api/mindbrain/events"),
    route("GET", "/api/mindbrain/simulate")
  ],
  forbiddenEmbedderPatterns: ["demo_firehose", "enable_lab_routes = true"],
  requiredCapabilities: {
    kind: "mindbrain_capabilities",
    features: {
      graph_diagnostics: true,
      graph_gap_rules: true,
      graph_gap_rules_import: true,
      graph_gap_rules_delete: true,
      graph_rule_evaluations: true,
      graph_rule_evaluations_run: true,
      graph_rule_events: true,
      graph_pattern_query: true,
      live_answer_view_create: true,
      ontology_inspect: true
    }
  }
} as const satisfies GhostcrabBackendContract;
