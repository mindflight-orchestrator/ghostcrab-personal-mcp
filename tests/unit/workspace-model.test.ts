import { describe, expect, it } from "vitest";

import {
  inferBasicSemantics,
  validateSemanticsAgainstCatalog,
  computeTableOrder,
  buildGenerationHints,
  mapDbColumnRole,
  mapPublicColumnRoleToDb,
  WORKSPACE_MODEL_SCHEMA_VERSION,
  WorkspaceModelExportSchema
} from "../../src/types/workspace-model.js";

// ─────────────────────────────────────────────────────────────────────────────
// Contract version
// ─────────────────────────────────────────────────────────────────────────────

describe("WORKSPACE_MODEL_SCHEMA_VERSION", () => {
  it("is semver-shaped", () => {
    expect(WORKSPACE_MODEL_SCHEMA_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("is 1.0.0 (public contract)", () => {
    expect(WORKSPACE_MODEL_SCHEMA_VERSION).toBe("1.0.0");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// inferBasicSemantics
// ─────────────────────────────────────────────────────────────────────────────

describe("inferBasicSemantics", () => {
  it("infers table and columns from CREATE TABLE", () => {
    const sql = `
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        user_id INT,
        status TEXT,
        created_at TIMESTAMPTZ
      );
    `;
    const r = inferBasicSemantics(sql, null);
    expect(r.table_semantics).toHaveLength(1);
    expect(r.table_semantics[0]?.table_name).toBe("orders");
    expect(r.table_semantics[0]?.emit_facets).toBe(false);

    const roles = new Map(
      r.column_semantics.map((c) => [c.column_name, c.column_role])
    );
    expect(roles.get("id")).toBe("id");
    expect(roles.get("user_id")).toBe("fk");
    expect(roles.get("status")).toBe("status");
    expect(roles.get("created_at")).toBe("timestamp");
  });

  it("sets emit_facets when sync_spec maps the table", () => {
    const sql = `CREATE TABLE public.articles (id INT, title TEXT);`;
    const r = inferBasicSemantics(sql, {
      source_table: "public.articles",
      fields: [{ column_name: "title", facet_key: "title", index_in_bm25: true }]
    });
    const t = r.table_semantics.find((x) => x.table_name === "articles");
    expect(t?.emit_facets).toBe(true);
  });

  it("adds sync_spec table when not in DDL", () => {
    const r = inferBasicSemantics("SELECT 1;", {
      source_table: "public.orphan",
      fields: []
    });
    expect(r.table_semantics.some((t) => t.table_name === "orphan")).toBe(true);
    expect(
      r.table_semantics.find((t) => t.table_name === "orphan")?.emit_facets
    ).toBe(true);
  });

  it("infers FK relations from REFERENCES clauses", () => {
    const sql = `
      CREATE TABLE orders (
        id INT PRIMARY KEY,
        customer_id INT REFERENCES customers(id)
      );
    `;
    const r = inferBasicSemantics(sql, null);
    expect(r.relation_semantics.length).toBeGreaterThan(0);
    const rel = r.relation_semantics[0];
    expect(rel?.from_table).toBe("orders");
    expect(rel?.to_table).toBe("customers");
    expect(rel?.relation_kind).toBe("many_to_one");
  });

  it("stores generation_strategy as 'unknown' for inferred tables", () => {
    const sql = `CREATE TABLE foo (id INT);`;
    const r = inferBasicSemantics(sql, null);
    expect(r.table_semantics[0]?.generation_strategy).toBe("unknown");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateSemanticsAgainstCatalog
// ─────────────────────────────────────────────────────────────────────────────

describe("validateSemanticsAgainstCatalog", () => {
  it("warns on orphan table/column semantics", () => {
    const warnings = validateSemanticsAgainstCatalog({
      existingTables: new Set(["public.known"]),
      existingColumns: new Set(["public.known.a"]),
      tableSemantics: [
        {
          table_schema: "public",
          table_name: "missing",
          generation_strategy: "unknown",
          emit_facets: false,
          emit_graph_entity: false,
          emit_graph_relation: false
        }
      ],
      columnSemantics: [
        {
          table_schema: "public",
          table_name: "known",
          column_name: "b",
          column_role: "attribute"
        }
      ]
    });
    expect(warnings.some((w) => w.includes("missing"))).toBe(true);
    expect(warnings.some((w) => w.includes(".b"))).toBe(true);
  });

  it("produces no warnings when semantics match catalog", () => {
    const warnings = validateSemanticsAgainstCatalog({
      existingTables: new Set(["casino.players"]),
      existingColumns: new Set(["casino.players.id", "casino.players.status"]),
      tableSemantics: [{
        table_schema: "casino",
        table_name: "players",
        generation_strategy: "unknown",
        emit_facets: true,
        emit_graph_entity: false,
        emit_graph_relation: false
      }],
      columnSemantics: [
        { table_schema: "casino", table_name: "players", column_name: "id", column_role: "id" },
        { table_schema: "casino", table_name: "players", column_name: "status", column_role: "status" }
      ]
    });
    expect(warnings).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeTableOrder
// ─────────────────────────────────────────────────────────────────────────────

describe("computeTableOrder", () => {
  it("puts parents before children", () => {
    const tables = [
      { schema_name: "casino", table_name: "visits" },
      { schema_name: "casino", table_name: "players" }
    ];
    const edges = [{ from_schema: "casino", from_table: "visits", to_schema: "casino", to_table: "players" }];
    const order = computeTableOrder(tables, edges);
    expect(order.indexOf("casino.players")).toBeLessThan(order.indexOf("casino.visits"));
  });

  it("handles disconnected graph (no edges)", () => {
    const tables = [
      { schema_name: "casino", table_name: "game_types" },
      { schema_name: "casino", table_name: "players" }
    ];
    const order = computeTableOrder(tables, []);
    expect(order).toHaveLength(2);
    expect(order).toContain("casino.game_types");
    expect(order).toContain("casino.players");
  });

  it("includes all tables even with cycles", () => {
    const tables = [
      { schema_name: "pub", table_name: "a" },
      { schema_name: "pub", table_name: "b" },
      { schema_name: "pub", table_name: "c" }
    ];
    const edges = [
      { from_schema: "pub", from_table: "a", to_schema: "pub", to_table: "b" },
      { from_schema: "pub", from_table: "b", to_schema: "pub", to_table: "a" }
    ];
    const order = computeTableOrder(tables, edges);
    expect(order).toHaveLength(3);
    expect(order).toContain("pub.a");
    expect(order).toContain("pub.b");
    expect(order).toContain("pub.c");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildGenerationHints
// ─────────────────────────────────────────────────────────────────────────────

describe("buildGenerationHints", () => {
  it("returns default seed_multipliers", () => {
    const hints = buildGenerationHints({ domainProfile: "casino", tables: [], edges: [] });
    expect(hints.seed_multipliers?.tiny).toBe(20);
    expect(hints.seed_multipliers?.low).toBe(200);
    expect(hints.seed_multipliers?.medium).toBe(2000);
    expect(hints.seed_multipliers?.high).toBe(10000);
  });

  it("returns default time_window_days of 90", () => {
    const hints = buildGenerationHints({ domainProfile: null, tables: [], edges: [] });
    expect(hints.time_window_days).toBe(90);
  });

  it("includes domain_profile", () => {
    const hints = buildGenerationHints({
      domainProfile: "crm",
      tables: [{ schema_name: "crm", table_name: "contacts" }],
      edges: []
    });
    expect(hints.domain_profile).toBe("crm");
    expect(hints.table_order).toEqual(["crm.contacts"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Column role mapping helpers
// ─────────────────────────────────────────────────────────────────────────────

describe("mapDbColumnRole", () => {
  it("maps known DB roles to public contract roles", () => {
    expect(mapDbColumnRole("id")).toBe("id");
    expect(mapDbColumnRole("fk")).toBe("fk");
    expect(mapDbColumnRole("timestamp")).toBe("timestamp");
    expect(mapDbColumnRole("status")).toBe("status");
  });

  it("maps 'attribute' and 'unknown' to null", () => {
    expect(mapDbColumnRole("attribute")).toBeNull();
    expect(mapDbColumnRole("unknown")).toBeNull();
    expect(mapDbColumnRole(null)).toBeNull();
    expect(mapDbColumnRole(undefined)).toBeNull();
  });
});

describe("mapPublicColumnRoleToDb", () => {
  it("maps public contract roles to DB-safe values", () => {
    expect(mapPublicColumnRoleToDb("id")).toBe("id");
    expect(mapPublicColumnRoleToDb("fk")).toBe("fk");
    expect(mapPublicColumnRoleToDb("timestamp")).toBe("timestamp");
    expect(mapPublicColumnRoleToDb("status")).toBe("status");
  });

  it("falls back to 'attribute' for roles not in migration 012 CHECK", () => {
    expect(mapPublicColumnRoleToDb("amount")).toBe("attribute");
    expect(mapPublicColumnRoleToDb("score")).toBe("attribute");
    expect(mapPublicColumnRoleToDb("label")).toBe("attribute");
    expect(mapPublicColumnRoleToDb("geo")).toBe("attribute");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// WorkspaceModelExportSchema — cross-validation with runtime types
// ─────────────────────────────────────────────────────────────────────────────

describe("WorkspaceModelExportSchema cross-validation", () => {
  it("accepts a minimal valid export", () => {
    const minimal = {
      schema_version: "1.0.0",
      exported_at: "2026-03-31T00:00:00Z",
      workspace: { id: "test-ws", label: "Test Workspace" },
      tables: []
    };
    expect(() => WorkspaceModelExportSchema.parse(minimal)).not.toThrow();
  });

  it("accepts a full export with all optional fields", () => {
    const full = {
      schema_version: "1.0.0",
      exported_at: "2026-03-31T00:00:00Z",
      workspace: { id: "casino-pilot", label: "Casino Pilot", domain_profile: "casino", pg_schema: "casino" },
      tables: [{
        schema_name: "casino",
        table_name: "players",
        table_role: "actor",
        emit_facets: true,
        emit_graph_entities: true,
        emit_graph_relations: false,
        emit_projections: false
      }],
      columns: [{
        schema_name: "casino",
        table_name: "players",
        column_name: "id",
        column_role: "id"
      }],
      relations: [],
      generation_hints: {
        table_order: ["casino.players"],
        seed_multipliers: { tiny: 20, low: 200, medium: 2000, high: 10000 },
        domain_profile: "casino",
        time_window_days: 90
      },
      validation_warnings: []
    };
    const parsed = WorkspaceModelExportSchema.parse(full);
    expect(parsed.schema_version).toBe("1.0.0");
    expect(parsed.tables).toHaveLength(1);
    expect(parsed.columns).toHaveLength(1);
    expect(parsed.generation_hints?.domain_profile).toBe("casino");
  });

  it("rejects missing workspace", () => {
    const bad = {
      schema_version: "1.0.0",
      exported_at: "2026-03-31T00:00:00Z",
      tables: []
    };
    expect(() => WorkspaceModelExportSchema.parse(bad)).toThrow();
  });

  it("rejects invalid schema_version format", () => {
    const bad = {
      schema_version: "v1.0.0",
      exported_at: "2026-03-31T00:00:00Z",
      workspace: { id: "ws", label: "WS" },
      tables: []
    };
    expect(() => WorkspaceModelExportSchema.parse(bad)).toThrow();
  });

  it("schema_version constant matches the contract schema", () => {
    const parsed = WorkspaceModelExportSchema.parse({
      schema_version: WORKSPACE_MODEL_SCHEMA_VERSION,
      exported_at: "2026-03-31T00:00:00Z",
      workspace: { id: "ws", label: "WS" },
      tables: []
    });
    expect(parsed.schema_version).toBe("1.0.0");
  });
});
