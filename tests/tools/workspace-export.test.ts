import { describe, expect, it, vi } from "vitest";

import { workspaceExportModelTool } from "../../src/tools/workspace/export.js";
import { workspaceInspectTool } from "../../src/tools/workspace/inspect.js";
import { WORKSPACE_MODEL_SCHEMA_VERSION } from "../../src/types/workspace-model.js";
import type { ToolExecutionContext } from "../../src/tools/registry.js";

type LegacyImpl = (
  sql: string,
  params?: readonly unknown[]
) => Promise<unknown[]>;

// Adapter so the existing PG-shaped mocks keep working against the SQLite-only
// fallback path. Routes SQLite SQL fragments back to the legacy `mindbrain.*`
// / `information_schema.*` sniffers and reshapes catalog rows.
function adaptLegacyMockForSqlite(legacy: LegacyImpl): LegacyImpl {
  return async (sql, params) => {
    if (sql.includes("FROM workspaces")) {
      return legacy("mindbrain.workspaces", params);
    }
    if (sql.includes("FROM table_semantics")) {
      return legacy("mindbrain.table_semantics", params);
    }
    if (sql.includes("FROM column_semantics")) {
      return legacy("mindbrain.column_semantics", params);
    }
    if (sql.includes("FROM relation_semantics")) {
      return legacy("mindbrain.relation_semantics", params);
    }
    if (sql.includes("sqlite_master")) {
      const rows = (await legacy(
        "information_schema.tables",
        params
      )) as Array<Record<string, unknown>>;
      return rows
        .filter((row) => (row.table_schema ?? "public") !== "mindbrain")
        .map((row) => ({ name: row.table_name }));
    }
    const pragmaMatch = sql.match(/PRAGMA\s+table_info\((\w+)\)/i);
    if (pragmaMatch) {
      const tableName = pragmaMatch[1];
      const columns = (await legacy(
        "information_schema.columns",
        params
      )) as Array<Record<string, unknown>>;
      const pkRows = (await legacy(
        "information_schema.table_constraints",
        params
      )) as Array<Record<string, unknown>>;
      const pkSet = new Set(
        pkRows
          .filter((row) => row.table_name === tableName)
          .map((row) => row.column_name as string)
      );
      return columns
        .filter((column) => column.table_name === tableName)
        .map((column) => ({
          name: column.column_name,
          notnull: column.is_nullable === "NO" ? 1 : 0,
          pk: pkSet.has(column.column_name as string) ? 1 : 0
        }));
    }
    return legacy(sql, params);
  };
}

function makeContext(queryImpl: LegacyImpl): ToolExecutionContext {
  const adapted = adaptLegacyMockForSqlite(queryImpl);
  return {
    database: {
      query: vi.fn().mockImplementation(adapted),
      transaction: vi.fn()
    } as unknown as ToolExecutionContext["database"],
    embeddings: {} as ToolExecutionContext["embeddings"],
    extensions: { pgFacets: false, pgDgraph: false, pgPragma: false },
    nativeExtensionsMode: "sql-only",
    retrieval: { hybridBm25Weight: 0.5, hybridVectorWeight: 0.5 }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ghostcrab_workspace_export_model
// ─────────────────────────────────────────────────────────────────────────────

describe("ghostcrab_workspace_export_model", () => {
  it("returns workspace_not_found when workspace missing", async () => {
    const ctx = makeContext(async () => []);
    const result = await workspaceExportModelTool.handler(
      { workspace_id: "missing-ws" },
      ctx
    );
    expect(result.isError).toBe(true);
    const data = JSON.parse((result.content[0] as { text: string }).text) as Record<
      string,
      unknown
    >;
    expect((data.error as Record<string, unknown>).code).toBe("workspace_not_found");
  });

  it("returns schema_version 1.0.0", async () => {
    const ctx = makeContext(async (sql: string) => {
      if (sql.includes("mindbrain.workspaces")) {
        return [{ id: "default", label: "Default Workspace", description: null, pg_schema: "public" }];
      }
      if (sql.includes("mindbrain.table_semantics")) return [];
      if (sql.includes("mindbrain.column_semantics")) return [];
      if (sql.includes("information_schema.tables")) return [];
      if (sql.includes("information_schema.columns")) return [];
      return [];
    });

    const result = await workspaceExportModelTool.handler(
      { workspace_id: "default" },
      ctx
    );
    expect(result.isError).toBeFalsy();
    const data = JSON.parse((result.content[0] as { text: string }).text) as Record<string, unknown>;
    expect(data.ok).toBe(true);
    expect(data.schema_version).toBe(WORKSPACE_MODEL_SCHEMA_VERSION);
    expect(data.schema_version).toBe("1.0.0");
  });

  it("returns public contract shape (workspace, tables, columns, generation_hints)", async () => {
    const ctx = makeContext(async (sql: string) => {
      if (sql.includes("mindbrain.workspaces")) {
        return [{ id: "casino-test", label: "Casino Test", description: null, pg_schema: "casino" }];
      }
      if (sql.includes("mindbrain.table_semantics")) {
        return [{
          table_schema: "casino",
          table_name: "players",
          business_role: "actor",
          generation_strategy: "synthetic",
          emit_facets: true,
          emit_graph_entity: true,
          emit_graph_relation: false,
          notes: "{\"entity_family\":\"player\",\"volume_driver\":\"low\",\"emit_projections\":true}"
        }];
      }
      if (sql.includes("mindbrain.column_semantics")) {
        return [{
          table_schema: "casino",
          table_name: "players",
          column_name: "id",
          column_role: "id"
        }, {
          table_schema: "casino",
          table_name: "players",
          column_name: "status",
          column_role: "status"
        }, {
          table_schema: "casino",
          table_name: "players",
          column_name: "display_name",
          column_role: "attribute"
        }, {
          table_schema: "casino",
          table_name: "players",
          column_name: "joined_at",
          column_role: "timestamp"
        }];
      }
      if (sql.includes("information_schema.tables")) {
        return [{ table_schema: "casino", table_name: "players" }];
      }
      if (sql.includes("information_schema.columns")) {
        return [
          { table_schema: "casino", table_name: "players", column_name: "id" },
          { table_schema: "casino", table_name: "players", column_name: "status" },
          { table_schema: "casino", table_name: "players", column_name: "display_name" },
          { table_schema: "casino", table_name: "players", column_name: "joined_at" }
        ];
      }
      return [];
    });

    const result = await workspaceExportModelTool.handler(
      { workspace_id: "casino-test", depth: "tables_and_columns" },
      ctx
    );
    expect(result.isError).toBeFalsy();
    const data = JSON.parse((result.content[0] as { text: string }).text) as Record<string, unknown>;
    expect(data.ok).toBe(true);

    // workspace object (not flat workspace_id)
    const workspace = data.workspace as Record<string, unknown>;
    expect(workspace).toBeDefined();
    expect(workspace.id).toBe("casino-test");
    expect(workspace.label).toBe("Casino Test");
    expect(workspace.pg_schema).toBe("casino");

    // tables array (not table_semantics)
    const tables = data.tables as Array<Record<string, unknown>>;
    expect(Array.isArray(tables)).toBe(true);
    expect(tables).toHaveLength(1);
    expect(tables[0]?.schema_name).toBe("casino");
    expect(tables[0]?.table_name).toBe("players");
    expect(tables[0]?.table_role).toBe("actor");
    expect(tables[0]?.entity_family).toBe("player");
    expect(tables[0]?.primary_time_column).toBe("joined_at");
    expect(tables[0]?.volume_driver).toBe("low");
    expect(tables[0]?.generation_strategy).toBe("seed_table");
    expect(tables[0]?.emit_facets).toBe(true);
    expect(tables[0]?.emit_graph_entities).toBe(true);
    expect(tables[0]?.emit_projections).toBe(true);

    // columns array (not column_semantics)
    const columns = data.columns as Array<Record<string, unknown>>;
    expect(Array.isArray(columns)).toBe(true);
    expect(columns).toHaveLength(4);
    const idCol = columns.find((column) => column.column_name === "id");
    const statusCol = columns.find((column) => column.column_name === "status");
    const displayNameCol = columns.find(
      (column) => column.column_name === "display_name"
    );
    const joinedAtCol = columns.find(
      (column) => column.column_name === "joined_at"
    );
    expect(idCol?.column_role).toBe("id");
    expect(idCol?.semantic_type).toBe("identifier");
    expect(idCol?.graph_usage).toBe("entity_name");
    expect(statusCol?.column_role).toBe("status");
    expect(statusCol?.semantic_type).toBe("state");
    expect(statusCol?.graph_usage).toBe("entity_property");
    expect(displayNameCol?.semantic_type).toBe("free_text");
    expect(displayNameCol?.graph_usage).toBe("entity_property");
    expect(joinedAtCol?.semantic_type).toBe("temporal");

    // generation_hints
    const hints = data.generation_hints as Record<string, unknown>;
    expect(hints).toBeDefined();
    expect(Array.isArray(hints.table_order)).toBe(true);
    expect((hints.table_order as string[])).toContain("casino.players");
    expect(hints.seed_multipliers).toBeDefined();
    expect(hints.time_window_days).toBe(90);

    // no legacy keys exposed
    expect(data.workspace_id).toBeUndefined();
    expect(data.table_semantics).toBeUndefined();
    expect(data.column_semantics).toBeUndefined();
    expect(data.pg_schema).toBeUndefined();
  });

  it("maps DB column_role 'attribute'/'unknown' to null in public contract", async () => {
    const ctx = makeContext(async (sql: string) => {
      if (sql.includes("mindbrain.workspaces")) {
        return [{ id: "ws", label: "WS", description: null, pg_schema: "public" }];
      }
      if (sql.includes("mindbrain.column_semantics")) {
        return [
          { table_schema: "public", table_name: "orders", column_name: "amount", column_role: "attribute" },
          { table_schema: "public", table_name: "orders", column_name: "note", column_role: "unknown" }
        ];
      }
      if (sql.includes("mindbrain.table_semantics")) {
        return [{ table_schema: "public", table_name: "orders", business_role: null, generation_strategy: "unknown", emit_facets: false, emit_graph_entity: false, emit_graph_relation: false, notes: null }];
      }
      if (sql.includes("information_schema.tables")) return [{ table_schema: "public", table_name: "orders" }];
      if (sql.includes("information_schema.columns")) return [
        { table_schema: "public", table_name: "orders", column_name: "amount" },
        { table_schema: "public", table_name: "orders", column_name: "note" }
      ];
      return [];
    });

    const result = await workspaceExportModelTool.handler(
      { workspace_id: "ws", depth: "tables_and_columns" },
      ctx
    );
    const data = JSON.parse((result.content[0] as { text: string }).text) as Record<string, unknown>;
    const columns = data.columns as Array<Record<string, unknown>>;
    expect(columns[0]?.column_role).toBeNull();
    expect(columns[1]?.column_role).toBeNull();
  });

  it("builds validation_warnings for orphan table semantics", async () => {
    const ctx = makeContext(async (sql: string) => {
      if (sql.includes("mindbrain.workspaces")) {
        return [{ id: "default", label: "Default", description: null, pg_schema: "public" }];
      }
      if (sql.includes("mindbrain.table_semantics")) {
        return [{
          table_schema: "public",
          table_name: "ghost_table",
          business_role: null,
          generation_strategy: "unknown",
          emit_facets: true,
          emit_graph_entity: false,
          emit_graph_relation: false,
          notes: null
        }];
      }
      if (sql.includes("mindbrain.column_semantics")) {
        return [{
          table_schema: "public",
          table_name: "real",
          column_name: "a",
          column_role: "attribute"
        }];
      }
      if (sql.includes("information_schema.tables")) {
        return [{ table_schema: "public", table_name: "real" }];
      }
      if (sql.includes("information_schema.columns")) {
        return [{ table_schema: "public", table_name: "real", column_name: "a" }];
      }
      return [];
    });

    const result = await workspaceExportModelTool.handler(
      { workspace_id: "default", depth: "tables_and_columns" },
      ctx
    );
    expect(result.isError).toBeFalsy();
    const data = JSON.parse((result.content[0] as { text: string }).text) as Record<string, unknown>;
    expect(data.ok).toBe(true);
    const warnings = data.validation_warnings as string[];
    expect(warnings.some((w) => w.includes("ghost_table"))).toBe(true);
  });

  it("omits columns when depth is tables_only", async () => {
    const ctx = makeContext(async (sql: string) => {
      if (sql.includes("mindbrain.workspaces")) {
        return [{ id: "ws", label: "WS", description: null, pg_schema: "public" }];
      }
      if (sql.includes("mindbrain.table_semantics")) return [];
      if (sql.includes("information_schema.tables")) return [];
      if (sql.includes("information_schema.columns")) return [];
      return [];
    });

    const result = await workspaceExportModelTool.handler(
      { workspace_id: "ws", depth: "tables_only" },
      ctx
    );
    const data = JSON.parse((result.content[0] as { text: string }).text) as Record<string, unknown>;
    expect(data.ok).toBe(true);
    expect(data.columns).toBeUndefined();
    expect(data.relations).toBeUndefined();
  });

  it("includes relations when depth is full", async () => {
    const ctx = makeContext(async (sql: string) => {
      if (sql.includes("mindbrain.workspaces")) {
        return [{ id: "ws", label: "WS", description: null, pg_schema: "public" }];
      }
      if (sql.includes("mindbrain.table_semantics")) {
        return [
          { table_schema: "public", table_name: "visits", business_role: null, generation_strategy: "unknown", emit_facets: false, emit_graph_entity: false, emit_graph_relation: false, notes: null },
          { table_schema: "public", table_name: "players", business_role: null, generation_strategy: "unknown", emit_facets: false, emit_graph_entity: false, emit_graph_relation: false, notes: null }
        ];
      }
      if (sql.includes("mindbrain.column_semantics")) return [];
      if (sql.includes("mindbrain.relation_semantics")) {
        return [{
          from_schema: "public",
          from_table: "visits",
          to_schema: "public",
          to_table: "players",
          fk_column: "player_id",
          relation_kind: "many_to_one"
        }];
      }
      if (sql.includes("information_schema.tables")) return [];
      if (sql.includes("information_schema.columns")) return [];
      return [];
    });

    const result = await workspaceExportModelTool.handler(
      { workspace_id: "ws", depth: "full" },
      ctx
    );
    const data = JSON.parse((result.content[0] as { text: string }).text) as Record<string, unknown>;
    expect(data.ok).toBe(true);
    const relations = data.relations as Array<Record<string, unknown>>;
    expect(Array.isArray(relations)).toBe(true);
    expect(relations).toHaveLength(1);
    expect(relations[0]?.source_table).toBe("visits");
    expect(relations[0]?.target_table).toBe("players");
    expect(relations[0]?.source_column).toBe("player_id");
    expect(relations[0]?.cardinality).toBe("1:n");
  });

  it("domain_profile derived from workspace id even when description is present", async () => {
    const ctx = makeContext(async (sql: string) => {
      if (sql.includes("mindbrain.workspaces")) {
        return [{ id: "kanban-board", label: "Kanban Board", description: "A board for managing tasks.", pg_schema: "kanban" }];
      }
      if (sql.includes("mindbrain.table_semantics")) return [];
      if (sql.includes("information_schema.table_constraints")) return [];
      if (sql.includes("information_schema.tables")) return [];
      if (sql.includes("information_schema.columns")) return [];
      return [];
    });

    const result = await workspaceExportModelTool.handler(
      { workspace_id: "kanban-board", depth: "tables_only" },
      ctx
    );
    const data = JSON.parse((result.content[0] as { text: string }).text) as Record<string, unknown>;
    expect(data.ok).toBe(true);
    const workspace = data.workspace as Record<string, unknown>;
    // Bug fix: description present must not nullify domain_profile
    expect(workspace.domain_profile).toBe("kanban");
    const hints = data.generation_hints as Record<string, unknown>;
    expect(hints.domain_profile).toBe("kanban");
  });

  it("target_column resolved from catalog PK, falls back to id when no PK row", async () => {
    const ctx = makeContext(async (sql: string) => {
      if (sql.includes("mindbrain.workspaces")) {
        return [{ id: "ws", label: "WS", description: null, pg_schema: "public" }];
      }
      if (sql.includes("mindbrain.table_semantics")) {
        return [
          { table_schema: "public", table_name: "cards", business_role: null, generation_strategy: "unknown", emit_facets: false, emit_graph_entity: false, emit_graph_relation: false, notes: null },
          { table_schema: "public", table_name: "boards", business_role: null, generation_strategy: "unknown", emit_facets: false, emit_graph_entity: false, emit_graph_relation: false, notes: null }
        ];
      }
      if (sql.includes("mindbrain.column_semantics")) return [];
      if (sql.includes("mindbrain.relation_semantics")) {
        return [{
          from_schema: "public", from_table: "cards",
          to_schema: "public", to_table: "boards",
          fk_column: "board_id", relation_kind: "many_to_one"
        }];
      }
      if (sql.includes("information_schema.table_constraints")) {
        // boards has PK "board_uuid", cards has none in this mock
        return [{ table_schema: "public", table_name: "boards", column_name: "board_uuid" }];
      }
      if (sql.includes("information_schema.tables")) {
        return [
          { table_schema: "public", table_name: "boards" },
          { table_schema: "public", table_name: "cards" }
        ];
      }
      if (sql.includes("information_schema.columns")) {
        return [
          { table_schema: "public", table_name: "boards", column_name: "board_uuid", is_nullable: "NO" },
          { table_schema: "public", table_name: "cards", column_name: "board_id", is_nullable: "YES" }
        ];
      }
      return [];
    });

    const result = await workspaceExportModelTool.handler(
      { workspace_id: "ws", depth: "full" },
      ctx
    );
    const data = JSON.parse((result.content[0] as { text: string }).text) as Record<string, unknown>;
    const relations = data.relations as Array<Record<string, unknown>>;
    expect(relations).toHaveLength(1);
    // boards has PK "board_uuid" in catalog → target_column should be "board_uuid"
    expect(relations[0]?.target_column).toBe("board_uuid");
  });

  it("generation_strategy maps synthetic→per_parent for child table, seed_table for root", async () => {
    const ctx = makeContext(async (sql: string) => {
      if (sql.includes("mindbrain.workspaces")) {
        return [{ id: "ws", label: "WS", description: null, pg_schema: "public" }];
      }
      if (sql.includes("mindbrain.table_semantics")) {
        return [
          { table_schema: "public", table_name: "players", business_role: null, generation_strategy: "synthetic", emit_facets: false, emit_graph_entity: false, emit_graph_relation: false, notes: null },
          { table_schema: "public", table_name: "visits", business_role: null, generation_strategy: "synthetic", emit_facets: false, emit_graph_entity: false, emit_graph_relation: false, notes: null }
        ];
      }
      if (sql.includes("mindbrain.column_semantics")) return [];
      if (sql.includes("mindbrain.relation_semantics")) {
        return [{ from_schema: "public", from_table: "visits", to_schema: "public", to_table: "players", fk_column: "player_id", relation_kind: "many_to_one" }];
      }
      if (sql.includes("information_schema.table_constraints")) return [];
      if (sql.includes("information_schema.tables")) return [];
      if (sql.includes("information_schema.columns")) return [];
      return [];
    });

    const result = await workspaceExportModelTool.handler(
      { workspace_id: "ws", depth: "full" },
      ctx
    );
    const data = JSON.parse((result.content[0] as { text: string }).text) as Record<string, unknown>;
    const tables = data.tables as Array<Record<string, unknown>>;
    const players = tables.find(t => t.table_name === "players");
    const visits = tables.find(t => t.table_name === "visits");
    // players has no parent relation → seed_table
    expect(players?.generation_strategy).toBe("seed_table");
    // visits is the child (from_table) → per_parent
    expect(visits?.generation_strategy).toBe("per_parent");
  });

  it("computes table_order respecting FK edges from relation_semantics (full depth)", async () => {
    const ctx = makeContext(async (sql: string) => {
      if (sql.includes("mindbrain.workspaces")) {
        return [{ id: "ws", label: "WS", description: null, pg_schema: "public" }];
      }
      if (sql.includes("mindbrain.table_semantics")) {
        return [
          { table_schema: "public", table_name: "visits", business_role: null, generation_strategy: "unknown", emit_facets: false, emit_graph_entity: false, emit_graph_relation: false, notes: null },
          { table_schema: "public", table_name: "players", business_role: null, generation_strategy: "unknown", emit_facets: false, emit_graph_entity: false, emit_graph_relation: false, notes: null }
        ];
      }
      if (sql.includes("mindbrain.column_semantics")) return [];
      if (sql.includes("mindbrain.relation_semantics")) {
        return [{
          from_schema: "public",
          from_table: "visits",
          to_schema: "public",
          to_table: "players",
          fk_column: "player_id",
          relation_kind: "many_to_one"
        }];
      }
      if (sql.includes("information_schema.tables")) return [];
      if (sql.includes("information_schema.columns")) return [];
      return [];
    });

    const result = await workspaceExportModelTool.handler(
      { workspace_id: "ws", depth: "full" },
      ctx
    );
    const data = JSON.parse((result.content[0] as { text: string }).text) as Record<string, unknown>;
    const hints = data.generation_hints as Record<string, unknown>;
    const order = hints.table_order as string[];
    expect(order.indexOf("public.players")).toBeLessThan(order.indexOf("public.visits"));
  });
});

  it("rich_meta precedence: explicit fields override heuristics for columns", async () => {
    const ctx = makeContext(async (sql: string) => {
      if (sql.includes("mindbrain.workspaces")) {
        return [{ id: "ws", label: "WS", description: null, pg_schema: "public", domain_profile: null }];
      }
      if (sql.includes("mindbrain.table_semantics")) {
        return [{ table_schema: "public", table_name: "cards", business_role: "stateful_item", generation_strategy: "unknown", emit_facets: true, emit_graph_entity: true, emit_graph_relation: false, notes: "{\"entity_family\":\"card\",\"volume_driver\":\"medium\",\"emit_projections\":true}" }];
      }
      if (sql.includes("mindbrain.column_semantics")) {
        return [{
          table_schema: "public", table_name: "cards", column_name: "status",
          column_role: "status",
          rich_meta: {
            public_column_role: "status",
            semantic_type: "state",
            facet_key: "card_status",
            graph_usage: "entity_property",
            projection_signal: "alert_trigger",
            is_nullable: false,
            distribution_hint: { values: ["todo", "done"], weights: [0.5, 0.5] }
          }
        }];
      }
      if (sql.includes("information_schema.table_constraints")) return [];
      if (sql.includes("information_schema.tables")) return [{ table_schema: "public", table_name: "cards" }];
      if (sql.includes("information_schema.columns")) return [{ table_schema: "public", table_name: "cards", column_name: "status", is_nullable: "YES" }];
      return [];
    });

    const result = await workspaceExportModelTool.handler(
      { workspace_id: "ws", depth: "tables_and_columns" },
      ctx
    );
    const data = JSON.parse((result.content[0] as { text: string }).text) as Record<string, unknown>;
    const columns = data.columns as Array<Record<string, unknown>>;
    const statusCol = columns.find(c => c.column_name === "status");
    expect(statusCol).toBeDefined();
    // Explicit rich_meta fields take precedence
    expect(statusCol?.column_role).toBe("status");
    expect(statusCol?.semantic_type).toBe("state");
    expect(statusCol?.facet_key).toBe("card_status");
    expect(statusCol?.graph_usage).toBe("entity_property");
    expect(statusCol?.projection_signal).toBe("alert_trigger");
    // is_nullable: explicit false overrides catalog YES
    expect(statusCol?.is_nullable).toBe(false);
    expect(statusCol?.distribution_hint).toEqual({ values: ["todo", "done"], weights: [0.5, 0.5] });

    // Table-level rich fields from notes JSON
    const tables = data.tables as Array<Record<string, unknown>>;
    const cardsTable = tables.find(t => t.table_name === "cards");
    expect(cardsTable?.table_role).toBe("stateful_item");
    expect(cardsTable?.entity_family).toBe("card");
    expect(cardsTable?.volume_driver).toBe("medium");
    expect(cardsTable?.emit_projections).toBe(true);
  });

  it("is_nullable falls back to catalog when not in rich_meta", async () => {
    const ctx = makeContext(async (sql: string) => {
      if (sql.includes("mindbrain.workspaces")) {
        return [{ id: "ws", label: "WS", description: null, pg_schema: "public", domain_profile: null }];
      }
      if (sql.includes("mindbrain.table_semantics")) {
        return [{ table_schema: "public", table_name: "t", business_role: null, generation_strategy: "unknown", emit_facets: false, emit_graph_entity: false, emit_graph_relation: false, notes: null }];
      }
      if (sql.includes("mindbrain.column_semantics")) {
        // No rich_meta → should use catalog
        return [{ table_schema: "public", table_name: "t", column_name: "email", column_role: "attribute", rich_meta: null }];
      }
      if (sql.includes("information_schema.table_constraints")) return [];
      if (sql.includes("information_schema.tables")) return [{ table_schema: "public", table_name: "t" }];
      if (sql.includes("information_schema.columns")) return [{ table_schema: "public", table_name: "t", column_name: "email", is_nullable: "NO" }];
      return [];
    });

    const result = await workspaceExportModelTool.handler(
      { workspace_id: "ws", depth: "tables_and_columns" },
      ctx
    );
    const data = JSON.parse((result.content[0] as { text: string }).text) as Record<string, unknown>;
    const columns = data.columns as Array<Record<string, unknown>>;
    const emailCol = columns.find(c => c.column_name === "email");
    // Catalog says NOT NULL → is_nullable = false
    expect(emailCol?.is_nullable).toBe(false);
  });

  it("rich_meta for relations: relation_role, hierarchical, graph_label from explicit", async () => {
    const ctx = makeContext(async (sql: string) => {
      if (sql.includes("mindbrain.workspaces")) {
        return [{ id: "ws", label: "WS", description: null, pg_schema: "public", domain_profile: null }];
      }
      if (sql.includes("mindbrain.table_semantics")) {
        return [
          { table_schema: "public", table_name: "cards", business_role: null, generation_strategy: "unknown", emit_facets: false, emit_graph_entity: false, emit_graph_relation: false, notes: null },
          { table_schema: "public", table_name: "boards", business_role: null, generation_strategy: "unknown", emit_facets: false, emit_graph_entity: false, emit_graph_relation: false, notes: null }
        ];
      }
      if (sql.includes("mindbrain.column_semantics")) return [];
      if (sql.includes("mindbrain.relation_semantics")) {
        return [{
          from_schema: "public", from_table: "cards",
          to_schema: "public", to_table: "boards",
          fk_column: "board_id", relation_kind: "many_to_one",
          rich_meta: { relation_role: "belongs_to", hierarchical: true, graph_label: "CONTAINS", target_column: "uuid" }
        }];
      }
      if (sql.includes("information_schema.table_constraints")) return [];
      if (sql.includes("information_schema.tables")) return [];
      if (sql.includes("information_schema.columns")) return [];
      return [];
    });

    const result = await workspaceExportModelTool.handler(
      { workspace_id: "ws", depth: "full" },
      ctx
    );
    const data = JSON.parse((result.content[0] as { text: string }).text) as Record<string, unknown>;
    const relations = data.relations as Array<Record<string, unknown>>;
    expect(relations).toHaveLength(1);
    expect(relations[0]?.relation_role).toBe("belongs_to");
    expect(relations[0]?.hierarchical).toBe(true);
    expect(relations[0]?.graph_label).toBe("CONTAINS");
    expect(relations[0]?.target_column).toBe("uuid");
  });

  it("estimated_total_rows computed from volume_driver × seed_multipliers", async () => {
    const ctx = makeContext(async (sql: string) => {
      if (sql.includes("mindbrain.workspaces")) {
        return [{ id: "ws", label: "WS", description: null, pg_schema: "public", domain_profile: null }];
      }
      if (sql.includes("mindbrain.table_semantics")) {
        return [
          { table_schema: "public", table_name: "members", business_role: "actor", generation_strategy: "unknown", emit_facets: true, emit_graph_entity: false, emit_graph_relation: false, notes: "{\"volume_driver\":\"low\"}" },
          { table_schema: "public", table_name: "cards", business_role: "stateful_item", generation_strategy: "unknown", emit_facets: true, emit_graph_entity: false, emit_graph_relation: false, notes: "{\"volume_driver\":\"medium\"}" }
        ];
      }
      if (sql.includes("mindbrain.column_semantics")) return [];
      if (sql.includes("information_schema.table_constraints")) return [];
      if (sql.includes("information_schema.tables")) return [];
      if (sql.includes("information_schema.columns")) return [];
      return [];
    });

    const result = await workspaceExportModelTool.handler(
      { workspace_id: "ws", depth: "tables_only" },
      ctx
    );
    const data = JSON.parse((result.content[0] as { text: string }).text) as Record<string, unknown>;
    const hints = data.generation_hints as Record<string, unknown>;
    // low=200 + medium=2000 = 2200
    expect(hints.estimated_total_rows).toBe(2200);
  });

// ─────────────────────────────────────────────────────────────────────────────
// ghostcrab_workspace_inspect
// ─────────────────────────────────────────────────────────────────────────────

describe("ghostcrab_workspace_inspect", () => {
  it("returns workspace_not_found when workspace missing", async () => {
    const ctx = makeContext(async () => []);
    const result = await workspaceInspectTool.handler(
      { workspace_id: "nope" },
      ctx
    );
    expect(result.isError).toBe(true);
  });
});
