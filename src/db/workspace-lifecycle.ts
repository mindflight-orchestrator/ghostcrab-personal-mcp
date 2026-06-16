import type { Queryable } from "./client.js";

export interface WorkspaceCleanupReport {
  workspace_id: string;
  tables_cleared: Array<{ table: string; rows_deleted: number }>;
  rows_deleted: number;
}

async function safeCount(
  db: Queryable,
  sql: string,
  params: readonly unknown[] = []
): Promise<number> {
  try {
    const rows = await db.query<{ count: number | string }>(sql, params);
    return Number(rows[0]?.count ?? 0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("no such table")) {
      return 0;
    }
    throw error;
  }
}

/**
 * Remove all data scoped to a workspace without deleting the workspace row.
 */
export async function resetWorkspaceData(
  db: Queryable,
  workspaceId: string
): Promise<WorkspaceCleanupReport> {
  const tables_cleared: Array<{ table: string; rows_deleted: number }> = [];
  const answerArtifactScopeParams = [
    workspaceId,
    workspaceId,
    `${workspaceId}:%`
  ] as const;
  const answerArtifactWorkspacePredicate = `
    workspace_id = ?
    OR (
      artifact_kind = 'analysis_plan'
      AND (scope = ? OR scope LIKE ?)
    )
  `;
  const projectionScopeParams = [workspaceId, `${workspaceId}:%`] as const;

  async function clear(
    table: string,
    countSql: string,
    deleteSql: string,
    params: readonly unknown[] = [workspaceId]
  ): Promise<void> {
    try {
      const rows_deleted = await safeCount(db, countSql, params);
      if (rows_deleted === 0) {
        return;
      }
      await db.query(deleteSql, params);
      tables_cleared.push({ table, rows_deleted });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("no such table")) {
        return;
      }
      throw error;
    }
  }

  await clear(
    "graph_relation_property",
    `SELECT COUNT(*) AS count FROM graph_relation_property
     WHERE relation_id IN (
       SELECT relation_id FROM graph_relation WHERE workspace_id = ?
     )`,
    `DELETE FROM graph_relation_property
     WHERE relation_id IN (
       SELECT relation_id FROM graph_relation WHERE workspace_id = ?
     )`
  );
  await clear(
    "graph_entity_document",
    `SELECT COUNT(*) AS count FROM graph_entity_document
     WHERE entity_id IN (
       SELECT entity_id FROM graph_entity WHERE workspace_id = ?
     )`,
    `DELETE FROM graph_entity_document
     WHERE entity_id IN (
       SELECT entity_id FROM graph_entity WHERE workspace_id = ?
     )`
  );
  await clear(
    "graph_entity_chunk",
    `SELECT COUNT(*) AS count FROM graph_entity_chunk WHERE workspace_id = ?`,
    `DELETE FROM graph_entity_chunk WHERE workspace_id = ?`
  );
  await clear(
    "graph_relation",
    `SELECT COUNT(*) AS count FROM graph_relation WHERE workspace_id = ?`,
    `DELETE FROM graph_relation WHERE workspace_id = ?`
  );
  await clear(
    "graph_entity_alias",
    `SELECT COUNT(*) AS count FROM graph_entity_alias
     WHERE entity_id IN (SELECT entity_id FROM graph_entity WHERE workspace_id = ?)`,
    `DELETE FROM graph_entity_alias
     WHERE entity_id IN (SELECT entity_id FROM graph_entity WHERE workspace_id = ?)`
  );
  await clear(
    "graph_entity",
    `SELECT COUNT(*) AS count FROM graph_entity WHERE workspace_id = ?`,
    `DELETE FROM graph_entity WHERE workspace_id = ?`
  );
  await clear(
    "graph_gap_rules",
    `SELECT COUNT(*) AS count FROM graph_gap_rules WHERE workspace_id = ?`,
    `DELETE FROM graph_gap_rules WHERE workspace_id = ?`
  );
  await clear(
    "relation_properties_raw",
    `SELECT COUNT(*) AS count FROM relation_properties_raw WHERE workspace_id = ?`,
    `DELETE FROM relation_properties_raw WHERE workspace_id = ?`
  );
  await clear(
    "relations_raw",
    `SELECT COUNT(*) AS count FROM relations_raw WHERE workspace_id = ?`,
    `DELETE FROM relations_raw WHERE workspace_id = ?`
  );
  await clear(
    "entity_documents_raw",
    `SELECT COUNT(*) AS count FROM entity_documents_raw WHERE workspace_id = ?`,
    `DELETE FROM entity_documents_raw WHERE workspace_id = ?`
  );
  await clear(
    "entity_chunks_raw",
    `SELECT COUNT(*) AS count FROM entity_chunks_raw WHERE workspace_id = ?`,
    `DELETE FROM entity_chunks_raw WHERE workspace_id = ?`
  );
  await clear(
    "entity_aliases_raw",
    `SELECT COUNT(*) AS count FROM entity_aliases_raw WHERE workspace_id = ?`,
    `DELETE FROM entity_aliases_raw WHERE workspace_id = ?`
  );
  await clear(
    "entities_raw",
    `SELECT COUNT(*) AS count FROM entities_raw WHERE workspace_id = ?`,
    `DELETE FROM entities_raw WHERE workspace_id = ?`
  );
  await clear(
    "facet_assignments_raw",
    `SELECT COUNT(*) AS count FROM facet_assignments_raw WHERE workspace_id = ?`,
    `DELETE FROM facet_assignments_raw WHERE workspace_id = ?`
  );
  await clear(
    "external_links_raw",
    `SELECT COUNT(*) AS count FROM external_links_raw WHERE workspace_id = ?`,
    `DELETE FROM external_links_raw WHERE workspace_id = ?`
  );
  await clear(
    "document_links_raw",
    `SELECT COUNT(*) AS count FROM document_links_raw WHERE workspace_id = ?`,
    `DELETE FROM document_links_raw WHERE workspace_id = ?`
  );
  await clear(
    "chunks_raw_vector",
    `SELECT COUNT(*) AS count FROM chunks_raw_vector WHERE workspace_id = ?`,
    `DELETE FROM chunks_raw_vector WHERE workspace_id = ?`
  );
  await clear(
    "documents_raw_vector",
    `SELECT COUNT(*) AS count FROM documents_raw_vector WHERE workspace_id = ?`,
    `DELETE FROM documents_raw_vector WHERE workspace_id = ?`
  );
  await clear(
    "chunks_raw",
    `SELECT COUNT(*) AS count FROM chunks_raw WHERE workspace_id = ?`,
    `DELETE FROM chunks_raw WHERE workspace_id = ?`
  );
  await clear(
    "documents_raw",
    `SELECT COUNT(*) AS count FROM documents_raw WHERE workspace_id = ?`,
    `DELETE FROM documents_raw WHERE workspace_id = ?`
  );
  await clear(
    "agent_facts",
    `SELECT COUNT(*) AS count FROM agent_facts WHERE workspace_id = ?`,
    `DELETE FROM agent_facts WHERE workspace_id = ?`
  );
  await clear(
    "collection_ontologies",
    `SELECT COUNT(*) AS count FROM collection_ontologies WHERE workspace_id = ?`,
    `DELETE FROM collection_ontologies WHERE workspace_id = ?`
  );
  await clear(
    "collections",
    `SELECT COUNT(*) AS count FROM collections WHERE workspace_id = ?`,
    `DELETE FROM collections WHERE workspace_id = ?`
  );
  await clear(
    "workspace_settings",
    `SELECT COUNT(*) AS count FROM workspace_settings WHERE workspace_id = ?`,
    `DELETE FROM workspace_settings WHERE workspace_id = ?`
  );
  await clear(
    "ontologies",
    `SELECT COUNT(*) AS count FROM ontologies WHERE workspace_id = ?`,
    `DELETE FROM ontologies WHERE workspace_id = ?`
  );
  await clear(
    "pending_migrations",
    `SELECT COUNT(*) AS count FROM pending_migrations WHERE workspace_id = ?`,
    `DELETE FROM pending_migrations WHERE workspace_id = ?`
  );
  await clear(
    "column_semantics",
    `SELECT COUNT(*) AS count FROM column_semantics WHERE workspace_id = ?`,
    `DELETE FROM column_semantics WHERE workspace_id = ?`
  );
  await clear(
    "relation_semantics",
    `SELECT COUNT(*) AS count FROM relation_semantics WHERE workspace_id = ?`,
    `DELETE FROM relation_semantics WHERE workspace_id = ?`
  );
  await clear(
    "table_semantics",
    `SELECT COUNT(*) AS count FROM table_semantics WHERE workspace_id = ?`,
    `DELETE FROM table_semantics WHERE workspace_id = ?`
  );
  await clear(
    "mindbrain_answer_events",
    `SELECT COUNT(*) AS count FROM mindbrain_answer_events
     WHERE artifact_id IN (
       SELECT artifact_id FROM mindbrain_answer_artifacts
       WHERE ${answerArtifactWorkspacePredicate}
     )`,
    `DELETE FROM mindbrain_answer_events
     WHERE artifact_id IN (
       SELECT artifact_id FROM mindbrain_answer_artifacts
       WHERE ${answerArtifactWorkspacePredicate}
     )`,
    answerArtifactScopeParams
  );
  await clear(
    "mindbrain_answer_artifacts",
    `SELECT COUNT(*) AS count FROM mindbrain_answer_artifacts
     WHERE ${answerArtifactWorkspacePredicate}`,
    `DELETE FROM mindbrain_answer_artifacts
     WHERE ${answerArtifactWorkspacePredicate}`,
    answerArtifactScopeParams
  );
  await clear(
    "projections",
    `SELECT COUNT(*) AS count FROM projections
     WHERE scope = ? OR scope LIKE ?`,
    `DELETE FROM projections
     WHERE scope = ? OR scope LIKE ?`,
    projectionScopeParams
  );

  const rows_deleted = tables_cleared.reduce(
    (sum, entry) => sum + entry.rows_deleted,
    0
  );

  return {
    workspace_id: workspaceId,
    tables_cleared,
    rows_deleted
  };
}

export async function deleteWorkspaceRow(
  db: Queryable,
  workspaceId: string
): Promise<number> {
  try {
    const rows_deleted = await safeCount(
      db,
      `SELECT COUNT(*) AS count FROM workspaces WHERE id = ?`,
      [workspaceId]
    );
    if (rows_deleted === 0) {
      return 0;
    }
    await db.query(`DELETE FROM workspaces WHERE id = ?`, [workspaceId]);
    return rows_deleted;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("no such table")) {
      return 0;
    }
    throw error;
  }
}

export async function archiveWorkspaceRow(
  db: Queryable,
  workspaceId: string
): Promise<void> {
  await db.query(`UPDATE workspaces SET status = 'archived' WHERE id = ?`, [
    workspaceId
  ]);
}
