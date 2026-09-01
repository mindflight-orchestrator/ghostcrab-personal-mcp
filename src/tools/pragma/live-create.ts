import { z } from "zod";

import {
  parseAnswerArtifactPayload,
  runCreateLiveAnswerView
} from "../../db/answer-artifacts.js";
import { resolveGhostcrabConfig } from "../../config/env.js";
import { probeMindbrainCapabilities } from "../../db/standalone-mindbrain.js";
import {
  createToolErrorFromException,
  createToolErrorResult,
  createToolSuccessResult,
  registerTool,
  type ToolHandler
} from "../registry.js";

export const GHOSTCRAB_ARTIFACT_CREATE_BLOCKER =
  "BLOCKER_GHOSTCRAB_ARTIFACT_CREATE_UNAVAILABLE";

const DefinitionInput = z
  .record(z.string(), z.unknown())
  .refine((value) => Object.keys(value).length > 0, {
    message: "definition must be a non-empty object"
  })
  .refine((value) => !("materialized" in value), {
    message: "definition.materialized is reserved for MindBrain"
  });

export const LiveCreateInput = z
  .object({
    slug: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[a-z0-9]+(?:_+[a-z0-9]+)*$/),
    public_label: z.string().trim().min(1).max(200),
    definition: DefinitionInput,
    workspace_id: z.string().trim().min(1).optional()
  })
  .strict();

function backendStatus(error: unknown): number | null {
  if (
    !(error instanceof Error) ||
    !error.cause ||
    typeof error.cause !== "object"
  ) {
    return null;
  }
  const status = (error.cause as Record<string, unknown>).status;
  return typeof status === "number" ? status : null;
}

function backendCode(error: unknown): string | null {
  if (
    !(error instanceof Error) ||
    !error.cause ||
    typeof error.cause !== "object"
  ) {
    return null;
  }
  const body = (error.cause as Record<string, unknown>).body;
  if (typeof body !== "string") return null;
  try {
    const parsed = JSON.parse(body) as { error?: { code?: unknown } };
    return typeof parsed.error?.code === "string" ? parsed.error.code : null;
  } catch {
    return null;
  }
}

export const liveCreateTool: ToolHandler = {
  definition: {
    name: "ghostcrab_live_create",
    description:
      "Write. Create one governed workspace-scoped live_answer_view through MindBrain. The explicit workspace_id overrides the active session workspace; a concrete effective workspace is always required. Identical retries are idempotent and identity conflicts never rename the artifact. Requires backend capability live_answer_view_create; otherwise returns BLOCKER_GHOSTCRAB_ARTIFACT_CREATE_UNAVAILABLE before any model/OpenRouter call. Use ghostcrab_tool_search to discover this extended tool.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["slug", "public_label", "definition"],
      properties: {
        slug: {
          type: "string",
          minLength: 1,
          maxLength: 80,
          pattern: "^[a-z0-9]+(?:_+[a-z0-9]+)*$",
          description:
            "Stable artifact slug; the id is live_answer_view__<slug>."
        },
        public_label: {
          type: "string",
          minLength: 1,
          maxLength: 200,
          description: "User-facing label."
        },
        definition: {
          type: "object",
          minProperties: 1,
          additionalProperties: true,
          description:
            "Non-empty declarative view definition. Top-level materialized is reserved."
        },
        workspace_id: {
          type: "string",
          minLength: 1,
          description:
            "Optional explicit override. When omitted, the active session workspace is used; the effective workspace is mandatory."
        }
      }
    }
  },
  async handler(args, context) {
    const input = LiveCreateInput.parse(args);
    const workspaceId = (
      input.workspace_id ?? context.session.workspace_id
    )?.trim();
    if (!workspaceId) {
      return createToolErrorResult(
        "ghostcrab_live_create",
        "No active workspace is available for live answer creation.",
        "workspace_context_required"
      );
    }

    const config = resolveGhostcrabConfig();
    const probe = await probeMindbrainCapabilities(
      config.mindbrainUrl,
      config.mindbrainHttpTimeoutMs
    );
    if (
      !probe.ok ||
      probe.capabilities.features.live_answer_view_create !== true
    ) {
      return createToolErrorResult(
        "ghostcrab_live_create",
        GHOSTCRAB_ARTIFACT_CREATE_BLOCKER,
        GHOSTCRAB_ARTIFACT_CREATE_BLOCKER,
        { workspace_id: workspaceId }
      );
    }

    try {
      const result = await runCreateLiveAnswerView({
        mindbrainUrl: config.mindbrainUrl,
        timeoutMs: config.mindbrainHttpTimeoutMs,
        workspaceId,
        slug: input.slug,
        publicLabel: input.public_label,
        definition: input.definition
      });
      return createToolSuccessResult("ghostcrab_live_create", {
        workspace_id: workspaceId,
        backend: "native",
        created: result.created,
        idempotent: result.idempotent,
        artifact: {
          ...result.artifact,
          payload: parseAnswerArtifactPayload(result.artifact.payload_json)
        }
      });
    } catch (error) {
      const status = backendStatus(error);
      const code = backendCode(error);
      if (status === 404 && code !== "workspace_not_found") {
        return createToolErrorResult(
          "ghostcrab_live_create",
          GHOSTCRAB_ARTIFACT_CREATE_BLOCKER,
          GHOSTCRAB_ARTIFACT_CREATE_BLOCKER,
          { workspace_id: workspaceId }
        );
      }
      if (status === 409 || code === "artifact_conflict") {
        return createToolErrorFromException(
          "ghostcrab_live_create",
          error,
          "artifact_conflict",
          "The live answer artifact identity conflicts with an existing definition."
        );
      }
      if (code === "workspace_not_found") {
        return createToolErrorFromException(
          "ghostcrab_live_create",
          error,
          "workspace_not_found",
          "The effective workspace does not exist."
        );
      }
      return createToolErrorFromException(
        "ghostcrab_live_create",
        error,
        "backend_unavailable",
        "MindBrain live answer creation failed."
      );
    }
  }
};

registerTool(liveCreateTool);
