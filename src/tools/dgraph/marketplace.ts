import { z } from "zod";

import {
  createToolErrorResult,
  createToolSuccessResult,
  registerTool,
  type ToolHandler
} from "../registry.js";

export const MarketplaceInput = z.object({
  query: z.string().trim().min(1),
  domain: z.string().min(1).optional(),
  min_confidence: z.coerce.number().min(0).max(1).default(0.5),
  max_hops: z.coerce.number().int().min(1).max(5).default(2),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

export const marketplaceTool: ToolHandler = {
  definition: {
    name: "ghostcrab_marketplace",
    description:
      "Search the knowledge graph using marketplace-style scoring (FTS rank + hub score + confidence decay). Requires pg_dgraph.",
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: {
        query: {
          type: "string",
          minLength: 1,
          description: "Search query."
        },
        domain: {
          type: "string",
          minLength: 1,
          description: "Optional domain filter applied as entity type prefix."
        },
        min_confidence: {
          type: "number",
          minimum: 0,
          maximum: 1,
          default: 0.5,
          description: "Minimum confidence score for returned entities."
        },
        max_hops: {
          type: "integer",
          minimum: 1,
          maximum: 5,
          default: 2,
          description: "Maximum graph hops from direct matches."
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          default: 20,
          description: "Maximum number of results."
        }
      }
    }
  },
  async handler(args, context) {
    const input = MarketplaceInput.parse(args);

    if (!context.extensions.pgDgraph) {
      return createToolErrorResult(
        "ghostcrab_marketplace",
        "pg_dgraph extension is not loaded; marketplace search requires native graph.",
        "extension_not_loaded"
      );
    }

    let rows: Array<{
      entity_id: string;
      name: string;
      type: string;
      confidence: number;
      fts_rank?: number;
      is_direct_match: boolean;
      hub_score?: number;
      composite_score: number;
      metadata: unknown;
    }>;

    try {
      rows = await context.database.query(
        `SELECT *
         FROM mb_ontology.marketplace_search_by_domain(
           $1::text,
           $2::text,
           NULL,
           $3::float,
           $4::int,
           NULL,
           $5::int
         )`,
        [
          input.query,
          input.domain ?? null,
          input.min_confidence,
          input.max_hops,
          input.limit
        ]
      );
    } catch {
      rows = await context.database.query(
        `SELECT * FROM graph.marketplace_search($1::text, $2::text, $3::real, $4::int, $5::int)`,
        [
          input.query,
          input.domain ?? null,
          input.min_confidence,
          input.max_hops,
          input.limit
        ]
      );
    }

    return createToolSuccessResult("ghostcrab_marketplace", {
      query: input.query,
      domain: input.domain ?? null,
      min_confidence: input.min_confidence,
      max_hops: input.max_hops,
      returned: rows.length,
      backend: "native" as const,
      results: rows.map((row) => ({
        entity_id: row.entity_id,
        name: row.name,
        type: row.type,
        confidence: row.confidence,
        fts_rank: row.fts_rank ?? null,
        is_direct_match: row.is_direct_match,
        hub_score: row.hub_score ?? null,
        composite_score: row.composite_score,
        metadata: row.metadata ?? null
      }))
    });
  }
};

registerTool(marketplaceTool);
