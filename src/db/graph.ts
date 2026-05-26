/**
 * graph_* helpers for the SQLite standalone backend.
 * Convention: entity_type = 'entity', name = MCP node id string.
 */

import type { Queryable } from "./client.js";

export const GRAPH_ENTITY_TYPE = "entity" as const;

const DEFAULT_ONTOLOGY_SUFFIX = "ghostcrab_learn";

export function learnOntologyId(workspaceId: string): string {
  return `${workspaceId}::${DEFAULT_ONTOLOGY_SUFFIX}`;
}

async function ensureLearnWorkspaceScaffold(
  database: Queryable,
  workspaceId: string
): Promise<void> {
  const ontologyId = learnOntologyId(workspaceId);

  await database.query(
    `
      INSERT INTO workspaces (id, workspace_id, label)
      VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        workspace_id = COALESCE(workspaces.workspace_id, excluded.workspace_id)
    `,
    [workspaceId, workspaceId, workspaceId]
  );

  await database.query(
    `
      INSERT INTO ontologies (ontology_id, workspace_id, name, source_kind)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(ontology_id) DO UPDATE SET
        workspace_id = excluded.workspace_id,
        name = excluded.name
    `,
    [ontologyId, workspaceId, DEFAULT_ONTOLOGY_SUFFIX, "constructed"]
  );
}

export async function resolveGraphEntityId(
  database: Queryable,
  nodeId: string,
  workspaceId = "default"
): Promise<bigint | null> {
  const [row] = await database.query<{ entity_id: number }>(
    `
      SELECT entity_id
      FROM graph_entity
      WHERE workspace_id = ?
        AND entity_type = ?
        AND name = ?
      LIMIT 1
    `,
    [workspaceId, GRAPH_ENTITY_TYPE, nodeId]
  );

  return row ? BigInt(row.entity_id) : null;
}

export async function mirrorGraphNodeToRaw(
  database: Queryable,
  workspaceId: string,
  entityId: bigint
): Promise<void> {
  const ontologyId = learnOntologyId(workspaceId);
  await ensureLearnWorkspaceScaffold(database, workspaceId);

  await database.query(
    `
      INSERT INTO entities_raw (
        workspace_id,
        ontology_id,
        entity_id,
        entity_type,
        name,
        confidence,
        metadata_json
      )
      SELECT
        ?,
        ?,
        entity_id,
        entity_type,
        name,
        confidence,
        metadata_json
      FROM graph_entity
      WHERE entity_id = ?
      ON CONFLICT(entity_id) DO UPDATE SET
        ontology_id = excluded.ontology_id,
        entity_type = excluded.entity_type,
        name = excluded.name,
        confidence = excluded.confidence,
        metadata_json = excluded.metadata_json
    `,
    [workspaceId, ontologyId, Number(entityId)]
  );
}

export async function mirrorGraphEdgeToRaw(
  database: Queryable,
  workspaceId: string,
  relationId: string,
  label: string,
  sourceId: bigint,
  targetId: bigint,
  confidence: number,
  properties: Record<string, unknown>
): Promise<void> {
  const ontologyId = learnOntologyId(workspaceId);
  await ensureLearnWorkspaceScaffold(database, workspaceId);

  await mirrorGraphNodeToRaw(database, workspaceId, sourceId);
  await mirrorGraphNodeToRaw(database, workspaceId, targetId);

  await database.query(
    `
      INSERT INTO relations_raw (
        workspace_id,
        ontology_id,
        relation_id,
        edge_type,
        source_entity_id,
        target_entity_id,
        confidence,
        metadata_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(relation_id) DO UPDATE SET
        ontology_id = excluded.ontology_id,
        edge_type = excluded.edge_type,
        source_entity_id = excluded.source_entity_id,
        target_entity_id = excluded.target_entity_id,
        confidence = excluded.confidence,
        metadata_json = excluded.metadata_json
    `,
    [
      workspaceId,
      ontologyId,
      Number(relationId),
      label,
      Number(sourceId),
      Number(targetId),
      confidence,
      JSON.stringify(properties)
    ]
  );
}

export async function upsertGraphEntity(
  database: Queryable,
  params: {
    nodeId: string;
    nodeType: string;
    label: string;
    properties: Record<string, unknown>;
    schemaId?: string | null;
    workspaceId?: string;
  }
): Promise<bigint> {
  const workspaceId = params.workspaceId ?? "default";
  const metadata = {
    ...params.properties,
    node_type: params.nodeType,
    label: params.label,
    schema_id: params.schemaId ?? null,
    workspace_id: workspaceId
  };

  const existing = await resolveGraphEntityId(
    database,
    params.nodeId,
    workspaceId
  );
  if (existing !== null) {
    await database.query(
      `
        UPDATE graph_entity
        SET metadata_json = ?, workspace_id = ?
        WHERE entity_id = ?
      `,
      [JSON.stringify(metadata), workspaceId, Number(existing)]
    );

    await database.query(
      `
        INSERT OR IGNORE INTO graph_entity_alias (term, entity_id, confidence)
        VALUES (?, ?, 1.0)
      `,
      [params.nodeId, Number(existing)]
    );

    await mirrorGraphNodeToRaw(database, workspaceId, existing);
    return existing;
  }

  await database.query(
    `
      INSERT INTO graph_entity (workspace_id, entity_type, name, metadata_json)
      VALUES (?, ?, ?, ?)
    `,
    [workspaceId, GRAPH_ENTITY_TYPE, params.nodeId, JSON.stringify(metadata)]
  );

  const created = await resolveGraphEntityId(
    database,
    params.nodeId,
    workspaceId
  );
  if (created === null) {
    throw new Error("Failed to create graph entity");
  }

  await database.query(
    `
      INSERT OR IGNORE INTO graph_entity_alias (term, entity_id, confidence)
      VALUES (?, ?, 1.0)
    `,
    [params.nodeId, Number(created)]
  );

  await mirrorGraphNodeToRaw(database, workspaceId, created);
  return created;
}

export async function setGraphEntityWorkspaceId(
  database: Queryable,
  entityId: bigint,
  workspaceId: string
): Promise<void> {
  await database.query(
    `
      UPDATE graph_entity
      SET workspace_id = ?
      WHERE entity_id = ?
    `,
    [workspaceId, Number(entityId)]
  );
}

export async function findGraphRelationByEndpoints(
  database: Queryable,
  params: {
    sourceName: string;
    targetName: string;
    label: string;
    workspaceId?: string;
  }
): Promise<{ id: string } | null> {
  const workspaceId = params.workspaceId ?? "default";
  const [row] = await database.query<{ relation_id: number }>(
    `
      SELECT r.relation_id
      FROM graph_relation r
      JOIN graph_entity s ON s.entity_id = r.source_id AND s.entity_type = 'entity'
      JOIN graph_entity t ON t.entity_id = r.target_id AND t.entity_type = 'entity'
      WHERE s.workspace_id = ?
        AND t.workspace_id = ?
        AND s.name = ?
        AND t.name = ?
        AND r.relation_type = ?
      LIMIT 1
    `,
    [
      workspaceId,
      workspaceId,
      params.sourceName,
      params.targetName,
      params.label
    ]
  );

  return row ? { id: String(row.relation_id) } : null;
}

export async function upsertGraphRelation(
  database: Queryable,
  params: {
    label: string;
    properties: Record<string, unknown>;
    sourceId: bigint;
    targetId: bigint;
    confidence?: number;
    workspaceId?: string;
  }
): Promise<string> {
  const workspaceId = params.workspaceId ?? "default";
  const confidence = params.confidence ?? 1;

  const [existing] = await database.query<{ relation_id: number }>(
    `
      SELECT relation_id
      FROM graph_relation
      WHERE workspace_id = ?
        AND source_id = ?
        AND target_id = ?
        AND relation_type = ?
      LIMIT 1
    `,
    [
      workspaceId,
      Number(params.sourceId),
      Number(params.targetId),
      params.label
    ]
  );
  if (existing) {
    await database.query(
      `
        UPDATE graph_relation
        SET metadata_json = ?, confidence = ?
        WHERE relation_id = ?
      `,
      [JSON.stringify(params.properties), confidence, existing.relation_id]
    );
    await mirrorGraphEdgeToRaw(
      database,
      workspaceId,
      String(existing.relation_id),
      params.label,
      params.sourceId,
      params.targetId,
      confidence,
      params.properties
    );
    return String(existing.relation_id);
  }

  const [nextRelationRow] = await database.query<{ next_id: number }>(
    `SELECT COALESCE(MAX(relation_id), 0) + 1 AS next_id FROM graph_relation`
  );
  const relationId = nextRelationRow?.next_id ?? 1;

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
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      relationId,
      workspaceId,
      params.label,
      Number(params.sourceId),
      Number(params.targetId),
      confidence,
      JSON.stringify(params.properties)
    ]
  );

  await mirrorGraphEdgeToRaw(
    database,
    workspaceId,
    String(relationId),
    params.label,
    params.sourceId,
    params.targetId,
    confidence,
    params.properties
  );

  return String(relationId);
}

export interface RelationProperty {
  property_key: string;
  value_type:
    | "text"
    | "number"
    | "percentage_bp"
    | "money_minor"
    | "date_unix"
    | "doc_ref"
    | "uri";
  value_text?: string;
  value_number?: number;
  value_integer?: number;
  ref_doc_id?: number;
  currency?: string;
}

export async function upsertGraphRelationProperties(
  database: Queryable,
  workspaceId: string,
  relationId: string,
  relation: {
    label: string;
    properties: Record<string, unknown>;
    sourceId: bigint;
    targetId: bigint;
    confidence?: number;
  },
  properties: RelationProperty[]
): Promise<void> {
  if (properties.length === 0) {
    return;
  }

  await mirrorGraphEdgeToRaw(
    database,
    workspaceId,
    relationId,
    relation.label,
    relation.sourceId,
    relation.targetId,
    relation.confidence ?? 1,
    relation.properties
  );

  for (const prop of properties) {
    await database.query(
      `
        INSERT INTO relation_properties_raw (
          workspace_id,
          relation_id,
          property_key,
          value_type,
          value_text,
          value_number,
          value_integer,
          ref_doc_id,
          currency
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(workspace_id, relation_id, property_key) DO UPDATE SET
          value_type = excluded.value_type,
          value_text = excluded.value_text,
          value_number = excluded.value_number,
          value_integer = excluded.value_integer,
          ref_doc_id = excluded.ref_doc_id,
          currency = excluded.currency
      `,
      [
        workspaceId,
        Number(relationId),
        prop.property_key,
        prop.value_type,
        prop.value_text ?? null,
        prop.value_number ?? null,
        prop.value_integer ?? null,
        prop.ref_doc_id ?? null,
        prop.currency ?? null
      ]
    );
  }

  await database.query(
    `
      INSERT INTO graph_relation_property (
        relation_id,
        property_key,
        value_type,
        value_text,
        value_number,
        value_integer,
        ref_doc_id,
        currency
      )
      SELECT
        relation_id,
        property_key,
        value_type,
        value_text,
        value_number,
        value_integer,
        ref_doc_id,
        currency
      FROM relation_properties_raw
      WHERE workspace_id = ?
        AND relation_id = ?
      ON CONFLICT(relation_id, property_key) DO UPDATE SET
        value_type = excluded.value_type,
        value_text = excluded.value_text,
        value_number = excluded.value_number,
        value_integer = excluded.value_integer,
        ref_doc_id = excluded.ref_doc_id,
        currency = excluded.currency
    `,
    [workspaceId, Number(relationId)]
  );
}
