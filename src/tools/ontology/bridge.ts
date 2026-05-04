import { z } from "zod";

import {
  createToolErrorResult,
  createToolSuccessResult,
  registerTool,
  type ToolHandler
} from "../registry.js";

// ── ghostcrab_workspace_bridge ───────────────────────────────────────────────

const BridgeWorkspacesInput = z.object({
  workspace_id_a: z.string().trim().min(1),
  workspace_id_b: z.string().trim().min(1),
  bridge_label: z.string().trim().min(1)
});

export const bridgeWorkspacesTool: ToolHandler = {
  definition: {
    name: "ghostcrab_workspace_bridge",
    description:
      "Write. Create a semantic bridge between two workspaces, linking equivalent entity types across ontology boundaries. Requires pg_mindbrain.",
    inputSchema: {
      type: "object",
      required: ["workspace_id_a", "workspace_id_b", "bridge_label"],
      properties: {
        workspace_id_a: {
          type: "string",
          minLength: 1,
          description: "Identifier of the source workspace."
        },
        workspace_id_b: {
          type: "string",
          minLength: 1,
          description: "Identifier of the target workspace."
        },
        bridge_label: {
          type: "string",
          minLength: 1,
          description: "Label identifying the bridge relationship (e.g. 'equivalent_to', 'extends')."
        }
      }
    }
  },
  async handler(args, context) {
    if (!context.extensions.pgMindbrain) {
      return createToolErrorResult(
        "ghostcrab_workspace_bridge",
        "pg_mindbrain extension is not loaded; ghostcrab_workspace_bridge requires pg_mindbrain.",
        "extension_not_loaded"
      );
    }

    const input = BridgeWorkspacesInput.parse(args);

    const rows = await context.database.query<{ result: unknown }>(
      `SELECT mb_ontology.bridge_workspaces($1::text, $2::text, $3::text) AS result`,
      [input.workspace_id_a, input.workspace_id_b, input.bridge_label]
    );

    return createToolSuccessResult("ghostcrab_workspace_bridge", {
      workspace_id_a: input.workspace_id_a,
      workspace_id_b: input.workspace_id_b,
      bridge_label: input.bridge_label,
      result: rows[0]?.result ?? null
    });
  }
};

// ── ghostcrab_workspace_find_bridges ─────────────────────────────────────────

const FindEntityBridgesInput = z.object({
  workspace_id_a: z.string().trim().min(1),
  workspace_id_b: z.string().trim().min(1)
});

export const findEntityBridgesTool: ToolHandler = {
  definition: {
    name: "ghostcrab_workspace_find_bridges",
    description:
      "Read. Discover existing semantic bridges between two workspaces. Requires pg_mindbrain.",
    inputSchema: {
      type: "object",
      required: ["workspace_id_a", "workspace_id_b"],
      properties: {
        workspace_id_a: {
          type: "string",
          minLength: 1,
          description: "Identifier of the first workspace."
        },
        workspace_id_b: {
          type: "string",
          minLength: 1,
          description: "Identifier of the second workspace."
        }
      }
    }
  },
  async handler(args, context) {
    if (!context.extensions.pgMindbrain) {
      return createToolErrorResult(
        "ghostcrab_workspace_find_bridges",
        "pg_mindbrain extension is not loaded; ghostcrab_workspace_find_bridges requires pg_mindbrain.",
        "extension_not_loaded"
      );
    }

    const input = FindEntityBridgesInput.parse(args);

    const rows = await context.database.query<{ result: unknown }>(
      `SELECT mb_ontology.find_entity_bridges($1::text, $2::text) AS result`,
      [input.workspace_id_a, input.workspace_id_b]
    );

    return createToolSuccessResult("ghostcrab_workspace_find_bridges", {
      workspace_id_a: input.workspace_id_a,
      workspace_id_b: input.workspace_id_b,
      bridges: rows[0]?.result ?? null
    });
  }
};

registerTool(bridgeWorkspacesTool);
registerTool(findEntityBridgesTool);
