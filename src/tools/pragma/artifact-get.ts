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
  workspace_id: z.string().trim().min(1).optional()
});

export const artifactGetTool: ToolHandler = {
  definition: {
    name: "ghostcrab_artifact_get",
    description:
      "Read. Fetch one answer artifact from the registry by artifact_id (analysis plan, live answer, snapshot, or evidence pack). When workspace_id is provided or active in session, validates that the artifact belongs to that workspace. Returns public_label for user-facing text. Use ghostcrab_tool_search to discover this extended tool.",
    inputSchema: {
      type: "object",
      required: ["artifact_id"],
      properties: {
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
