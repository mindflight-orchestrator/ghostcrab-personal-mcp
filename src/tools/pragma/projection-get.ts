import { z } from "zod";

import { resolveGhostcrabConfig } from "../../config/env.js";
import { runStandaloneGhostcrabProjectionGet } from "../../db/standalone-mindbrain.js";
import {
  createToolErrorResult,
  createToolSuccessResult,
  registerTool,
  type ToolHandler
} from "../registry.js";

export const ProjectionGetInput = z.object({
  projection_id: z.string().trim().min(1),
  collection_id: z.preprocess((value) => {
    if (value === null) return undefined;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (normalized === "" || normalized === "null" || normalized === "nil") {
        return undefined;
      }
    }
    return value;
  }, z.string().trim().min(1).optional()),
  include_evidence: z.boolean().default(true),
  include_deltas: z.boolean().default(true),
  workspace_id: z.string().trim().min(1).optional()
});

type ProjectionEntity = {
  entity_id: number;
  entity_type: string;
  name: string;
  confidence: number;
  metadata: Record<string, unknown>;
};

type LinkedEvidence = {
  relation: {
    relation_id: number;
    relation_type: string;
    source_id: number;
    target_id: number;
    metadata: Record<string, unknown>;
  };
  evidence: ProjectionEntity;
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

function mapEntity(row: {
  confidence: number;
  entity_id: number;
  entity_type: string;
  metadata_json: unknown;
  name: string;
}): ProjectionEntity {
  return {
    entity_id: Number(row.entity_id),
    entity_type: row.entity_type,
    name: row.name,
    confidence: Number(row.confidence ?? 0),
    metadata: parseJsonObject(row.metadata_json)
  };
}

export const projectionGetTool: ToolHandler = {
  definition: {
    name: "ghostcrab_projection_get",
    description:
      "Read. Retrieve a materialized graph projection by projection_id from ProjectionResult entities, optionally including linked evidence and DeltaFinding rows.",
    inputSchema: {
      type: "object",
      required: ["projection_id"],
      properties: {
        workspace_id: {
          type: "string",
          description:
            "Target workspace id. Overrides session context for this call only."
        },
        collection_id: {
          type: ["string", "null"],
          description:
            "Optional collection scope. Omit or pass null to search all collections in the workspace."
        },
        projection_id: {
          type: "string",
          description:
            "Projection identifier stored in graph_entity.metadata_json.projection_id."
        },
        include_evidence: {
          type: "boolean",
          default: true,
          description:
            "Include graph_relation rows sourced from ProjectionResult and their target evidence entities."
        },
        include_deltas: {
          type: "boolean",
          default: true,
          description:
            "Include DeltaFinding entities where metadata_json.metric equals projection_id."
        }
      }
    }
  },
  async handler(args, context) {
    const input = ProjectionGetInput.parse(args);
    const workspaceId = input.workspace_id ?? context.session.workspace_id;

    let response;
    try {
      response = await runStandaloneGhostcrabProjectionGet({
        mindbrainUrl: resolveGhostcrabConfig().mindbrainUrl,
        workspaceId,
        collectionId: input.collection_id,
        projectionId: input.projection_id,
        includeEvidence: input.include_evidence,
        includeDeltas: input.include_deltas
      });
    } catch (error) {
      return createToolErrorResult(
        "ghostcrab_projection_get",
        error instanceof Error ? error.message : "MindBrain projection-get backend unavailable",
        "backend_unavailable"
      );
    }

    const projectionResults = response.projection_results.map(mapEntity);
    const linkedEvidence = response.linked_evidence.map((row) => ({
      relation: {
        relation_id: Number(row.relation_id),
        relation_type: row.relation_type,
        source_id: Number(row.source_id),
        target_id: Number(row.target_id),
        metadata: parseJsonObject(row.relation_metadata_json)
      },
      evidence: {
        entity_id: Number(row.evidence_entity_id),
        entity_type: row.evidence_entity_type,
        name: row.evidence_name,
        confidence: Number(row.evidence_confidence ?? 0),
        metadata: parseJsonObject(row.evidence_metadata_json)
      }
    }));
    const deltas = response.deltas.map(mapEntity);

    return createToolSuccessResult("ghostcrab_projection_get", {
      workspace_id: workspaceId,
      collection_id: input.collection_id ?? null,
      projection_id: input.projection_id,
      include_evidence: input.include_evidence,
      include_deltas: input.include_deltas,
      backend: "native",
      notes: [],
      projection_results: projectionResults,
      linked_evidence: linkedEvidence,
      deltas,
      report: {
        workspace_id: workspaceId,
        collection_id: input.collection_id ?? null,
        projection_id: input.projection_id,
        projection_result_count: projectionResults.length,
        linked_evidence_count: linkedEvidence.length,
        delta_count: deltas.length,
        has_projection: projectionResults.length > 0
      }
    });
  }
};

registerTool(projectionGetTool);
