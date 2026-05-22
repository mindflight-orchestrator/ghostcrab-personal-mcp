import { z } from "zod";

import { resolveGhostcrabConfig } from "../../config/env.js";
import { runStandaloneReindexAll } from "../../db/standalone-mindbrain.js";
import {
  createToolErrorResult,
  createToolSuccessResult,
  registerTool,
  type ToolHandler
} from "../registry.js";

export const CollectionReindexInput = z.object({
  workspace_id: z.string().trim().min(1).optional(),
  collection_id: z.string().trim().min(1),
  table_id: z.coerce.number().int().positive()
});

export const collectionReindexTool: ToolHandler = {
  definition: {
    name: "ghostcrab_collection_reindex",
    description:
      "Write. Rebuild BM25, collection facet postings, and graph derived indexes for a workspace collection via native MindBrain reindexAll.",
    inputSchema: {
      type: "object",
      required: ["collection_id", "table_id"],
      properties: {
        workspace_id: {
          type: "string",
          description:
            "Target workspace id. Overrides session context for this call only."
        },
        collection_id: {
          type: "string",
          description: "Collection id whose raw documents and facets are reindexed."
        },
        table_id: {
          type: "integer",
          minimum: 1,
          description:
            "Facet/search table id used for BM25, facet_postings, and graph projection."
        }
      }
    }
  },
  async handler(args, context) {
    const input = CollectionReindexInput.parse(args);
    const workspaceId = input.workspace_id ?? context.session.workspace_id;
    const config = resolveGhostcrabConfig();

    try {
      const result = await runStandaloneReindexAll({
        mindbrainUrl: config.mindbrainUrl,
        timeoutMs: config.mindbrainHttpTimeoutMs,
        workspaceId,
        collectionId: input.collection_id,
        tableId: input.table_id
      });

      return createToolSuccessResult("ghostcrab_collection_reindex", {
        backend: "mindbrain/reindex/all",
        ...result
      });
    } catch (error) {
      return createToolErrorResult(
        "ghostcrab_collection_reindex",
        error instanceof Error ? error.message : "native collection reindex failed",
        "backend_reindex_failed"
      );
    }
  }
};

registerTool(collectionReindexTool);
