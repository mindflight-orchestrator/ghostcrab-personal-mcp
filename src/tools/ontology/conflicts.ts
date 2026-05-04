import { z } from "zod";

import {
  createToolErrorResult,
  createToolSuccessResult,
  registerTool,
  type ToolHandler
} from "../registry.js";

const DetectConflictsInput = z.object({
  workspace_ids: z.array(z.string().trim().min(1)).min(2)
});

export const detectConflictsTool: ToolHandler = {
  definition: {
    name: "ghostcrab_ontology_conflicts",
    description:
      "Read. Detect ontology conflicts across a set of workspaces (e.g. type name clashes, incompatible relation definitions). Requires pg_mindbrain.",
    inputSchema: {
      type: "object",
      required: ["workspace_ids"],
      properties: {
        workspace_ids: {
          type: "array",
          minItems: 2,
          items: { type: "string", minLength: 1 },
          description: "List of workspace identifiers to scan for conflicts (minimum 2)."
        }
      }
    }
  },
  async handler(args, context) {
    if (!context.extensions.pgMindbrain) {
      return createToolErrorResult(
        "ghostcrab_ontology_conflicts",
        "pg_mindbrain extension is not loaded; ghostcrab_ontology_conflicts requires pg_mindbrain.",
        "extension_not_loaded"
      );
    }

    const input = DetectConflictsInput.parse(args);

    const rows = await context.database.query<{ result: unknown }>(
      `SELECT mb_ontology.detect_conflicts($1::text[]) AS result`,
      [input.workspace_ids]
    );

    return createToolSuccessResult("ghostcrab_ontology_conflicts", {
      workspace_ids: input.workspace_ids,
      conflicts: rows[0]?.result ?? null
    });
  }
};

registerTool(detectConflictsTool);
