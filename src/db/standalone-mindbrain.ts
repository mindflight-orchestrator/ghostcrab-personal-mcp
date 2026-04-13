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
  workspaceId: string;
}

export interface StandalonePackParams {
  mindbrainUrl: string;
  userId: string;
  query: string;
  scope?: string;
  limit: number;
}

export interface StandaloneMindbrainSqlParams {
  mindbrainUrl: string;
  sql: string;
  params?: readonly unknown[];
  sessionId?: number;
  commit?: boolean;
}

export async function runStandaloneTraverse(
  params: StandaloneTraverseParams
): Promise<StandaloneTraverseResult> {
  const url = new URL("/api/mindbrain/traverse", normalizeBaseUrl(params.mindbrainUrl));
  url.searchParams.set("start", params.start);
  url.searchParams.set("direction", params.direction);
  url.searchParams.set("depth", String(params.depth));
  if (params.target) {
    url.searchParams.set("target", params.target);
  }
  for (const edgeLabel of params.edgeLabels) {
    url.searchParams.append("edge_label", edgeLabel);
  }

  return await fetchJson<StandaloneTraverseResult>(url, { method: "GET" });
}

export async function runStandaloneWorkspaceExportToon(
  params: StandaloneWorkspaceExportParams
): Promise<string> {
  const url = new URL("/api/mindbrain/workspace-export", normalizeBaseUrl(params.mindbrainUrl));
  url.searchParams.set("workspace_id", params.workspaceId);
  return await fetchText(url, { method: "GET" });
}

export async function runStandalonePackToon(
  params: StandalonePackParams
): Promise<string> {
  const url = new URL("/api/mindbrain/pack", normalizeBaseUrl(params.mindbrainUrl));
  url.searchParams.set("user_id", params.userId);
  url.searchParams.set("query", params.query);
  url.searchParams.set("limit", String(params.limit));
  if (params.scope) {
    url.searchParams.set("scope", params.scope);
  }
  return await fetchText(url, { method: "GET" });
}

export async function runStandaloneMindbrainSql(
  params: StandaloneMindbrainSqlParams
): Promise<MindbrainSqlResponse> {
  const path = params.sessionId === undefined
    ? "/api/mindbrain/sql"
    : params.commit === undefined
      ? "/api/mindbrain/sql/session/query"
      : "/api/mindbrain/sql/session/close";
  const url = new URL(path, normalizeBaseUrl(params.mindbrainUrl));
  const body =
    params.sessionId === undefined
      ? { sql: params.sql, params: params.params ?? [] }
      : params.commit === undefined
        ? { session_id: params.sessionId, sql: params.sql, params: params.params ?? [] }
        : { session_id: params.sessionId, commit: params.commit };
  return await fetchJson<MindbrainSqlResponse>(url, {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json"
    }
  });
}

export async function openStandaloneMindbrainSqlSession(
  mindbrainUrl: string
): Promise<number> {
  const url = new URL("/api/mindbrain/sql/session/open", normalizeBaseUrl(mindbrainUrl));
  const response = await fetchJson<MindbrainSqlSessionOpenResponse>(url, {
    method: "POST",
    body: "{}",
    headers: {
      "content-type": "application/json"
    }
  });
  return response.session_id;
}

export async function closeStandaloneMindbrainSqlSession(
  mindbrainUrl: string,
  sessionId: number,
  commit: boolean
): Promise<void> {
  const url = new URL("/api/mindbrain/sql/session/close", normalizeBaseUrl(mindbrainUrl));
  await fetchJson<MindbrainSqlSessionCloseResponse>(url, {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId, commit }),
    headers: {
      "content-type": "application/json"
    }
  });
}

async function fetchText(url: URL, init: RequestInit): Promise<string> {
  const response = await fetch(url, init);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`MindBrain request failed (${response.status} ${response.statusText}): ${text || "empty response"}`);
  }
  return text;
}

async function fetchJson<T>(url: URL, init: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`MindBrain request failed (${response.status} ${response.statusText}): ${text || "empty response"}`);
  }

  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new Error(
      `Failed to parse MindBrain response from ${url.pathname}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}
