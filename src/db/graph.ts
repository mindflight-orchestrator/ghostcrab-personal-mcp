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
