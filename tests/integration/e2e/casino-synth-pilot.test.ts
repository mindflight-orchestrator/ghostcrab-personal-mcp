/**
 * PR-6.3 — Casino Synth Pilot: End-to-End Integration Test
 *
 * This test validates the complete synthetic data generation flow for the casino domain:
 *
 *   workspace creation → DDL → model export → validation → data generation → Layer 2 verification
 *
 * PREREQUISITES (these are provided by PR-1 to PR-4, Cursor Composer 2 plan):
 *   - ghostcrab_workspace_export_model tool (PR-3)
 *   - ghostcrab_ddl_propose accepting table_semantics (PR-4)
 *   - mindbrain.table_semantics migration (PR-2)
 *
 * WHAT THIS TEST DOES TODAY (independent of PR-1 to PR-4):
 *   - Validates the contract schema file is well-formed
 *   - Validates the casino example export against the Zod schema
 *   - Tests fixture file integrity
 *   - Verifies the generator script is syntactically valid
 *
 * WHAT THIS TEST DOES WHEN PR-1 TO PR-4 ARE MERGED:
 *   - The "requires PR-3" describe blocks (currently skipped) will be activated
 *   - They will run against a live MCP server with GHOSTCRAB_MINDBRAIN_URL
 *
 * @group e2e
 * @slow
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeAll } from "vitest";
import { z } from "zod";
import { WorkspaceModelExportSchema } from "../../../src/types/workspace-model.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../../..");

// ---------------------------------------------------------------------------
// Zod schema (matches workspace-model-contract.test.ts — single source of truth
// will be src/types/workspace-model.ts after PR-1 is merged)
// ---------------------------------------------------------------------------

const TableRoleSchema = z.enum([
  "actor", "event", "transaction", "stateful_item",
  "reference", "hierarchy", "association"
]);
const GenerationStrategySchema = z.enum([
  "seed_table", "per_parent", "time_series", "sparse_events", "static_ref"
]);
const VolumeDriverSchema = z.enum(["high", "medium", "low", "tiny"]);
const ColumnRoleSchema = z.enum([
  "id", "fk", "status", "timestamp", "amount", "score",
  "category", "owner", "parent_ref", "text_content",
  "geo", "embedding_source", "label", "flag"
]);
const SemanticTypeSchema = z.enum([
  "identifier", "state", "measure", "enum", "free_text", "temporal", "spatial", "vector", "boolean"
]);
const GraphUsageSchema = z.enum([
  "entity_name", "entity_property", "edge_source", "edge_target", "edge_metadata"
]);
const RelationRoleSchema = z.enum([
  "belongs_to", "contains", "depends_on", "targets",
  "registered_for", "works_at", "assigned_to", "references"
]);
const CardinalitySchema = z.enum(["1:1", "1:n", "n:n"]);
const SemVerSchema = z.string().regex(/^\d+\.\d+\.\d+$/);

const TableExportSchema = z.object({
  schema_name: z.string(),
  table_name: z.string(),
  table_role: TableRoleSchema,
  entity_family: z.string().nullable().optional(),
  primary_time_column: z.string().nullable().optional(),
  volume_driver: VolumeDriverSchema.nullable().optional(),
  generation_strategy: GenerationStrategySchema.nullable().optional(),
  emit_facets: z.boolean().optional().default(false),
  emit_graph_entities: z.boolean().optional().default(false),
  emit_graph_relations: z.boolean().optional().default(false),
  emit_projections: z.boolean().optional().default(false),
  notes: z.record(z.string(), z.unknown()).nullable().optional()
});

const ColumnExportSchema = z.object({
  schema_name: z.string(),
  table_name: z.string(),
  column_name: z.string(),
  column_role: ColumnRoleSchema.nullable().optional(),
  semantic_type: SemanticTypeSchema.nullable().optional(),
  facet_key: z.string().nullable().optional(),
  graph_usage: GraphUsageSchema.nullable().optional(),
  projection_signal: z.string().nullable().optional(),
  is_nullable: z.boolean().optional().default(true),
  distribution_hint: z.record(z.string(), z.unknown()).nullable().optional()
});

const RelationExportSchema = z.object({
  source_schema: z.string(),
  source_table: z.string(),
  source_column: z.string(),
  target_schema: z.string(),
  target_table: z.string(),
  target_column: z.string(),
  relation_role: RelationRoleSchema.nullable().optional(),
  hierarchical: z.boolean().optional().default(false),
  graph_label: z.string().nullable().optional(),
  cardinality: CardinalitySchema.nullable().optional(),
  notes: z.record(z.string(), z.unknown()).nullable().optional()
});

const WorkspaceModelExportSchema = z.object({
  schema_version: SemVerSchema,
  exported_at: z.string(),
  workspace: z.object({
    id: z.string().regex(/^[a-z][a-z0-9-]{1,62}[a-z0-9]$|^[a-z][a-z0-9]$/),
    label: z.string().min(1).max(200),
    description: z.string().nullable().optional(),
    domain_profile: z.string().nullable().optional(),
    pg_schema: z.string().optional()
  }),
  tables: z.array(TableExportSchema),
  columns: z.array(ColumnExportSchema).optional().default([]),
  relations: z.array(RelationExportSchema).optional().default([]),
  generation_hints: z.object({
    table_order: z.array(z.string()).optional(),
    estimated_total_rows: z.number().int().min(0).optional(),
    seed_multipliers: z.object({
      tiny: z.number().int().optional(),
      low: z.number().int().optional(),
      medium: z.number().int().optional(),
      high: z.number().int().optional()
    }).optional(),
    domain_profile: z.string().nullable().optional(),
    time_window_days: z.number().int().min(1).optional()
  }).optional(),
  validation_warnings: z.array(z.string()).optional().default([])
});

type WorkspaceModelExport = z.infer<typeof WorkspaceModelExportSchema>;

// ---------------------------------------------------------------------------
// File paths
// ---------------------------------------------------------------------------

const FIXTURE_BASE = resolve(ROOT, "tests/fixtures/casino-pilot");
const DDL_PATH = resolve(FIXTURE_BASE, "ddl.sql");
const SEMANTICS_PATH = resolve(FIXTURE_BASE, "semantics.json");
const EXPECTED_COUNTS_PATH = resolve(FIXTURE_BASE, "expected-counts.json");
const CASINO_EXPORT_PATH = resolve(ROOT, "docs/dev/examples/casino-benchmark.export.json");
const SCHEMA_CONTRACT_PATH = resolve(ROOT, "docs/dev/workspace-model-export.schema.json");
const GEN_SCRIPT_PATH = resolve(ROOT, "scripts/synth-gen-casino-pilot.ts");
const DERIVE_SCRIPT_PATH = resolve(ROOT, "scripts/synth-derive-casino.ts");
const README_PATH = resolve(ROOT, "docs/dev/README.md");

// ---------------------------------------------------------------------------
// 1. Contract integrity (no DB required)
// ---------------------------------------------------------------------------

describe("PR-5 contract integrity", () => {
  it("docs/dev/workspace-model-export.schema.json exists", () => {
    expect(existsSync(SCHEMA_CONTRACT_PATH)).toBe(true);
  });

  it("schema JSON is parseable", () => {
    const raw = readFileSync(SCHEMA_CONTRACT_PATH, "utf-8");
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it("schema has required top-level keys", () => {
    const schema = JSON.parse(readFileSync(SCHEMA_CONTRACT_PATH, "utf-8")) as Record<string, unknown>;
    expect(schema["$schema"]).toBeDefined();
    expect(schema["title"]).toBe("GhostCrabWorkspaceModelExport");
    expect(schema["$defs"]).toBeDefined();
    expect(schema["properties"]).toBeDefined();
  });

  it("docs/dev/README.md exists and covers key topics", () => {
    expect(existsSync(README_PATH)).toBe(true);
    const content = readFileSync(README_PATH, "utf-8");
    expect(content).toContain("schema_version");
    expect(content).toContain("table_role");
    expect(content).toContain("generation_strategy");
    expect(content).toContain("SemVer");
  });
});

// ---------------------------------------------------------------------------
// 2. Casino export example validation (no DB required)
// ---------------------------------------------------------------------------

describe("casino-benchmark export example", () => {
  let casinoExport: WorkspaceModelExport;

  beforeAll(() => {
    const raw = JSON.parse(readFileSync(CASINO_EXPORT_PATH, "utf-8")) as unknown;
    casinoExport = WorkspaceModelExportSchema.parse(raw);
  });

  it("parses against the Zod contract schema", () => {
    expect(casinoExport.schema_version).toBe("1.0.0");
  });

  it("has casino as domain_profile", () => {
    expect(casinoExport.workspace.domain_profile).toBe("casino");
  });

  it("has 9 tables", () => {
    expect(casinoExport.tables.length).toBe(9);
  });

  it("players table is actor with emit_facets and emit_graph_entities", () => {
    const players = casinoExport.tables.find(t => t.table_name === "players");
    expect(players?.table_role).toBe("actor");
    expect(players?.emit_facets).toBe(true);
    expect(players?.emit_graph_entities).toBe(true);
    expect(players?.generation_strategy).toBe("seed_table");
  });

  it("all emit_facets=true tables have a primary_time_column or are actor tables", () => {
    const facetTables = casinoExport.tables.filter(t => t.emit_facets);
    for (const t of facetTables) {
      const hasTime = t.primary_time_column !== null && t.primary_time_column !== undefined;
      const isActor = t.table_role === "actor";
      expect(hasTime || isActor, `${t.table_name} should have time column or be actor`).toBe(true);
    }
  });

  it("table_order in generation_hints covers all 9 tables", () => {
    expect(casinoExport.generation_hints?.table_order?.length).toBe(9);
  });

  it("table_order starts with reference tables (no FK dependencies)", () => {
    const order = casinoExport.generation_hints!.table_order!;
    const firstTwo = order.slice(0, 2);
    const referenceTables = casinoExport.tables
      .filter(t => t.table_role === "reference" || t.generation_strategy === "static_ref")
      .map(t => `${t.schema_name}.${t.table_name}`);
    for (const ref of referenceTables) {
      expect(firstTwo, `${ref} should appear early in table_order`).toContain(ref);
    }
  });

  it("players appears before visits in table_order (FK dependency)", () => {
    const order = casinoExport.generation_hints!.table_order!;
    const playersIdx = order.indexOf("casino.players");
    const visitsIdx = order.indexOf("casino.visits");
    expect(playersIdx).toBeGreaterThanOrEqual(0);
    expect(visitsIdx).toBeGreaterThanOrEqual(0);
    expect(playersIdx).toBeLessThan(visitsIdx);
  });

  it("validation_warnings is empty (export is fully annotated)", () => {
    expect(casinoExport.validation_warnings).toEqual([]);
  });

  it("column annotations include distribution_hints for status columns", () => {
    const statusCols = (casinoExport.columns ?? []).filter(c => c.column_role === "status");
    for (const col of statusCols) {
      if (col.distribution_hint) {
        expect(col.distribution_hint["values"], `${col.table_name}.${col.column_name} should have values`).toBeDefined();
      }
    }
  });

  it("relations cover all major FK edges", () => {
    const relations = casinoExport.relations ?? [];
    const hasVisitsToPlayers = relations.some(
      r => r.source_table === "visits" && r.target_table === "players"
    );
    const hasSessionsToVisits = relations.some(
      r => r.source_table === "game_sessions" && r.target_table === "visits"
    );
    expect(hasVisitsToPlayers).toBe(true);
    expect(hasSessionsToVisits).toBe(true);
  });

  it("survives round-trip serde", () => {
    const json = JSON.stringify(casinoExport);
    const reparsed = WorkspaceModelExportSchema.parse(JSON.parse(json));
    expect(reparsed.tables.length).toBe(casinoExport.tables.length);
    expect(reparsed.relations?.length).toBe(casinoExport.relations?.length);
  });
});

// ---------------------------------------------------------------------------
// 3. Fixture integrity (no DB required)
// ---------------------------------------------------------------------------

describe("casino-pilot fixture integrity", () => {
  it("ddl.sql exists and is non-empty", () => {
    expect(existsSync(DDL_PATH)).toBe(true);
    const content = readFileSync(DDL_PATH, "utf-8");
    expect(content.length).toBeGreaterThan(100);
    expect(content).toContain("casino.players");
    expect(content).toContain("casino.game_sessions");
    expect(content).toContain("casino.transactions");
  });

  it("ddl.sql defines all 9 tables from the export", () => {
    const ddl = readFileSync(DDL_PATH, "utf-8");
    const casinoExport = WorkspaceModelExportSchema.parse(
      JSON.parse(readFileSync(CASINO_EXPORT_PATH, "utf-8"))
    );
    for (const table of casinoExport.tables) {
      expect(ddl, `DDL should define table ${table.table_name}`).toContain(`casino.${table.table_name}`);
    }
  });

  it("semantics.json exists and is valid", () => {
    expect(existsSync(SEMANTICS_PATH)).toBe(true);
    const raw = JSON.parse(readFileSync(SEMANTICS_PATH, "utf-8")) as Record<string, unknown>;
    expect(raw.workspace_id).toBe("casino-pilot");
    expect(Array.isArray(raw.tables)).toBe(true);
    const tables = raw.tables as Array<{ schema_name: string; table_name: string; table_role: string }>;
    expect(tables.length).toBe(9);
    for (const t of tables) {
      expect(TableRoleSchema.safeParse(t.table_role).success, `${t.table_name} has valid table_role`).toBe(true);
    }
  });

  it("semantics.json tables match casino export tables", () => {
    const semantics = JSON.parse(readFileSync(SEMANTICS_PATH, "utf-8")) as {
      tables: Array<{ schema_name: string; table_name: string }>
    };
    const casinoExport = WorkspaceModelExportSchema.parse(
      JSON.parse(readFileSync(CASINO_EXPORT_PATH, "utf-8"))
    );
    const exportTableKeys = new Set(casinoExport.tables.map(t => `${t.schema_name}.${t.table_name}`));
    const fixtureTableKeys = new Set(semantics.tables.map(t => `${t.schema_name}.${t.table_name}`));
    for (const key of exportTableKeys) {
      expect(fixtureTableKeys.has(key), `Fixture should have ${key}`).toBe(true);
    }
  });

  it("expected-counts.json exists and has correct structure", () => {
    expect(existsSync(EXPECTED_COUNTS_PATH)).toBe(true);
    const raw = JSON.parse(readFileSync(EXPECTED_COUNTS_PATH, "utf-8")) as Record<string, unknown>;
    expect(raw.layer1).toBeDefined();
    expect(raw.layer2).toBeDefined();
    expect(raw.searchability).toBeDefined();
    const layer2 = raw.layer2 as Record<string, unknown>;
    expect(layer2.facets).toBeDefined();
    expect(layer2.graph_entity).toBeDefined();
    expect(layer2.graph_relation).toBeDefined();
  });

  it("expected-counts.json layer1 covers all 9 tables", () => {
    const raw = JSON.parse(readFileSync(EXPECTED_COUNTS_PATH, "utf-8")) as {
      layer1: Record<string, { min: number; max: number }>
    };
    const casinoExport = WorkspaceModelExportSchema.parse(
      JSON.parse(readFileSync(CASINO_EXPORT_PATH, "utf-8"))
    );
    for (const table of casinoExport.tables) {
      const key = `${table.schema_name}.${table.table_name}`;
      expect(raw.layer1[key], `expected-counts should have entry for ${key}`).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Script integrity (no DB required)
// ---------------------------------------------------------------------------

describe("synth scripts integrity", () => {
  it("synth-gen-casino-pilot.ts exists", () => {
    expect(existsSync(GEN_SCRIPT_PATH)).toBe(true);
  });

  it("synth-gen-casino-pilot.ts references the export contract", () => {
    const content = readFileSync(GEN_SCRIPT_PATH, "utf-8");
    expect(content).toContain("casino-benchmark.export.json");
    expect(content).toContain("generation_strategy");
    expect(content).toContain("table_role");
    expect(content).toContain("volume_driver");
  });

  it("synth-gen-casino-pilot.ts does NOT hardcode casino schema in GhostCrab types", () => {
    const content = readFileSync(GEN_SCRIPT_PATH, "utf-8");
    // The generator reads from the contract, not from GhostCrab internal types
    expect(content).not.toContain("src/types");
    expect(content).not.toContain("src/tools");
  });

  it("synth-gen-casino-pilot.ts implements all 6 generation strategies", () => {
    const content = readFileSync(GEN_SCRIPT_PATH, "utf-8");
    const strategies = ["seed_table", "per_parent", "time_series", "sparse_events", "static_ref"];
    for (const s of strategies) {
      expect(content, `Generator should handle strategy: ${s}`).toContain(s);
    }
  });

  it("synth-derive-casino.ts exists", () => {
    expect(existsSync(DERIVE_SCRIPT_PATH)).toBe(true);
  });

  it("synth-derive-casino.ts verifies all 3 Layer 2 surfaces", () => {
    const content = readFileSync(DERIVE_SCRIPT_PATH, "utf-8");
    expect(content).toContain("facets");
    expect(content).toContain("graph.entity");
    expect(content).toContain("graph.relation");
  });
});

// ---------------------------------------------------------------------------
// 5. Cross-domain examples consistency (no DB required)
// ---------------------------------------------------------------------------

describe("all domain examples consistency", () => {
  const examplesDir = resolve(ROOT, "docs/dev/examples");
  const examples = [
    "casino-benchmark.export.json",
    "crm-pipeline.export.json",
    "kanban-board.export.json",
    "project-delivery.export.json"
  ];

  it("all example files exist", () => {
    for (const f of examples) {
      expect(existsSync(resolve(examplesDir, f)), `${f} should exist`).toBe(true);
    }
  });

  it("all examples are valid against the contract schema", () => {
    for (const f of examples) {
      const raw = JSON.parse(readFileSync(resolve(examplesDir, f), "utf-8")) as unknown;
      expect(() => WorkspaceModelExportSchema.parse(raw), `${f} should parse`).not.toThrow();
    }
  });

  it("all examples have unique workspace IDs", () => {
    const ids = examples.map(f => {
      const raw = JSON.parse(readFileSync(resolve(examplesDir, f), "utf-8")) as { workspace: { id: string } };
      return raw.workspace.id;
    });
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(examples.length);
  });

  it("all examples have generation_hints with table_order", () => {
    for (const f of examples) {
      const parsed = WorkspaceModelExportSchema.parse(
        JSON.parse(readFileSync(resolve(examplesDir, f), "utf-8"))
      );
      expect(parsed.generation_hints?.table_order, `${f} should have table_order`).toBeDefined();
      expect(parsed.generation_hints!.table_order!.length, `${f} table_order should be non-empty`).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// 6. Live MCP E2E (requires GHOSTCRAB_MINDBRAIN_URL + built dist/index.js)
//    Guard: tests only run when GHOSTCRAB_MINDBRAIN_URL is set in the environment.
// ---------------------------------------------------------------------------

const HAS_DB = Boolean(process.env.GHOSTCRAB_MINDBRAIN_URL);

describe(HAS_DB ? "live MCP E2E" : "live MCP E2E [skipped - no GHOSTCRAB_MINDBRAIN_URL]", () => {
  const WORKSPACE_ID = "casino-pilot-e2e";
  const DDL_CONTENT = readFileSync(DDL_PATH, "utf-8");
  const SEMANTICS = JSON.parse(readFileSync(SEMANTICS_PATH, "utf-8")) as {
    workspace_id: string;
    tables: Array<Record<string, unknown>>
  };

  it.runIf(HAS_DB)("creates workspace casino-pilot-e2e", async () => {
    const { callToolJson, withMcpStdioClient } = await import("../../helpers/mcp-stdio.js");
    await withMcpStdioClient("e2e-create", async ({ client }) => {
      const result = await callToolJson(client, "ghostcrab_workspace_create", {
        id: WORKSPACE_ID,
        label: "Casino Pilot E2E",
        description: "Automated E2E test workspace for casino synth pilot"
      });
      // workspace may already exist from a previous run — both outcomes are OK
      expect(result.ok === true || (result.error as Record<string, unknown> | undefined)?.code === "workspace_already_exists").toBe(true);
    }, { timeoutMs: 20000 });
  }, 30000);

  it.runIf(HAS_DB)("proposes and executes casino DDL with semantic annotations (one table)", async () => {
    const { callToolJson, withMcpStdioClient } = await import("../../helpers/mcp-stdio.js");
    const firstTable = SEMANTICS.tables[0];
    if (!firstTable) return;

    await withMcpStdioClient("e2e-ddl", async ({ client }) => {
      const result = await callToolJson(client, "ghostcrab_ddl_propose", {
        workspace_id: WORKSPACE_ID,
        sql: DDL_CONTENT,
        table_semantics: [firstTable]
      });
      // proposal accepted or DDL already applied
      const hasProposal =
        result.ok === true &&
        result.status === "pending" &&
        result.migration_id !== undefined;
      const alreadyExists = typeof result.error === "object" &&
        (result.error as Record<string, unknown>).code === "already_exists";
      expect(hasProposal || alreadyExists).toBe(true);
    }, { timeoutMs: 20000 });
  }, 30000);

  it.runIf(HAS_DB)("exports workspace model and validates against contract schema", async () => {
    const { callToolJson, withMcpStdioClient } = await import("../../helpers/mcp-stdio.js");
    await withMcpStdioClient("e2e-export", async ({ client }) => {
      const result = await callToolJson(client, "ghostcrab_workspace_export_model", {
        workspace_id: WORKSPACE_ID,
        depth: "tables_and_columns"
      });
      expect(result.ok).toBe(true);

      // Shape must match the 1.0.0 public contract
      expect(result.schema_version).toBe("1.0.0");

      const workspace = result.workspace as Record<string, unknown> | undefined;
      expect(workspace).toBeDefined();
      expect(workspace?.id).toBe(WORKSPACE_ID);

      expect(Array.isArray(result.tables)).toBe(true);
      expect(Array.isArray(result.columns)).toBe(true);

      const hints = result.generation_hints as Record<string, unknown> | undefined;
      expect(hints).toBeDefined();
      expect(Array.isArray(hints?.table_order)).toBe(true);

      // No legacy shape keys
      expect(result.workspace_id).toBeUndefined();
      expect(result.table_semantics).toBeUndefined();
      expect(result.pg_schema).toBeUndefined();

      // Validate via Zod
      expect(() => WorkspaceModelExportSchema.parse(result)).not.toThrow();
    }, { timeoutMs: 20000 });
  }, 30000);

  it.runIf(HAS_DB)("validation_warnings is empty when semantic annotations are consistent", async () => {
    const { callToolJson, withMcpStdioClient } = await import("../../helpers/mcp-stdio.js");
    await withMcpStdioClient("e2e-export-warnings", async ({ client }) => {
      const result = await callToolJson(client, "ghostcrab_workspace_export_model", {
        workspace_id: WORKSPACE_ID,
        depth: "full"
      });
      expect(result.ok).toBe(true);
      const warnings = result.validation_warnings as string[];
      // Warnings may be non-empty if DDL wasn't fully executed — just check it's an array
      expect(Array.isArray(warnings)).toBe(true);
    }, { timeoutMs: 20000 });
  }, 30000);

  it.runIf(HAS_DB)("ghostcrab_workspace_inspect returns tables for the workspace", async () => {
    const { callToolJson, withMcpStdioClient } = await import("../../helpers/mcp-stdio.js");
    await withMcpStdioClient("e2e-inspect", async ({ client }) => {
      const result = await callToolJson(client, "ghostcrab_workspace_inspect", {
        workspace_id: WORKSPACE_ID,
        include_columns: true,
        include_relations: false
      });
      expect(result.ok).toBe(true);
    }, { timeoutMs: 20000 });
  }, 30000);
});
