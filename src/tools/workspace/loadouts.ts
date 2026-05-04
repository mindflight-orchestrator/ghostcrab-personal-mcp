import { z } from "zod";

import {
  createToolErrorResult,
  createToolSuccessResult,
  registerTool,
  type ToolExecutionContext,
  type ToolHandler
} from "../registry.js";
import {
  buildOntologyLoadoutSkeleton,
  getOntologyLoadoutCatalogSnapshot,
  loadOntologyLoadout,
  suggestOntologyLoadouts
} from "../../db/ontology-loadouts.js";
import { WorkspaceIdSchema } from "../../types/workspace.js";

const LoadoutInspectInput = z.object({
  loadout_id: z.string().min(1)
});

const LoadoutApplyInput = z.object({
  workspace_id: WorkspaceIdSchema,
  loadout_id: z.string().min(1),
  overwrite: z.boolean().optional().default(false)
});

const LoadoutSuggestInput = z.object({
  goal: z.string().min(1),
  limit: z.number().int().min(1).max(5).optional().default(3)
});

function formatLoadout(loadout: ReturnType<typeof loadOntologyLoadout>) {
  if (!loadout) {
    return null;
  }

  return {
    loadout_id: loadout.loadout_id,
    label: loadout.label,
    description: loadout.description,
    domain_profile: loadout.domain_profile,
    recommended_for: loadout.recommended_for,
    modeling_questions: loadout.modeling_questions,
    core_entities: loadout.core_entities,
    core_relations: loadout.core_relations,
    facet_focus: loadout.facet_focus,
    graph_focus: loadout.graph_focus,
    suggested_next_tools: loadout.suggested_next_tools,
    default_for_new_workspace: Boolean(loadout.default_for_new_workspace)
  };
}

async function readWorkspaceDomainProfile(
  context: ToolExecutionContext,
  workspaceId: string
): Promise<{ id: string; domain_profile: string | null } | null> {
  try {
    const rows = await context.database.query<{ id: string; domain_profile: string | null }>(
      `SELECT id, domain_profile
       FROM workspaces
       WHERE id = ?`,
      [workspaceId]
    );
    return rows[0] ?? null;
  } catch {
    const rows = await context.database.query<{ id: string }>(
      `SELECT id
       FROM workspaces
       WHERE id = ?`,
      [workspaceId]
    );
    const row = rows[0];
    return row ? { id: row.id, domain_profile: null } : null;
  }
}

export const loadoutListTool: ToolHandler = {
  definition: {
    name: "ghostcrab_loadout_list",
    description:
      "Read. List predefined ontology loadouts and the recommended default starter.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  async handler(_args, _context) {
    const loadouts = getOntologyLoadoutCatalogSnapshot().map(formatLoadout);

    return createToolSuccessResult("ghostcrab_loadout_list", {
      default_loadout_id: "default-minimal",
      total: loadouts.length,
      loadouts
    });
  }
};

export const loadoutInspectTool: ToolHandler = {
  definition: {
    name: "ghostcrab_loadout_inspect",
    description:
      "Read. Inspect a predefined ontology loadout, including questions the LLM should ask next.",
    inputSchema: {
      type: "object",
      required: ["loadout_id"],
      properties: {
        loadout_id: {
          type: "string",
          minLength: 1
        }
      }
    }
  },
  async handler(args, _context) {
    const input = LoadoutInspectInput.parse(args);
    const loadout = loadOntologyLoadout(input.loadout_id);

    if (!loadout) {
      return createToolErrorResult(
        "ghostcrab_loadout_inspect",
        `Unknown loadout '${input.loadout_id}'.`,
        "unknown_loadout"
      );
    }

    const skeleton = buildOntologyLoadoutSkeleton(
      loadout.loadout_id,
      "preview"
    );

    return createToolSuccessResult("ghostcrab_loadout_inspect", {
      loadout: formatLoadout(loadout),
      skeleton_preview: skeleton
        ? {
            nodes: skeleton.nodes.length,
            edges: skeleton.edges.length,
            core_entity_nodes: skeleton.nodes
              .filter((node) => node.node_type === "ontology_entity")
              .map((node) => node.label),
            core_relation_nodes: skeleton.nodes
              .filter((node) => node.node_type === "ontology_relation")
              .map((node) => node.label),
            wrapper_nodes: skeleton.nodes
              .filter((node) => node.node_type !== "ontology_entity" && node.node_type !== "ontology_relation")
              .map((node) => ({ id: node.id, node_type: node.node_type, label: node.label }))
          }
        : null
    });
  }
};

export const loadoutApplyTool: ToolHandler = {
  definition: {
    name: "ghostcrab_loadout_apply",
    description:
      "Write. Bind a predefined ontology loadout to a workspace by updating domain_profile.",
    inputSchema: {
      type: "object",
      required: ["workspace_id", "loadout_id"],
      properties: {
        workspace_id: {
          type: "string",
          description: "Target workspace id."
        },
        loadout_id: {
          type: "string",
          minLength: 1
        },
        overwrite: {
          type: "boolean",
          default: false,
          description:
            "Allow replacing an already selected different loadout."
        }
      }
    }
  },
  async handler(args, context) {
    const input = LoadoutApplyInput.parse(args);
    const loadout = loadOntologyLoadout(input.loadout_id);
    if (!loadout) {
      return createToolErrorResult(
        "ghostcrab_loadout_apply",
        `Unknown loadout '${input.loadout_id}'.`,
        "unknown_loadout"
      );
    }

    const workspace = await readWorkspaceDomainProfile(context, input.workspace_id);
    if (!workspace) {
      return createToolErrorResult(
        "ghostcrab_loadout_apply",
        `Workspace '${input.workspace_id}' does not exist.`,
        "workspace_not_found"
      );
    }

    const existingDomainProfile = workspace.domain_profile ?? null;
    if (
      existingDomainProfile &&
      existingDomainProfile !== loadout.domain_profile &&
      !input.overwrite
    ) {
      return createToolErrorResult(
        "ghostcrab_loadout_apply",
        `Workspace '${input.workspace_id}' already has domain_profile '${existingDomainProfile}'. Use overwrite=true to replace it with '${loadout.domain_profile}'.`,
        "loadout_conflict",
        {
          workspace_id: input.workspace_id,
          existing_domain_profile: existingDomainProfile,
          requested_domain_profile: loadout.domain_profile
        }
      );
    }

    if (existingDomainProfile === loadout.domain_profile) {
      return createToolSuccessResult("ghostcrab_loadout_apply", {
        workspace_id: input.workspace_id,
        loadout_id: loadout.loadout_id,
        domain_profile: loadout.domain_profile,
        applied: false,
        overwrite: input.overwrite,
        message: `Workspace '${input.workspace_id}' already uses loadout '${loadout.loadout_id}'.`,
        loadout: formatLoadout(loadout)
      });
    }

    try {
      await context.database.query(
        `UPDATE workspaces
         SET domain_profile = ?
         WHERE id = ?`,
        [loadout.domain_profile, input.workspace_id]
      );
    } catch (error) {
      return createToolErrorResult(
        "ghostcrab_loadout_apply",
        `Failed to update workspace '${input.workspace_id}' domain_profile: ${error instanceof Error ? error.message : String(error)}`,
        "workspace_profile_update_failed"
      );
    }

    return createToolSuccessResult("ghostcrab_loadout_apply", {
      workspace_id: input.workspace_id,
      loadout_id: loadout.loadout_id,
      domain_profile: loadout.domain_profile,
      applied: true,
      overwrite: input.overwrite,
      loadout: formatLoadout(loadout),
      next_steps: [
        "Ask the missing ontology questions.",
        "Register the required schemas.",
        "Use ghostcrab_learn to encode graph nodes and edges.",
        "Use ghostcrab_loadout_seed to materialize the ontology skeleton.",
        "Use ghostcrab_workspace_export_model to verify the resulting model."
      ],
      suggested_next_tools: loadout.suggested_next_tools
    });
  }
};

export const loadoutSuggestTool: ToolHandler = {
  definition: {
    name: "ghostcrab_loadout_suggest",
    description:
      "Read. Suggest the best ontology loadouts for a workspace goal or ontology description.",
    inputSchema: {
      type: "object",
      required: ["goal"],
      properties: {
        goal: {
          type: "string",
          minLength: 1,
          description:
            "Free-text description of the workspace, ontology, or domain."
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 5,
          default: 3,
          description: "Maximum number of suggestions to return."
        }
      }
    }
  },
  async handler(args, _context) {
    const input = LoadoutSuggestInput.parse(args);
    const suggestions = suggestOntologyLoadouts(input.goal, input.limit).map((entry) => ({
      loadout: formatLoadout(entry.loadout),
      score: entry.score,
      matched_terms: entry.matched_terms
    }));

    return createToolSuccessResult("ghostcrab_loadout_suggest", {
      goal: input.goal,
      limit: input.limit,
      suggestions,
      recommended_loadout_id: suggestions[0]?.loadout?.loadout_id ?? "default-minimal"
    });
  }
};

registerTool(loadoutListTool);
registerTool(loadoutInspectTool);
registerTool(loadoutApplyTool);
registerTool(loadoutSuggestTool);
