import { SQLITE_FACT_STORE_TABLE, safeParseFacetJson } from "../../db/fact-store.js";
import { type AnswerArtifactKind } from "../../db/answer-artifacts.js";
import {
  ANALYSIS_PLAN_KIND,
  ANSWER_SNAPSHOT_KIND
} from "../pragma/answer-artifact-overlay.js";
import type { ToolExecutionContext } from "../registry.js";
import type { BusinessCapability, EvidenceRef } from "./types.js";

interface AnswerArtifactRow {
  artifact_id: string;
  workspace_id: string;
  scope: string | null;
  agent_id: string | null;
  artifact_kind: AnswerArtifactKind;
  public_label: string;
  lifecycle: string;
  state: string;
  slug: string;
  payload_json: string | null;
}

function parsePayloadObject(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
    ) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return {};
  }

  return {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function keysFromObject(value: unknown): string[] {
  return value && typeof value === "object" && !Array.isArray(value)
    ? Object.keys(value as Record<string, unknown>)
    : [];
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function mapPayloadToCapability(
  artifact: AnswerArtifactRow
): BusinessCapability {
  const payload = parsePayloadObject(artifact.payload_json);
  const requestedFacets = stringArray(payload.required_facets);
  const requiredSchemas = stringArray(payload.required_schemas);

  const common: BusinessCapability = {
    capability_id:
      str(artifact.slug) ??
      str(artifact.artifact_id) ??
      "analysis_plan",
    workspace_id: str(artifact.workspace_id),
    label: str(payload.label) ?? str(payload.title) ?? artifact.public_label,
    business_question: str(payload.business_question) ?? artifact.public_label,
    example_queries: stringArray(payload.example_queries),
    required_schemas: requiredSchemas,
    required_facets: requestedFacets,
    required_edges: stringArray(payload.required_edges),
    scope: str(artifact.scope),
    agent_id: str(artifact.agent_id),
    artifact_kind: artifact.artifact_kind,
    availability: artifact.artifact_kind,
    source: "ghostcrab_answer_artifact_registry",
    status: str(payload.status),
    projection_id: str(payload.projection_id) ?? str(payload.projectionId),
    payload,
    version: typeof payload.version === "number" ? payload.version : str(payload.version),
    artifact_id: artifact.artifact_id
  };

  if (artifact.artifact_kind === ANSWER_SNAPSHOT_KIND) {
    common.required_facets = keysFromObject(payload.params);
    common.scope = str(artifact.scope);
    common.schema_id = str(payload.schema_id) ?? undefined;
  }

  return common;
}

function mapRegisteredCapability(row: {
  id: string;
  content: string;
  facets_json: string;
}): BusinessCapability | null {
  const facets = safeParseFacetJson(row.facets_json);
  const rawStatus = facets.status;
  if (
    rawStatus === "inactive" ||
    rawStatus === "deprecated" ||
    rawStatus === "pending_review"
  ) {
    return null;
  }
  const activation = facets.activation_status;
  if (
    activation === "pending_review" ||
    activation === "proposed" ||
    activation === "inactive"
  ) {
    return null;
  }

  const mode = str(facets.availability) ?? "gap_report";
  return {
    capability_id: str(facets.capability_id) ?? row.id,
    workspace_id: str(facets.workspace_id) ?? undefined,
    label: str(facets.label),
    business_question: str(facets.business_question) ?? row.content,
    example_queries: stringArray(facets.example_queries),
    required_schemas: stringArray(facets.required_schemas),
    required_facets: stringArray(facets.required_facets),
    required_edges: stringArray(facets.required_edges),
    scope: str(facets.scope) ?? null,
    agent_id: str(facets.agent_id) ?? null,
    artifact_kind: str(facets.artifact_kind) ?? "gap_report",
    availability: mode as BusinessCapability["availability"],
    source: str(facets.source) ?? "business-capability",
    status: str(facets.status) ?? undefined,
    version: str(facets.version),
    proposal_fingerprint: str(facets.proposal_fingerprint),
    artifact_id: str(facets.artifact_id),
    schema_id: str(facets.schema_id),
    activation_status: str(facets.activation_status) as
      | "active"
      | "pending_review"
      | undefined,
    payload: Object.fromEntries(
      Object.entries(facets).filter(
        ([key, value]) =>
          ![
            "activation_status",
            "proposal_fingerprint",
            "workspace_id",
            "version"
          ].includes(key) && value !== undefined
      )
    )
  };
}

export async function loadRuntimeCapabilities(params: {
  context: ToolExecutionContext;
  workspaceId: string;
  limit?: number;
}): Promise<{ capabilities: BusinessCapability[]; evidence: EvidenceRef[] }> {
  const { context, workspaceId } = params;
  const limit = params.limit ?? 120;

  const capabilities: BusinessCapability[] = [];
  const evidence: EvidenceRef[] = [];

  try {
    const artifactRows = await context.database.query<AnswerArtifactRow>(
      `
        SELECT artifact_id, workspace_id, scope, agent_id, artifact_kind, public_label,
               lifecycle, state, slug, payload_json
        FROM mindbrain_answer_artifacts
        WHERE workspace_id = ?
          AND artifact_kind IN (?, ?, ?)
        ORDER BY artifact_id
        LIMIT ?
      `,
      [
        workspaceId,
        ANALYSIS_PLAN_KIND,
        "live_answer_view",
        ANSWER_SNAPSHOT_KIND,
        limit
      ]
    );

    for (const row of artifactRows) {
      const capability = mapPayloadToCapability(row);
      capabilities.push(capability);
      evidence.push({
        source: "ghostcrab_answer_artifacts",
        ref: capability.capability_id,
        kind: String(row.artifact_kind)
      });
    }
  } catch {
    // Keep matching available even when mindbrain artifact registry is temporarily
    // unavailable by continuing with only stored business-capability rows.
  }

  const registered = await context.database.query<{
    id: string;
    content: string;
    facets_json: string;
  }>(
    `
      SELECT id, content, facets_json
      FROM ${SQLITE_FACT_STORE_TABLE}
      WHERE schema_id = ?
        AND json_extract(facets_json, '$.workspace_id') = ?
        AND (valid_until_unix IS NULL OR valid_until_unix > strftime('%s', 'now'))
      ORDER BY COALESCE(version, 1) DESC, created_at_unix DESC
      LIMIT ?
    `,
    ["ghostcrab:business-capability", workspaceId, limit]
  );

  for (const row of registered) {
    const capability = mapRegisteredCapability(row);
    if (!capability) continue;
    capabilities.push(capability);
  }

  return {
    capabilities,
    evidence: [
      ...evidence,
      ...capabilities
        .filter((capability) => capability.source === "business-capability")
        .map((capability) => ({
          source: "ghostcrab:business-capability",
          ref: capability.capability_id,
          kind: capability.availability ?? "gap_report"
        }))
    ]
  };
}
