import type { DatabaseClient } from "../../src/db/client.js";

export async function nextGraphEntityId(
  database: DatabaseClient
): Promise<number> {
  const [row] = await database.query<{ next_id: number }>(
    `
      SELECT COALESCE(MAX(entity_id), 0) + 1 AS next_id
      FROM graph_entity
      WHERE entity_id BETWEEN 1 AND ?
    `,
    [Number.MAX_SAFE_INTEGER - 1]
  );
  return Number(row?.next_id ?? 1);
}

export async function nextGraphRelationId(
  database: DatabaseClient
): Promise<number> {
  const [row] = await database.query<{ next_id: number }>(
    `
      SELECT COALESCE(MAX(relation_id), 0) + 1 AS next_id
      FROM graph_relation
      WHERE relation_id BETWEEN 1 AND ?
    `,
    [Number.MAX_SAFE_INTEGER - 1]
  );
  return Number(row?.next_id ?? 1);
}

export async function seedGraphProjectionResult(
  database: DatabaseClient,
  params: {
    workspaceId: string;
    projectionId: string;
    collectionId: string;
    label: string;
  }
): Promise<number> {
  const entityId = await nextGraphEntityId(database);
  await database.query(
    `
      INSERT INTO graph_entity (
        entity_id,
        workspace_id,
        entity_type,
        name,
        confidence,
        metadata_json
      )
      VALUES ($1, $2, 'ProjectionResult', $3, 1.0, $4)
    `,
    [
      entityId,
      params.workspaceId,
      params.label,
      JSON.stringify({
        projection_id: params.projectionId,
        collection_id: params.collectionId
      })
    ]
  );
  return entityId;
}

export async function seedGraphEntity(
  database: DatabaseClient,
  params: {
    workspaceId: string;
    entityType: string;
    name: string;
    metadata?: Record<string, unknown>;
    confidence?: number;
  }
): Promise<number> {
  const entityId = await nextGraphEntityId(database);
  await database.query(
    `
      INSERT INTO graph_entity (
        entity_id,
        workspace_id,
        entity_type,
        name,
        confidence,
        metadata_json
      )
      VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [
      entityId,
      params.workspaceId,
      params.entityType,
      params.name,
      params.confidence ?? 1.0,
      JSON.stringify(params.metadata ?? {})
    ]
  );
  return entityId;
}

export async function seedGraphRelation(
  database: DatabaseClient,
  params: {
    workspaceId: string;
    relationType: string;
    sourceId: number;
    targetId: number;
    metadata?: Record<string, unknown>;
  }
): Promise<number> {
  const relationId = await nextGraphRelationId(database);
  await database.query(
    `
      INSERT INTO graph_relation (
        relation_id,
        workspace_id,
        relation_type,
        source_id,
        target_id,
        confidence,
        metadata_json
      )
      VALUES ($1, $2, $3, $4, $5, 1.0, $6)
    `,
    [
      relationId,
      params.workspaceId,
      params.relationType,
      params.sourceId,
      params.targetId,
      JSON.stringify(params.metadata ?? {})
    ]
  );
  return relationId;
}

export async function seedAnswerArtifact(
  database: DatabaseClient,
  params: {
    artifactId: string;
    slug: string;
    workspaceId: string | null;
    artifactKind: "analysis_plan" | "live_answer_view" | "answer_snapshot";
    publicLabel: string;
    payload?: Record<string, unknown>;
    legacyRef?: string | null;
    agentId?: string | null;
    scope?: string | null;
    lifecycle?: string;
    state?: string;
    currentVersion?: number;
  }
): Promise<void> {
  const workspaceId = params.workspaceId;
  const agentId =
    params.artifactKind === "analysis_plan"
      ? (params.agentId ?? "agent:self")
      : (params.agentId ?? null);
  const scope =
    params.artifactKind === "analysis_plan"
      ? (params.scope ?? params.workspaceId ?? "default")
      : (params.scope ?? params.workspaceId);

  await database.query(
    `
      INSERT INTO mindbrain_answer_artifacts (
        artifact_id,
        slug,
        workspace_id,
        agent_id,
        scope,
        artifact_kind,
        public_label_key,
        public_label,
        lifecycle,
        state,
        current_version,
        payload_json,
        legacy_ref
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `,
    [
      params.artifactId,
      params.slug,
      workspaceId,
      agentId,
      scope,
      params.artifactKind,
      `${params.artifactKind}.${params.slug}`,
      params.publicLabel,
      params.lifecycle ?? "active",
      params.state ?? "open",
      params.currentVersion ?? 1,
      JSON.stringify(params.payload ?? {}),
      params.legacyRef ?? null
    ]
  );
}

export async function deleteWorkspaceProjectionsData(
  database: DatabaseClient,
  workspaceId: string,
  artifactIdPrefix?: string
): Promise<void> {
  await database.query(
    `
      DELETE FROM graph_relation
      WHERE workspace_id = $1
        AND source_id IN (
          SELECT entity_id FROM graph_entity
          WHERE workspace_id = $1 AND entity_type = 'ProjectionResult'
        )
    `,
    [workspaceId]
  );
  await database.query(
    `
      DELETE FROM graph_entity
      WHERE workspace_id = $1
        AND entity_type IN ('ProjectionResult', 'Evidence', 'DeltaFinding')
    `,
    [workspaceId]
  );
  if (artifactIdPrefix) {
    await database.query(
      `DELETE FROM mindbrain_answer_artifacts WHERE artifact_id LIKE $1`,
      [`${artifactIdPrefix}%`]
    );
  } else {
    await database.query(
      `DELETE FROM mindbrain_answer_artifacts WHERE workspace_id = $1`,
      [workspaceId]
    );
  }
  await database.query(
    `DELETE FROM mindbrain_answer_events WHERE artifact_id LIKE $1`,
    [artifactIdPrefix ? `${artifactIdPrefix}%` : `%${workspaceId}%`]
  );
}
