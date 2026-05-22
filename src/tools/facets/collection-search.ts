import { z } from "zod";

import { resolveGhostcrabConfig } from "../../config/env.js";
import { runStandaloneCollectionFacetSearch } from "../../db/standalone-mindbrain.js";
import {
  createToolSuccessResult,
  registerTool,
  type ToolHandler
} from "../registry.js";

export const CollectionFacetSearchInput = z.object({
  workspace_id: z.string().trim().min(1).optional(),
  collection_id: z.string().trim().min(1),
  table_id: z.coerce.number().int().positive().optional(),
  namespace: z.string().trim().min(1).optional(),
  dimension: z.string().trim().min(1).optional(),
  value: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25)
});

export const collectionFacetSearchTool: ToolHandler = {
  definition: {
    name: "ghostcrab_collection_facet_search",
    description:
      "Read. Search collection facets for a workspace/collection. After reindex, reads Roaring bitmaps from facet_postings (namespace+dimension required). Falls back to facet_assignments_raw when postings are absent or namespace/dimension are omitted. Extended tool for collection-imported taxonomy facets (distinct from agent facets table).",
    inputSchema: {
      type: "object",
      required: ["collection_id"],
      properties: {
        workspace_id: {
          type: "string",
          description: "Target workspace id. Defaults to session workspace."
        },
        collection_id: {
          type: "string",
          description: "Collection id within the workspace."
        },
        table_id: {
          type: "integer",
          description:
            "Optional facet table id (facet_tables.table_id). When set, enables facet_postings Roaring search after reindex."
        },
        namespace: {
          type: "string",
          description: "Optional ontology namespace filter."
        },
        dimension: {
          type: "string",
          description: "Optional facet dimension filter."
        },
        value: {
          type: "string",
          description: "Optional substring match on facet value."
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          default: 25
        }
      }
    }
  },
  async handler(args, context) {
    const input = CollectionFacetSearchInput.parse(args);
    const workspaceId = input.workspace_id ?? context.session.workspace_id;
    const config = resolveGhostcrabConfig();

    const result = await runStandaloneCollectionFacetSearch({
      mindbrainUrl: config.mindbrainUrl,
      timeoutMs: config.mindbrainHttpTimeoutMs,
      workspaceId,
      collectionId: input.collection_id,
      tableId: input.table_id,
      namespace: input.namespace,
      dimension: input.dimension,
      value: input.value,
      limit: input.limit
    });

    return createToolSuccessResult("ghostcrab_collection_facet_search", {
      workspace_id: workspaceId,
      collection_id: input.collection_id,
      namespace: input.namespace ?? null,
      dimension: input.dimension ?? null,
      value: input.value ?? null,
      returned: result.returned,
      matches: result.matches,
      source: result.source
    });
  }
};

registerTool(collectionFacetSearchTool);
