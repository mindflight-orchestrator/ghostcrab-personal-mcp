/**
 * V3 Plan B integration test — proves the minimal chain on a real database:
 *
 *   migration 009 applied → mindbrain schema exists
 *   migration 011 applied → facets.source_ref column exists
 *   ghostcrab_workspace_create → workspace row visible in mindbrain.workspaces
 *   ghostcrab_workspace_list  → workspace visible with stats
 *   ghostcrab_ddl_propose     → migration stored as pending
 *   CLI ddl-approve           → migration transitions to approved
 *   ghostcrab_ddl_execute     → migration executed (CREATE TABLE + trigger)
 *   source_ref contract       → partial unique index accepts/rejects correctly
 *
 * These tests require a real PostgreSQL database (DATABASE_URL env var).
 * They run in the same job as other integration tests (tests/integration/).
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

import {
  closeIntegrationDatabase,
  createIntegrationHarness,
  runCliCapture
} from "../../helpers/cli-integration.js";
import {
  workspaceCreateTool
} from "../../../src/tools/workspace/create.js";
import {
  workspaceListTool
} from "../../../src/tools/workspace/list.js";
import {
  ddlProposeTool,
  ddlExecuteTool,
  ddlListPendingTool
} from "../../../src/tools/workspace/ddl.js";
import { createToolContext } from "../../helpers/tool-context.js";
import { resolveGhostcrabConfig } from "../../../src/config/env.js";

const harness = createIntegrationHarness();

/** Unique prefix per test run to avoid cross-run collisions. */
const RUN_ID = randomUUID().slice(0, 8);

function wsId(suffix: string): string {
  return `v3test${RUN_ID.replace(/-/g, "")}${suffix}`;
}

/** DDL execute now persists workspace semantics; drop stray rows when the physical table is removed. */
async function cleanupMindbrainSemantics(
  db: typeof harness.database,
  workspaceId: string,
  tableName: string
): Promise<void> {
  const t = tableName.toLowerCase();
  await db.query(
    `DELETE FROM mindbrain.column_semantics WHERE workspace_id = $1 AND table_name = $2`,
    [workspaceId, t]
  );
  await db.query(
    `DELETE FROM mindbrain.relation_semantics WHERE workspace_id = $1 AND (from_table = $2 OR to_table = $2)`,
    [workspaceId, t]
  );
  await db.query(
    `DELETE FROM mindbrain.table_semantics WHERE workspace_id = $1 AND table_name = $2`,
    [workspaceId, t]
  );
}

async function cleanupV3(db: typeof harness.database): Promise<void> {
  await db.query(
    `DELETE FROM mindbrain.workspaces WHERE id LIKE $1`,
    [`v3test${RUN_ID.replace(/-/g, "")}%`]
  );
}

describe.sequential("V3 Plan B integration — workspace + DDL lifecycle", () => {
  const config = resolveGhostcrabConfig(process.env);

  beforeAll(async () => {
    await cleanupV3(harness.database);
  });

  afterAll(async () => {
    await cleanupV3(harness.database);
    await closeIntegrationDatabase(harness.database);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Schema baseline
  // ─────────────────────────────────────────────────────────────────────────

  it("sqlite workspace metadata tables exist", async () => {
    const rows = await harness.database.query<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'workspaces'`
    );
    expect(rows).toHaveLength(1);
  });

  it("default workspace exists", async () => {
    const rows = await harness.database.query<{ id: string }>(
      `SELECT id FROM workspaces WHERE id = 'default'`
    );
    expect(rows).toHaveLength(1);
  });

  it("facets.workspace_id column exists", async () => {
    const rows = await harness.database.query<{ name: string }>(
      `PRAGMA table_info(facets)`
    );
    expect(rows.some((row) => row.name === "workspace_id")).toBe(true);
  });

  it("facets.source_ref column exists", async () => {
    const rows = await harness.database.query<{ name: string }>(
      `PRAGMA table_info(facets)`
    );
    expect(rows.some((row) => row.name === "source_ref")).toBe(true);
  });

  it("unique index on (source_ref, workspace_id) exists", async () => {
    const rows = await harness.database.query<{ name: string }>(
      `SELECT name FROM sqlite_master
       WHERE type = 'index' AND name = 'idx_facets_source_ref_workspace'`
    );
    expect(rows).toHaveLength(1);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // source_ref contract
  // ─────────────────────────────────────────────────────────────────────────

  const sourceRefSchemaId = `v3:test:${RUN_ID}`;

  it("source_ref contract: two historical rows (source_ref=NULL) are allowed", async () => {
    await harness.database.query(
      `INSERT INTO facets (schema_id, content, facets, workspace_id, source_ref)
       VALUES ($1, 'hist1', '{}', 'default', NULL),
              ($1, 'hist2', '{}', 'default', NULL)`,
      [sourceRefSchemaId]
    );
    const rows = await harness.database.query<{ content: string }>(
      `SELECT content FROM facets WHERE schema_id = $1 ORDER BY content`,
      [sourceRefSchemaId]
    );
    expect(rows.length).toBeGreaterThanOrEqual(2);
    await harness.database.query(`DELETE FROM facets WHERE schema_id = $1`, [
      sourceRefSchemaId
    ]);
  });

  it("source_ref contract: two synced rows with same (source_ref, workspace_id) are rejected", async () => {
    const refDup = `ref:contract-test:${RUN_ID}`;
    await harness.database.query(
      `INSERT INTO facets (schema_id, content, facets, workspace_id, source_ref)
       VALUES ($1, 'synced1', '{}', 'default', $2)`,
      [sourceRefSchemaId, refDup]
    );
    await expect(
      harness.database.query(
        `INSERT INTO facets (schema_id, content, facets, workspace_id, source_ref)
         VALUES ($1, 'synced2', '{}', 'default', $2)`,
        [sourceRefSchemaId, refDup]
      )
    ).rejects.toThrow();
    await harness.database.query(`DELETE FROM facets WHERE schema_id = $1`, [
      sourceRefSchemaId
    ]);
  });

  it("source_ref contract: same source_ref on different workspaces is allowed", async () => {
    const ws1 = wsId("ct1");
    const ws2 = wsId("ct2");
    await harness.database.query(
      `INSERT INTO workspaces (id, label, pg_schema) VALUES ($1, 'Test 1', 'main'), ($2, 'Test 2', 'main')
       ON CONFLICT (id) DO NOTHING`,
      [ws1, ws2]
    );
    const refCross = `ref:crossws:${RUN_ID}`;
    await harness.database.query(
      `INSERT INTO facets (schema_id, content, facets, workspace_id, source_ref)
       VALUES ($1, 'cross1', '{}', $2, $4),
              ($1, 'cross2', '{}', $3, $4)`,
      [sourceRefSchemaId, ws1, ws2, refCross]
    );
    const rows = await harness.database.query<{ source_ref: string }>(
      `SELECT source_ref FROM facets WHERE schema_id = $1 AND source_ref = $2`,
      [sourceRefSchemaId, refCross]
    );
    expect(rows).toHaveLength(2);
    await harness.database.query(
      `DELETE FROM facets WHERE schema_id = $1`,
      [sourceRefSchemaId]
    );
    await harness.database.query(
      `DELETE FROM workspaces WHERE id IN ($1, $2)`,
      [ws1, ws2]
    );
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Workspace tools
  // ─────────────────────────────────────────────────────────────────────────

  it("ghostcrab_workspace_create: creates a new workspace", async () => {
    const ctx = createToolContext(harness.database);
    const wsName = wsId("wc");
    const result = await workspaceCreateTool.handler(
      { id: wsName, label: "V3 Integration Test WS", created_by: "test" },
      ctx
    );
    expect(result.isError).toBeFalsy();
    const data = result.structuredContent as Record<string, unknown>;
    expect(data.ok).toBe(true);
    expect(data.created).toBe(true);
    expect(data.workspace_id).toBe(wsName);

    const rows = await harness.database.query<{ id: string }>(
      `SELECT id FROM workspaces WHERE id = $1`,
      [wsName]
    );
    expect(rows).toHaveLength(1);
  });

  it("ghostcrab_workspace_create: idempotent on re-creation", async () => {
    const ctx = createToolContext(harness.database);
    const wsName = wsId("wi");
    await workspaceCreateTool.handler(
      { id: wsName, label: "Idempotent test" },
      ctx
    );
    const result2 = await workspaceCreateTool.handler(
      { id: wsName, label: "Idempotent test" },
      ctx
    );
    const data = result2.structuredContent as Record<string, unknown>;
    expect(data.ok).toBe(true);
    expect(data.created).toBe(false);
    expect(data.idempotent).toBe(true);
  });

  it("ghostcrab_workspace_list: lists workspace with stats", async () => {
    const ctx = createToolContext(harness.database);
    const result = await workspaceListTool.handler({ status: "active" }, ctx);
    const data = result.structuredContent as Record<string, unknown>;
    expect(data.ok).toBe(true);
    const workspaces = data.workspaces as Array<Record<string, unknown>>;
    const defaultWs = workspaces.find((w) => w.id === "default");
    expect(defaultWs).toBeDefined();
    expect(typeof defaultWs?.facets_count).toBe("number");
    expect(typeof defaultWs?.entities_count).toBe("number");
  });

  // ─────────────────────────────────────────────────────────────────────────
  // DDL lifecycle: propose → approve (CLI) → execute
  // ─────────────────────────────────────────────────────────────────────────

  it("ghostcrab_ddl_propose: stores a safe migration as pending", async () => {
    const ctx = createToolContext(harness.database);
    const result = await ddlProposeTool.handler(
      {
        workspace_id: "default",
        sql: `CREATE TABLE IF NOT EXISTS v3_test_${RUN_ID.replace(/-/g, "_")} (id INTEGER PRIMARY KEY, label TEXT)`,
        rationale: "Integration test table"
      },
      ctx
    );
    expect(result.isError).toBeFalsy();
    const data = result.structuredContent as Record<string, unknown>;
    expect(data.ok).toBe(true);
    expect(data.status).toBe("pending");
    expect(typeof data.migration_id).toBe("string");

    const rows = await harness.database.query<{ status: string }>(
      `SELECT status FROM pending_migrations WHERE id = $1`,
      [data.migration_id]
    );
    expect(rows[0]?.status).toBe("pending");

    await harness.database.query(
      `DELETE FROM pending_migrations WHERE id = $1`,
      [data.migration_id]
    );
  });

  it("ghostcrab_ddl_propose: rejects DROP TABLE", async () => {
    const ctx = createToolContext(harness.database);
    const result = await ddlProposeTool.handler(
      {
        workspace_id: "default",
        sql: "DROP TABLE facets"
      },
      ctx
    );
    expect(result.isError).toBe(true);
    const data = result.structuredContent as Record<string, unknown>;
    expect((data.error as Record<string, unknown>).code).toBe("blocked_ddl_pattern");
  });

  it("full DDL chain: propose → CLI approve → execute → table exists", async () => {
    const ctx = createToolContext(harness.database);
    const tableName = `v3_chain_${RUN_ID.replace(/-/g, "_")}`;

    // 1. Propose
    const proposeResult = await ddlProposeTool.handler(
      {
        workspace_id: "default",
        sql: `CREATE TABLE IF NOT EXISTS ${tableName} (id INTEGER PRIMARY KEY, label TEXT)`,
        rationale: "V3 integration chain test"
      },
      ctx
    );
    expect(proposeResult.isError).toBeFalsy();
    const proposeData = proposeResult.structuredContent as Record<string, unknown>;
    const migrationId = proposeData.migration_id as string;

    // 2. Approve via CLI command simulation (direct DB update — simulates ddl-approve CLI)
    await harness.database.query(
      `UPDATE pending_migrations
       SET status = 'approved', approved_by = 'integration-test', approved_at = now()
       WHERE id = $1`,
      [migrationId]
    );

    // 3. Verify list shows approved status
    const listResult = await ddlListPendingTool.handler(
      { status: "approved", workspace_id: "default" },
      ctx
    );
    const listData = listResult.structuredContent as Record<string, unknown>;
    const migrations = listData.migrations as Array<Record<string, unknown>>;
    const thisMigration = migrations.find((m) => m.id === migrationId);
    expect(thisMigration?.status).toBe("approved");

    // 4. Execute
    const execResult = await ddlExecuteTool.handler(
      { migration_id: migrationId },
      ctx
    );
    expect(execResult.isError).toBeFalsy();
    const execData = execResult.structuredContent as Record<string, unknown>;
    expect(execData.ok).toBe(true);
    expect(execData.status).toBe("executed");

    // 5. Verify table now exists in DB
    const tableExists = await harness.database.query<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`,
      [tableName]
    );
    expect(tableExists[0]?.name).toBe(tableName);

    // 6. Verify migration is now 'executed' in pending_migrations
    const statusRows = await harness.database.query<{ status: string }>(
      `SELECT status FROM pending_migrations WHERE id = $1`,
      [migrationId]
    );
    expect(statusRows[0]?.status).toBe("executed");

    // Cleanup
    await harness.database.query(`DROP TABLE IF EXISTS ${tableName}`);
    await cleanupMindbrainSemantics(harness.database, "default", tableName);
    await harness.database.query(
      `DELETE FROM pending_migrations WHERE id = $1`,
      [migrationId]
    );
  });

  it("DDL lifecycle with sync_spec: generates trigger preview in proposal", async () => {
    const ctx = createToolContext(harness.database);
    const tableName = `v3_trigger_${RUN_ID.replace(/-/g, "_")}`;

    const proposeResult = await ddlProposeTool.handler(
      {
        workspace_id: "default",
        sql: `CREATE TABLE IF NOT EXISTS ${tableName} (id INTEGER PRIMARY KEY, title TEXT)`,
        rationale: "V3 trigger preview test",
        sync_spec: {
          source_table: `public.${tableName}`,
          fields: [
            { column_name: "title", facet_key: "title", index_in_bm25: true, facet_type: "term" }
          ]
        }
      },
      ctx
    );
    expect(proposeResult.isError).toBeFalsy();
    const data = proposeResult.structuredContent as Record<string, unknown>;
    expect(data.has_trigger_preview).toBe(true);
    expect(typeof data.trigger_summary).toBe("string");
    expect(String(data.trigger_summary)).toContain(tableName);

    // Verify preview_trigger is stored in DB
    const rows = await harness.database.query<{ preview_trigger: string | null }>(
      `SELECT preview_trigger FROM pending_migrations WHERE id = $1`,
      [data.migration_id]
    );
    expect(rows[0]?.preview_trigger).not.toBeNull();
    expect(rows[0]?.preview_trigger).toContain("mindbrain_sync");

    await harness.database.query(
      `DELETE FROM pending_migrations WHERE id = $1`,
      [data.migration_id]
    );
  });

  it("CLI ddl-approve then ddl-execute via runCliCapture", async () => {
    const ctx = createToolContext(harness.database);
    const tableName = `v3_cli_${RUN_ID.replace(/-/g, "_")}`;

    // 1. Propose via tool
    const proposeResult = await ddlProposeTool.handler(
      {
        workspace_id: "default",
        sql: `CREATE TABLE IF NOT EXISTS ${tableName} (id INTEGER PRIMARY KEY)`,
        proposed_by: "cli-integration-test"
      },
      ctx
    );
    const proposeData = proposeResult.structuredContent as Record<string, unknown>;
    const migrationId = proposeData.migration_id as string;

    // 2. Approve via CLI
    const approveResult = await runCliCapture([
      "maintenance",
      "ddl-approve",
      "--id",
      migrationId,
      "--by",
      "cli-test-user"
    ]);
    expect(approveResult.exitCode).toBe(0);
    const approveJson = JSON.parse(approveResult.stdout.join("").trim()) as Record<string, unknown>;
    expect(approveJson.ok).toBe(true);
    expect(approveJson.status).toBe("approved");

    // 3. Execute via CLI
    const executeResult = await runCliCapture([
      "maintenance",
      "ddl-execute",
      "--id",
      migrationId
    ]);
    expect(executeResult.exitCode).toBe(0);
    const execJson = JSON.parse(executeResult.stdout.join("").trim()) as Record<string, unknown>;
    expect(execJson.ok).toBe(true);
    expect(execJson.status).toBe("executed");

    // 4. Table exists
    const tableExists = await harness.database.query<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`,
      [tableName]
    );
    expect(tableExists[0]?.name).toBe(tableName);

    // Cleanup
    await harness.database.query(`DROP TABLE IF EXISTS ${tableName}`);
    await cleanupMindbrainSemantics(harness.database, "default", tableName);
    await harness.database.query(
      `DELETE FROM pending_migrations WHERE id = $1`,
      [migrationId]
    );
  });

});
