import { z } from "zod";
import { randomUUID } from "node:crypto";

import { formatPgVector } from "../../embeddings/vector.js";
import { SQLITE_NEXT_FACT_DOC_ID_EXPR } from "../../db/fact-store.js";
import {
  createToolSuccessResult,
  registerTool,
  type ToolHandler
} from "../registry.js";

export const RememberInput = z.object({
  content: z.string().trim().min(1).max(100_000),
  facets: z.record(z.string(), z.unknown()).default({}),
  schema_id: z.string().min(1).default("agent:observation"),
  workspace_id: z.string().min(1).optional(),
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
      "Write. Store durable facts, stable notes, or observations in persistent memory. Call ghostcrab_status first for routing and workspace guidance when not on first-turn fuzzy onboarding. Do not use on a first-turn fuzzy onboarding request. Summarize before storing; avoid using raw payloads as the durable artifact when a stable summary will do.",
    inputSchema: {
      type: "object",
      required: ["content"],
      properties: {
        content: {
          type: "string",
          description: "Content to store in the facets store."
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
        workspace_id: {
          type: "string",
          description:
            "Target workspace id. Overrides session context for this call only."
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
    const effectiveWorkspaceId =
      input.workspace_id ?? context.session.workspace_id;
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

    const nowUnix = Math.floor(Date.now() / 1000);
    const id = randomUUID();
    const validUntilUnix = input.valid_until
      ? Math.floor(Date.parse(`${input.valid_until}T00:00:00Z`) / 1000)
      : null;

    await context.database.query(
      `
        INSERT INTO facets (
          id,
          schema_id,
          content,
          facets_json,
          embedding_blob,
          created_by,
          created_at_unix,
          updated_at_unix,
          valid_until_unix,
          doc_id,
          workspace_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ${SQLITE_NEXT_FACT_DOC_ID_EXPR}, ?)
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
        effectiveWorkspaceId
      ]
    );

    return createToolSuccessResult("ghostcrab_remember", {
      stored: true,
      id,
      created_at: new Date(nowUnix * 1000).toISOString(),
      schema_id: input.schema_id,
      workspace_id: effectiveWorkspaceId,
      embedding_runtime: embeddingRuntime,
      embedding_stored: embeddingStored,
      notes
    });
  }
};

registerTool(rememberTool);
