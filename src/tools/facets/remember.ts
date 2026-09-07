import { z } from "zod";

import { resolveGhostcrabConfig } from "../../config/env.js";
import { canonicalJsonHash } from "../../db/canonical-json.js";
import { encodeEmbedding } from "../../embeddings/blob.js";
import { runStandaloneFactWrite } from "../../db/standalone-mindbrain.js";
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
    .optional(),
  valid_from: z
    .string()
    .regex(
      /^\d{4}-\d{2}-\d{2}$/,
      "valid_from must be an ISO date in YYYY-MM-DD format."
    )
    .optional()
});

const GOAL_INTENT_PATTERNS =
  /\b(i want|i need|i'd like|je veux|je voudrais|je vais|create|créer|build|construire|make|develop|set up|design|implement)\b/i;

/**
 * An intention is not an observation. Writing "je veux suivre les chantiers"
 * as a durable fact fills the store with things that were never true, and the
 * distinction is worth materialising in code rather than only in the docs.
 *
 * Deliberately narrow: long texts, JSON payloads and multi-line notes are left
 * alone, because a phrasing match inside a real report is a false positive.
 * Ported from the Postgres build so both engines warn on the same inputs.
 */
function looksLikeGoalOrIntent(content: string): boolean {
  const trimmed = content.trim();
  if (trimmed.length > 2_000) {
    return false;
  }
  if (GOAL_INTENT_PATTERNS.test(trimmed)) {
    try {
      JSON.parse(trimmed);
      return false;
    } catch {
      return !trimmed.includes("\n") || trimmed.split("\n").length < 5;
    }
  }
  return false;
}

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
        },
        valid_from: {
          type: "string",
          description:
            "Optional start of validity in YYYY-MM-DD format. Defaults to today. Backdate it when importing a fact that was already true earlier; facts dated in the future stay out of reads until that date."
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
    let rawEmbedding: number[] | undefined;
    let embeddingBlob: string | undefined;

    if (looksLikeGoalOrIntent(input.content)) {
      notes.push(
        "This content looks like a domain-modeling goal or intent rather than a factual observation. " +
          "Storing it as a raw fact may pollute your workspace. " +
          "Consider calling ghostcrab_status first to get routing, workspace guidance, and suggested modeling steps."
      );
    }

    if (embeddingRuntime.writeEmbeddingsEnabled) {
      try {
        const [embedding] = await context.embeddings.embedMany([input.content]);
        if (embedding.length > 0) {
          rawEmbedding = embedding;
          embeddingBlob = encodeEmbedding(embedding);
          embeddingStored = true;
        }
      } catch (error) {
        embeddingRuntime = context.embeddings.getStatus();
        notes.push(
          `Embeddings write skipped: ${error instanceof Error ? error.message : "Unknown embeddings error"}`
        );
      }
    }

    const validUntilUnix = input.valid_until
      ? Math.floor(Date.parse(`${input.valid_until}T00:00:00Z`) / 1000)
      : undefined;
    // Default to now so a fact is current from the moment it is written; the
    // backend COALESCEs on rewrite, so re-remembering never moves the start.
    const validFromUnix = input.valid_from
      ? Math.floor(Date.parse(`${input.valid_from}T00:00:00Z`) / 1000)
      : Math.floor(Date.now() / 1000);

    // Deterministic provenance over the whole payload: two identical
    // observations are one observation. The backend resolves the same
    // source_ref to the same row, so re-running a session does not fan the
    // store out into near-duplicates, and "where does this come from" has an
    // answer that survives the session. Any change to content, facets or
    // schema_id yields a different ref, hence a new appended row.
    const sourceRef = `ghostcrab://remember/${canonicalJsonHash({
      content: input.content,
      facets: input.facets,
      schema_id: input.schema_id
    })}`;

    const config = resolveGhostcrabConfig();
    const result = await runStandaloneFactWrite({
      mindbrainUrl: config.mindbrainUrl,
      timeoutMs: config.mindbrainHttpTimeoutMs,
      schemaId: input.schema_id,
      content: input.content,
      workspaceId: effectiveWorkspaceId,
      facetsJson: JSON.stringify(input.facets),
      embeddingBlob,
      embedding: rawEmbedding,
      createdBy: input.created_by,
      validUntilUnix,
      validFromUnix,
      sourceRef
    });

    if (result.updated) {
      notes.push(
        "An identical fact was already stored under the same provenance; the existing row was refreshed instead of duplicated."
      );
    }

    return createToolSuccessResult("ghostcrab_remember", {
      stored: true,
      id: result.id,
      created: result.created,
      deduplicated: result.updated,
      source_ref: sourceRef,
      created_at: new Date().toISOString(),
      schema_id: input.schema_id,
      workspace_id: effectiveWorkspaceId,
      embedding_runtime: embeddingRuntime,
      embedding_stored: embeddingStored,
      notes
    });
  }
};

registerTool(rememberTool);
