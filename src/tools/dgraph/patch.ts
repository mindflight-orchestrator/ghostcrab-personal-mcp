import { z } from "zod";

import {
  createToolErrorResult,
  createToolSuccessResult,
  registerTool,
  type ToolHandler
} from "../registry.js";

export const PatchInput = z.object({
  patch_id: z.number().int().positive(),
  applied_by: z.string().min(1).default("agent:self")
});

export const patchTool: ToolHandler = {
  definition: {
    name: "ghostcrab_patch",
    description:
      "Apply a knowledge patch previously produced by the graph learning pipeline (pg_dgraph).",
    inputSchema: {
      type: "object",
      required: ["patch_id"],
      properties: {
        patch_id: { type: "integer", minimum: 1 },
        applied_by: { type: "string", default: "agent:self" }
      }
    }
  },
  async handler(args, context) {
    const input = PatchInput.parse(args);

    if (!context.extensions.pgDgraph) {
      return createToolErrorResult(
        "ghostcrab_patch",
        "pg_dgraph extension is not loaded; knowledge patches require native graph.",
        "extension_not_loaded"
      );
    }

    const [row] = await context.database.query<{ apply_knowledge_patch: number }>(
      `
        SELECT graph.apply_knowledge_patch($1::bigint, $2::text) AS apply_knowledge_patch
      `,
      [input.patch_id, input.applied_by]
    );

    const relationsApplied = row?.apply_knowledge_patch ?? 0;

    return createToolSuccessResult("ghostcrab_patch", {
      patch_id: input.patch_id,
      applied_by: input.applied_by,
      relations_applied: relationsApplied,
      backend: "native" as const
    });
  }
};

registerTool(patchTool);
