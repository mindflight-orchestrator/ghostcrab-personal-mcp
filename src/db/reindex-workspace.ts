import type { Queryable } from "./client.js";

export interface WorkspaceReindexTarget {
  collection_id: string;
  table_id: number;
}

export interface WorkspaceReindexDiscovery {
  targets: WorkspaceReindexTarget[];
  skipped_collections: string[];
  source: "collections" | "documents_raw";
}

const TARGETS_FROM_COLLECTIONS_SQL = `
  SELECT c.collection_id AS collection_id, ft.table_id AS table_id
  FROM collections c
  INNER JOIN facet_tables ft ON ft.table_name = c.collection_id
  WHERE c.workspace_id = ?
  ORDER BY c.collection_id
`;

const TARGETS_FROM_DOCUMENTS_RAW_SQL = `
  SELECT DISTINCT dr.collection_id AS collection_id, ft.table_id AS table_id
  FROM documents_raw dr
  INNER JOIN facet_tables ft ON ft.table_name = dr.collection_id
  WHERE dr.workspace_id = ?
  ORDER BY dr.collection_id
`;

const COLLECTION_IDS_FROM_COLLECTIONS_SQL = `
  SELECT collection_id
  FROM collections
  WHERE workspace_id = ?
  ORDER BY collection_id
`;

const COLLECTION_IDS_FROM_DOCUMENTS_RAW_SQL = `
  SELECT DISTINCT collection_id
  FROM documents_raw
  WHERE workspace_id = ?
  ORDER BY collection_id
`;

export async function discoverWorkspaceReindexTargets(
  database: Queryable,
  workspaceId: string
): Promise<WorkspaceReindexDiscovery> {
  const fromCollections = await database.query<{
    collection_id: string;
    table_id: number;
  }>(TARGETS_FROM_COLLECTIONS_SQL, [workspaceId]);

  if (fromCollections.length > 0) {
    const skipped = await listSkippedCollectionIds(
      database,
      workspaceId,
      fromCollections
    );
    return {
      targets: fromCollections.map(normalizeTarget),
      skipped_collections: skipped,
      source: "collections"
    };
  }

  const fromDocumentsRaw = await database.query<{
    collection_id: string;
    table_id: number;
  }>(TARGETS_FROM_DOCUMENTS_RAW_SQL, [workspaceId]);

  const skipped = await listSkippedCollectionIds(
    database,
    workspaceId,
    fromDocumentsRaw
  );

  return {
    targets: fromDocumentsRaw.map(normalizeTarget),
    skipped_collections: skipped,
    source: "documents_raw"
  };
}

async function listSkippedCollectionIds(
  database: Queryable,
  workspaceId: string,
  targets: WorkspaceReindexTarget[]
): Promise<string[]> {
  const registered = await database.query<{ collection_id: string }>(
    COLLECTION_IDS_FROM_COLLECTIONS_SQL,
    [workspaceId]
  );

  const collectionIds =
    registered.length > 0
      ? registered.map((row) => row.collection_id)
      : (
          await database.query<{ collection_id: string }>(
            COLLECTION_IDS_FROM_DOCUMENTS_RAW_SQL,
            [workspaceId]
          )
        ).map((row) => row.collection_id);

  const targetIds = new Set(targets.map((target) => target.collection_id));
  return collectionIds.filter((collectionId) => !targetIds.has(collectionId));
}

function normalizeTarget(row: {
  collection_id: string;
  table_id: number;
}): WorkspaceReindexTarget {
  return {
    collection_id: row.collection_id,
    table_id: Number(row.table_id)
  };
}
