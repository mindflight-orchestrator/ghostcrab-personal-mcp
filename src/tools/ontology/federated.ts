import { z } from "zod";

import {
  createToolErrorResult,
  createToolSuccessResult,
  registerTool,
  type ToolHandler
} from "../registry.js";

const FederatedSearchInput = z.object({
  query: z.string().trim().min(1),
  workspace_ids: z.array(z.string().trim().min(1)).min(1),
  options: z.record(z.string(), z.unknown()).optional()
});

export const federatedSearchTool: ToolHandler = {
  definition: {
    name: "ghostcrab_federated_search",
    description:
      "Read. Run a federated full-text search across multiple workspaces simultaneously. Requires pg_mindbrain.",
    inputSchema: {
      type: "object",
      required: ["query", "workspace_ids"],
      properties: {
        query: {
          type: "string",
          minLength: 1,
          description: "Search query to run across all specified workspaces."
        },
        workspace_ids: {
          type: "array",
          minItems: 1,
          items: { type: "string", minLength: 1 },
          description: "List of workspace identifiers to search."
        },
        options: {
          type: "object",
          description: "Optional JSONB search options (e.g. limit, min_score, entity_types).",
          additionalProperties: true
        }
      }
    }
  },
  async handler(args, context) {
    if (!context.extensions.pgMindbrain) {
      return createToolErrorResult(
        "ghostcrab_federated_search",
        "pg_mindbrain extension is not loaded; ghostcrab_federated_search requires pg_mindbrain.",
        "extension_not_loaded"
      );
    }

    const input = FederatedSearchInput.parse(args);

    const rows = await context.database.query<{ result: unknown }>(
      `SELECT mb_ontology.federated_search($1::text, $2::text[], $3::jsonb) AS result`,
      [input.query, input.workspace_ids, input.options ?? null]
    );

    return createToolSuccessResult("ghostcrab_federated_search", {
      query: input.query,
      workspace_ids: input.workspace_ids,
      results: rows[0]?.result ?? null
    });
  }
};

registerTool(federatedSearchTool);
