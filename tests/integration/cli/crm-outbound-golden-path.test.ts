/**
 * Mini CRM outbound golden-path proof: rich DDL proposal to golden export.
 *
 * Proves: propose (rich semantics) -> approve -> execute -> export -> matches golden fixture.
 */

import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

import { resolveGhostcrabConfig } from "../../../src/config/env.js";
import { workspaceCreateTool } from "../../../src/tools/workspace/create.js";
import { ddlExecuteTool, ddlProposeTool } from "../../../src/tools/workspace/ddl.js";
import { workspaceExportModelTool } from "../../../src/tools/workspace/export.js";
import { closeIntegrationDatabase, createIntegrationHarness } from "../../helpers/cli-integration.js";
import { type ExportPayload, diffExports } from "../../helpers/export-diff.js";
import { createToolContext } from "../../helpers/tool-context.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const harness = createIntegrationHarness();
const RUN_ID = randomUUID().slice(0, 8);
const WS_ID = `crm-outbound-${RUN_ID}`;

const richProposal = JSON.parse(
  readFileSync(join(__dirname, "../../fixtures/crm-outbound/rich-proposal.json"), "utf8")
) as Record<string, unknown>;

const goldenExport = JSON.parse(
  readFileSync(join(__dirname, "../../fixtures/crm-outbound/golden-export.json"), "utf8")
) as ExportPayload;

const CRM_OUTBOUND_DDL = `
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  website TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  title TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  channel TEXT NOT NULL DEFAULT 'email',
  launched_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS campaign_enrollments (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  contact_id TEXT NOT NULL REFERENCES contacts(id),
  enrollment_status TEXT NOT NULL DEFAULT 'queued',
  enrolled_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS activities (
  id TEXT PRIMARY KEY,
  enrollment_id TEXT NOT NULL REFERENCES campaign_enrollments(id),
  contact_id TEXT NOT NULL REFERENCES contacts(id),
  activity_type TEXT NOT NULL,
  outcome TEXT,
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`;

describe.sequential("CRM outbound golden-path — rich semantics end-to-end", () => {
  const config = resolveGhostcrabConfig(process.env);

  afterAll(async () => {
    try {
      await harness.database.query(`DROP TABLE IF EXISTS activities`);
      await harness.database.query(`DROP TABLE IF EXISTS campaign_enrollments`);
      await harness.database.query(`DROP TABLE IF EXISTS campaigns`);
      await harness.database.query(`DROP TABLE IF EXISTS contacts`);
      await harness.database.query(`DROP TABLE IF EXISTS accounts`);
      await harness.database.query(`DELETE FROM workspaces WHERE id = $1`, [WS_ID]);
    } catch {
      // best-effort cleanup
    }
    await closeIntegrationDatabase(harness.database);
  });

  it("creates crm workspace and proposes DDL with rich semantics", async () => {
    const ctx = createToolContext(harness.database);

    const createResult = await workspaceCreateTool.handler(
      {
        id: WS_ID,
        label: "CRM Outbound",
        description: "Mini CRM outbound: accounts, contacts, campaigns, enrollments, and activities.",
        created_by: "crm-outbound-golden-path-test"
      },
      ctx
    );
    expect(createResult.isError).toBeFalsy();

    await harness.database.query(
      `UPDATE workspaces SET domain_profile = 'crm' WHERE id = $1`,
      [WS_ID]
    );

    const proposeResult = await ddlProposeTool.handler(
      {
        workspace_id: WS_ID,
        sql: CRM_OUTBOUND_DDL,
        rationale: "Mini CRM outbound golden-path proof",
        proposed_by: "crm-outbound-golden-path-test",
        table_semantics: richProposal.table_semantics as unknown[],
        column_semantics: richProposal.column_semantics as unknown[],
        relation_semantics: richProposal.relation_semantics as unknown[]
      },
      ctx
    );
    expect(proposeResult.isError).toBeFalsy();

    const migrationId = (proposeResult.structuredContent as Record<string, unknown>)
      .migration_id as string;
    expect(migrationId).toBeDefined();

    await harness.database.query(
      `UPDATE pending_migrations
       SET status = 'approved', approved_by = 'crm-outbound-golden-path-test', approved_at = now()
       WHERE id = $1`,
      [migrationId]
    );

    const execResult = await ddlExecuteTool.handler({ migration_id: migrationId }, ctx);
    expect(execResult.isError).toBeFalsy();

    const semanticsApplied = ((execResult.structuredContent as Record<string, unknown>)
      .semantics_applied ?? {}) as Record<string, number>;
    expect(semanticsApplied.table_semantics).toBe(5);
    expect(semanticsApplied.column_semantics).toBe(10);
    expect(semanticsApplied.relation_semantics).toBe(4);
  });

  it("persists rich semantics for outbound-specific columns and relations", async () => {
    const enrollmentStatus = await harness.database.query<{
      column_role: string;
      rich_meta: string | null;
    }>(
      `SELECT column_role, rich_meta
       FROM column_semantics
       WHERE workspace_id = $1
         AND table_name = 'campaign_enrollments'
         AND column_name = 'enrollment_status'`,
      [WS_ID]
    );
    expect(enrollmentStatus).toHaveLength(1);
    expect(enrollmentStatus[0]?.column_role).toBe("status");
    const enrollmentStatusMeta = enrollmentStatus[0]?.rich_meta
      ? JSON.parse(enrollmentStatus[0].rich_meta) as Record<string, unknown>
      : null;
    expect(enrollmentStatusMeta?.semantic_type).toBe("state");
    expect(enrollmentStatusMeta?.projection_signal).toBe("alert_trigger");

    const worksAtRelation = await harness.database.query<{
      relation_kind: string;
      rich_meta: string | null;
    }>(
      `SELECT relation_kind, rich_meta
       FROM relation_semantics
       WHERE workspace_id = $1
         AND from_table = 'contacts'
         AND to_table = 'accounts'`,
      [WS_ID]
    );
    expect(worksAtRelation).toHaveLength(1);
    expect(worksAtRelation[0]?.relation_kind).toBe("many_to_one");
    const worksAtMeta = worksAtRelation[0]?.rich_meta
      ? JSON.parse(worksAtRelation[0].rich_meta) as Record<string, unknown>
      : null;
    expect(worksAtMeta?.relation_role).toBe("works_at");
    expect(worksAtMeta?.graph_label).toBe("WORKS_AT");
  });

  it("exports a rich model for the mini outbound CRM", async () => {
    const ctx = createToolContext(harness.database);

    const exportResult = await workspaceExportModelTool.handler(
      { workspace_id: WS_ID, depth: "full" },
      ctx
    );
    expect(exportResult.isError).toBeFalsy();

    const exportData = exportResult.structuredContent as ExportPayload;

    const tables = exportData.tables as Array<Record<string, unknown>>;
    const campaigns = tables.find((table) => table.table_name === "campaigns");
    const enrollments = tables.find((table) => table.table_name === "campaign_enrollments");
    const activities = tables.find((table) => table.table_name === "activities");
    expect(campaigns?.table_role).toBe("stateful_item");
    expect(campaigns?.entity_family).toBe("campaign");
    expect(campaigns?.emit_projections).toBe(true);
    expect(enrollments?.table_role).toBe("association");
    expect(activities?.table_role).toBe("event");

    const columns = exportData.columns as Array<Record<string, unknown>>;
    const campaignStatus = columns.find(
      (column) => column.table_name === "campaigns" && column.column_name === "status"
    );
    const activityType = columns.find(
      (column) => column.table_name === "activities" && column.column_name === "activity_type"
    );
    const activityOutcome = columns.find(
      (column) => column.table_name === "activities" && column.column_name === "outcome"
    );
    expect(campaignStatus?.column_role).toBe("status");
    expect(campaignStatus?.semantic_type).toBe("state");
    expect(campaignStatus?.facet_key).toBe("campaign_status");
    expect(activityType?.column_role).toBe("category");
    expect(activityType?.semantic_type).toBe("enum");
    expect(activityOutcome?.is_nullable).toBe(true);

    const relations = exportData.relations as Array<Record<string, unknown>>;
    const worksAt = relations.find(
      (relation) => relation.source_table === "contacts" && relation.target_table === "accounts"
    );
    const targetsCampaign = relations.find(
      (relation) =>
        relation.source_table === "campaign_enrollments"
        && relation.source_column === "campaign_id"
        && relation.target_table === "campaigns"
    );
    expect(worksAt?.relation_role).toBe("works_at");
    expect(worksAt?.graph_label).toBe("WORKS_AT");
    expect(targetsCampaign?.relation_role).toBe("targets");
    expect(targetsCampaign?.graph_label).toBe("TARGETS");

    const hints = (exportData.generation_hints ?? {}) as Record<string, unknown>;
    expect(hints.domain_profile).toBe("crm");
    const tableOrder = (hints.table_order ?? []) as string[];
    expect(tableOrder.findIndex((table) => table.includes("accounts"))).toBeLessThan(
      tableOrder.findIndex((table) => table.includes("contacts"))
    );
    expect(tableOrder.findIndex((table) => table.includes("contacts"))).toBeLessThan(
      tableOrder.findIndex((table) => table.includes("campaign_enrollments"))
    );
    expect(tableOrder.findIndex((table) => table.includes("campaign_enrollments"))).toBeLessThan(
      tableOrder.findIndex((table) => table.includes("activities"))
    );
  });

  it("structurally matches the outbound CRM golden export on critical semantic fields", async () => {
    const ctx = createToolContext(harness.database);

    const exportResult = await workspaceExportModelTool.handler(
      { workspace_id: WS_ID, depth: "full" },
      ctx
    );
    const exportData = exportResult.structuredContent as ExportPayload;

    const adaptedExport: ExportPayload = {
      ...exportData,
      workspace: {
        ...(exportData.workspace as Record<string, unknown>),
        id: "crm-outbound",
        label: (goldenExport.workspace as Record<string, unknown>).label
      }
    };

    const diffs = diffExports(adaptedExport, {
      schema_version: goldenExport.schema_version,
      workspace: {
        id: "crm-outbound",
        label: (goldenExport.workspace as Record<string, unknown>).label,
        domain_profile: (goldenExport.workspace as Record<string, unknown>).domain_profile
      },
      tables: goldenExport.tables,
      columns: goldenExport.columns,
      relations: goldenExport.relations
    });

    const criticalDiffs = diffs.filter((diff) =>
      diff.includes("table_role")
      || diff.includes("entity_family")
      || diff.includes("facet_key")
      || diff.includes("relation_role")
      || diff.includes("hierarchical")
      || diff.includes("graph_label")
      || diff.includes("semantic_type")
      || diff.includes("projection_signal")
      || diff.includes("is_nullable")
      || diff.includes("column_role")
    );

    if (criticalDiffs.length > 0) {
      throw new Error(
        `Critical semantic field mismatches vs outbound CRM golden fixture:\n  ${criticalDiffs.join("\n  ")}`
      );
    }
  });
});
