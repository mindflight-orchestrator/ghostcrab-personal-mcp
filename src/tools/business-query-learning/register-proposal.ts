import { createHash } from "node:crypto";
import { z } from "zod";

import { encodeEmbedding } from "../../embeddings/blob.js";
import { resolveGhostcrabConfig } from "../../config/env.js";
import { runStandaloneFactWrite } from "../../db/standalone-mindbrain.js";
import {
  createToolErrorResult,
  createToolSuccessResult,
  registerTool,
  type ToolHandler
} from "../registry.js";
import { SQLITE_FACT_STORE_TABLE } from "../../db/fact-store.js";
import type { ToolExecutionContext } from "../registry.js";
import type { BusinessCapability } from "../business-query-router/types.js";

const BusinessCapabilitySchema = z
  .object({
    capability_id: z.string().trim().min(1),
    workspace_id: z.string().trim().min(1),
    label: z.string().trim().min(1).optional(),
    business_question: z.string().trim().min(1),
    example_queries: z.array(z.string()).default([]),
    required_schemas: z.array(z.string()).default([]),
    required_facets: z.array(z.string()).default([]),
    required_edges: z.array(z.string()).default([]),
    scope: z.string().nullable().optional(),
    agent_id: z.string().nullable().optional(),
    artifact_kind: z.string().default("gap_report"),
    availability: z
      .enum([
        "analysis_plan",
        "live_answer_view",
        "answer_snapshot",
        "evidence_pack",
        "live_query",
        "gap_report"
      ])
      .default("gap_report"),
    fallback_mode: z.string().default("gap_report"),
    source: z.string().default("registered_proposal"),
    status: z.string().default("active"),
    activation_status: z.enum(["active", "pending_review"]).default("pending_review"),
    proposal_fingerprint: z.string().optional(),
    version: z.union([z.string(), z.number()]).default(1)
  })
  .strict();

const RegisterProposalInput = z
  .object({
    workspace_id: z.string().trim().min(1),
    proposal_id: z.string().trim().min(1).optional(),
    proposal: z
      .object({
        proposal_id: z.string().trim().min(1).optional(),
        capability: BusinessCapabilitySchema,
        activation_status: z
          .enum(["active", "pending_review"])
          .default("pending_review")
          .optional()
      })
      .strict()
      .optional(),
    accepted_by: z.string().trim().min(1),
    persist_to: z.array(z.literal("mindbrain")).default(["mindbrain"])
  })
  .strict()
  .refine(
    (value) => value.proposal_id !== undefined || value.proposal !== undefined,
    "Provide proposal_id or proposal."
  );

function buildProposalFingerprint(
  capability: Pick<
    BusinessCapability,
    | "capability_id"
    | "workspace_id"
    | "label"
    | "business_question"
    | "required_facets"
    | "required_schemas"
    | "required_edges"
    | "status"
  >
): string {
  const hash = createHash("sha1");
  const payload = {
    capability_id: capability.capability_id,
    workspace_id: capability.workspace_id,
    label: capability.label ?? null,
    business_question: capability.business_question,
    required_facets: [...(capability.required_facets ?? [])].sort(),
    required_schemas: [...(capability.required_schemas ?? [])].sort(),
    required_edges: [...(capability.required_edges ?? [])].sort(),
    status: capability.status ?? "active"
  };
  hash.update(JSON.stringify(payload));
  return hash.digest("hex");
}

export const businessQueryRegisterProposalTool: ToolHandler = {
  definition: {
    name: "ghostcrab_business_query_register",
    description:
      "Write. Register an explicitly accepted business capability proposal as ghostcrab:business-capability.",
    inputSchema: {
      type: "object",
      required: ["workspace_id", "accepted_by"],
      properties: {
        workspace_id: { type: "string" },
        proposal_id: {
          type: "string",
          description:
            "Accepted proposal id. A full proposal object is required for persistence in v1."
        },
        proposal: {
          type: "object",
          description: "Learning proposal returned by ghostcrab_business_query_answer."
        },
        accepted_by: { type: "string" },
        persist_to: {
          type: "array",
          items: { type: "string", enum: ["mindbrain"] },
          default: ["mindbrain"]
        }
      },
      additionalProperties: false
    }
  },
  async handler(args, context) {
    const input = RegisterProposalInput.parse(args);
    if (!input.persist_to.includes("mindbrain")) {
      return createToolErrorResult(
        "ghostcrab_business_query_register",
        "Only persist_to=['mindbrain'] is supported in this branch.",
        "unsupported_persistence_target"
      );
    }

    if (!input.proposal) {
      return createToolErrorResult(
        "ghostcrab_business_query_register",
        "A full proposal object is required to register a capability.",
        "proposal_required",
        { proposal_id: input.proposal_id }
      );
    }

    const rawCapability = {
      ...input.proposal.capability,
      workspace_id: input.workspace_id,
      status: "active",
      activation_status:
        input.proposal.activation_status ?? "pending_review"
    };
    const proposalFingerprint =
      rawCapability.proposal_fingerprint ??
      buildProposalFingerprint(rawCapability as BusinessCapability);
    const capability = {
      ...rawCapability,
      proposal_fingerprint: proposalFingerprint
    };

    const existing = await findExistingProposal(context, {
      workspaceId: input.workspace_id,
      capabilityId: capability.capability_id,
      proposalFingerprint: proposalFingerprint
    });

    const proposalStorageId = input.proposal.proposal_id ?? input.proposal_id ?? null;
    if (existing && existing.activation_status === "pending_review") {
      return createToolSuccessResult(
        "ghostcrab_business_query_register",
        {
          schema_id: "ghostcrab:business-capability",
          id: existing.id,
          version: 1,
          capability_id: capability.capability_id,
          workspace_id: input.workspace_id,
          persisted_to: ["mindbrain"],
          persisted_status: "already_exists",
          proposal_fingerprint: proposalFingerprint,
          proposal_id: proposalStorageId,
          activation_status: existing.activation_status ?? "active",
          notes: ["Proposal already exists; no changes applied."]
        }
      );
    }

    const now = new Date().toISOString();
    const facets = {
      ...capability,
      proposal_id: proposalStorageId,
      accepted_by: input.accepted_by,
      accepted_at: now,
      activation_status: input.proposal.activation_status ?? "pending_review"
    };
    const content = capability.business_question ?? input.proposal.proposal_id;
    let embeddingStored = false;
    let embeddingBlob: string | undefined;

    if (context.embeddings.getStatus().writeEmbeddingsEnabled) {
      try {
        const [embedding] = await context.embeddings.embedMany([content]);
        if (embedding.length > 0) {
          embeddingBlob = encodeEmbedding(embedding);
          embeddingStored = true;
        }
      } catch {
        embeddingStored = false;
      }
    }

    if (existing) {
      await runStandaloneFactWrite({
        mindbrainUrl: resolveGhostcrabConfig().mindbrainUrl,
        timeoutMs: resolveGhostcrabConfig().mindbrainHttpTimeoutMs,
        id: existing.id,
        workspaceId: input.workspace_id,
        schemaId: "ghostcrab:business-capability",
        content,
        facetsJson: JSON.stringify(facets),
        embeddingBlob: embeddingBlob,
        createdBy: input.accepted_by
      });
    } else {
      await runStandaloneFactWrite({
        mindbrainUrl: resolveGhostcrabConfig().mindbrainUrl,
        timeoutMs: resolveGhostcrabConfig().mindbrainHttpTimeoutMs,
        workspaceId: input.workspace_id,
        schemaId: "ghostcrab:business-capability",
        content,
        facetsJson: JSON.stringify(facets),
        embeddingBlob: embeddingBlob,
        createdBy: input.accepted_by
      });
    }

    const [stored] = await context.database.query<{ id: string }>(
      `
        SELECT id
        FROM ${SQLITE_FACT_STORE_TABLE}
        WHERE schema_id = 'ghostcrab:business-capability'
          AND json_extract(facets_json, '$.capability_id') = ?
          AND json_extract(facets_json, '$.workspace_id') = ?
        ORDER BY updated_at_unix DESC, created_at_unix DESC
        LIMIT 1
      `,
      [capability.capability_id, input.workspace_id]
    );

    return createToolSuccessResult(
      "ghostcrab_business_query_register",
      {
        schema_id: "ghostcrab:business-capability",
        id: stored?.id ?? existing?.id ?? null,
        version: 1,
        capability_id: capability.capability_id,
        workspace_id: input.workspace_id,
        persisted_to: ["mindbrain"],
        embedding_stored: embeddingStored,
        proposal_fingerprint: proposalFingerprint,
        proposal_id: proposalStorageId,
        activation_status: input.proposal.activation_status ?? "pending_review",
        notes: [
          existing
            ? "Proposal overwritten with accepted payload."
            : "Proposal persisted."
        ]
      }
    );
  }
};

async function findExistingProposal(
  context: ToolExecutionContext,
  params: {
    workspaceId: string;
    capabilityId: string;
    proposalFingerprint: string;
  }
): Promise<
  | {
      id: string;
      activation_status: string;
      proposal_id: string | null;
    }
  | null
> {
  const rows = await context.database.query<{
    id: string;
    facets_json: string;
  }>(
    `
      SELECT id, facets_json
      FROM ${SQLITE_FACT_STORE_TABLE}
      WHERE schema_id = 'ghostcrab:business-capability'
        AND (
          json_extract(facets_json, '$.capability_id') = ?
          OR json_extract(facets_json, '$.proposal_fingerprint') = ?
        )
        AND json_extract(facets_json, '$.workspace_id') = ?
      LIMIT 1
    `,
    [params.capabilityId, params.proposalFingerprint, params.workspaceId]
  );

  if (rows.length === 0) return null;

  const first = rows[0];
  if (!first) return null;
  const facets = parseFacets(first.facets_json);
  return {
    id: first.id,
    activation_status: String(facets.activation_status ?? "active"),
    proposal_id: (facets.proposal_id as string | undefined) ?? null
  };
}

function parseFacets(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

registerTool(businessQueryRegisterProposalTool);
