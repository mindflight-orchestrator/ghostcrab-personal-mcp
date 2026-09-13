import { z } from "zod";

import {
  parseAnswerArtifactPayload,
  runGetAnswerArtifact
} from "../../db/answer-artifacts.js";
import { resolveGhostcrabConfig } from "../../config/env.js";
import {
  createToolErrorFromException,
  createToolErrorResult,
  createToolSuccessResult,
  registerTool,
  type ToolHandler
} from "../registry.js";

export const ArtifactGetInput = z.object({
  artifact_id: z.string().trim().min(1),
  include_answer: z.boolean().default(false),
  expected_version: z.number().int().positive().optional(),
  expected_contract_digest: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  expected_source_digest: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  expected_as_of: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  workspace_id: z.string().trim().min(1).optional()
});

export const artifactGetTool: ToolHandler = {
  definition: {
    name: "ghostcrab_artifact_get",
    description:
      "Read. Fetch one workspace-scoped answer artifact. Use include_answer and all expected_* arguments supplied by business_query_answer to retrieve a qualified native result with evidence, ontology and freshness validation. Stale or changed bindings cannot return a complete answer. Without include_answer, returns the raw registry payload.",
    inputSchema: {
      type: "object",
      required: ["artifact_id"],
      properties: {
        include_answer: {
          type: "boolean",
          default: false,
          description:
            "Read the qualified native result with evidence and ontology using the binding returned by business_query_answer."
        },
        expected_version: { type: "integer", minimum: 1 },
        expected_contract_digest: { type: "string", pattern: "^[a-f0-9]{64}$" },
        expected_source_digest: { type: "string", pattern: "^[a-f0-9]{64}$" },
        expected_as_of: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
        artifact_id: {
          type: "string",
          description:
            "Registry id, e.g. live_answer_view__pilotage_hebdomadaire or analysis_plan__scope_slug."
        },
        workspace_id: {
          type: "string",
          description:
            "Optional workspace context for the call. The returned artifact must match this workspace."
        }
      }
    }
  },
  async handler(args, context) {
    const input = ArtifactGetInput.parse(args);
    const workspaceId = input.workspace_id ?? context.session.workspace_id;

    let row;
    try {
      row = await runGetAnswerArtifact({
        mindbrainUrl: resolveGhostcrabConfig().mindbrainUrl,
        artifactId: input.artifact_id
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("404") || message.includes("NotFound")) {
        return createToolErrorResult(
          "ghostcrab_artifact_get",
          `Artifact ${input.artifact_id} was not found.`,
          "artifact_not_found",
          { artifact_id: input.artifact_id }
        );
      }
      return createToolErrorFromException(
        "ghostcrab_artifact_get",
        error,
        "backend_unavailable",
        "MindBrain artifact backend unavailable"
      );
    }

    if (workspaceId && row.workspace_id !== workspaceId) {
      return createToolErrorResult(
        "ghostcrab_artifact_get",
        `Artifact ${row.artifact_id} belongs to workspace ${row.workspace_id ?? "<none>"}, not ${workspaceId}.`,
        "workspace_mismatch",
        {
          requested_workspace_id: workspaceId,
          artifact_workspace_id: row.workspace_id ?? null,
          artifact_id: row.artifact_id
        }
      );
    }

    if (input.include_answer) {
      if (row.state !== "refreshed" || row.lifecycle !== "active") {
        return createToolErrorResult(
          "ghostcrab_artifact_get",
          "The selected projection is no longer an active refreshed answer.",
          "projection_stale"
        );
      }
      if (!workspaceId)
        return createToolErrorResult(
          "ghostcrab_artifact_get",
          "A workspace is required for a qualified answer.",
          "missing_workspace"
        );
      if (
        !input.expected_version ||
        !input.expected_contract_digest ||
        !input.expected_source_digest ||
        !input.expected_as_of
      ) {
        return createToolErrorResult(
          "ghostcrab_artifact_get",
          "Use all bound arguments supplied by ghostcrab_business_query_answer.",
          "missing_answer_binding"
        );
      }
      if (row.current_version !== input.expected_version)
        return createToolErrorResult(
          "ghostcrab_artifact_get",
          "The selected artifact version changed.",
          "projection_version_changed"
        );
      if (!row.answer_json)
        return createToolErrorResult(
          "ghostcrab_artifact_get",
          "No qualified native answer is available.",
          "projection_unavailable"
        );
      const answer = parseAnswerArtifactPayload(row.answer_json);
      if (answer.status !== "ready" && answer.status !== "indeterminate")
        return createToolErrorResult(
          "ghostcrab_artifact_get",
          "The prepared answer is stale or unavailable; explicit refresh is required.",
          "projection_stale",
          { status: answer.status, reason: answer.reason }
        );
      if (
        answer.contract_digest !== input.expected_contract_digest ||
        answer.source_digest !== input.expected_source_digest ||
        answer.as_of !== input.expected_as_of ||
        answer.workspace_id !== workspaceId
      ) {
        return createToolErrorResult(
          "ghostcrab_artifact_get",
          "The answer no longer matches the selected contract, scope, date or source revision.",
          "projection_binding_changed"
        );
      }
      return createToolSuccessResult("ghostcrab_artifact_get", {
        workspace_id: workspaceId,
        artifact_id: row.artifact_id,
        current_version: row.current_version,
        public_label: row.public_label,
        backend: "native_projection_contract",
        answer_available: answer.status === "ready",
        answer
      });
    }

    return createToolSuccessResult("ghostcrab_artifact_get", {
      workspace_id: row.workspace_id,
      backend: "native",
      artifact_id: row.artifact_id,
      slug: row.slug,
      artifact_kind: row.artifact_kind,
      public_label: row.public_label,
      lifecycle: row.lifecycle,
      state: row.state,
      current_version: row.current_version,
      legacy_ref: row.legacy_ref,
      agent_id: row.agent_id,
      scope: row.scope,
      payload: parseAnswerArtifactPayload(row.payload_json),
      notes: [
        "Use public_label when speaking to the user; artifact_kind is for routing only."
      ]
    });
  }
};

registerTool(artifactGetTool);
