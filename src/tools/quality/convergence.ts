import { z } from "zod";

import { resolveGhostcrabConfig } from "../../config/env.js";
import {
  runStandaloneGraphDiagnostics,
  runStandaloneQualityConvergence,
  runStandaloneQualityConvergenceGet,
  runStandaloneQualityConvergenceList,
  runStandaloneQualityRemediationActions,
  runStandaloneQualityRemediationDecision,
  runStandaloneQualityRemediationStatus
} from "../../db/standalone-mindbrain.js";
import {
  createToolErrorResult,
  createToolSuccessResult,
  registerTool,
  type ToolHandler
} from "../registry.js";

const ActionStatusInput = z.enum([
  "proposed",
  "approved",
  "rejected",
  "applied",
  "failed",
  "skipped"
]);

const QualityRunInput = z.object({
  workspace_id: z.string().trim().min(1).optional(),
  ontology_id: z.string().trim().min(1).optional(),
  persist: z.boolean().default(true),
  limit: z.coerce.number().int().min(1).max(500).default(200),
  component_small_max: z.coerce.number().int().min(1).max(20).default(2)
});

const QualityRunListInput = z.object({
  workspace_id: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

const QualityRunGetInput = z.object({
  run_id: z.string().trim().min(1)
});

const QualityActionsInput = z.object({
  run_id: z.string().trim().min(1),
  status: ActionStatusInput.optional()
});

const QualityDecisionInput = z.object({
  action_id: z.string().trim().min(1),
  decision: z.enum(["approved", "rejected"]),
  actor: z.string().trim().min(1).optional(),
  note: z.string().trim().min(1).optional()
});

const QualityApplyInput = z.object({
  run_id: z.string().trim().min(1),
  action_id: z.string().trim().min(1),
  actor: z.string().trim().min(1).optional()
});

function configForQualityTools() {
  const config = resolveGhostcrabConfig();
  return {
    mindbrainUrl: config.mindbrainUrl,
    timeoutMs: config.mindbrainHttpTimeoutMs
  };
}

function workspaceOrSession(
  workspaceId: string | undefined,
  sessionWorkspaceId: string | undefined
): string | undefined {
  return workspaceId ?? sessionWorkspaceId;
}

function asToolPayload(value: object): Record<string, unknown> {
  return value as Record<string, unknown>;
}

export const qualityConvergenceRunTool: ToolHandler = {
  definition: {
    name: "ghostcrab_quality_convergence_run",
    description:
      "Read/write. Run the native MindBrain quality convergence pipeline for a workspace. Persists the run and proposed remediation actions by default; set persist:false for a read-only preview.",
    inputSchema: {
      type: "object",
      properties: {
        workspace_id: {
          type: "string",
          description:
            "Target workspace id. Defaults to the current MCP session workspace."
        },
        ontology_id: {
          type: "string",
          description:
            "Optional ontology id. When omitted, MindBrain uses the workspace default ontology."
        },
        persist: {
          type: "boolean",
          default: true,
          description:
            "Persist the convergence run and remediation actions in MindBrain."
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 500,
          default: 200,
          description: "Maximum graph diagnostic issue rows considered."
        },
        component_small_max: {
          type: "integer",
          minimum: 1,
          maximum: 20,
          default: 2,
          description:
            "Weak connected components with this many nodes or fewer are reported as small components."
        }
      }
    }
  },
  async handler(args, context) {
    const input = QualityRunInput.parse(args);
    const workspaceId = workspaceOrSession(
      input.workspace_id,
      context.session.workspace_id
    );
    if (!workspaceId) {
      return createToolErrorResult(
        "ghostcrab_quality_convergence_run",
        "workspace_id is required when the MCP session has no active workspace.",
        "missing_workspace"
      );
    }

    try {
      const report = await runStandaloneQualityConvergence({
        ...configForQualityTools(),
        workspaceId,
        ontologyId: input.ontology_id,
        persist: input.persist,
        limit: input.limit,
        componentSmallMax: input.component_small_max
      });
      return createToolSuccessResult(
        "ghostcrab_quality_convergence_run",
        asToolPayload(report)
      );
    } catch (error) {
      return createToolErrorResult(
        "ghostcrab_quality_convergence_run",
        error instanceof Error ? error.message : String(error),
        "mindbrain_quality_convergence_failed"
      );
    }
  }
};

export const qualityConvergenceListTool: ToolHandler = {
  definition: {
    name: "ghostcrab_quality_convergence_list",
    description:
      "Read. List persisted MindBrain quality convergence runs for a workspace.",
    inputSchema: {
      type: "object",
      properties: {
        workspace_id: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 20 }
      }
    }
  },
  async handler(args, context) {
    const input = QualityRunListInput.parse(args);
    const workspaceId = workspaceOrSession(
      input.workspace_id,
      context.session.workspace_id
    );
    if (!workspaceId) {
      return createToolErrorResult(
        "ghostcrab_quality_convergence_list",
        "workspace_id is required when the MCP session has no active workspace.",
        "missing_workspace"
      );
    }
    const runs = await runStandaloneQualityConvergenceList({
      ...configForQualityTools(),
      workspaceId,
      limit: input.limit
    });
    return createToolSuccessResult(
      "ghostcrab_quality_convergence_list",
      asToolPayload(runs)
    );
  }
};

export const qualityConvergenceGetTool: ToolHandler = {
  definition: {
    name: "ghostcrab_quality_convergence_get",
    description:
      "Read. Retrieve one persisted MindBrain quality convergence report by run_id.",
    inputSchema: {
      type: "object",
      required: ["run_id"],
      properties: {
        run_id: { type: "string" }
      }
    }
  },
  async handler(args) {
    const input = QualityRunGetInput.parse(args);
    const report = await runStandaloneQualityConvergenceGet({
      ...configForQualityTools(),
      runId: input.run_id
    });
    return createToolSuccessResult(
      "ghostcrab_quality_convergence_get",
      asToolPayload(report)
    );
  }
};

export const qualityRemediationActionsTool: ToolHandler = {
  definition: {
    name: "ghostcrab_quality_remediation_actions",
    description:
      "Read. List remediation actions proposed by a persisted MindBrain quality convergence run.",
    inputSchema: {
      type: "object",
      required: ["run_id"],
      properties: {
        run_id: { type: "string" },
        status: {
          type: "string",
          enum: [
            "proposed",
            "approved",
            "rejected",
            "applied",
            "failed",
            "skipped"
          ]
        }
      }
    }
  },
  async handler(args) {
    const input = QualityActionsInput.parse(args);
    const actions = await runStandaloneQualityRemediationActions({
      ...configForQualityTools(),
      runId: input.run_id,
      status: input.status
    });
    return createToolSuccessResult(
      "ghostcrab_quality_remediation_actions",
      asToolPayload(actions)
    );
  }
};

export const qualityRemediationDecideTool: ToolHandler = {
  definition: {
    name: "ghostcrab_quality_remediation_decide",
    description:
      "Write. Approve or reject a proposed MindBrain quality remediation action. Approval records intent only; execution is separate.",
    inputSchema: {
      type: "object",
      required: ["action_id", "decision"],
      properties: {
        action_id: { type: "string" },
        decision: { type: "string", enum: ["approved", "rejected"] },
        actor: { type: "string" },
        note: { type: "string" }
      }
    }
  },
  async handler(args) {
    const input = QualityDecisionInput.parse(args);
    const result = await runStandaloneQualityRemediationDecision({
      ...configForQualityTools(),
      actionId: input.action_id,
      decision: input.decision,
      actor: input.actor,
      note: input.note
    });
    return createToolSuccessResult(
      "ghostcrab_quality_remediation_decide",
      asToolPayload(result)
    );
  }
};

export const qualityRemediationApplyTool: ToolHandler = {
  definition: {
    name: "ghostcrab_quality_remediation_apply",
    description:
      "Write. Apply one approved allow-listed remediation action. V1 only executes diagnostic-only graph diagnostics actions and records the result.",
    inputSchema: {
      type: "object",
      required: ["run_id", "action_id"],
      properties: {
        run_id: { type: "string" },
        action_id: { type: "string" },
        actor: { type: "string" }
      }
    }
  },
  async handler(args) {
    const input = QualityApplyInput.parse(args);
    const actionsPayload = await runStandaloneQualityRemediationActions({
      ...configForQualityTools(),
      runId: input.run_id,
      status: "approved"
    });
    const action = actionsPayload.actions.find(
      (candidate) => candidate.action_id === input.action_id
    );
    if (!action) {
      return createToolErrorResult(
        "ghostcrab_quality_remediation_apply",
        "Approved remediation action was not found for this run_id.",
        "approved_action_not_found"
      );
    }
    if (
      action.execution_mode !== "diagnostic_only" ||
      action.mcp_tool !== "ghostcrab_graph_diagnostics"
    ) {
      return createToolErrorResult(
        "ghostcrab_quality_remediation_apply",
        "This remediation action is not allow-listed for automatic application in v1.",
        "unsupported_remediation_action",
        { action }
      );
    }

    const toolArgs =
      typeof action.tool_args === "object" && action.tool_args !== null
        ? (action.tool_args as Record<string, unknown>)
        : {};
    const workspaceId =
      typeof toolArgs.workspace_id === "string" ? toolArgs.workspace_id : undefined;
    if (!workspaceId) {
      return createToolErrorResult(
        "ghostcrab_quality_remediation_apply",
        "Allow-listed diagnostics action is missing tool_args.workspace_id.",
        "invalid_action_tool_args",
        { action }
      );
    }

    const diagnostics = await runStandaloneGraphDiagnostics({
      ...configForQualityTools(),
      workspaceId,
      ontologyId:
        typeof toolArgs.ontology_id === "string"
          ? toolArgs.ontology_id
          : undefined
    });
    const result = await runStandaloneQualityRemediationStatus({
      ...configForQualityTools(),
      actionId: input.action_id,
      status: "applied",
      resultJson: {
        applied_by: input.actor ?? "ghostcrab_quality_remediation_apply",
        diagnostic_result: diagnostics
      }
    });
    return createToolSuccessResult("ghostcrab_quality_remediation_apply", {
      ...result,
      diagnostic_result: diagnostics
    });
  }
};

registerTool(qualityConvergenceRunTool);
registerTool(qualityConvergenceListTool);
registerTool(qualityConvergenceGetTool);
registerTool(qualityRemediationActionsTool);
registerTool(qualityRemediationDecideTool);
registerTool(qualityRemediationApplyTool);
