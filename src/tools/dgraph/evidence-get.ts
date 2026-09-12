import { z } from "zod";
import { runStandaloneKnowledge } from "../../db/standalone-mindbrain.js";
import {
  createToolSuccessResult,
  registerTool,
  type ToolHandler
} from "../registry.js";
import {
  EntityReferenceInput,
  entityReferenceSchema,
  knowledgeError,
  requireKnowledgeCapability
} from "./native-knowledge.js";

export const EvidenceGetInput = z
  .object({
    workspace_id: z.string().trim().min(1).optional(),
    assertion_ref: EntityReferenceInput,
    include_text: z.boolean().default(true),
    limit: z.number().int().min(1).max(100).default(20),
    cursor: z.string().min(1).max(128).optional()
  })
  .strict();

export const evidenceGetTool: ToolHandler = {
  definition: {
    name: "ghostcrab_evidence_get",
    description:
      "Read. Resolve an exact assertion and retrieve its declared supporting paths, source spans and text verification from MindBrain. Distinguishes direct support from a real Evidence object; missing text or mismatched hashes are explicit. Does not infer legal truth or fetch external sources.",
    inputSchema: {
      type: "object",
      required: ["assertion_ref"],
      additionalProperties: false,
      properties: {
        workspace_id: { type: "string" },
        assertion_ref: entityReferenceSchema,
        include_text: { type: "boolean", default: true },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
        cursor: {
          type: "string",
          description: "Opaque cursor returned by the previous evidence page."
        }
      }
    }
  },
  async handler(args, context) {
    const input = EvidenceGetInput.parse(args);
    try {
      const config = await requireKnowledgeCapability("evidence_get");
      const result = await runStandaloneKnowledge<Record<string, unknown>>({
        mindbrainUrl: config.mindbrainUrl,
        timeoutMs: config.mindbrainHttpTimeoutMs,
        operation: "evidence",
        workspaceId: input.workspace_id ?? context.session.workspace_id,
        input
      });
      return createToolSuccessResult("ghostcrab_evidence_get", result);
    } catch (error) {
      return knowledgeError("ghostcrab_evidence_get", error);
    }
  }
};
registerTool(evidenceGetTool);
