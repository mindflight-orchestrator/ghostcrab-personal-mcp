import { z } from "zod";

import { resolveGhostcrabConfig } from "../../config/env.js";
import {
  runStandaloneGraphDiagnostics,
  runStandaloneGraphGapRules,
  runStandaloneGraphGapRulesImport
} from "../../db/standalone-mindbrain.js";
import {
  createToolErrorResult,
  createToolSuccessResult,
  registerTool,
  type ToolHandler
} from "../registry.js";

const DirectionInput = z.enum(["out", "in", "either"]);

const GapRuleInput = z.object({
  rule_id: z.string().trim().min(1),
  ontology_id: z.string().trim().min(1).optional(),
  workspace_id: z.string().trim().min(1).optional(),
  entity_type: z.string().trim().min(1),
  relation_type: z.string().trim().min(1),
  direction: DirectionInput.default("out"),
  target_entity_type: z.string().trim().min(1).optional().nullable(),
  min_count: z.coerce.number().int().min(0).default(1),
  max_count: z.coerce.number().int().min(0).optional().nullable(),
  severity: z.string().trim().min(1).default("warning"),
  label: z.string().trim().min(1),
  enabled: z.boolean().default(true),
  metadata_json: z.string().trim().default("{}")
});

export const GraphDiagnosticsInput = z.object({
  workspace_id: z.string().trim().min(1).optional(),
  ontology_id: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
  component_small_max: z.coerce.number().int().min(1).max(20).default(2)
});

export const GraphGapRulesInput = z.object({
  workspace_id: z.string().trim().min(1).optional(),
  ontology_id: z.string().trim().min(1).optional()
});

export const GraphGapRulesImportInput = z.object({
  ontology_id: z.string().trim().min(1),
  workspace_id: z.string().trim().min(1).optional(),
  replace: z.boolean().default(false),
  rules: z.array(GapRuleInput).min(1).max(200)
});

export const graphDiagnosticsTool: ToolHandler = {
  definition: {
    name: "ghostcrab_graph_diagnostics",
    description:
      "Read. Run MindBrain graph gap diagnostics for missing required relations, cardinality violations, isolated entities, small components, ontology edge-type mismatches, evidence gaps, and ontology coverage gaps.",
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
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 500,
          default: 200,
          description: "Maximum issue rows to return."
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
    const input = GraphDiagnosticsInput.parse(args);
    const workspaceId = input.workspace_id ?? context.session.workspace_id;
    const config = resolveGhostcrabConfig();

    try {
      const report = await runStandaloneGraphDiagnostics({
        mindbrainUrl: config.mindbrainUrl,
        timeoutMs: config.mindbrainHttpTimeoutMs,
        workspaceId,
        ontologyId: input.ontology_id,
        limit: input.limit,
        componentSmallMax: input.component_small_max
      });

      return createToolSuccessResult("ghostcrab_graph_diagnostics", {
        workspace_id: workspaceId,
        ontology_id: input.ontology_id ?? null,
        backend: "mindbrain/graph/diagnostics",
        summary: report.summary,
        issues: Array.isArray(report.issues) ? report.issues : []
      });
    } catch (error) {
      return createToolErrorResult(
        "ghostcrab_graph_diagnostics",
        error instanceof Error
          ? error.message
          : "MindBrain graph diagnostics backend unavailable",
        "backend_unavailable"
      );
    }
  }
};

export const graphGapRulesTool: ToolHandler = {
  definition: {
    name: "ghostcrab_graph_gap_rules",
    description:
      "Read. List MindBrain closed-world graph gap rules for an ontology or workspace default ontology.",
    inputSchema: {
      type: "object",
      properties: {
        workspace_id: {
          type: "string",
          description:
            "Workspace id used to resolve the default ontology and include workspace-scoped rules."
        },
        ontology_id: {
          type: "string",
          description: "Ontology id to inspect directly."
        }
      }
    }
  },
  async handler(args, context) {
    const input = GraphGapRulesInput.parse(args);
    const workspaceId = input.workspace_id ?? context.session.workspace_id;
    const config = resolveGhostcrabConfig();

    try {
      const response = await runStandaloneGraphGapRules({
        mindbrainUrl: config.mindbrainUrl,
        timeoutMs: config.mindbrainHttpTimeoutMs,
        workspaceId,
        ontologyId: input.ontology_id
      });

      return createToolSuccessResult("ghostcrab_graph_gap_rules", {
        workspace_id: response.workspace_id ?? workspaceId ?? null,
        ontology_id: response.ontology_id,
        backend: "mindbrain/graph/gap-rules",
        rules: Array.isArray(response.rules) ? response.rules : []
      });
    } catch (error) {
      return createToolErrorResult(
        "ghostcrab_graph_gap_rules",
        error instanceof Error
          ? error.message
          : "MindBrain graph gap rules backend unavailable",
        "backend_unavailable"
      );
    }
  }
};

export const graphGapRulesImportTool: ToolHandler = {
  definition: {
    name: "ghostcrab_graph_gap_rules_import",
    description:
      "Write. Import MindBrain closed-world graph gap rules for required relations and cardinality checks.",
    inputSchema: {
      type: "object",
      required: ["ontology_id", "rules"],
      properties: {
        ontology_id: {
          type: "string",
          description: "Ontology id the rules belong to."
        },
        workspace_id: {
          type: "string",
          description:
            "Optional workspace scope. Use this for workspace-specific closed-world rules."
        },
        replace: {
          type: "boolean",
          default: false,
          description:
            "When true, replace existing rules for the ontology and workspace scope before importing."
        },
        rules: {
          type: "array",
          minItems: 1,
          maxItems: 200,
          items: {
            type: "object",
            required: ["rule_id", "entity_type", "relation_type", "label"],
            properties: {
              rule_id: { type: "string" },
              ontology_id: { type: "string" },
              workspace_id: { type: "string" },
              entity_type: { type: "string" },
              relation_type: { type: "string" },
              direction: {
                type: "string",
                enum: ["out", "in", "either"],
                default: "out"
              },
              target_entity_type: { type: ["string", "null"] },
              min_count: { type: "integer", minimum: 0, default: 1 },
              max_count: { type: ["integer", "null"], minimum: 0 },
              severity: { type: "string", default: "warning" },
              label: { type: "string" },
              enabled: { type: "boolean", default: true },
              metadata_json: { type: "string", default: "{}" }
            }
          }
        }
      }
    }
  },
  async handler(args, context) {
    const input = GraphGapRulesImportInput.parse(args);
    const config = resolveGhostcrabConfig();
    const workspaceId = input.workspace_id ?? context.session.workspace_id;

    try {
      const response = await runStandaloneGraphGapRulesImport({
        mindbrainUrl: config.mindbrainUrl,
        timeoutMs: config.mindbrainHttpTimeoutMs,
        payload: {
          ontology_id: input.ontology_id,
          workspace_id: workspaceId,
          replace: input.replace,
          rules: input.rules
        }
      });

      return createToolSuccessResult("ghostcrab_graph_gap_rules_import", {
        workspace_id: workspaceId,
        ontology_id: input.ontology_id,
        backend: "mindbrain/graph/gap-rules/import",
        imported: response.imported
      });
    } catch (error) {
      return createToolErrorResult(
        "ghostcrab_graph_gap_rules_import",
        error instanceof Error
          ? error.message
          : "MindBrain graph gap rules import backend unavailable",
        "backend_unavailable"
      );
    }
  }
};

registerTool(graphDiagnosticsTool);
registerTool(graphGapRulesTool);
registerTool(graphGapRulesImportTool);
