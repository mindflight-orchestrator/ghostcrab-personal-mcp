import type { ToolExecutionContext } from "../registry.js";

type Artifact = {
  artifact_id: string;
  current_version: number;
  lifecycle: string;
  state: string;
  payload_json: string;
};

/** Conservative phrase equivalence: retain dates, numbers and negation. */
export function normalizeProjectionQuestion(question: string): string {
  return question
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[’']/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/^(?:s il te plait |s il vous plait )/, "")
    .replace(/^(?:peux tu |pouvez vous )/, "")
    .replace(/^(?:me donner |me montrer |donne moi |montre moi |affiche )/, "")
    .replace(/^(?:la liste |liste )/, "");
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Prepared native contracts own this workspace's projection route. No fact reads. */
export async function routeQualifiedProjection(
  context: ToolExecutionContext,
  workspaceId: string,
  question: string,
  asOf?: string
): Promise<Record<string, unknown> | null> {
  const rows = await context.database.query<Artifact>(
    `
    SELECT artifact_id, current_version, lifecycle, state,
      json_remove(payload_json, '$.qualified_result.rows', '$.qualified_result.ontology') AS payload_json
    FROM mindbrain_answer_artifacts
    WHERE workspace_id = ? AND artifact_kind IN ('live_answer_view', 'answer_snapshot')
      AND CASE WHEN json_valid(payload_json) THEN json_type(payload_json, '$.projection_contract') END IS NOT NULL
    ORDER BY artifact_id LIMIT 501
  `,
    [workspaceId]
  );
  if (!rows.length) return null;
  if (rows.length > 500)
    throw new Error(
      "Projection catalog exceeds the qualified discovery limit (500)."
    );
  const normalized = normalizeProjectionQuestion(question);
  const candidates = rows.flatMap((row) => {
    const payload = object(JSON.parse(row.payload_json));
    const contract = object(payload?.projection_contract);
    if (
      !contract ||
      contract.version !== 1 ||
      !["active", "stale"].includes(row.lifecycle)
    )
      return [];
    const phrases = [
      contract.business_question,
      ...(Array.isArray(contract.paraphrases) ? contract.paraphrases : [])
    ];
    if (
      !phrases.some(
        (phrase) =>
          typeof phrase === "string" &&
          normalizeProjectionQuestion(phrase) === normalized
      )
    )
      return [];
    return [{ row, contract, result: object(payload?.qualified_result) }];
  });
  const base = {
    backend: "native_projection_contract",
    question,
    workspace_id: workspaceId
  };
  if (candidates.length !== 1)
    return {
      ...base,
      match_status: candidates.length ? "ambiguous" : "unsupported",
      route: { mode: candidates.length ? "clarification" : "gap_report" },
      answer_available: false,
      candidates: candidates.map(({ row }) => row.artifact_id),
      reason: candidates.length
        ? "Several contracts cover this question; clarify the intended projection."
        : "No declared projection question or supported paraphrase covers all requested conditions."
    };
  const { row, contract, result } = candidates[0];
  const requestedDate = asOf ?? new Date().toISOString().slice(0, 10);
  const dateMatches =
    (asOf === undefined && contract.operation !== "dated_relations") ||
    contract.as_of === requestedDate;
  const available =
    dateMatches && row.state === "refreshed" && result?.status === "ready";
  return {
    ...base,
    match_status: "matched",
    artifact_id: row.artifact_id,
    route: { mode: "live_answer_view", artifact_id: row.artifact_id },
    contract_version: contract.version,
    ontology_id: contract.ontology_id,
    ontology_version: contract.ontology_version,
    as_of: contract.as_of,
    answer_available: available,
    availability_basis:
      "stored_materialization; source freshness is revalidated by the second call",
    reason: !dateMatches
      ? "The prepared result does not cover the requested as_of date."
      : result?.status === "indeterminate"
        ? "The materialized result has incomplete evidence."
        : row.state !== "refreshed"
          ? "Explicit native refresh is required."
          : undefined,
    // A partial result can be inspected, but never advertised as a complete answer.
    next_call:
      dateMatches && result && row.state === "refreshed"
        ? {
            name: "ghostcrab_artifact_get",
            arguments: {
              workspace_id: workspaceId,
              artifact_id: row.artifact_id,
              include_answer: true,
              expected_version: row.current_version,
              expected_contract_digest: result.contract_digest,
              expected_source_digest: result.source_digest,
              expected_as_of: contract.as_of
            }
          }
        : null
  };
}
