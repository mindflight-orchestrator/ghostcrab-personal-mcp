import { z } from "zod";
import { resolveGhostcrabConfig } from "../../config/env.js";
import { runStandaloneKnowledge } from "../../db/standalone-mindbrain.js";
import { createToolErrorResult } from "../registry.js";

export const EntityReferenceInput = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("entity_id"),
      value: z.number().int().positive().max(4_294_967_295),
      ontology_id: z.string().min(1).optional(),
      entity_type: z.string().min(1).optional()
    })
    .strict(),
  ...["external_id", "fact_id", "name"].map((kind) =>
    z
      .object({
        kind: z.literal(kind as "external_id" | "fact_id" | "name"),
        value: z.string().min(1).max(4096),
        ontology_id: z.string().min(1).optional(),
        entity_type: z.string().min(1).optional()
      })
      .strict()
  )
]);
export const entityReferenceSchema = {
  type: "object",
  required: ["kind", "value"],
  additionalProperties: false,
  oneOf: [
    {
      properties: {
        kind: { const: "entity_id" },
        value: { type: "integer", minimum: 1, maximum: 4_294_967_295 }
      }
    },
    {
      properties: {
        kind: { enum: ["external_id", "fact_id", "name"] },
        value: { type: "string", minLength: 1, maxLength: 4096 }
      }
    }
  ],
  properties: {
    kind: {
      type: "string",
      enum: ["external_id", "fact_id", "entity_id", "name"]
    },
    value: {
      oneOf: [
        { type: "string", minLength: 1 },
        { type: "integer", minimum: 1 }
      ]
    },
    ontology_id: { type: "string", minLength: 1 },
    entity_type: { type: "string", minLength: 1 }
  }
} as const;

export async function requireKnowledgeCapability(
  feature: "native_fact_index" | "typed_entity_references" | "evidence_get"
) {
  const config = resolveGhostcrabConfig();
  const capabilities = await runStandaloneKnowledge<{
    features?: Record<string, boolean>;
  }>({
    mindbrainUrl: config.mindbrainUrl,
    operation: "capabilities",
    timeoutMs: config.mindbrainHttpTimeoutMs
  });
  if (capabilities.features?.[feature] !== true)
    throw new Error("CapabilityUnavailable");
  return config;
}

export function knowledgeError(tool: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const codes: Record<string, string> = {
    CapabilityUnavailable: "capability_unavailable",
    IndexNotReady: "index_not_ready",
    AmbiguousReference: "ambiguous_reference",
    NotFound: "not_found",
    StaleCursor: "stale_cursor",
    EvidenceProfileUnavailable: "evidence_profile_unavailable",
    InvalidEvidenceProfile: "invalid_evidence_profile",
    EvidenceLimitExceeded: "evidence_limit_exceeded",
    BadRequest: "invalid_arguments"
  };
  const code =
    Object.entries(codes).find(([native]) => message.includes(native))?.[1] ??
    "backend_unavailable";
  return createToolErrorResult(tool, message, code);
}
