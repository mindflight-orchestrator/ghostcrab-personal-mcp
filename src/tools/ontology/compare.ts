import { z } from "zod";

import {
  createToolErrorResult,
  createToolSuccessResult,
  registerTool,
  type ToolHandler
} from "../registry.js";

const CompareWorkspacesInput = z.object({
  workspace_id_a: z.string().trim().min(1),
  workspace_id_b: z.string().trim().min(1)
});

export const compareWorkspacesTool: ToolHandler = {
  definition: {
    name: "ghostcrab_workspace_compare",
    description:
      "Read. Compare the ontology schemas of two workspaces and return structural differences. Requires pg_mindbrain.",
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
        "ghostcrab_workspace_compare",
        "pg_mindbrain extension is not loaded; ghostcrab_workspace_compare requires pg_mindbrain.",
        "extension_not_loaded"
      );
    }

    const input = CompareWorkspacesInput.parse(args);

    const rows = await context.database.query<{ result: unknown }>(
      `SELECT mb_ontology.compare_workspaces($1::text, $2::text) AS result`,
      [input.workspace_id_a, input.workspace_id_b]
    );

    return createToolSuccessResult("ghostcrab_workspace_compare", {
      workspace_id_a: input.workspace_id_a,
      workspace_id_b: input.workspace_id_b,
      comparison: rows[0]?.result ?? null
    });
  }
};

registerTool(compareWorkspacesTool);
