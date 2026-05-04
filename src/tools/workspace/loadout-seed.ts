import { z } from "zod";

import {
  createToolErrorResult,
  createToolSuccessResult,
  registerTool,
  type ToolHandler
} from "../registry.js";
import {
  buildOntologyLoadoutSemanticProposal,
  buildOntologyLoadoutSkeleton,
  loadOntologyLoadout
} from "../../db/ontology-loadouts.js";
import {
  resolveGraphEntityId,
  setGraphEntityWorkspaceId,
  upsertGraphEntity,
  upsertGraphRelation
} from "../../db/graph.js";
import { persistSemanticProposal } from "./semantic-persist.js";
import { WorkspaceIdSchema } from "../../types/workspace.js";

const LoadoutSeedInput = z.object({
  workspace_id: WorkspaceIdSchema,
  loadout_id: z.string().min(1),
  persist_semantics: z.boolean().optional().default(true)
});

async function readWorkspace(
  database: Parameters<typeof persistSemanticProposal>[0],
  workspaceId: string
): Promise<{ id: string; domain_profile: string | null } | null> {
  try {
    const rows = await database.query<{ id: string; domain_profile: string | null }>(
      `SELECT id, domain_profile
       FROM workspaces
       WHERE id = ?`,
      [workspaceId]
    );
    return rows[0] ?? null;
  } catch {
    const rows = await database.query<{ id: string }>(
      `SELECT id
       FROM workspaces
       WHERE id = ?`,
      [workspaceId]
    );
    const row = rows[0];
    return row ? { id: row.id, domain_profile: null } : null;
  }
}

export const loadoutSeedTool: ToolHandler = {
  definition: {
    name: "ghostcrab_loadout_seed",
    description:
      "Write. Seed the graph and semantic placeholders for a predefined ontology loadout into a workspace.",
    inputSchema: {
      type: "object",
      required: ["workspace_id", "loadout_id"],
      properties: {
        workspace_id: {
          type: "string"
        },
        loadout_id: {
          type: "string",
          minLength: 1
        },
        persist_semantics: {
          type: "boolean",
          default: true,
          description:
            "Also persist placeholder semantic table/column/relation definitions."
        }
      }
    }
  },
  async handler(args, context) {
    const input = LoadoutSeedInput.parse(args);
    const loadout = loadOntologyLoadout(input.loadout_id);
    if (!loadout) {
      return createToolErrorResult(
        "ghostcrab_loadout_seed",
        `Unknown loadout '${input.loadout_id}'.`,
        "unknown_loadout"
      );
    }

    const workspace = await readWorkspace(context.database, input.workspace_id);
    if (!workspace) {
      return createToolErrorResult(
        "ghostcrab_loadout_seed",
        `Workspace '${input.workspace_id}' does not exist.`,
        "workspace_not_found"
      );
    }

    const skeleton = buildOntologyLoadoutSkeleton(
      loadout.loadout_id,
      input.workspace_id
    );
    if (!skeleton) {
      return createToolErrorResult(
        "ghostcrab_loadout_seed",
        `Unable to build a skeleton for loadout '${input.loadout_id}'.`,
        "loadout_skeleton_missing"
      );
    }

    const semanticProposal = buildOntologyLoadoutSemanticProposal(
      loadout.loadout_id,
      input.workspace_id
    );

    const graphResult = await context.database.transaction(async (queryable) => {
      const seededNodes: string[] = [];
      const seededEdges: Array<{ source: string; target: string; label: string }> = [];

      for (const node of skeleton.nodes) {
        await upsertGraphEntity(queryable, {
          nodeId: node.id,
          nodeType: node.node_type,
          label: node.label,
          properties: {
            ...node.properties,
            workspace_id: input.workspace_id
          },
          schemaId: null
        });

        const entityId = await resolveGraphEntityId(queryable, node.id);
        if (entityId !== null) {
          await setGraphEntityWorkspaceId(queryable, entityId, input.workspace_id);
        }

        seededNodes.push(node.id);
      }

      for (const edge of skeleton.edges) {
        const sourceId = await resolveGraphEntityId(queryable, edge.source);
        const targetId = await resolveGraphEntityId(queryable, edge.target);
        if (sourceId === null || targetId === null) {
          continue;
        }

        await upsertGraphRelation(queryable, {
          label: edge.label,
          sourceId,
          targetId,
          confidence: 1,
          properties: {
            ...edge.properties,
            workspace_id: input.workspace_id
          }
        });

        seededEdges.push({
          source: edge.source,
          target: edge.target,
          label: edge.label
        });
      }

      return {
        seeded_nodes: seededNodes,
        seeded_edges: seededEdges
      };
    });

    let semanticResult:
      | {
          table_semantics: number;
          column_semantics: number;
          relation_semantics: number;
        }
      | null = null;

    if (input.persist_semantics && semanticProposal) {
      const persisted = await context.database.transaction((tx) =>
        persistSemanticProposal(tx, input.workspace_id, semanticProposal)
      );

      semanticResult = persisted.counts
        ? {
            table_semantics: persisted.counts.table_semantics ?? 0,
            column_semantics: persisted.counts.column_semantics ?? 0,
            relation_semantics: persisted.counts.relation_semantics ?? 0
          }
        : {
            table_semantics: 0,
            column_semantics: 0,
            relation_semantics: 0
          };
    }

    if (workspace.domain_profile !== loadout.domain_profile) {
      try {
        await context.database.query(
          `UPDATE workspaces
           SET domain_profile = ?
           WHERE id = ?`,
          [loadout.domain_profile, input.workspace_id]
        );
      } catch {
        // Best effort only. ghostcrab_loadout_apply remains the canonical setter.
      }
    }

    return createToolSuccessResult("ghostcrab_loadout_seed", {
      workspace_id: input.workspace_id,
      loadout_id: loadout.loadout_id,
      domain_profile: loadout.domain_profile,
      persist_semantics: input.persist_semantics,
      graph: {
        seeded_nodes: graphResult.seeded_nodes.length,
        seeded_edges: graphResult.seeded_edges.length,
        node_ids: graphResult.seeded_nodes,
        edge_triplets: graphResult.seeded_edges
      },
      semantics: semanticResult,
      next_steps: [
        "Inspect the workspace model.",
        "Add domain-specific schemas.",
        "Extend or prune the seeded ontology nodes as needed."
      ]
    });
  }
};

registerTool(loadoutSeedTool);
