import { z } from "zod";

import { resolveGhostcrabConfig } from "../../config/env.js";
import type { Queryable } from "../../db/client.js";
import { runStandaloneGhostcrabProjectionGet } from "../../db/standalone-mindbrain.js";
import {
  createToolSuccessResult,
  registerTool,
  type ToolHandler
} from "../registry.js";

export const ProjectionGetInput = z.object({
  projection_id: z.string().trim().min(1),
  collection_id: z.preprocess(
    (value) => {
      if (value === null) return undefined;
      if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        if (normalized === "" || normalized === "null" || normalized === "nil") {
          return undefined;
        }
      }
      return value;
    },
    z.string().trim().min(1).optional()
  ),
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
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
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
          description: "Target workspace id. Overrides session context for this call only."
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
    const notes: string[] = [];
    let backend: "native" | "sql" = "native";
    let projectionResults: ProjectionEntity[];
    let linkedEvidence: LinkedEvidence[];
    let deltas: ProjectionEntity[];

    if (context.database.kind === "sqlite") {
      try {
        const response = await runStandaloneGhostcrabProjectionGet({
          mindbrainUrl: resolveGhostcrabConfig().mindbrainUrl,
          workspaceId,
          collectionId: input.collection_id,
          projectionId: input.projection_id,
          includeEvidence: input.include_evidence,
          includeDeltas: input.include_deltas
        });
        projectionResults = response.projection_results.map(mapEntity);
        linkedEvidence = response.linked_evidence.map((row) => ({
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
        deltas = response.deltas.map(mapEntity);
      } catch (error) {
        backend = "sql";
        notes.push(
          `MindBrain projection-get endpoint unavailable: ${error instanceof Error ? error.message : "Unknown backend error"} Falling back to local graph SQL.`
        );
        projectionResults = await loadProjectionResultsSql(
          context.database,
          workspaceId,
          input.collection_id,
          input.projection_id
        );
        linkedEvidence = input.include_evidence
          ? await loadLinkedEvidenceSql(
              context.database,
              workspaceId,
              input.collection_id,
              input.projection_id
            )
          : [];
        deltas = input.include_deltas
          ? await loadDeltasSql(
              context.database,
              workspaceId,
              input.collection_id,
              input.projection_id
            )
          : [];
      }
    } else {
      throw new Error("ghostcrab_projection_get is only implemented for SQLite mode.");
    }

    return createToolSuccessResult("ghostcrab_projection_get", {
      workspace_id: workspaceId,
      collection_id: input.collection_id ?? null,
      projection_id: input.projection_id,
      include_evidence: input.include_evidence,
      include_deltas: input.include_deltas,
      backend,
      notes,
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

async function loadProjectionResultsSql(
  database: Queryable,
  workspaceId: string,
  collectionId: string | undefined,
  projectionId: string
): Promise<ProjectionEntity[]> {
  const rows = await database.query<{
    confidence: number;
    entity_id: number;
    entity_type: string;
    metadata_json: unknown;
    name: string;
  }>(
    `
        SELECT entity_id, entity_type, name, confidence, metadata_json
        FROM graph_entity
        WHERE workspace_id = ?
          AND entity_type = 'ProjectionResult'
          AND json_extract(metadata_json, '$.projection_id') = ?
          AND (? IS NULL OR json_extract(metadata_json, '$.collection_id') = ?)
          AND deprecated_at IS NULL
        ORDER BY confidence DESC, entity_id ASC
      `,
    [workspaceId, projectionId, collectionId ?? null, collectionId ?? null]
  );
  return rows.map(mapEntity);
}

async function loadLinkedEvidenceSql(
  database: Queryable,
  workspaceId: string,
  collectionId: string | undefined,
  projectionId: string
): Promise<LinkedEvidence[]> {
  const rows = await database.query<{
    evidence_confidence: number;
    evidence_entity_id: number;
    evidence_entity_type: string;
    evidence_metadata_json: unknown;
    evidence_name: string;
    relation_id: number;
    relation_metadata_json: unknown;
    relation_type: string;
    source_id: number;
    target_id: number;
  }>(
    `
        SELECT
          r.relation_id,
          r.relation_type,
          r.source_id,
          r.target_id,
          r.metadata_json AS relation_metadata_json,
          e.entity_id AS evidence_entity_id,
          e.entity_type AS evidence_entity_type,
          e.name AS evidence_name,
          e.confidence AS evidence_confidence,
          e.metadata_json AS evidence_metadata_json
        FROM graph_entity p
        JOIN graph_relation r ON r.source_id = p.entity_id
        JOIN graph_entity e ON e.entity_id = r.target_id
        WHERE p.workspace_id = ?
          AND p.entity_type = 'ProjectionResult'
          AND json_extract(p.metadata_json, '$.projection_id') = ?
          AND (? IS NULL OR json_extract(p.metadata_json, '$.collection_id') = ?)
          AND p.deprecated_at IS NULL
          AND r.deprecated_at IS NULL
          AND e.deprecated_at IS NULL
        ORDER BY r.relation_id ASC, e.entity_id ASC
      `,
    [workspaceId, projectionId, collectionId ?? null, collectionId ?? null]
  );
  return rows.map((row) => ({
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
}

async function loadDeltasSql(
  database: Queryable,
  workspaceId: string,
  collectionId: string | undefined,
  projectionId: string
): Promise<ProjectionEntity[]> {
  const rows = await database.query<{
    confidence: number;
    entity_id: number;
    entity_type: string;
    metadata_json: unknown;
    name: string;
  }>(
    `
        SELECT entity_id, entity_type, name, confidence, metadata_json
        FROM graph_entity
        WHERE workspace_id = ?
          AND entity_type = 'DeltaFinding'
          AND json_extract(metadata_json, '$.metric') = ?
          AND (? IS NULL OR json_extract(metadata_json, '$.collection_id') = ?)
          AND deprecated_at IS NULL
        ORDER BY confidence DESC, entity_id ASC
      `,
    [workspaceId, projectionId, collectionId ?? null, collectionId ?? null]
  );
  return rows.map(mapEntity);
}

registerTool(projectionGetTool);
