export type RouteMode =
  | "answer_snapshot"
  | "analysis_plan"
  | "live_answer_view"
  | "live_query"
  | "gap_report"
  | "clarification";

export type Availability =
  | "analysis_plan"
  | "live_answer_view"
  | "answer_snapshot"
  | "evidence_pack"
  | "live_query"
  | "gap_report";

export type StructuredFacetValue = string | number | boolean | string[] | null;

export interface StructuredFacets {
  [key: string]: StructuredFacetValue;
}

export interface BusinessIntent {
  id: string;
  label: string;
  slots: Record<string, unknown>;
  structured_facets?: StructuredFacets;
  canonical_phrase?: string;
  intent_type?: string;
  flags?: {
    [key: string]: unknown;
  };
  confidence: number;
}

export interface BusinessCapability {
  capability_id: string;
  workspace_id?: string;
  label?: string;
  business_question?: string;
  example_queries?: string[];
  required_schemas?: string[];
  required_facets?: string[];
  required_edges?: string[];
  scope?: string | null;
  agent_id?: string | null;
  artifact_kind?: Availability | string;
  availability: Availability;
  fallback_mode?: RouteMode;
  source: string;
  status?: string;
  version?: number | string;
  artifact_id?: string;
  proposal_fingerprint?: string;
  projection_id?: string | null;
  activation_status?: "active" | "pending_review";
  payload?: Record<string, unknown>;
  schema_id?: string;
  score_freshness?: number;
}

export interface EvidenceRef {
  source: string;
  ref: string;
  kind: string;
  confidence?: number;
  note?: string;
}

export interface Gap {
  code: string;
  message: string;
  missing?: string[];
}

export interface ExecutionStep {
  id: string;
  action: string;
  tool?: string;
  params?: Record<string, unknown>;
}

export interface RouteDecision {
  mode: RouteMode;
  capability_id?: string;
  scope?: string | null;
  artifact_id?: string;
  schema_id?: string;
  confidence: number;
  reason: string;
  suggested_capabilities?: string[];
  coverage_retained?: number;
}

export interface RankedCapabilityScore {
  capability_id: string;
  mode: RouteMode;
  score: number;
  artifact_id?: string;
  capability_label?: string;
}

export interface AlternativeRoute {
  mode: RouteMode;
  capability_id?: string;
  schema_id?: string;
  artifact_id?: string;
  score?: number;
  reason: string;
}

export interface LearningProposal {
  proposal_id: string;
  proposal_kind: "single_capability" | "composite_projection_candidate";
  capability: BusinessCapability;
  intent_signature?: string;
  proposed_facets?: StructuredFacets;
  evidence_count?: number;
  confidence_tier?: "low" | "medium" | "high";
  reason: string;
  status: "proposed";
}

export interface BusinessQueryResult {
  intent: BusinessIntent;
  route: RouteDecision;
  plan: ExecutionStep[];
  answer?: {
    type: "list" | "summary" | "projection_contract" | "gap_report";
    rows?: unknown[];
    summary?: string;
  };
  evidence: EvidenceRef[];
  route_reason?: string;
  route_scores?: RankedCapabilityScore[];
  alternative_routes?: AlternativeRoute[];
  applied_live_facets?: string[];
  skipped_live_facets?: string[];
  coverage_retained?: number;
  gaps: Gap[];
  learning_proposal?: LearningProposal;
}
