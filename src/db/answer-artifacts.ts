import {
  runStandaloneAnswerArtifactEvents,
  runStandaloneAnswerArtifactGet,
  runStandaloneAnswerArtifactRefresh,
  runStandaloneMindbrainSql,
  type StandaloneAnswerArtifactEventRow,
  type StandaloneAnswerArtifactEventsResponse,
  type StandaloneAnswerArtifactRefreshResponse,
  type StandaloneAnswerArtifactRow
} from "./standalone-mindbrain.js";

export const ANSWER_ARTIFACT_KINDS = [
  "analysis_plan",
  "live_answer_view",
  "answer_snapshot",
  "evidence_pack"
] as const;

export type AnswerArtifactKind = (typeof ANSWER_ARTIFACT_KINDS)[number];

const ANSWER_ARTIFACT_KIND_SET = new Set<string>(ANSWER_ARTIFACT_KINDS);

export function isAnswerArtifactKind(
  kind: unknown
): kind is AnswerArtifactKind {
  return typeof kind === "string" && ANSWER_ARTIFACT_KIND_SET.has(kind);
}

export function assertAnswerArtifactKind(kind: unknown): AnswerArtifactKind {
  if (!isAnswerArtifactKind(kind)) {
    throw new Error(
      `Invalid artifact_kind "${String(kind)}". Allowed: ${ANSWER_ARTIFACT_KINDS.join(", ")}`
    );
  }
  return kind;
}

export interface ListAnswerArtifactsParams {
  mindbrainUrl: string;
  timeoutMs?: number;
  workspaceId?: string;
  kind?: AnswerArtifactKind;
  agentId?: string;
  scope?: string;
  limit?: number;
}

export interface AnswerArtifactListRow {
  artifact_id: string;
  slug: string;
  workspace_id: string | null;
  agent_id: string | null;
  scope: string | null;
  artifact_kind: AnswerArtifactKind;
  public_label: string;
  lifecycle: string;
  state: string;
  current_version: number;
  legacy_ref: string | null;
}

export function buildListAnswerArtifactsQuery(
  filters: Omit<ListAnswerArtifactsParams, "mindbrainUrl" | "timeoutMs"> = {}
): { sql: string; params: unknown[] } {
  const clauses = ["1 = 1"];
  const params: unknown[] = [];

  if (filters.workspaceId) {
    clauses.push("workspace_id = ?");
    params.push(filters.workspaceId);
  }
  if (filters.kind) {
    assertAnswerArtifactKind(filters.kind);
    clauses.push("artifact_kind = ?");
    params.push(filters.kind);
  }
  if (filters.agentId) {
    clauses.push("agent_id = ?");
    params.push(filters.agentId);
  }
  if (filters.scope) {
    clauses.push("scope = ?");
    params.push(filters.scope);
  }

  const limit =
    typeof filters.limit === "number" && filters.limit > 0
      ? Math.min(filters.limit, 500)
      : 100;

  const sql = `
    SELECT artifact_id, slug, workspace_id, agent_id, scope, artifact_kind,
           public_label, lifecycle, state, current_version, legacy_ref
    FROM mindbrain_answer_artifacts
    WHERE ${clauses.join(" AND ")}
    ORDER BY artifact_kind, artifact_id
    LIMIT ${limit}
  `.trim();

  return { sql, params };
}

export function mapAnswerArtifactListRows(
  columns: string[],
  rows: unknown[][]
): AnswerArtifactListRow[] {
  const index = Object.fromEntries(columns.map((name, i) => [name, i]));
  return rows.map((row) => {
    const kind = assertAnswerArtifactKind(row[index.artifact_kind]);
    return {
      artifact_id: String(row[index.artifact_id] ?? ""),
      slug: String(row[index.slug] ?? ""),
      workspace_id: (row[index.workspace_id] as string | null) ?? null,
      agent_id: (row[index.agent_id] as string | null) ?? null,
      scope: (row[index.scope] as string | null) ?? null,
      artifact_kind: kind,
      public_label: String(row[index.public_label] ?? ""),
      lifecycle: String(row[index.lifecycle] ?? ""),
      state: String(row[index.state] ?? ""),
      current_version: Number(row[index.current_version] ?? 0),
      legacy_ref: (row[index.legacy_ref] as string | null) ?? null
    };
  });
}

export async function runListAnswerArtifacts(
  params: ListAnswerArtifactsParams
): Promise<AnswerArtifactListRow[]> {
  const { sql, params: sqlParams } = buildListAnswerArtifactsQuery(params);
  const response = await runStandaloneMindbrainSql({
    mindbrainUrl: params.mindbrainUrl,
    timeoutMs: params.timeoutMs,
    sql,
    params: sqlParams
  });
  return mapAnswerArtifactListRows(response.columns, response.rows);
}

export async function runGetAnswerArtifact(params: {
  mindbrainUrl: string;
  timeoutMs?: number;
  artifactId: string;
}): Promise<StandaloneAnswerArtifactRow> {
  const row = await runStandaloneAnswerArtifactGet({
    mindbrainUrl: params.mindbrainUrl,
    timeoutMs: params.timeoutMs,
    artifactId: params.artifactId
  });
  assertAnswerArtifactKind(row.artifact_kind);
  return row;
}

export function parseAnswerArtifactPayload(
  payloadJson: string
): Record<string, unknown> {
  if (!payloadJson || payloadJson.trim() === "") {
    return {};
  }
  try {
    const parsed = JSON.parse(payloadJson) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export async function runListAnswerArtifactEvents(params: {
  mindbrainUrl: string;
  timeoutMs?: number;
  artifactId: string;
  limit?: number;
}): Promise<StandaloneAnswerArtifactEventsResponse> {
  return runStandaloneAnswerArtifactEvents({
    mindbrainUrl: params.mindbrainUrl,
    timeoutMs: params.timeoutMs,
    artifactId: params.artifactId,
    limit: params.limit
  });
}

export async function runRefreshLiveAnswerView(params: {
  mindbrainUrl: string;
  timeoutMs?: number;
  artifactId: string;
  includeLatestEvent?: boolean;
}): Promise<{
  artifact: StandaloneAnswerArtifactRefreshResponse & {
    public_label?: string;
    lifecycle?: string;
  };
  answer_update_event: StandaloneAnswerArtifactEventRow | null;
}> {
  const artifact = await runStandaloneAnswerArtifactGet({
    mindbrainUrl: params.mindbrainUrl,
    timeoutMs: params.timeoutMs,
    artifactId: params.artifactId
  });
  if (artifact.artifact_kind !== "live_answer_view") {
    throw new Error(
      `ghostcrab_live_refresh only applies to live answer views; got "${artifact.artifact_kind}".`
    );
  }

  const refresh = await runStandaloneAnswerArtifactRefresh({
    mindbrainUrl: params.mindbrainUrl,
    timeoutMs: params.timeoutMs,
    artifactId: params.artifactId
  });

  let answer_update_event: StandaloneAnswerArtifactEventRow | null = null;
  if (params.includeLatestEvent !== false) {
    const events = await runStandaloneAnswerArtifactEvents({
      mindbrainUrl: params.mindbrainUrl,
      timeoutMs: params.timeoutMs,
      artifactId: params.artifactId,
      limit: 1
    });
    answer_update_event = events.events[0] ?? null;
    if (
      answer_update_event &&
      answer_update_event.event_kind !== "answer_update_event"
    ) {
      throw new Error(
        `Expected event_kind answer_update_event, got "${answer_update_event.event_kind}".`
      );
    }
  }

  return { artifact: refresh, answer_update_event };
}
