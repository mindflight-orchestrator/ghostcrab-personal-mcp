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
import { graphReindexTool } from "../../src/tools/dgraph/graph-reindex.js";
import { graphSearchTool } from "../../src/tools/dgraph/graph-search.js";
import { learnTool } from "../../src/tools/dgraph/learn.js";
import { traverseTool } from "../../src/tools/dgraph/traverse.js";
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
const BUNDLE_PATH = join(
  __dirname,
  "../../examples/immeuble-demo/bundle.json"
);
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
  await safeDelete(database, `DELETE FROM graph_entity_chunk WHERE workspace_id = ?`, [
    WS_ID
  ]);
  await safeDelete(database, `DELETE FROM graph_relation WHERE workspace_id = ?`, [
    WS_ID
  ]);
  await safeDelete(
    database,
    `DELETE FROM graph_entity_alias
     WHERE entity_id IN (SELECT entity_id FROM graph_entity WHERE workspace_id = ?)`,
    [WS_ID]
  );
  await safeDelete(database, `DELETE FROM graph_entity WHERE workspace_id = ?`, [
    WS_ID
  ]);
  await safeDelete(database, `DELETE FROM relation_properties_raw WHERE workspace_id = ?`, [
    WS_ID
  ]);
  await safeDelete(database, `DELETE FROM relations_raw WHERE workspace_id = ?`, [WS_ID]);
  await safeDelete(database, `DELETE FROM entity_aliases_raw WHERE workspace_id = ?`, [
    WS_ID
  ]);
  await safeDelete(database, `DELETE FROM entities_raw WHERE workspace_id = ?`, [WS_ID]);
  await safeDelete(database, `DELETE FROM facet_assignments_raw WHERE workspace_id = ?`, [
    WS_ID
  ]);
  await safeDelete(database, `DELETE FROM facets WHERE workspace_id = ?`, [WS_ID]);
  await safeDelete(database, `DELETE FROM workspace_settings WHERE workspace_id = ?`, [
    WS_ID
  ]);
  await safeDelete(
    database,
    `DELETE FROM ontologies WHERE workspace_id = ? AND ontology_id LIKE ?`,
    [WS_ID, `${WS_ID}::%`]
  );
  await safeDelete(database, `DELETE FROM workspaces WHERE id = ? OR workspace_id = ?`, [
    WS_ID,
    WS_ID
  ]);
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

function skipUnlessBackendAligned(ctx: { skip: (reason?: string) => void }): void {
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

    expect(fileEntities).toBe(bundleEntityCount);
    expect(fileRelations).toBe(bundleRelationCount);
    expect(fileGraphEntities).toBe(0);

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
    expect(entities.length).toBeGreaterThanOrEqual(5);
    expect(
      entities.some((entity) => /appartement/i.test(entity.name))
    ).toBe(true);
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
