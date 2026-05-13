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
  relation_id: number;
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
  projection_results: StandaloneGhostcrabProjectionEntityRow[];
  linked_evidence: StandaloneGhostcrabProjectionEvidenceRow[];
  deltas: StandaloneGhostcrabProjectionEntityRow[];
  report: {
    workspace_id: string;
    collection_id?: string | null;
    projection_id: string;
    projection_result_count: number;
    linked_evidence_count: number;
    delta_count: number;
    has_projection: boolean;
  };
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

export interface StandaloneMindbrainSqlParams {
  mindbrainUrl: string;
  timeoutMs?: number;
  sql: string;
  params?: readonly unknown[];
  sessionId?: number;
  commit?: boolean;
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
