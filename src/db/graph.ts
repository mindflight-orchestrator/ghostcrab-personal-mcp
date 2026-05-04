/**
 * graph.* helpers (pg_dgraph-aligned). Convention: type = 'entity', name = MCP node id string.
 */

import type { Queryable } from "./client.js";

export const GRAPH_ENTITY_TYPE = "entity" as const;

export async function resolveGraphEntityId(
  database: Queryable,
  nodeId: string
): Promise<bigint | null> {
  if (database.kind === "sqlite") {
    const [row] = await database.query<{ entity_id: number }>(
      `
        SELECT entity_id
        FROM graph_entity
        WHERE entity_type = ? AND name = ?
        LIMIT 1
      `,
      [GRAPH_ENTITY_TYPE, nodeId]
    );

    return row ? BigInt(row.entity_id) : null;
  }

  const [row] = await database.query<{ id: string }>(
    `
      SELECT id::text
      FROM graph.entity
      WHERE type = $1 AND name = $2
      LIMIT 1
    `,
    [GRAPH_ENTITY_TYPE, nodeId]
  );

  return row ? BigInt(row.id) : null;
}

export async function upsertGraphEntity(
  database: Queryable,
  params: {
    nodeId: string;
    nodeType: string;
    label: string;
    properties: Record<string, unknown>;
    schemaId?: string | null;
  }
): Promise<bigint> {
  const metadata = {
    ...params.properties,
    node_type: params.nodeType,
    label: params.label,
    schema_id: params.schemaId ?? null
  };

  if (database.kind === "sqlite") {
    const existing = await resolveGraphEntityId(database, params.nodeId);
    if (existing !== null) {
      await database.query(
        `
          UPDATE graph_entity
          SET metadata_json = ?
          WHERE entity_id = ?
        `,
        [JSON.stringify(metadata), Number(existing)]
      );

      await database.query(
        `
          INSERT OR IGNORE INTO graph_entity_alias (term, entity_id, confidence)
          VALUES (?, ?, 1.0)
        `,
        [params.nodeId, Number(existing)]
      );

      return existing;
    }

    await database.query(
      `
        INSERT INTO graph_entity (entity_type, name, metadata_json)
        VALUES (?, ?, ?)
      `,
      [GRAPH_ENTITY_TYPE, params.nodeId, JSON.stringify(metadata)]
    );

    const created = await resolveGraphEntityId(database, params.nodeId);
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

    return created;
  }

  const [row] = await database.query<{ id: string }>(
    `
      INSERT INTO graph.entity (type, name, metadata)
      VALUES ($1, $2, $3::jsonb)
      ON CONFLICT (type, name) DO UPDATE SET
        metadata = graph.entity.metadata || EXCLUDED.metadata,
        deprecated_at = NULL
      RETURNING id::text
    `,
    [GRAPH_ENTITY_TYPE, params.nodeId, JSON.stringify(metadata)]
  );

  const entityId = BigInt(row.id);

  await database.query(
    `
      INSERT INTO graph.entity_alias (term, entity_id, confidence)
      VALUES ($1, $2, 1.0)
      ON CONFLICT (term, entity_id) DO NOTHING
    `,
    [params.nodeId, row.id]
  );

  return entityId;
}

export async function setGraphEntityWorkspaceId(
  _database: Queryable,
  _entityId: bigint,
  _workspaceId: string
): Promise<void> {
  // The SQLite graph tables in this repo do not currently store workspace_id on
  // graph entities directly. Keep the helper as a no-op so shared workspace
  // tooling can run without branching the public MCP surface.
}

export async function findGraphRelationByEndpoints(
  database: Queryable,
  params: {
    sourceName: string;
    targetName: string;
    label: string;
  }
): Promise<{ id: string } | null> {
  if (database.kind === "sqlite") {
    const [row] = await database.query<{ relation_id: number }>(
      `
        SELECT r.relation_id
        FROM graph_relation r
        JOIN graph_entity s ON s.entity_id = r.source_id AND s.entity_type = 'entity'
        JOIN graph_entity t ON t.entity_id = r.target_id AND t.entity_type = 'entity'
        WHERE s.name = ?
          AND t.name = ?
          AND r.relation_type = ?
        LIMIT 1
      `,
      [params.sourceName, params.targetName, params.label]
    );

    return row ? { id: String(row.relation_id) } : null;
  }

  const [row] = await database.query<{ id: string }>(
    `
      SELECT id::text
      FROM graph.find_relation_by_endpoints($1, $2, $3)
      LIMIT 1
    `,
    [params.sourceName, params.targetName, params.label]
  );

  return row ? { id: row.id } : null;
}

export async function upsertGraphRelation(
  database: Queryable,
  params: {
    label: string;
    properties: Record<string, unknown>;
    sourceId: bigint;
    targetId: bigint;
    confidence?: number;
  }
): Promise<string> {
  const confidence = params.confidence ?? 1;

  if (database.kind === "sqlite") {
    const [existing] = await database.query<{ relation_id: number }>(
      `
        SELECT relation_id
        FROM graph_relation
        WHERE source_id = ?
          AND target_id = ?
          AND relation_type = ?
        LIMIT 1
      `,
      [Number(params.sourceId), Number(params.targetId), params.label]
    );
    if (existing) {
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
          relation_type,
          source_id,
          target_id,
          confidence,
          metadata_json
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        relationId,
        params.label,
        Number(params.sourceId),
        Number(params.targetId),
        confidence,
        JSON.stringify(params.properties)
      ]
    );

    return String(relationId);
  }

  const [row] = await database.query<{ id: string }>(
    `
      SELECT graph.upsert_relation(
        $1,
        $2::bigint,
        $3::bigint,
        $4::real,
        NULL,
        NULL,
        $5::jsonb,
        NULL,
        NULL,
        NULL,
        NULL
      ) AS id
    `,
    [
      params.label,
      params.sourceId.toString(),
      params.targetId.toString(),
      confidence,
      JSON.stringify(params.properties)
    ]
  );

  return row?.id ?? `${params.sourceId}:${params.targetId}:${params.label}`;
}
