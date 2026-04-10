import { z } from "zod";
import { randomUUID } from "node:crypto";

import { mergeFacetDeltasIfNeeded } from "../../db/maintenance.js";
import { formatPgVector } from "../../embeddings/vector.js";
import {
  createToolSuccessResult,
  registerTool,
  type ToolHandler
} from "../registry.js";

export const RememberInput = z.object({
  content: z.string().trim().min(1).max(100_000),
  facets: z.record(z.string(), z.unknown()).default({}),
  schema_id: z.string().min(1).default("agent:observation"),
  created_by: z.string().min(1).optional(),
  valid_until: z
    .string()
    .regex(
      /^\d{4}-\d{2}-\d{2}$/,
      "valid_until must be an ISO date in YYYY-MM-DD format."
    )
    .optional()
});

export const rememberTool: ToolHandler = {
  definition: {
    name: "ghostcrab_remember",
    description:
      "Store a fact, document, or observation in persistent memory and return its UUID.",
    inputSchema: {
      type: "object",
      required: ["content"],
      properties: {
        content: {
          type: "string",
          description: "Content to store in pg_facets."
        },
        facets: {
          type: "object",
          description: "Facet metadata for later filtering.",
          additionalProperties: true
        },
        schema_id: {
          type: "string",
          default: "agent:observation"
        },
        created_by: {
          type: "string"
        },
        valid_until: {
          type: "string",
          description: "Optional expiry date in YYYY-MM-DD format."
        }
      }
    }
  },
  async handler(args, context) {
    const input = RememberInput.parse(args);
    let embeddingRuntime = context.embeddings.getStatus();
    const notes: string[] = [];
    let embeddingStored = false;
    let embeddingValue: string | null = null;

    if (embeddingRuntime.writeEmbeddingsEnabled) {
      try {
        const [embedding] = await context.embeddings.embedMany([input.content]);

        if (embedding.length > 0) {
          embeddingValue = formatPgVector(embedding);
          embeddingStored = true;
        }
      } catch (error) {
        embeddingRuntime = context.embeddings.getStatus();
        notes.push(
          `Embeddings write skipped: ${error instanceof Error ? error.message : "Unknown embeddings error"}`
        );
      }
    }

    let row: { id: string; created_at: string } | undefined;

    if (context.database.kind === "sqlite") {
      const nowUnix = Math.floor(Date.now() / 1000);
      const id = randomUUID();
      const [docIdRow] = await context.database.query<{ next_doc_id: number }>(
        `SELECT COALESCE(MAX(doc_id), 0) + 1 AS next_doc_id FROM mfo_facets`
      );
      const docId = docIdRow?.next_doc_id ?? 1;
      const validUntilUnix = input.valid_until
        ? Math.floor(Date.parse(`${input.valid_until}T00:00:00Z`) / 1000)
        : null;

      await context.database.query(
        `
          INSERT INTO mfo_facets (
            id,
            schema_id,
            content,
            facets_json,
            embedding_blob,
            created_by,
            created_at_unix,
            updated_at_unix,
            valid_until_unix,
            doc_id
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          id,
          input.schema_id,
          input.content,
          JSON.stringify(input.facets),
          embeddingValue,
          input.created_by ?? null,
          nowUnix,
          nowUnix,
          validUntilUnix,
          docId
        ]
      );

      row = {
        id,
        created_at: new Date(nowUnix * 1000).toISOString()
      };
    } else {
      [row] = await context.database.query<{
        created_at: string;
        id: string;
      }>(
        embeddingValue
          ? `
              INSERT INTO mfo_facets (
                schema_id,
                content,
                facets,
                embedding,
                created_by,
                valid_until
              )
              VALUES ($1, $2, $3::jsonb, $4::vector, $5, $6::date)
              RETURNING id, created_at
            `
          : `
              INSERT INTO mfo_facets (
                schema_id,
                content,
                facets,
                created_by,
                valid_until
              )
              VALUES ($1, $2, $3::jsonb, $4, $5::date)
              RETURNING id, created_at
            `,
        embeddingValue
          ? [
              input.schema_id,
              input.content,
              JSON.stringify(input.facets),
              embeddingValue,
              input.created_by ?? null,
              input.valid_until ?? null
            ]
          : [
              input.schema_id,
              input.content,
              JSON.stringify(input.facets),
              input.created_by ?? null,
              input.valid_until ?? null
            ]
      );
    }

    if (!row?.id) {
      throw new Error(
        "INSERT returned no row — possible constraint violation"
      );
    }

    await mergeFacetDeltasIfNeeded(context.database, context.extensions);

    return createToolSuccessResult("ghostcrab_remember", {
      stored: true,
      id: row.id,
      created_at: row.created_at,
      schema_id: input.schema_id,
      embedding_runtime: embeddingRuntime,
      embedding_stored: embeddingStored,
      notes
    });
  }
};

registerTool(rememberTool);
