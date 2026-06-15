import { z } from "zod";

import { runRefreshLiveAnswerView } from "../../db/answer-artifacts.js";
import { resolveGhostcrabConfig } from "../../config/env.js";
import {
  createToolErrorFromException,
  createToolSuccessResult,
  registerTool,
  type ToolHandler
} from "../registry.js";

export const LiveRefreshInput = z.object({
  artifact_id: z.string().trim().min(1),
  workspace_id: z.string().trim().min(1).optional(),
  include_latest_event: z.boolean().default(true)
});

function parseEventSignal(signalJson: string): Record<string, unknown> {
  if (!signalJson) return {};
  try {
    const parsed = JSON.parse(signalJson) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export const liveRefreshTool: ToolHandler = {
  definition: {
    name: "ghostcrab_live_refresh",
    description:
      "Write. Explicitly refresh one live answer view (Données en direct) from current graph/facts. Requires one exact artifact_id such as live_answer_view__pilotage_hebdomadaire; wildcards/globs are not supported. Bumps current_version and records an answer_update_event. Only valid for live_answer_view artifacts. Use ghostcrab_tool_search to discover this extended tool.",
    inputSchema: {
      type: "object",
      required: ["artifact_id"],
      properties: {
        artifact_id: {
          type: "string",
          description:
            "Exact live answer artifact id (live_answer_view__…). Wildcards/globs such as live_answer_view__foo_* are not supported."
        },
        workspace_id: {
          type: "string",
          description: "Optional workspace context for the call."
        },
        include_latest_event: {
          type: "boolean",
          default: true,
          description:
            "When true, attach the latest answer_update_event row after refresh."
        }
      }
    }
  },
  async handler(args, context) {
    const input = LiveRefreshInput.parse(args);
    const workspaceId = input.workspace_id ?? context.session.workspace_id;

    let result;
    try {
      result = await runRefreshLiveAnswerView({
        mindbrainUrl: resolveGhostcrabConfig().mindbrainUrl,
        artifactId: input.artifact_id,
        includeLatestEvent: input.include_latest_event
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "MindBrain refresh failed";
      const code =
        message.includes("live answer views") ||
        message.includes("live_answer_view")
          ? "invalid_artifact_kind"
          : "backend_unavailable";
      return createToolErrorFromException(
        "ghostcrab_live_refresh",
        error,
        code,
        message
      );
    }

    const event = result.answer_update_event;

    return createToolSuccessResult("ghostcrab_live_refresh", {
      workspace_id: workspaceId,
      backend: "native",
      artifact_id: result.artifact.artifact_id,
      artifact_kind: result.artifact.artifact_kind,
      current_version: result.artifact.current_version,
      state: result.artifact.state,
      refreshed: true,
      answer_update_event: event
        ? {
            event_id: event.event_id,
            event_kind: event.event_kind,
            from_version: event.from_version,
            to_version: event.to_version,
            signal: parseEventSignal(event.signal_json),
            created_at_unix: event.created_at_unix
          }
        : null,
      notes: [
        "Live views use explicit refresh on Personal/SQLite; graph changes mark views stale until refresh."
      ]
    });
  }
};

registerTool(liveRefreshTool);
