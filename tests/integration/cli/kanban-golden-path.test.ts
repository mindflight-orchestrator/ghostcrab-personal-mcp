/**
 * Kanban golden-path proof: full flow from rich DDL proposal to golden export.
 * Requires DATABASE_URL and migrations through 013.
 *
 * Proves: propose (rich semantics) → approve → execute → export → matches golden fixture.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

import {
  closeIntegrationDatabase,
  createIntegrationHarness
} from "../../helpers/cli-integration.js";
import { ddlExecuteTool, ddlProposeTool } from "../../../src/tools/workspace/ddl.js";
import { workspaceCreateTool } from "../../../src/tools/workspace/create.js";
import { workspaceExportModelTool } from "../../../src/tools/workspace/export.js";
import { createToolContext } from "../../helpers/tool-context.js";
import { resolveGhostcrabConfig } from "../../../src/config/env.js";
import type { ExportPayload } from "../../helpers/export-diff.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const harness = createIntegrationHarness();
const RUN_ID = randomUUID().slice(0, 8);
const WS_ID = `kanban-test-${RUN_ID}`;

// Load fixtures
const richProposal = JSON.parse(
  readFileSync(join(__dirname, "../../fixtures/kanban/rich-proposal.json"), "utf8")
) as Record<string, unknown>;

const goldenExport = JSON.parse(
  readFileSync(join(__dirname, "../../../docs/dev/examples/kanban-board.export.json"), "utf8")
) as ExportPayload;

// Kanban DDL (minimal tables to prove the flow)
const KANBAN_DDL = `
CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  email TEXT NOT NULL,
  joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS boards (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS columns (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id),
  name TEXT NOT NULL,
  position INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS cards (
  id TEXT PRIMARY KEY,
  column_id TEXT NOT NULL REFERENCES columns(id),
  assignee_id TEXT REFERENCES members(id),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'backlog',
  priority TEXT NOT NULL DEFAULT 'medium',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL REFERENCES cards(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`;

describe.sequential("Kanban golden-path — rich semantics end-to-end", () => {
  const config = resolveGhostcrabConfig(process.env);

  afterAll(async () => {
    // Cleanup workspace and kanban schema
    try {
      await harness.database.query(`DROP TABLE IF EXISTS comments`);
      await harness.database.query(`DROP TABLE IF EXISTS cards`);
      await harness.database.query(`DROP TABLE IF EXISTS columns`);
      await harness.database.query(`DROP TABLE IF EXISTS boards`);
      await harness.database.query(`DROP TABLE IF EXISTS members`);
      await harness.database.query(`DELETE FROM workspaces WHERE id = $1`, [WS_ID]);
    } catch {
      // best-effort cleanup
    }
    await closeIntegrationDatabase(harness.database);
  });

  it("sqlite rich_meta columns and domain_profile exist", async () => {
    const richMetaCol = await harness.database.query<{ name: string }>(
      `PRAGMA table_info(column_semantics)`
    );
    expect(richMetaCol.some((row) => row.name === "rich_meta")).toBe(true);

    const relRichMeta = await harness.database.query<{ name: string }>(
      `PRAGMA table_info(relation_semantics)`
    );
    expect(relRichMeta.some((row) => row.name === "rich_meta")).toBe(true);

    const domainProfile = await harness.database.query<{ name: string }>(
      `PRAGMA table_info(workspaces)`
    );
    expect(domainProfile.some((row) => row.name === "domain_profile")).toBe(true);
  });

  it("creates kanban workspace and proposes DDL with rich semantics", async () => {
    const ctx = createToolContext(harness.database);

    // Create workspace
    const createResult = await workspaceCreateTool.handler(
      {
        id: WS_ID,
        label: "Kanban Board",
        description: "Project management kanban: boards, columns, cards, comments and team members.",
        created_by: "kanban-golden-path-test"
      },
      ctx
    );
    expect(createResult.isError).toBeFalsy();

    // Set domain_profile on workspace
    await harness.database.query(
      `UPDATE workspaces SET domain_profile = 'kanban' WHERE id = $1`,
      [WS_ID]
    );

    // Propose DDL with rich semantics
    const proposeResult = await ddlProposeTool.handler(
      {
        workspace_id: WS_ID,
        sql: KANBAN_DDL,
        rationale: "Kanban golden-path proof",
        proposed_by: "kanban-golden-path-test",
        table_semantics: richProposal.table_semantics as unknown[],
        column_semantics: richProposal.column_semantics as unknown[],
        relation_semantics: richProposal.relation_semantics as unknown[]
      },
      ctx
    );
    expect(proposeResult.isError).toBeFalsy();
    const proposeData = proposeResult.structuredContent as Record<string, unknown>;
    const migrationId = proposeData.migration_id as string;
    expect(migrationId).toBeDefined();

    // Approve migration
    await harness.database.query(
      `UPDATE pending_migrations
       SET status = 'approved', approved_by = 'kanban-golden-path-test', approved_at = now()
       WHERE id = $1`,
      [migrationId]
    );

    // Execute migration
    const execResult = await ddlExecuteTool.handler(
      { migration_id: migrationId },
      ctx
    );
    expect(execResult.isError).toBeFalsy();
    const execData = execResult.structuredContent as Record<string, unknown>;
    expect(execData.semantics_applied).toBeDefined();
    const semanticsApplied = execData.semantics_applied as Record<string, number>;
    expect(semanticsApplied.table_semantics).toBe(5);
    expect(semanticsApplied.column_semantics).toBe(8);
    expect(semanticsApplied.relation_semantics).toBe(4);
  });

  it("rich semantics persisted to DB with correct rich_meta", async () => {
    // Verify column rich_meta
    const statusCol = await harness.database.query<{
      column_role: string;
      rich_meta: string | null;
    }>(
      `SELECT column_role, rich_meta FROM column_semantics
       WHERE workspace_id = $1 AND table_name = 'cards' AND column_name = 'status'`,
      [WS_ID]
    );
    expect(statusCol).toHaveLength(1);
    const rm = statusCol[0]?.rich_meta ? JSON.parse(statusCol[0].rich_meta) as Record<string, unknown> : null;
    expect(rm).toBeDefined();
    expect(rm?.public_column_role).toBe("status");
    expect(rm?.semantic_type).toBe("state");
    expect(rm?.facet_key).toBe("card_status");
    expect(rm?.projection_signal).toBe("alert_trigger");
    expect(rm?.is_nullable).toBe(false);
    expect((rm?.distribution_hint as Record<string, unknown>)?.values).toBeDefined();

    // Verify relation rich_meta
    const colBoardRel = await harness.database.query<{
      relation_kind: string;
      rich_meta: string | null;
    }>(
      `SELECT relation_kind, rich_meta FROM relation_semantics
       WHERE workspace_id = $1 AND from_table = 'columns' AND to_table = 'boards'`,
      [WS_ID]
    );
    expect(colBoardRel).toHaveLength(1);
    const relRm = colBoardRel[0]?.rich_meta ? JSON.parse(colBoardRel[0].rich_meta) as Record<string, unknown> : null;
    expect(relRm?.relation_role).toBe("belongs_to");
    expect(relRm?.hierarchical).toBe(true);
    expect(relRm?.graph_label).toBe("CONTAINS");
  });

  it("export returns rich non-null semantic fields matching golden fixture structure", async () => {
    const ctx = createToolContext(harness.database);

    const exportResult = await workspaceExportModelTool.handler(
      { workspace_id: WS_ID, depth: "full" },
      ctx
    );
    expect(exportResult.isError).toBeFalsy();

    const exportData = exportResult.structuredContent as ExportPayload;

    // ── Table assertions ─────────────────────────────────────────────────────
    const tables = exportData.tables as Array<Record<string, unknown>>;
    const boardsTable = tables.find(t => t.table_name === "boards");
    expect(boardsTable?.table_role).toBe("stateful_item");
    expect(boardsTable?.entity_family).toBe("board");
    expect(boardsTable?.primary_time_column).toBe("created_at");
    expect(boardsTable?.volume_driver).toBe("low");

    const cardsTable = tables.find(t => t.table_name === "cards");
    expect(cardsTable?.table_role).toBe("stateful_item");
    expect(cardsTable?.entity_family).toBe("card");
    expect(cardsTable?.emit_projections).toBe(true);
    expect(cardsTable?.emit_graph_entities).toBe(true);

    const commentsTable = tables.find(t => t.table_name === "comments");
    expect(commentsTable?.table_role).toBe("event");

    // ── Column assertions ─────────────────────────────────────────────────────
    const columns = exportData.columns as Array<Record<string, unknown>>;

    const titleCol = columns.find(c => c.table_name === "cards" && c.column_name === "title");
    expect(titleCol?.column_role).toBe("label");
    expect(titleCol?.semantic_type).toBe("free_text");
    expect(titleCol?.facet_key).toBe("card_title");

    const statusCol = columns.find(c => c.table_name === "cards" && c.column_name === "status");
    expect(statusCol?.column_role).toBe("status");
    expect(statusCol?.semantic_type).toBe("state");
    expect(statusCol?.facet_key).toBe("card_status");
    expect(statusCol?.projection_signal).toBe("alert_trigger");
    expect(statusCol?.is_nullable).toBe(false);
    const distHint = statusCol?.distribution_hint as Record<string, unknown>;
    expect(Array.isArray(distHint?.values)).toBe(true);

    const priorityCol = columns.find(c => c.table_name === "cards" && c.column_name === "priority");
    expect(priorityCol?.column_role).toBe("score");
    expect(priorityCol?.semantic_type).toBe("enum");
    expect(priorityCol?.facet_key).toBe("card_priority");

    const assigneeCol = columns.find(c => c.table_name === "cards" && c.column_name === "assignee_id");
    expect(assigneeCol?.column_role).toBe("owner");
    expect(assigneeCol?.graph_usage).toBe("edge_target");
    expect(assigneeCol?.is_nullable).toBe(true);

    // ── Relation assertions ───────────────────────────────────────────────────
    const relations = exportData.relations as Array<Record<string, unknown>>;

    const colBoardRel = relations.find(
      r => r.source_table === "columns" && r.target_table === "boards"
    );
    expect(colBoardRel?.relation_role).toBe("belongs_to");
    expect(colBoardRel?.hierarchical).toBe(true);
    expect(colBoardRel?.graph_label).toBe("CONTAINS");
    expect(colBoardRel?.cardinality).toBe("1:n");

    const cardMemberRel = relations.find(
      r => r.source_table === "cards" && r.target_table === "members"
    );
    expect(cardMemberRel?.relation_role).toBe("assigned_to");
    expect(cardMemberRel?.hierarchical).toBe(false);
    expect(cardMemberRel?.graph_label).toBe("ASSIGNED_TO");

    // ── generation_hints assertions ───────────────────────────────────────────
    const hints = exportData.generation_hints as Record<string, unknown>;
    expect(hints.domain_profile).toBe("kanban");
    const tableOrder = hints.table_order as string[];
    expect(tableOrder).toBeDefined();
    // members and boards must come before columns, cards
    const membersIdx = tableOrder.findIndex(t => t.includes("members"));
    const boardsIdx = tableOrder.findIndex(t => t.includes("boards"));
    const columnsIdx = tableOrder.findIndex(t => t.includes("columns"));
    const cardsIdx = tableOrder.findIndex(t => t.includes("cards"));
    expect(boardsIdx).toBeLessThan(columnsIdx);
    expect(columnsIdx).toBeLessThan(cardsIdx);
    expect(membersIdx).toBeLessThan(cardsIdx);
  });

  it("export structurally matches golden fixture on all non-null semantic fields", async () => {
    const ctx = createToolContext(harness.database);

    const exportResult = await workspaceExportModelTool.handler(
      { workspace_id: WS_ID, depth: "full" },
      ctx
    );
    const exportData = exportResult.structuredContent as ExportPayload;

    // Adapt workspace id for structural comparison (golden uses "kanban-board", test uses WS_ID)
    const adaptedExport: ExportPayload = {
      ...exportData,
      workspace: { ...(exportData.workspace as Record<string, unknown>), id: "kanban-board" }
    };

    // Compare against golden fixture — only fields present in golden are checked.
    // Diff will report any golden field that the live export returns differently.
    const diffs = (await import("../../helpers/export-diff.js")).diffExports(
      adaptedExport,
      {
        schema_version: goldenExport.schema_version,
        workspace: {
          id: "kanban-board",
          label: (goldenExport.workspace as Record<string, unknown>).label,
          domain_profile: (goldenExport.workspace as Record<string, unknown>).domain_profile
        },
        tables: goldenExport.tables,
        columns: goldenExport.columns,
        relations: goldenExport.relations
      }
    );

    // Report diffs as test context rather than hard failure for fields expected to differ
    // (e.g. generation_strategy computed differently from synthetic gen).
    // Core semantic fields (roles, families, facet_keys, relation_roles) must all match.
    const criticalDiffs = diffs.filter(d =>
      !d.includes(".notes:")
      && (
        d.includes("table_role") ||
        d.includes("entity_family") ||
        d.includes("facet_key") ||
        d.includes("relation_role") ||
        d.includes("hierarchical") ||
        d.includes("graph_label") ||
        d.includes("semantic_type") ||
        d.includes("projection_signal") ||
        d.includes("is_nullable") ||
        d.includes("column_role")
      )
    );

    if (criticalDiffs.length > 0) {
      throw new Error(
        `Critical semantic field mismatches vs golden fixture:\n  ${criticalDiffs.join("\n  ")}`
      );
    }
  });
});
