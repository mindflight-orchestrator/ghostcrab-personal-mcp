import { z } from "zod";

import { resolveGhostcrabConfig } from "../../config/env.js";
import {
  runStandaloneGraphDiagnostics,
  runStandaloneGraphGapRules,
  runStandaloneGraphGapRulesDelete,
  runStandaloneGraphGapRulesImport
} from "../../db/standalone-mindbrain.js";
import {
  createToolErrorFromException,
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

export const GraphGapRulesDeleteInput = z.object({
  rule_ids: z.array(z.string().trim().min(1)).min(1).max(200),
  ontology_id: z.string().trim().min(1).optional(),
  workspace_id: z.string().trim().min(1).optional()
});

export const graphDiagnosticsTool: ToolHandler = {
  definition: {
    name: "ghostcrab_graph_diagnostics",
    description:
      "Read. Unified graph gap report after closed-world rules are loaded. Evaluates imported gap rules (missing_required_relation, too_many_relations) plus native checks: isolated_entity, small_component, relation_type_mismatch, entity_without_evidence, relation_without_evidence, ontology_coverage_gap. Not a substitute for ghostcrab_coverage (schema instantiation) or ghostcrab_graph_gap_rules (rule audit). Workflow: import rules → list rules → run diagnostics. Example: { \"workspace_id\": \"immeuble-demo\" }.",
    inputSchema: {
      type: "object",
      properties: {
        workspace_id: {
          type: "string",
          description:
            "Target workspace id. Defaults to the current MCP session workspace. Example: immeuble-demo."
        },
        ontology_id: {
          type: "string",
          description:
            "Optional ontology id. When omitted, MindBrain uses the workspace default ontology (e.g. immeuble-demo::core)."
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
      return createToolErrorFromException(
        "ghostcrab_graph_diagnostics",
        error,
        "backend_unavailable",
        "MindBrain graph diagnostics backend unavailable"
      );
    }
  }
};

export const graphGapRulesTool: ToolHandler = {
  definition: {
    name: "ghostcrab_graph_gap_rules",
    description:
      "Read. List active closed-world gap rules (rule_id, entity/relation types, direction, min/max counts, severity, enabled, metadata). Use before and after ghostcrab_graph_gap_rules_import to audit the contract. Returns global rules (workspace_id null) plus workspace-scoped rules. Example: { \"workspace_id\": \"immeuble-demo\" }. Pair with ghostcrab_graph_diagnostics to see violations.",
    inputSchema: {
      type: "object",
      properties: {
        workspace_id: {
          type: "string",
          description:
            "Workspace id used to resolve the default ontology and include workspace-scoped rules. Example: immeuble-demo."
        },
        ontology_id: {
          type: "string",
          description:
            "Ontology id to inspect directly. When omitted, uses the workspace default ontology."
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
      return createToolErrorFromException(
        "ghostcrab_graph_gap_rules",
        error,
        "backend_unavailable",
        "MindBrain graph gap rules backend unavailable"
      );
    }
  }
};

export const graphGapRulesImportTool: ToolHandler = {
  definition: {
    name: "ghostcrab_graph_gap_rules_import",
    description:
      "Write. Import closed-world gap rules: unary cardinality checks per entity_type and relation_type (e.g. each unit must have exactly one assigned_cellar). Upserts by rule_id; set replace:true to delete all rules in the ontology+workspace scope before import (use when switching rule packs L0→L2). Disable a rule with enabled:false instead of deleting. Then list via ghostcrab_graph_gap_rules and validate via ghostcrab_graph_diagnostics. Accepts the full gap-rules JSON envelope (ontology_id, workspace_id, replace, rules).",
    inputSchema: {
      type: "object",
      required: ["ontology_id", "rules"],
      properties: {
        ontology_id: {
          type: "string",
          description:
            "Ontology id the rules belong to. Example: immeuble-demo::core."
        },
        workspace_id: {
          type: "string",
          description:
            "Optional workspace scope for workspace-specific rules. Example: immeuble-demo. Defaults to MCP session workspace."
        },
        replace: {
          type: "boolean",
          default: false,
          description:
            "When true, delete all existing rules for this ontology_id and workspace_id scope before importing. When false (default), upsert each rule_id without removing omitted rules."
        },
        rules: {
          type: "array",
          minItems: 1,
          maxItems: 200,
          description:
            "Closed-world rules. Each rule checks relation counts for entities of entity_type.",
          items: {
            type: "object",
            required: ["rule_id", "entity_type", "relation_type", "label"],
            properties: {
              rule_id: {
                type: "string",
                description: "Stable rule identifier, e.g. unit-one-cellar."
              },
              ontology_id: { type: "string" },
              workspace_id: { type: "string" },
              entity_type: {
                type: "string",
                description: "Entity type to evaluate, e.g. unit."
              },
              relation_type: {
                type: "string",
                description: "Relation type to count, e.g. assigned_cellar."
              },
              direction: {
                type: "string",
                enum: ["out", "in", "either"],
                default: "out",
                description:
                  "Count outgoing (out), incoming (in), or either direction relations."
              },
              target_entity_type: {
                type: ["string", "null"],
                description:
                  "Optional endpoint entity type filter when counting relations."
              },
              min_count: {
                type: "integer",
                minimum: 0,
                default: 1,
                description: "Minimum required relation count."
              },
              max_count: {
                type: ["integer", "null"],
                minimum: 0,
                description: "Maximum allowed relation count (cardinality upper bound)."
              },
              severity: {
                type: "string",
                enum: ["error", "warning", "info"],
                default: "warning"
              },
              label: {
                type: "string",
                description: "Human-readable business label for diagnostics issues."
              },
              enabled: {
                type: "boolean",
                default: true,
                description: "When false, rule is stored but not evaluated."
              },
              metadata_json: {
                type: "string",
                default: "{}",
                description:
                  'Optional JSON string. Use entity_filter.metadata.{field}.{one_of|not_one_of|eq} to restrict which entities are evaluated, e.g. {"entity_filter":{"metadata":{"usage_status":{"not_one_of":["vacant","vacant_works"]}}}}.'
              }
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
      return createToolErrorFromException(
        "ghostcrab_graph_gap_rules_import",
        error,
        "backend_unavailable",
        "MindBrain graph gap rules import backend unavailable"
      );
    }
  }
};

export const graphGapRulesDeleteTool: ToolHandler = {
  definition: {
    name: "ghostcrab_graph_gap_rules_delete",
    description:
      "Write. Delete one or more closed-world gap rules by rule_id. Prefer enabled:false on ghostcrab_graph_gap_rules_import to disable without deleting. For bulk replacement of a rule pack, use replace:true on import instead. Optional ontology_id and workspace_id scope the delete for safety.",
    inputSchema: {
      type: "object",
      required: ["rule_ids"],
      properties: {
        rule_ids: {
          type: "array",
          minItems: 1,
          maxItems: 200,
          items: { type: "string" },
          description: "Rule ids to delete, e.g. [\"leased-unit-has-lease\"]."
        },
        ontology_id: {
          type: "string",
          description:
            "Optional ontology scope. When set, only rules for this ontology are deleted."
        },
        workspace_id: {
          type: "string",
          description:
            "Optional workspace scope. When set with ontology_id, restricts deletion to that workspace."
        }
      }
    }
  },
  async handler(args, context) {
    const input = GraphGapRulesDeleteInput.parse(args);
    const config = resolveGhostcrabConfig();
    const workspaceId = input.workspace_id ?? context.session.workspace_id;

    try {
      const response = await runStandaloneGraphGapRulesDelete({
        mindbrainUrl: config.mindbrainUrl,
        timeoutMs: config.mindbrainHttpTimeoutMs,
        payload: {
          rule_ids: input.rule_ids,
          ontology_id: input.ontology_id,
          workspace_id: workspaceId
        }
      });

      return createToolSuccessResult("ghostcrab_graph_gap_rules_delete", {
        workspace_id: workspaceId ?? null,
        ontology_id: input.ontology_id ?? null,
        backend: "mindbrain/graph/gap-rules/delete",
        deleted: response.deleted
      });
    } catch (error) {
      return createToolErrorFromException(
        "ghostcrab_graph_gap_rules_delete",
        error,
        "backend_unavailable",
        "MindBrain graph gap rules delete backend unavailable"
      );
    }
  }
};

registerTool(graphDiagnosticsTool);
registerTool(graphGapRulesTool);
registerTool(graphGapRulesImportTool);
registerTool(graphGapRulesDeleteTool);
