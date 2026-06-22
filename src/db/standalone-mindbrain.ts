import { URL } from "node:url";

export interface MindbrainSqlResponse {
  ok: true;
  columns: string[];
  rows: unknown[][];
  changes: number;
  last_insert_rowid?: number;
}

export interface MindbrainSqlSessionOpenResponse {
  ok: true;
  session_id: number;
}

export interface MindbrainSqlSessionCloseResponse {
  ok: true;
  session_id: number;
  committed: boolean;
}

export interface StandaloneTraverseParams {
  mindbrainUrl: string;
  timeoutMs?: number;
  start: string;
  direction: "outbound" | "inbound";
  edgeLabels: string[];
  depth: number;
  target?: string;
  workspaceId: string;
}

export interface StandaloneTraverseRow {
  node_id: string;
  node_label: string;
  node_type: string;
  metadata_json: string;
  edge_label: string | null;
  depth: number;
  path: string[];
}

export interface StandaloneTraverseResult {
  target_found: boolean;
  rows: StandaloneTraverseRow[];
}

export interface StandaloneWorkspaceExportParams {
  mindbrainUrl: string;
  timeoutMs?: number;
  workspaceId: string;
}

export interface StandaloneCoverageParams {
  mindbrainUrl: string;
  timeoutMs?: number;
  domainOrWorkspace: string;
  entityTypes?: string[];
}

export interface StandalonePackParams {
  mindbrainUrl: string;
  timeoutMs?: number;
  userId: string;
  query: string;
  scope?: string;
  limit: number;
}

export interface StandaloneGhostcrabPackParams {
  mindbrainUrl: string;
  timeoutMs?: number;
  workspaceId?: string;
  agentId: string;
  query: string;
  scope?: string;
  limit: number;
}

export interface StandaloneGhostcrabPackRow {
  id: string;
  proj_type: string;
  content: string;
  weight: number;
  source_ref: string | null;
  status: string;
  artifact_kind?: "analysis_plan";
  legacy_kind?: "projection_type_a";
  public_label?: string;
}

export interface StandaloneGhostcrabProjectionGetParams {
  mindbrainUrl: string;
  timeoutMs?: number;
  workspaceId: string;
  collectionId?: string;
  projectionId: string;
  includeEvidence: boolean;
  includeDeltas: boolean;
}

export interface StandaloneGhostcrabProjectionEntityRow {
  entity_id: number;
  entity_type: string;
  name: string;
  confidence: number;
  metadata_json: string;
}

export interface StandaloneGhostcrabProjectionEvidenceRow {
  relation_id: number | string;
  relation_type: string;
  source_id: number;
  target_id: number;
  relation_metadata_json: string;
  evidence_entity_id: number;
  evidence_entity_type: string;
  evidence_name: string;
  evidence_confidence: number;
  evidence_metadata_json: string;
}

export interface StandaloneGhostcrabProjectionGetResponse {
  workspace_id: string;
  projection_id: string;
  artifact_kind?: "answer_snapshot";
  legacy_kind?: "projection_type_b";
  projection_results: StandaloneGhostcrabProjectionEntityRow[];
  linked_evidence: StandaloneGhostcrabProjectionEvidenceRow[];
  deltas: StandaloneGhostcrabProjectionEntityRow[];
  report: {
    workspace_id: string;
    collection_id?: string | null;
    projection_id: string;
    artifact_kind?: "answer_snapshot";
    legacy_kind?: "projection_type_b";
    frozen?: boolean;
    terminal?: boolean;
    projection_result_count: number;
    linked_evidence_count: number;
    delta_count: number;
    has_projection: boolean;
  };
}

export interface StandaloneAnswerArtifactRow {
  artifact_id: string;
  slug: string;
  workspace_id: string | null;
  agent_id: string | null;
  scope: string | null;
  artifact_kind:
    | "analysis_plan"
    | "live_answer_view"
    | "answer_snapshot"
    | "evidence_pack";
  public_label: string;
  lifecycle: string;
  state: string;
  current_version: number;
  payload_json: string;
  legacy_ref: string | null;
}

export interface StandaloneAnswerArtifactRefreshResponse {
  ok: true;
  artifact_id: string;
  artifact_kind: string;
  current_version: number;
  state: string;
}

export interface StandaloneAnswerArtifactEventRow {
  event_id: string;
  artifact_id: string;
  event_kind: string;
  from_version: number | null;
  to_version: number | null;
  signal_json: string;
  created_at_unix: number;
}

export interface StandaloneAnswerArtifactGetParams {
  mindbrainUrl: string;
  timeoutMs?: number;
  artifactId: string;
}

export interface StandaloneAnswerArtifactRefreshParams {
  mindbrainUrl: string;
  timeoutMs?: number;
  artifactId: string;
}

export interface StandaloneAnswerArtifactEventsParams {
  mindbrainUrl: string;
  timeoutMs?: number;
  artifactId: string;
  limit?: number;
}

export interface StandaloneAnswerArtifactEventsResponse {
  artifact_id: string;
  event_kind: string;
  events: StandaloneAnswerArtifactEventRow[];
}

export interface StandaloneGhostcrabGraphSearchParams {
  mindbrainUrl: string;
  timeoutMs?: number;
  workspaceId: string;
  collectionId?: string;
  query: string;
  entityTypes: string[];
  metadataFilters: Record<string, unknown>;
  limit: number;
}

export interface StandaloneGhostcrabGraphSearchRow {
  entity_id: number;
  entity_type: string;
  name: string;
  confidence: number;
  metadata_json: string;
  score: number;
}

export interface StandaloneGhostcrabGraphSearchResponse {
  workspace_id: string;
  collection_id?: string | null;
  query: string;
  entity_types: string[];
  returned: number;
  searched_layers: string[];
  rows: StandaloneGhostcrabGraphSearchRow[];
}

export interface StandaloneSearchEmbeddingUpsertParams {
  mindbrainUrl: string;
  timeoutMs?: number;
  tableId: number;
  docId: number;
  embedding: number[];
}

export interface StandaloneGhostcrabSearchParams {
  mindbrainUrl: string;
  timeoutMs?: number;
  workspaceId: string;
  collectionId?: string;
  tableId?: number;
  query: string;
  embedding: number[];
  vectorWeight: number;
  limit: number;
}

export interface StandaloneGhostcrabSearchMatch {
  doc_id: number;
  bm25_score: number;
  vector_score: number;
  combined_score: number;
}

export interface StandaloneGhostcrabSearchResponse {
  workspace_id: string;
  collection_id?: string | null;
  table_id?: number;
  query: string;
  retrieval_mode?: string;
  candidate_limit?: number;
  returned: number;
  matches: StandaloneGhostcrabSearchMatch[];
}

export interface StandaloneFactWriteParams {
  mindbrainUrl: string;
  timeoutMs?: number;
  id?: string;
  workspaceId?: string;
  schemaId: string;
  content: string;
  facetsJson?: string;
  embeddingBlob?: string;
  /** Numeric embedding vector for auto-sync to search_embeddings. */
  embedding?: number[];
  createdBy?: string;
  validFromUnix?: number;
  validUntilUnix?: number;
  sourceRef?: string;
}

export interface StandaloneFactWriteResponse {
  ok: true;
  id: string;
  doc_id: number;
  created: boolean;
  updated: boolean;
}

export interface StandaloneGraphPathParams {
  mindbrainUrl: string;
  timeoutMs?: number;
  workspaceId?: string;
  source: string;
  target: string;
  maxDepth?: number;
  edgeLabels?: string[];
}

export interface StandaloneGraphSubgraphParams {
  mindbrainUrl: string;
  timeoutMs?: number;
  workspaceId?: string;
  seedIds: number[];
  hops?: number;
  edgeTypes?: string[];
}

export interface StandaloneGraphSubgraphEvent {
  seq: number;
  kind: string;
  payload: unknown;
}

export interface StandaloneGraphDiagnosticsParams {
  mindbrainUrl: string;
  timeoutMs?: number;
  workspaceId: string;
  ontologyId?: string;
  limit?: number;
  componentSmallMax?: number;
}

export interface StandaloneGraphDiagnosticsIssue {
  kind: string;
  severity: string;
  label: string;
  suggested_action: string;
  entity_id?: number | null;
  relation_id?: number | null;
  rule_id?: string | null;
  observed_count?: number | null;
  expected_min?: number | null;
  expected_max?: number | null;
}

export interface StandaloneGraphDiagnosticsResponse {
  kind: "graph_diagnostics_report";
  summary: Record<string, unknown>;
  issues: StandaloneGraphDiagnosticsIssue[];
}

export interface StandaloneOntologyReconciliationParams {
  mindbrainUrl: string;
  timeoutMs?: number;
  workspaceId: string;
  ontologyId?: string;
  limit?: number;
}

export interface StandaloneOntologyReconciliationIssue {
  kind: string;
  severity: string;
  section: string;
  label: string;
  suggested_action: string;
}

export interface StandaloneOntologyReconciliationResponse {
  kind: "ontology_reconciliation_report";
  summary: Record<string, unknown>;
  issues: StandaloneOntologyReconciliationIssue[];
}

export interface StandaloneGraphGapRulesParams {
  mindbrainUrl: string;
  timeoutMs?: number;
  workspaceId: string;
  ontologyId?: string;
}

export interface StandaloneGraphGapRule {
  rule_id: string;
  ontology_id: string;
  workspace_id?: string | null;
  entity_type: string;
  relation_type: string;
  direction: "out" | "in" | "either";
  target_entity_type?: string | null;
  min_count: number;
  max_count?: number | null;
  severity: string;
  label: string;
  enabled: boolean;
  metadata?: Record<string, unknown>;
}

export interface StandaloneGraphGapRulesResponse {
  kind: "graph_gap_rules";
  ontology_id: string;
  workspace_id?: string | null;
  rules: StandaloneGraphGapRule[];
}

export interface StandaloneGraphGapRulesImportParams {
  mindbrainUrl: string;
  timeoutMs?: number;
  payload: Record<string, unknown>;
}

export interface StandaloneGraphGapRulesImportResponse {
  ok: true;
  imported: number;
}

export interface StandaloneGraphGapRulesDeleteParams {
  mindbrainUrl: string;
  timeoutMs?: number;
  payload: Record<string, unknown>;
}

export interface StandaloneGraphGapRulesDeleteResponse {
  ok: true;
  deleted: number;
}

export interface StandaloneGraphRuleEvaluationsParams {
  mindbrainUrl: string;
  timeoutMs?: number;
  workspaceId: string;
  ontologyId?: string;
  limit?: number;
}

export interface StandaloneGraphRuleEvaluationsRunParams extends StandaloneGraphRuleEvaluationsParams {
  createRemediationActions?: boolean;
}

export interface StandaloneGraphRuleEvent {
  event_id: string;
  rule_id: string;
  subject_entity_id: number;
  from_state: "unknown" | "valid" | "invalid" | string;
  to_state: "valid" | "invalid" | string;
  observed_count: number;
  expected_min: number;
  expected_max?: number | null;
  idempotency_key: string;
  created_at_unix: number;
}

export interface StandaloneGraphRuleEvaluation {
  rule_id: string;
  subject_entity_id: number;
  state: "valid" | "invalid" | string;
  observed_count: number;
  expected_min: number;
  expected_max?: number | null;
  last_evaluated_at_unix: number;
  updated_at_unix: number;
}

export interface StandaloneGraphRuleEvaluationRunResponse {
  kind: "graph_rule_evaluation_run";
  workspace_id: string;
  ontology_id: string;
  evaluated: number;
  changed: number;
  events_created: number;
  invalid_count: number;
  remediation_actions_created: number;
  events: StandaloneGraphRuleEvent[];
}

export interface StandaloneGraphRuleEvaluationsResponse {
  kind: "graph_rule_evaluations";
  workspace_id: string;
  ontology_id: string;
  evaluations: StandaloneGraphRuleEvaluation[];
}

export interface StandaloneGraphRuleEventsResponse {
  kind: "graph_rule_events";
  workspace_id: string;
  ontology_id: string;
  events: StandaloneGraphRuleEvent[];
}

export interface StandaloneQualityConvergenceRunParams {
  mindbrainUrl: string;
  timeoutMs?: number;
  workspaceId: string;
  ontologyId?: string;
  persist?: boolean;
  limit?: number;
  componentSmallMax?: number;
}

export interface StandaloneQualityConvergenceListParams {
  mindbrainUrl: string;
  timeoutMs?: number;
  workspaceId: string;
  limit?: number;
}

export interface StandaloneQualityConvergenceGetParams {
  mindbrainUrl: string;
  timeoutMs?: number;
  runId: string;
}

export interface StandaloneQualityRemediationActionsParams {
  mindbrainUrl: string;
  timeoutMs?: number;
  runId: string;
  status?: string;
}

export interface StandaloneQualityRemediationDecisionParams {
  mindbrainUrl: string;
  timeoutMs?: number;
  actionId: string;
  decision: "approved" | "rejected";
  actor?: string;
  note?: string;
}

export interface StandaloneQualityRemediationStatusParams {
  mindbrainUrl: string;
  timeoutMs?: number;
  actionId: string;
  status:
    | "proposed"
    | "approved"
    | "rejected"
    | "applied"
    | "failed"
    | "skipped";
  resultJson?: Record<string, unknown>;
}

export interface StandaloneQualityConvergenceReport {
  kind: "quality_convergence_report";
  run_id: string;
  workspace_id: string;
  ontology_id?: string;
  canonical_layer?: string;
  input_fingerprint?: string;
  layers?: Record<string, unknown>;
  remediation?: Record<string, unknown>;
}

export interface StandaloneQualityRunsResponse {
  kind: "quality_convergence_runs";
  workspace_id: string;
  runs: Array<Record<string, unknown>>;
}

export interface StandaloneQualityRemediationActionsResponse {
  kind: "quality_remediation_actions";
  run_id?: string;
  actions: Array<Record<string, unknown>>;
}

export interface StandaloneQualityMutationResponse {
  ok: true;
  action_id: string;
  decision?: string;
  status?: string;
}

export interface StandaloneMindbrainSqlParams {
  mindbrainUrl: string;
  timeoutMs?: number;
  sql: string;
  params?: readonly unknown[];
  sessionId?: number;
  commit?: boolean;
}

export interface MindbrainCapabilitiesResponse {
  kind: string;
  mindbrain_version?: string;
  features: {
    graph_diagnostics?: boolean;
    graph_gap_rules?: boolean;
    graph_gap_rules_import?: boolean;
    graph_gap_rules_delete?: boolean;
    graph_rule_evaluations?: boolean;
    graph_rule_evaluations_run?: boolean;
    graph_rule_events?: boolean;
    quality_convergence?: boolean;
    quality_remediation_actions?: boolean;
    [key: string]: boolean | undefined;
  };
}

export async function probeMindbrainCapabilities(
  mindbrainUrl: string,
  timeoutMs = 1500
): Promise<
  | { ok: true; capabilities: MindbrainCapabilitiesResponse }
  | { ok: false; reason: string }
> {
  const url = new URL(
    "/api/mindbrain/capabilities",
    normalizeBaseUrl(mindbrainUrl)
  );
  try {
    const response = await fetch(
      url,
      withTimeout({ method: "GET" }, timeoutMs)
    );
    if (response.ok) {
      const capabilities =
        (await response.json()) as MindbrainCapabilitiesResponse;
      return { ok: true, capabilities };
    }
  } catch {
    // fall through to legacy route probe
  }

  try {
    const fallback = new URL(
      "/api/mindbrain/graph/gap-rules",
      normalizeBaseUrl(mindbrainUrl)
    );
    fallback.searchParams.set("ontology_id", "__capability_probe__");
    const response = await fetch(
      fallback,
      withTimeout({ method: "GET" }, timeoutMs)
    );
    if (response.status === 404 || response.status === 405) {
      return { ok: false, reason: "missing_graph_gap_routes" };
    }
    return {
      ok: true,
      capabilities: {
        kind: "mindbrain_capabilities",
        features: {
          graph_diagnostics: true,
          graph_gap_rules: true
        }
      }
    };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function runStandaloneTraverse(
  params: StandaloneTraverseParams
): Promise<StandaloneTraverseResult> {
  const url = new URL(
    "/api/mindbrain/traverse",
    normalizeBaseUrl(params.mindbrainUrl)
  );
  url.searchParams.set("start", params.start);
  url.searchParams.set("direction", params.direction);
  url.searchParams.set("depth", String(params.depth));
  if (params.target) {
    url.searchParams.set("target", params.target);
  }
  for (const edgeLabel of params.edgeLabels) {
    url.searchParams.append("edge_label", edgeLabel);
  }
  url.searchParams.set("workspace_id", params.workspaceId);

  return await fetchJson<StandaloneTraverseResult>(
    url,
    { method: "GET" },
    params.timeoutMs
  );
}

export async function runStandaloneWorkspaceExportToon(
  params: StandaloneWorkspaceExportParams
): Promise<string> {
  const url = new URL(
    "/api/mindbrain/workspace-export",
    normalizeBaseUrl(params.mindbrainUrl)
  );
  url.searchParams.set("workspace_id", params.workspaceId);
  return await fetchText(url, { method: "GET" }, params.timeoutMs);
}

export async function runStandaloneCoverageReportToon(
  params: StandaloneCoverageParams
): Promise<string> {
  const url = new URL(
    "/api/mindbrain/coverage-by-domain",
    normalizeBaseUrl(params.mindbrainUrl)
  );
  url.searchParams.set("domain_or_workspace", params.domainOrWorkspace);
  for (const entityType of params.entityTypes ?? []) {
    url.searchParams.append("entity_type", entityType);
  }
  return await fetchText(url, { method: "GET" }, params.timeoutMs);
}

export async function runStandalonePackToon(
  params: StandalonePackParams
): Promise<string> {
  const url = new URL(
    "/api/mindbrain/pack",
    normalizeBaseUrl(params.mindbrainUrl)
  );
  url.searchParams.set("user_id", params.userId);
  url.searchParams.set("query", params.query);
  url.searchParams.set("limit", String(params.limit));
  if (params.scope) {
    url.searchParams.set("scope", params.scope);
  }
  return await fetchText(url, { method: "GET" }, params.timeoutMs);
}

export async function runStandaloneGhostcrabPack(
  params: StandaloneGhostcrabPackParams
): Promise<StandaloneGhostcrabPackRow[]> {
  const url = new URL(
    "/api/mindbrain/ghostcrab/pack-projections",
    normalizeBaseUrl(params.mindbrainUrl)
  );
  url.searchParams.set("agent_id", params.agentId);
  url.searchParams.set("query", params.query);
  url.searchParams.set("limit", String(params.limit));
  if (params.workspaceId) {
    url.searchParams.set("workspace_id", params.workspaceId);
  }
  if (params.scope) {
    url.searchParams.set("scope", params.scope);
  }

  const response = await fetchJson<{
    rows?: StandaloneGhostcrabPackRow[];
  }>(url, { method: "GET" }, params.timeoutMs);
  return Array.isArray(response.rows) ? response.rows : [];
}

export async function runStandaloneGhostcrabProjectionGet(
  params: StandaloneGhostcrabProjectionGetParams
): Promise<StandaloneGhostcrabProjectionGetResponse> {
  const url = new URL(
    "/api/mindbrain/ghostcrab/projection-get",
    normalizeBaseUrl(params.mindbrainUrl)
  );
  url.searchParams.set("workspace_id", params.workspaceId);
  if (params.collectionId) {
    url.searchParams.set("collection_id", params.collectionId);
  }
  url.searchParams.set("projection_id", params.projectionId);
  url.searchParams.set("include_evidence", String(params.includeEvidence));
  url.searchParams.set("include_deltas", String(params.includeDeltas));

  return await fetchJson<StandaloneGhostcrabProjectionGetResponse>(
    url,
    {
      method: "GET"
    },
    params.timeoutMs
  );
}

export async function runStandaloneAnswerArtifactGet(
  params: StandaloneAnswerArtifactGetParams
): Promise<StandaloneAnswerArtifactRow> {
  const url = new URL(
    `/api/mindbrain/ghostcrab/artifact/${encodeURIComponent(params.artifactId)}`,
    normalizeBaseUrl(params.mindbrainUrl)
  );
  return await fetchJson<StandaloneAnswerArtifactRow>(
    url,
    { method: "GET" },
    params.timeoutMs
  );
}

export async function runStandaloneAnswerArtifactRefresh(
  params: StandaloneAnswerArtifactRefreshParams
): Promise<StandaloneAnswerArtifactRefreshResponse> {
  const url = new URL(
    `/api/mindbrain/ghostcrab/artifact/${encodeURIComponent(params.artifactId)}/refresh`,
    normalizeBaseUrl(params.mindbrainUrl)
  );
  return await fetchJson<StandaloneAnswerArtifactRefreshResponse>(
    url,
    { method: "POST" },
    params.timeoutMs
  );
}

export async function runStandaloneAnswerArtifactEvents(
  params: StandaloneAnswerArtifactEventsParams
): Promise<StandaloneAnswerArtifactEventsResponse> {
  const url = new URL(
    `/api/mindbrain/ghostcrab/artifact/${encodeURIComponent(params.artifactId)}/events`,
    normalizeBaseUrl(params.mindbrainUrl)
  );
  if (params.limit !== undefined) {
    url.searchParams.set("limit", String(params.limit));
  }
  const body = await fetchJson<{
    artifact_id: string;
    event_kind: string;
    rows?: StandaloneAnswerArtifactEventRow[];
    events?: StandaloneAnswerArtifactEventRow[];
  }>(url, { method: "GET" }, params.timeoutMs);
  const events = body.rows ?? body.events ?? [];
  return {
    artifact_id: body.artifact_id,
    event_kind: body.event_kind,
    events
  };
}

export async function runStandaloneGhostcrabGraphSearch(
  params: StandaloneGhostcrabGraphSearchParams
): Promise<StandaloneGhostcrabGraphSearchResponse> {
  const url = new URL(
    "/api/mindbrain/ghostcrab/graph-search",
    normalizeBaseUrl(params.mindbrainUrl)
  );
  url.searchParams.set("workspace_id", params.workspaceId);
  url.searchParams.set("query", params.query);
  url.searchParams.set("limit", String(params.limit));
  if (params.collectionId) {
    url.searchParams.set("collection_id", params.collectionId);
  }
  for (const entityType of params.entityTypes) {
    url.searchParams.append("entity_type", entityType);
  }
  if (Object.keys(params.metadataFilters).length > 0) {
    url.searchParams.set(
      "metadata_filters",
      JSON.stringify(params.metadataFilters)
    );
  }

  return await fetchJson<StandaloneGhostcrabGraphSearchResponse>(
    url,
    {
      method: "GET"
    },
    params.timeoutMs
  );
}

export async function runStandaloneSearchEmbeddingUpsert(
  params: StandaloneSearchEmbeddingUpsertParams
): Promise<void> {
  const url = new URL(
    "/api/mindbrain/search-embedding-upsert",
    normalizeBaseUrl(params.mindbrainUrl)
  );
  await fetchJson<{ ok: true }>(
    url,
    {
      method: "POST",
      body: JSON.stringify({
        table_id: params.tableId,
        doc_id: params.docId,
        embedding: params.embedding
      }),
      headers: { "content-type": "application/json" }
    },
    params.timeoutMs
  );
}

export async function runStandaloneGhostcrabSearch(
  params: StandaloneGhostcrabSearchParams
): Promise<StandaloneGhostcrabSearchResponse> {
  const url = new URL(
    "/api/mindbrain/ghostcrab/search",
    normalizeBaseUrl(params.mindbrainUrl)
  );
  return await fetchJson<StandaloneGhostcrabSearchResponse>(
    url,
    {
      method: "POST",
      body: JSON.stringify({
        workspace_id: params.workspaceId,
        collection_id: params.collectionId,
        table_id: params.tableId,
        query: params.query,
        embedding: params.embedding,
        vector_weight: params.vectorWeight,
        limit: params.limit
      }),
      headers: { "content-type": "application/json" }
    },
    params.timeoutMs
  );
}

export async function runStandaloneFactWrite(
  params: StandaloneFactWriteParams
): Promise<StandaloneFactWriteResponse> {
  const url = new URL(
    "/api/mindbrain/facts/write",
    normalizeBaseUrl(params.mindbrainUrl)
  );
  const body: Record<string, unknown> = {
    schema_id: params.schemaId,
    content: params.content
  };
  if (params.id !== undefined) body.id = params.id;
  if (params.workspaceId !== undefined) body.workspace_id = params.workspaceId;
  if (params.facetsJson !== undefined) body.facets_json = params.facetsJson;
  if (params.embeddingBlob !== undefined)
    body.embedding_blob = params.embeddingBlob;
  if (params.embedding !== undefined && params.embedding.length > 0)
    body.embedding = params.embedding;
  if (params.createdBy !== undefined) body.created_by = params.createdBy;
  if (params.validFromUnix !== undefined)
    body.valid_from_unix = params.validFromUnix;
  if (params.validUntilUnix !== undefined)
    body.valid_until_unix = params.validUntilUnix;
  if (params.sourceRef !== undefined) body.source_ref = params.sourceRef;

  return await fetchJson<StandaloneFactWriteResponse>(
    url,
    {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" }
    },
    params.timeoutMs
  );
}

export async function runStandaloneGraphPath(
  params: StandaloneGraphPathParams
): Promise<string> {
  const url = new URL(
    "/api/mindbrain/graph-path",
    normalizeBaseUrl(params.mindbrainUrl)
  );
  url.searchParams.set("source", params.source);
  url.searchParams.set("target", params.target);
  if (params.workspaceId) {
    url.searchParams.set("workspace_id", params.workspaceId);
  }
  if (params.maxDepth !== undefined) {
    url.searchParams.set("max_depth", String(params.maxDepth));
  }
  for (const label of params.edgeLabels ?? []) {
    url.searchParams.append("edge_label", label);
  }
  return await fetchText(url, { method: "GET" }, params.timeoutMs);
}

export async function runStandaloneGraphSubgraph(
  params: StandaloneGraphSubgraphParams
): Promise<StandaloneGraphSubgraphEvent[]> {
  const url = new URL(
    "/api/mindbrain/graph/subgraph",
    normalizeBaseUrl(params.mindbrainUrl)
  );
  url.searchParams.set("seed_ids", params.seedIds.join(","));
  url.searchParams.set("format", "json");
  if (params.workspaceId) {
    url.searchParams.set("workspace_id", params.workspaceId);
  }
  if (params.hops !== undefined) {
    url.searchParams.set("hops", String(params.hops));
  }
  if (params.edgeTypes && params.edgeTypes.length > 0) {
    url.searchParams.set("edge_types", params.edgeTypes.join(","));
  }
  return await fetchJson<StandaloneGraphSubgraphEvent[]>(
    url,
    { method: "GET" },
    params.timeoutMs
  );
}

export async function runStandaloneGraphDiagnostics(
  params: StandaloneGraphDiagnosticsParams
): Promise<StandaloneGraphDiagnosticsResponse> {
  const url = new URL(
    "/api/mindbrain/graph/diagnostics",
    normalizeBaseUrl(params.mindbrainUrl)
  );
  url.searchParams.set("workspace_id", params.workspaceId);
  if (params.ontologyId) {
    url.searchParams.set("ontology_id", params.ontologyId);
  }
  if (params.limit !== undefined) {
    url.searchParams.set("limit", String(params.limit));
  }
  if (params.componentSmallMax !== undefined) {
    url.searchParams.set(
      "component_small_max",
      String(params.componentSmallMax)
    );
  }
  return await fetchJson<StandaloneGraphDiagnosticsResponse>(
    url,
    { method: "GET" },
    params.timeoutMs
  );
}

export async function runStandaloneOntologyReconciliation(
  params: StandaloneOntologyReconciliationParams
): Promise<StandaloneOntologyReconciliationResponse> {
  const url = new URL(
    "/api/mindbrain/ontology/reconciliation",
    normalizeBaseUrl(params.mindbrainUrl)
  );
  url.searchParams.set("workspace_id", params.workspaceId);
  if (params.ontologyId) {
    url.searchParams.set("ontology_id", params.ontologyId);
  }
  if (params.limit !== undefined) {
    url.searchParams.set("limit", String(params.limit));
  }
  return await fetchJson<StandaloneOntologyReconciliationResponse>(
    url,
    { method: "GET" },
    params.timeoutMs
  );
}

export async function runStandaloneGraphGapRules(
  params: StandaloneGraphGapRulesParams
): Promise<StandaloneGraphGapRulesResponse> {
  const url = new URL(
    "/api/mindbrain/graph/gap-rules",
    normalizeBaseUrl(params.mindbrainUrl)
  );
  if (params.workspaceId) {
    url.searchParams.set("workspace_id", params.workspaceId);
  }
  if (params.ontologyId) {
    url.searchParams.set("ontology_id", params.ontologyId);
  }
  return await fetchJson<StandaloneGraphGapRulesResponse>(
    url,
    { method: "GET" },
    params.timeoutMs
  );
}

export async function runStandaloneGraphGapRulesImport(
  params: StandaloneGraphGapRulesImportParams
): Promise<StandaloneGraphGapRulesImportResponse> {
  const url = new URL(
    "/api/mindbrain/graph/gap-rules/import",
    normalizeBaseUrl(params.mindbrainUrl)
  );
  return await fetchJson<StandaloneGraphGapRulesImportResponse>(
    url,
    {
      method: "POST",
      body: JSON.stringify(params.payload),
      headers: { "content-type": "application/json" }
    },
    params.timeoutMs
  );
}

export async function runStandaloneGraphGapRulesDelete(
  params: StandaloneGraphGapRulesDeleteParams
): Promise<StandaloneGraphGapRulesDeleteResponse> {
  const url = new URL(
    "/api/mindbrain/graph/gap-rules/delete",
    normalizeBaseUrl(params.mindbrainUrl)
  );
  return await fetchJson<StandaloneGraphGapRulesDeleteResponse>(
    url,
    {
      method: "POST",
      body: JSON.stringify(params.payload),
      headers: { "content-type": "application/json" }
    },
    params.timeoutMs
  );
}

export async function runStandaloneGraphRuleEvaluationsRun(
  params: StandaloneGraphRuleEvaluationsRunParams
): Promise<StandaloneGraphRuleEvaluationRunResponse> {
  const url = new URL(
    "/api/mindbrain/graph/rule-evaluations/run",
    normalizeBaseUrl(params.mindbrainUrl)
  );
  return await fetchJson<StandaloneGraphRuleEvaluationRunResponse>(
    url,
    {
      method: "POST",
      body: JSON.stringify({
        workspace_id: params.workspaceId,
        ontology_id: params.ontologyId,
        limit: params.limit,
        create_remediation_actions: params.createRemediationActions ?? true
      }),
      headers: { "content-type": "application/json" }
    },
    params.timeoutMs
  );
}

export async function runStandaloneGraphRuleEvaluations(
  params: StandaloneGraphRuleEvaluationsParams
): Promise<StandaloneGraphRuleEvaluationsResponse> {
  const url = new URL(
    "/api/mindbrain/graph/rule-evaluations",
    normalizeBaseUrl(params.mindbrainUrl)
  );
  url.searchParams.set("workspace_id", params.workspaceId);
  if (params.ontologyId) {
    url.searchParams.set("ontology_id", params.ontologyId);
  }
  if (params.limit !== undefined) {
    url.searchParams.set("limit", String(params.limit));
  }
  return await fetchJson<StandaloneGraphRuleEvaluationsResponse>(
    url,
    { method: "GET" },
    params.timeoutMs
  );
}

export async function runStandaloneGraphRuleEvents(
  params: StandaloneGraphRuleEvaluationsParams
): Promise<StandaloneGraphRuleEventsResponse> {
  const url = new URL(
    "/api/mindbrain/graph/rule-events",
    normalizeBaseUrl(params.mindbrainUrl)
  );
  url.searchParams.set("workspace_id", params.workspaceId);
  if (params.ontologyId) {
    url.searchParams.set("ontology_id", params.ontologyId);
  }
  if (params.limit !== undefined) {
    url.searchParams.set("limit", String(params.limit));
  }
  return await fetchJson<StandaloneGraphRuleEventsResponse>(
    url,
    { method: "GET" },
    params.timeoutMs
  );
}

export async function runStandaloneQualityConvergence(
  params: StandaloneQualityConvergenceRunParams
): Promise<StandaloneQualityConvergenceReport> {
  const url = new URL(
    "/api/mindbrain/quality/convergence/run",
    normalizeBaseUrl(params.mindbrainUrl)
  );
  return await fetchJson<StandaloneQualityConvergenceReport>(
    url,
    {
      method: "POST",
      body: JSON.stringify({
        workspace_id: params.workspaceId,
        ...(params.ontologyId ? { ontology_id: params.ontologyId } : {}),
        persist: params.persist ?? true,
        ...(params.limit !== undefined ? { limit: params.limit } : {}),
        ...(params.componentSmallMax !== undefined
          ? { component_small_max: params.componentSmallMax }
          : {})
      }),
      headers: { "content-type": "application/json" }
    },
    params.timeoutMs
  );
}

export async function runStandaloneQualityConvergenceList(
  params: StandaloneQualityConvergenceListParams
): Promise<StandaloneQualityRunsResponse> {
  const url = new URL(
    "/api/mindbrain/quality/convergence/runs",
    normalizeBaseUrl(params.mindbrainUrl)
  );
  url.searchParams.set("workspace_id", params.workspaceId);
  if (params.limit !== undefined) {
    url.searchParams.set("limit", String(params.limit));
  }
  return await fetchJson<StandaloneQualityRunsResponse>(
    url,
    { method: "GET" },
    params.timeoutMs
  );
}

export async function runStandaloneQualityConvergenceGet(
  params: StandaloneQualityConvergenceGetParams
): Promise<StandaloneQualityConvergenceReport> {
  const url = new URL(
    "/api/mindbrain/quality/convergence/run",
    normalizeBaseUrl(params.mindbrainUrl)
  );
  url.searchParams.set("run_id", params.runId);
  return await fetchJson<StandaloneQualityConvergenceReport>(
    url,
    { method: "GET" },
    params.timeoutMs
  );
}

export async function runStandaloneQualityRemediationActions(
  params: StandaloneQualityRemediationActionsParams
): Promise<StandaloneQualityRemediationActionsResponse> {
  const url = new URL(
    "/api/mindbrain/quality/remediation/actions",
    normalizeBaseUrl(params.mindbrainUrl)
  );
  url.searchParams.set("run_id", params.runId);
  if (params.status) {
    url.searchParams.set("status", params.status);
  }
  return await fetchJson<StandaloneQualityRemediationActionsResponse>(
    url,
    { method: "GET" },
    params.timeoutMs
  );
}

export async function runStandaloneQualityRemediationDecision(
  params: StandaloneQualityRemediationDecisionParams
): Promise<StandaloneQualityMutationResponse> {
  const url = new URL(
    "/api/mindbrain/quality/remediation/decision",
    normalizeBaseUrl(params.mindbrainUrl)
  );
  return await fetchJson<StandaloneQualityMutationResponse>(
    url,
    {
      method: "POST",
      body: JSON.stringify({
        action_id: params.actionId,
        decision: params.decision,
        ...(params.actor ? { actor: params.actor } : {}),
        ...(params.note ? { note: params.note } : {})
      }),
      headers: { "content-type": "application/json" }
    },
    params.timeoutMs
  );
}

export async function runStandaloneQualityRemediationStatus(
  params: StandaloneQualityRemediationStatusParams
): Promise<StandaloneQualityMutationResponse> {
  const url = new URL(
    "/api/mindbrain/quality/remediation/status",
    normalizeBaseUrl(params.mindbrainUrl)
  );
  return await fetchJson<StandaloneQualityMutationResponse>(
    url,
    {
      method: "POST",
      body: JSON.stringify({
        action_id: params.actionId,
        status: params.status,
        result_json: JSON.stringify(params.resultJson ?? {})
      }),
      headers: { "content-type": "application/json" }
    },
    params.timeoutMs
  );
}

export async function runStandaloneMindbrainSql(
  params: StandaloneMindbrainSqlParams
): Promise<MindbrainSqlResponse> {
  const path =
    params.sessionId === undefined
      ? "/api/mindbrain/sql"
      : params.commit === undefined
        ? "/api/mindbrain/sql/session/query"
        : "/api/mindbrain/sql/session/close";
  const url = new URL(path, normalizeBaseUrl(params.mindbrainUrl));
  const body =
    params.sessionId === undefined
      ? { sql: params.sql, params: params.params ?? [] }
      : params.commit === undefined
        ? {
            session_id: params.sessionId,
            sql: params.sql,
            params: params.params ?? []
          }
        : { session_id: params.sessionId, commit: params.commit };
  return await fetchJson<MindbrainSqlResponse>(
    url,
    {
      method: "POST",
      body: JSON.stringify(body),
      headers: {
        "content-type": "application/json"
      }
    },
    params.timeoutMs
  );
}

export async function openStandaloneMindbrainSqlSession(
  mindbrainUrl: string,
  timeoutMs?: number
): Promise<number> {
  const url = new URL(
    "/api/mindbrain/sql/session/open",
    normalizeBaseUrl(mindbrainUrl)
  );
  const response = await fetchJson<MindbrainSqlSessionOpenResponse>(
    url,
    {
      method: "POST",
      body: "{}",
      headers: {
        "content-type": "application/json"
      }
    },
    timeoutMs
  );
  return response.session_id;
}

export async function closeStandaloneMindbrainSqlSession(
  mindbrainUrl: string,
  sessionId: number,
  commit: boolean,
  timeoutMs?: number
): Promise<void> {
  const url = new URL(
    "/api/mindbrain/sql/session/close",
    normalizeBaseUrl(mindbrainUrl)
  );
  await fetchJson<MindbrainSqlSessionCloseResponse>(
    url,
    {
      method: "POST",
      body: JSON.stringify({ session_id: sessionId, commit }),
      headers: {
        "content-type": "application/json"
      }
    },
    timeoutMs
  );
}

function formatMindBrainHttpError(
  status: number,
  statusText: string,
  bodyText: string
): string {
  const head = `MindBrain request failed (${String(status)} ${statusText})`;
  const raw = (bodyText ?? "").trim();
  if (!raw) return `${head}: empty response`;
  try {
    const j = JSON.parse(raw) as { error?: string; detail?: string };
    if (j && typeof j === "object") {
      if (j.detail) {
        return j.error
          ? `${head}: ${j.error} — ${j.detail}`
          : `${head}: ${j.detail}`;
      }
      if (j.error) {
        // No `detail`: backend may be an older binary. Always keep full JSON in the string for debugging.
        return `${head}: ${j.error} (raw: ${raw})`;
      }
    }
  } catch {
    // not JSON; fall through
  }
  return `${head}: ${raw}`;
}

function mindBrainHttpError(
  url: URL,
  response: Response,
  bodyText: string
): Error {
  const message = formatMindBrainHttpError(
    response.status,
    response.statusText,
    bodyText
  );
  return new Error(message, {
    cause: {
      path: url.pathname,
      status: response.status,
      body: bodyText
    } as const
  });
}

async function fetchText(
  url: URL,
  init: RequestInit,
  timeoutMs?: number
): Promise<string> {
  const response = await fetch(url, withTimeout(init, timeoutMs));
  const text = await response.text();
  if (!response.ok) {
    throw mindBrainHttpError(url, response, text);
  }
  return text;
}

async function fetchJson<T>(
  url: URL,
  init: RequestInit,
  timeoutMs?: number
): Promise<T> {
  const response = await fetch(url, withTimeout(init, timeoutMs));
  const text = await response.text();
  if (!response.ok) {
    throw mindBrainHttpError(url, response, text);
  }

  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new Error(
      `Failed to parse MindBrain response from ${url.pathname}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    );
  }
}

function withTimeout(
  init: RequestInit,
  timeoutMs: number | undefined
): RequestInit {
  if (timeoutMs === undefined || init.signal !== undefined) {
    return init;
  }

  return {
    ...init,
    signal: AbortSignal.timeout(timeoutMs)
  };
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}

export interface StandaloneReindexGraphParams {
  mindbrainUrl: string;
  timeoutMs?: number;
  workspaceId: string;
  documentTableId?: number;
}

export interface StandaloneReindexGraphResult {
  workspace_id: string;
  projected_count: number;
  document_table_id: number | null;
  adjacency_rebuilt?: boolean;
}

export async function runStandaloneReindexGraph(
  params: StandaloneReindexGraphParams
): Promise<StandaloneReindexGraphResult> {
  const url = new URL(
    "/api/mindbrain/reindex/graph",
    normalizeBaseUrl(params.mindbrainUrl)
  );
  return await fetchJson<StandaloneReindexGraphResult>(
    url,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        workspace_id: params.workspaceId,
        document_table_id: params.documentTableId ?? null
      })
    },
    params.timeoutMs
  );
}

export interface StandaloneCollectionFacetSearchParams {
  mindbrainUrl: string;
  timeoutMs?: number;
  workspaceId: string;
  collectionId: string;
  tableId?: number;
  namespace?: string;
  dimension?: string;
  value?: string;
  limit?: number;
}

export interface StandaloneCollectionFacetMatch {
  doc_id: number;
  chunk_index: number | null;
  namespace: string;
  dimension: string;
  value: string;
  weight: number;
}

export interface StandaloneCollectionFacetSearchResult {
  workspace_id: string;
  collection_id: string;
  returned: number;
  matches: StandaloneCollectionFacetMatch[];
  source: string;
}

export async function runStandaloneCollectionFacetSearch(
  params: StandaloneCollectionFacetSearchParams
): Promise<StandaloneCollectionFacetSearchResult> {
  const url = new URL(
    "/api/mindbrain/collections/facet-search",
    normalizeBaseUrl(params.mindbrainUrl)
  );
  url.searchParams.set("workspace_id", params.workspaceId);
  url.searchParams.set("collection_id", params.collectionId);
  if (params.tableId !== undefined) {
    url.searchParams.set("table_id", String(params.tableId));
  }
  if (params.namespace) url.searchParams.set("namespace", params.namespace);
  if (params.dimension) url.searchParams.set("dimension", params.dimension);
  if (params.value) url.searchParams.set("value", params.value);
  url.searchParams.set("limit", String(params.limit ?? 25));

  return await fetchJson<StandaloneCollectionFacetSearchResult>(
    url,
    { method: "GET" },
    params.timeoutMs
  );
}

export interface StandaloneReindexAllParams {
  mindbrainUrl: string;
  timeoutMs?: number;
  workspaceId: string;
  collectionId: string;
  tableId: number;
}

export interface StandaloneReindexAllResult {
  workspace_id: string;
  collection_id: string;
  table_id: number;
  graph_projected: number;
  facet_assignments: number;
  bm25_documents: number;
}

export async function runStandaloneReindexAll(
  params: StandaloneReindexAllParams
): Promise<StandaloneReindexAllResult> {
  const url = new URL(
    "/api/mindbrain/reindex/all",
    normalizeBaseUrl(params.mindbrainUrl)
  );
  return await fetchJson<StandaloneReindexAllResult>(
    url,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        workspace_id: params.workspaceId,
        collection_id: params.collectionId,
        table_id: params.tableId
      })
    },
    params.timeoutMs
  );
}
