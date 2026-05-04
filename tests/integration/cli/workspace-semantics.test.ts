/**
 * Workspace semantics (migration 012): mindbrain semantic tables + DDL persist + export.
 * Requires DATABASE_URL and migrations through 012.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

import {
  closeIntegrationDatabase,
  createIntegrationHarness
} from "../../helpers/cli-integration.js";
import { ddlExecuteTool, ddlProposeTool } from "../../../src/tools/workspace/ddl.js";
import { workspaceExportModelTool } from "../../../src/tools/workspace/export.js";
import { createToolContext } from "../../helpers/tool-context.js";
import { resolveGhostcrabConfig } from "../../../src/config/env.js";

const harness = createIntegrationHarness();
const RUN_ID = randomUUID().slice(0, 8);

describe.sequential("Workspace semantics — migration 012 + DDL persist", () => {
  const config = resolveGhostcrabConfig(process.env);

  beforeAll(async () => {
    /* harness runs migrations */
  });

  afterAll(async () => {
    await closeIntegrationDatabase(harness.database);
  });

  it("sqlite semantic tables and pending_migrations.semantic_spec exist", async () => {
    const tbl = await harness.database.query<{ name: string }>(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name = 'table_semantics'`
    );
    expect(tbl).toHaveLength(1);

    const columns = await harness.database.query<{ name: string }>(
      `PRAGMA table_info(pending_migrations)`
    );
    expect(columns.some((column) => column.name === "semantic_spec")).toBe(true);
  });

  it("DDL execute persists inferred semantics to mindbrain.table_semantics", async () => {
    const ctx = createToolContext(harness.database, {
      nativeExtensionsMode: config.nativeExtensionsMode
    });
    const tableName = `wssem_${RUN_ID.replace(/-/g, "_")}`;

    const propose = await ddlProposeTool.handler(
      {
        workspace_id: "default",
        sql: `CREATE TABLE IF NOT EXISTS ${tableName} (
          id INTEGER PRIMARY KEY,
          user_id INT,
          status TEXT
        )`,
        rationale: "workspace semantics integration"
      },
      ctx
    );
    expect(propose.isError).toBeFalsy();
    const pdata = propose.structuredContent as Record<string, unknown>;
    const migrationId = pdata.migration_id as string;
    expect(pdata.semantic_proposal).toBeDefined();

    await harness.database.query(
      `UPDATE pending_migrations
       SET status = 'approved', approved_by = 'test', approved_at = now()
       WHERE id = $1`,
      [migrationId]
    );

    const exec = await ddlExecuteTool.handler({ migration_id: migrationId }, ctx);
    expect(exec.isError).toBeFalsy();
    const edata = exec.structuredContent as Record<string, unknown>;
    expect(edata.semantics_applied).toBeDefined();
    expect((edata.semantics_error as string | undefined) ?? "").toBe("");

    const semRows = await harness.database.query<{ table_name: string }>(
      `SELECT table_name FROM table_semantics
       WHERE workspace_id = 'default' AND table_name = $1`,
      [tableName]
    );
    expect(semRows.length).toBeGreaterThanOrEqual(1);

    const exportResult = await workspaceExportModelTool.handler(
      { workspace_id: "default", depth: "tables_and_columns" },
      ctx
    );
    expect(exportResult.isError).toBeFalsy();
    const xdata = exportResult.structuredContent as Record<string, unknown>;
    const warns = (xdata.validation_warnings as string[]) ?? [];
    expect(warns.filter((w) => w.includes(tableName))).toEqual([]);

    await harness.database.query(`DROP TABLE IF EXISTS ${tableName}`);
    await harness.database.query(
      `DELETE FROM table_semantics WHERE workspace_id = 'default' AND table_name = $1`,
      [tableName]
    );
    await harness.database.query(
      `DELETE FROM column_semantics WHERE workspace_id = 'default' AND table_name = $1`,
      [tableName]
    );
    await harness.database.query(
      `DELETE FROM pending_migrations WHERE id = $1`,
      [migrationId]
    );
  });
});
