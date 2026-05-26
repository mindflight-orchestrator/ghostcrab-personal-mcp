/**
 * Immeuble-demo coherence: backup bundle import → raw counts → graph reindex → MCP reads.
 *
 * Requires:
 * - Native mindbrain-standalone-tool binary (vendor/mindbrain/zig-out)
 * - Reachable MindBrain HTTP backend whose SQLite file matches resolveGhostcrabSqlite()
 *   (set GHOSTCRAB_SQLITE_PATH + GHOSTCRAB_MINDBRAIN_URL to the running backend)
 *
 * File-level import assertions always run. MCP tool assertions skip when the backend
 * database is not aligned with the resolved SQLite path.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { resolveGhostcrabSqlite } from "../../bin/lib/resolve-ghostcrab-sqlite.mjs";
import type { DatabaseClient } from "../../src/db/client.js";
import { collectionReindexTool } from "../../src/tools/dgraph/collection-reindex.js";
import { graphReindexTool } from "../../src/tools/dgraph/graph-reindex.js";
import { graphSearchTool } from "../../src/tools/dgraph/graph-search.js";
import { learnTool } from "../../src/tools/dgraph/learn.js";
import { traverseTool } from "../../src/tools/dgraph/traverse.js";
import { collectionFacetSearchTool } from "../../src/tools/facets/collection-search.js";
import { searchTool } from "../../src/tools/facets/search.js";
import { spawnBackupLoad } from "../helpers/backup-load.js";
import {
  backendSeesSqliteCounts,
  canReadSqliteFile,
  readSqliteCount
} from "../helpers/sqlite-file.js";
import {
  closeIntegrationDatabase,
  createIntegrationHarness,
  readStructured
} from "../helpers/cli-integration.js";
import { createToolContext } from "../helpers/tool-context.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const WS_ID = "immeuble-demo";
const COLL_ID = "immeuble-demo::docs";
const FACET_TABLE_ID = 77001;
const BUNDLE_PATH = join(__dirname, "../../examples/immeuble-demo/bundle.json");
const LEARN_TEST_NODE_ID = "immeuble-demo:audit-test-node";

const harness = createIntegrationHarness();
let sqlitePath = "";
let bundleEntityCount = 0;
let bundleRelationCount = 0;
let backendAligned = false;

async function countRows(
  database: DatabaseClient,
  sql: string,
  params: readonly unknown[] = []
): Promise<number> {
  const [row] = await database.query<{ count: number }>(sql, params);
  return Number(row?.count ?? 0);
}

async function safeDelete(
  database: DatabaseClient,
  sql: string,
  params: readonly unknown[] = []
): Promise<void> {
  try {
    await database.query(sql, params);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("no such table")) {
      throw error;
    }
  }
}

async function cleanupImmeubleWorkspace(
  database: DatabaseClient
): Promise<void> {
  await safeDelete(
    database,
    `DELETE FROM graph_relation_property
     WHERE relation_id IN (
       SELECT relation_id FROM graph_relation WHERE workspace_id = ?
     )`,
    [WS_ID]
  );
  await safeDelete(
    database,
    `DELETE FROM graph_entity_document
     WHERE entity_id IN (
       SELECT entity_id FROM graph_entity WHERE workspace_id = ?
     )`,
    [WS_ID]
  );
  await safeDelete(
    database,
    `DELETE FROM graph_entity_chunk WHERE workspace_id = ?`,
    [WS_ID]
  );
  await safeDelete(
    database,
    `DELETE FROM graph_relation WHERE workspace_id = ?`,
    [WS_ID]
  );
  await safeDelete(
    database,
    `DELETE FROM graph_entity_alias
     WHERE entity_id IN (SELECT entity_id FROM graph_entity WHERE workspace_id = ?)`,
    [WS_ID]
  );
  await safeDelete(
    database,
    `DELETE FROM graph_entity WHERE workspace_id = ?`,
    [WS_ID]
  );
  await safeDelete(
    database,
    `DELETE FROM search_documents WHERE table_id = ?`,
    [FACET_TABLE_ID]
  );
  await safeDelete(database, `DELETE FROM search_fts_docs WHERE table_id = ?`, [
    FACET_TABLE_ID
  ]);
  await safeDelete(
    database,
    `DELETE FROM search_collection_stats WHERE table_id = ?`,
    [FACET_TABLE_ID]
  );
  await safeDelete(
    database,
    `DELETE FROM search_document_stats WHERE table_id = ?`,
    [FACET_TABLE_ID]
  );
  await safeDelete(
    database,
    `DELETE FROM search_term_frequencies WHERE table_id = ?`,
    [FACET_TABLE_ID]
  );
  await safeDelete(
    database,
    `DELETE FROM search_term_stats WHERE table_id = ?`,
    [FACET_TABLE_ID]
  );
  await safeDelete(database, `DELETE FROM search_postings WHERE table_id = ?`, [
    FACET_TABLE_ID
  ]);
  await safeDelete(
    database,
    `DELETE FROM bm25_sync_triggers WHERE table_id = ?`,
    [FACET_TABLE_ID]
  );
  await safeDelete(database, `DELETE FROM facet_postings WHERE table_id = ?`, [
    FACET_TABLE_ID
  ]);
  await safeDelete(database, `DELETE FROM facet_deltas WHERE table_id = ?`, [
    FACET_TABLE_ID
  ]);
  await safeDelete(
    database,
    `DELETE FROM facet_value_nodes WHERE table_id = ?`,
    [FACET_TABLE_ID]
  );
  await safeDelete(
    database,
    `DELETE FROM facet_definitions WHERE table_id = ?`,
    [FACET_TABLE_ID]
  );
  await safeDelete(database, `DELETE FROM facet_tables WHERE table_id = ?`, [
    FACET_TABLE_ID
  ]);
  await safeDelete(database, `DELETE FROM table_semantics WHERE table_id = ?`, [
    FACET_TABLE_ID
  ]);
  await safeDelete(
    database,
    `DELETE FROM relation_properties_raw WHERE workspace_id = ?`,
    [WS_ID]
  );
  await safeDelete(
    database,
    `DELETE FROM relations_raw WHERE workspace_id = ?`,
    [WS_ID]
  );
  await safeDelete(
    database,
    `DELETE FROM entity_documents_raw WHERE workspace_id = ?`,
    [WS_ID]
  );
  await safeDelete(
    database,
    `DELETE FROM entity_chunks_raw WHERE workspace_id = ?`,
    [WS_ID]
  );
  await safeDelete(
    database,
    `DELETE FROM entity_aliases_raw WHERE workspace_id = ?`,
    [WS_ID]
  );
  await safeDelete(
    database,
    `DELETE FROM entities_raw WHERE workspace_id = ?`,
    [WS_ID]
  );
  await safeDelete(
    database,
    `DELETE FROM facet_assignments_raw WHERE workspace_id = ?`,
    [WS_ID]
  );
  await safeDelete(
    database,
    `DELETE FROM external_links_raw WHERE workspace_id = ?`,
    [WS_ID]
  );
  await safeDelete(
    database,
    `DELETE FROM document_links_raw WHERE workspace_id = ?`,
    [WS_ID]
  );
  await safeDelete(
    database,
    `DELETE FROM chunks_raw_vector WHERE workspace_id = ?`,
    [WS_ID]
  );
  await safeDelete(
    database,
    `DELETE FROM documents_raw_vector WHERE workspace_id = ?`,
    [WS_ID]
  );
  await safeDelete(database, `DELETE FROM chunks_raw WHERE workspace_id = ?`, [
    WS_ID
  ]);
  await safeDelete(
    database,
    `DELETE FROM documents_raw WHERE workspace_id = ?`,
    [WS_ID]
  );
  await safeDelete(database, `DELETE FROM facets WHERE workspace_id = ?`, [
    WS_ID
  ]);
  await safeDelete(
    database,
    `DELETE FROM collection_ontologies WHERE workspace_id = ?`,
    [WS_ID]
  );
  await safeDelete(database, `DELETE FROM collections WHERE workspace_id = ?`, [
    WS_ID
  ]);
  await safeDelete(
    database,
    `DELETE FROM workspace_settings WHERE workspace_id = ?`,
    [WS_ID]
  );
  await safeDelete(
    database,
    `DELETE FROM ontologies WHERE workspace_id = ? AND ontology_id LIKE ?`,
    [WS_ID, `${WS_ID}::%`]
  );
  await safeDelete(
    database,
    `DELETE FROM workspaces WHERE id = ? OR workspace_id = ?`,
    [WS_ID, WS_ID]
  );
}

function toolContext(database: DatabaseClient, workspaceId = WS_ID) {
  const config = harness.config;
  const ctx = createToolContext(database, {
    embeddingsMode: config.embeddingsMode,
    embeddingDimensions: config.embeddingDimensions,
    embeddingFixturePath: config.embeddingFixturePath,
    hybridBm25Weight: config.hybridBm25Weight,
    hybridVectorWeight: config.hybridVectorWeight
  });
  ctx.session.workspace_id = workspaceId;
  return ctx;
}

function skipUnlessBackendAligned(ctx: {
  skip: (reason?: string) => void;
}): void {
  if (!backendAligned) {
    ctx.skip(
      "MindBrain backend SQLite is not aligned with resolveGhostcrabSqlite(); set GHOSTCRAB_SQLITE_PATH to the backend database file."
    );
  }
}

const describeIfSqliteFile = canReadSqliteFile() ? describe : describe.skip;

describeIfSqliteFile("immeuble-demo import → reindex → MCP coherence", () => {
  beforeAll(async () => {
    const bundle = JSON.parse(readFileSync(BUNDLE_PATH, "utf8")) as {
      entities_raw: unknown[];
      relations_raw: unknown[];
    };
    bundleEntityCount = bundle.entities_raw.length;
    bundleRelationCount = bundle.relations_raw.length;

    const resolved = resolveGhostcrabSqlite({});
    sqlitePath = resolved.sqlitePathResolved;

    await cleanupImmeubleWorkspace(harness.database);

    const load = spawnBackupLoad({
      dbPath: sqlitePath,
      bundlePath: BUNDLE_PATH,
      reindex: "none"
    });

    expect(load.ok, load.stderr || load.stdout).toBe(true);

    const fileEntities = readSqliteCount(
      sqlitePath,
      `SELECT COUNT(*) AS count FROM entities_raw WHERE workspace_id = ?`,
      [WS_ID]
    );
    const fileRelations = readSqliteCount(
      sqlitePath,
      `SELECT COUNT(*) AS count FROM relations_raw WHERE workspace_id = ?`,
      [WS_ID]
    );
    const fileGraphEntities = readSqliteCount(
      sqlitePath,
      `SELECT COUNT(*) AS count FROM graph_entity WHERE workspace_id = ?`,
      [WS_ID]
    );
    const fileFacetTables = readSqliteCount(
      sqlitePath,
      `SELECT COUNT(*) AS count FROM facet_tables WHERE table_id = ?`,
      [FACET_TABLE_ID]
    );
    const fileFacetDefinitions = readSqliteCount(
      sqlitePath,
      `SELECT COUNT(*) AS count FROM facet_definitions WHERE table_id = ?`,
      [FACET_TABLE_ID]
    );
    const fileBm25Triggers = readSqliteCount(
      sqlitePath,
      `SELECT COUNT(*) AS count FROM bm25_sync_triggers WHERE table_id = ?`,
      [FACET_TABLE_ID]
    );

    expect(fileEntities).toBe(bundleEntityCount);
    expect(fileRelations).toBe(bundleRelationCount);
    expect(fileGraphEntities).toBe(0);
    expect(fileFacetTables).toBe(1);
    expect(fileFacetDefinitions).toBeGreaterThan(0);
    expect(fileBm25Triggers).toBe(1);

    backendAligned = await backendSeesSqliteCounts({
      database: harness.database,
      sqlitePath,
      workspaceId: WS_ID
    });
  });

  afterAll(async () => {
    await cleanupImmeubleWorkspace(harness.database);
    await closeIntegrationDatabase(harness.database);
  });

  it("backup-load writes raw graph tables without derived projection", () => {
    expect(
      readSqliteCount(
        sqlitePath,
        `SELECT COUNT(*) AS count FROM entities_raw WHERE workspace_id = ?`,
        [WS_ID]
      )
    ).toBe(bundleEntityCount);
    expect(
      readSqliteCount(
        sqlitePath,
        `SELECT COUNT(*) AS count FROM graph_entity WHERE workspace_id = ?`,
        [WS_ID]
      )
    ).toBe(0);
  });

  it("ghostcrab_graph_reindex projects raw graph tables into derived indexes", async (ctx) => {
    skipUnlessBackendAligned(ctx);

    const result = await graphReindexTool.handler(
      { workspace_id: WS_ID },
      toolContext(harness.database)
    );
    const structured = readStructured(result);

    expect(structured.ok).toBe(true);
    expect(structured.workspace_id).toBe(WS_ID);

    const graphEntities = await countRows(
      harness.database,
      `SELECT COUNT(*) AS count FROM graph_entity WHERE workspace_id = ?`,
      [WS_ID]
    );
    const graphRelations = await countRows(
      harness.database,
      `SELECT COUNT(*) AS count FROM graph_relation WHERE workspace_id = ?`,
      [WS_ID]
    );

    expect(graphEntities).toBe(bundleEntityCount);
    expect(graphRelations).toBe(bundleRelationCount);
  });

  it("ghostcrab_graph_search finds apartment units after reindex", async (ctx) => {
    skipUnlessBackendAligned(ctx);

    const result = await graphSearchTool.handler(
      {
        workspace_id: WS_ID,
        query: "appartement",
        limit: 20
      },
      toolContext(harness.database)
    );
    const structured = readStructured(result);
    const entities = structured.entities as Array<{ name: string }>;

    expect(structured.ok).toBe(true);
    expect(entities.length).toBeGreaterThanOrEqual(13);
    expect(entities.some((entity) => /appartement/i.test(entity.name))).toBe(
      true
    );
  });

  it("ghostcrab_collection_reindex builds BM25 and facet postings", async (ctx) => {
    skipUnlessBackendAligned(ctx);

    const result = await collectionReindexTool.handler(
      {
        workspace_id: WS_ID,
        collection_id: COLL_ID,
        table_id: FACET_TABLE_ID
      },
      toolContext(harness.database)
    );
    const structured = readStructured(result);

    expect(structured.ok).toBe(true);
    expect(structured.table_id).toBe(FACET_TABLE_ID);
    expect(structured.bm25_documents).toBeGreaterThan(0);
    expect(structured.facet_assignments).toBeGreaterThan(0);
    expect(structured.graph_projected).toBeGreaterThan(0);

    const postings = await countRows(
      harness.database,
      `SELECT COUNT(*) AS count FROM facet_postings WHERE table_id = ?`,
      [FACET_TABLE_ID]
    );
    const searchDocs = await countRows(
      harness.database,
      `SELECT COUNT(*) AS count FROM search_documents WHERE table_id = ?`,
      [FACET_TABLE_ID]
    );
    expect(postings).toBeGreaterThan(0);
    expect(searchDocs).toBeGreaterThan(0);

    const facetSearch = await collectionFacetSearchTool.handler(
      {
        workspace_id: WS_ID,
        collection_id: COLL_ID,
        table_id: FACET_TABLE_ID,
        namespace: "source",
        dimension: "document_type",
        value: "PV",
        limit: 10
      },
      toolContext(harness.database)
    );
    const facetStructured = readStructured(facetSearch);
    expect(facetStructured.ok).toBe(true);
    expect(facetStructured.source).toBe("facet_postings");
    expect(facetStructured.returned).toBeGreaterThan(0);
  });

  it("ghostcrab_traverse walks contains edges from the building", async (ctx) => {
    skipUnlessBackendAligned(ctx);

    const result = await traverseTool.handler(
      {
        workspace_id: WS_ID,
        start: "Résidence Les Tilleuls",
        direction: "outbound",
        edge_labels: ["contains"],
        depth: 2
      },
      toolContext(harness.database)
    );
    const structured = readStructured(result);
    const paths = structured.paths as Array<{ rows?: unknown[] }>;

    expect(structured.ok).toBe(true);
    expect(Array.isArray(paths)).toBe(true);
    expect(paths.length).toBeGreaterThan(0);
  });

  it("ghostcrab_search returns no agent facets after import-only", async (ctx) => {
    skipUnlessBackendAligned(ctx);

    const result = await searchTool.handler(
      {
        workspace_id: WS_ID,
        query: "appartement",
        limit: 10
      },
      toolContext(harness.database)
    );
    const structured = readStructured(result);
    const results = structured.results as unknown[];

    expect(structured.ok).toBe(true);
    expect(results.length).toBe(0);
  });

  it("ghostcrab_learn raw mirror survives a subsequent graph reindex", async (ctx) => {
    skipUnlessBackendAligned(ctx);

    const learnResult = await learnTool.handler(
      {
        workspace_id: WS_ID,
        node: {
          id: LEARN_TEST_NODE_ID,
          node_type: "audit_marker",
          label: "Audit marker node",
          properties: { source: "immeuble-demo-coherence-test" }
        }
      },
      toolContext(harness.database)
    );
    expect(readStructured(learnResult).ok).toBe(true);

    const rawBefore = await countRows(
      harness.database,
      `SELECT COUNT(*) AS count FROM entities_raw WHERE workspace_id = ? AND name = ?`,
      [WS_ID, LEARN_TEST_NODE_ID]
    );
    expect(rawBefore).toBe(1);

    const reindexResult = await graphReindexTool.handler(
      { workspace_id: WS_ID },
      toolContext(harness.database)
    );
    expect(readStructured(reindexResult).ok).toBe(true);

    const graphAfter = await countRows(
      harness.database,
      `SELECT COUNT(*) AS count FROM graph_entity WHERE workspace_id = ? AND name = ?`,
      [WS_ID, LEARN_TEST_NODE_ID]
    );
    expect(graphAfter).toBe(1);
  });
});
