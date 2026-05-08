import { z } from "zod";

import {
  createToolSuccessResult,
  registerTool,
  type ToolHandler
} from "../registry.js";

export const EntityChunksInput = z.object({
  workspace_id: z.string().trim().min(1).optional(),
  entity_id: z.coerce.number().int().positive().optional(),
  entity_name: z.string().trim().min(1).optional(),
  entity_type: z.string().trim().min(1).optional(),
  collection_id: z.string().trim().min(1).optional(),
  doc_id: z.coerce.number().int().nonnegative().optional(),
  chunk_index: z.coerce.number().int().nonnegative().optional(),
  include_content: z.boolean().default(true),
  limit: z.coerce.number().int().min(1).max(200).default(50)
});

export const entityChunksTool: ToolHandler = {
  definition: {
    name: "ghostcrab_entity_chunks",
    description:
      "Read. Return graph_entity_chunk links, optionally joined to raw chunk/document content, for an entity or workspace collection scope.",
    inputSchema: {
      type: "object",
      properties: {
        workspace_id: {
          type: "string",
          description:
            "Target workspace id. Overrides session context for this call only."
        },
        entity_id: {
          type: "integer",
          minimum: 1,
          description: "Exact graph_entity.entity_id."
        },
        entity_name: {
          type: "string",
          description:
            "Optional graph_entity.name filter. Use with entity_type when names may collide."
        },
        entity_type: {
          type: "string",
          description: "Optional graph_entity.entity_type filter."
        },
        collection_id: {
          type: "string",
          description: "Optional collection scope."
        },
        doc_id: {
          type: "integer",
          minimum: 0,
          description: "Optional raw document id filter."
        },
        chunk_index: {
          type: "integer",
          minimum: 0,
          description: "Optional raw chunk index filter."
        },
        include_content: {
          type: "boolean",
          default: true,
          description:
            "Include chunks_raw.content and document metadata when available."
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 200,
          default: 50
        }
      }
    }
  },
  async handler(args, context) {
    const input = EntityChunksInput.parse(args);
    const workspaceId = input.workspace_id ?? context.session.workspace_id;

    const whereClauses = ["c.workspace_id = ?"];
    const params: unknown[] = [workspaceId];

    if (input.entity_id !== undefined) {
      whereClauses.push("c.entity_id = ?");
      params.push(input.entity_id);
    }
    if (input.entity_name !== undefined) {
      whereClauses.push("e.name = ?");
      params.push(input.entity_name);
    }
    if (input.entity_type !== undefined) {
      whereClauses.push("e.entity_type = ?");
      params.push(input.entity_type);
    }
    if (input.collection_id !== undefined) {
      whereClauses.push("c.collection_id = ?");
      params.push(input.collection_id);
    }
    if (input.doc_id !== undefined) {
      whereClauses.push("c.doc_id = ?");
      params.push(input.doc_id);
    }
    if (input.chunk_index !== undefined) {
      whereClauses.push("c.chunk_index = ?");
      params.push(input.chunk_index);
    }

    const rows = await context.database.query<{
      chunk_content: string | null;
      chunk_index: number;
      chunk_metadata_json: string | null;
      collection_id: string;
      confidence: number;
      doc_id: number;
      doc_nanoid: string | null;
      entity_id: number;
      entity_metadata_json: string;
      entity_name: string;
      entity_type: string;
      language: string | null;
      metadata_json: string;
      role: string | null;
      source_ref: string | null;
      summary: string | null;
      token_count: number | null;
    }>(
      `
        SELECT
          c.entity_id,
          e.entity_type,
          e.name AS entity_name,
          e.metadata_json AS entity_metadata_json,
          c.collection_id,
          c.doc_id,
          c.chunk_index,
          c.role,
          c.confidence,
          c.metadata_json,
          ${input.include_content ? "ch.content" : "NULL"} AS chunk_content,
          ${input.include_content ? "ch.language" : "NULL"} AS language,
          ${input.include_content ? "ch.token_count" : "NULL"} AS token_count,
          ${input.include_content ? "ch.metadata_json" : "NULL"} AS chunk_metadata_json,
          ${input.include_content ? "d.doc_nanoid" : "NULL"} AS doc_nanoid,
          ${input.include_content ? "d.source_ref" : "NULL"} AS source_ref,
          ${input.include_content ? "d.summary" : "NULL"} AS summary
        FROM graph_entity_chunk c
        JOIN graph_entity e ON e.entity_id = c.entity_id
        LEFT JOIN chunks_raw ch
          ON ch.workspace_id = c.workspace_id
         AND ch.collection_id = c.collection_id
         AND ch.doc_id = c.doc_id
         AND ch.chunk_index = c.chunk_index
        LEFT JOIN documents_raw d
          ON d.workspace_id = c.workspace_id
         AND d.collection_id = c.collection_id
         AND d.doc_id = c.doc_id
        WHERE ${whereClauses.join(" AND ")}
        ORDER BY c.confidence DESC, c.collection_id ASC, c.doc_id ASC, c.chunk_index ASC
        LIMIT ?
      `,
      [...params, input.limit]
    );

    return createToolSuccessResult("ghostcrab_entity_chunks", {
      workspace_id: workspaceId,
      filters: {
        entity_id: input.entity_id ?? null,
        entity_name: input.entity_name ?? null,
        entity_type: input.entity_type ?? null,
        collection_id: input.collection_id ?? null,
        doc_id: input.doc_id ?? null,
        chunk_index: input.chunk_index ?? null
      },
      include_content: input.include_content,
      backend: "sql",
      returned: rows.length,
      results: rows.map((row) => ({
        entity: {
          entity_id: Number(row.entity_id),
          entity_type: row.entity_type,
          name: row.entity_name,
          metadata: parseJsonObject(row.entity_metadata_json)
        },
        chunk: {
          collection_id: row.collection_id,
          doc_id: Number(row.doc_id),
          chunk_index: Number(row.chunk_index),
          role: row.role,
          confidence: Number(row.confidence ?? 0),
          metadata: parseJsonObject(row.metadata_json),
          content: row.chunk_content,
          language: row.language,
          token_count:
            row.token_count === null || row.token_count === undefined
              ? null
              : Number(row.token_count),
          chunk_metadata: parseJsonObject(row.chunk_metadata_json)
        },
        document: {
          doc_nanoid: row.doc_nanoid,
          source_ref: row.source_ref,
          summary: row.summary
        }
      }))
    });
  }
};

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  if (typeof value !== "string" || value.length === 0) {
    return {};
  }

  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

registerTool(entityChunksTool);
