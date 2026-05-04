/**
 * PR-5.3 - Contract conformance tests for the GhostCrab workspace model export.
 *
 * These tests validate the JSON examples against the structural contract defined in
 * docs/dev/workspace-model-export.schema.json using Zod schemas that mirror
 * the JSON Schema definitions. They also verify serde round-trip stability.
 *
 * NOTE: These tests validate the contract examples and the schema shape itself.
 * They are intentionally independent of the types defined in src/types/workspace-model.ts
 * (PR-1), which will be added in a subsequent PR. When PR-1 is merged, add
 * cross-validation between the Zod schemas here and the TS types there.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { z } from "zod";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONTRACTS_DIR = resolve(__dirname, "../../docs/dev");

// ---------------------------------------------------------------------------
// Zod schemas mirroring the JSON Schema definitions
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

const WorkspaceMetaSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{1,62}[a-z0-9]$|^[a-z][a-z0-9]$/),
  label: z.string().min(1).max(200),
  description: z.string().nullable().optional(),
  domain_profile: z.string().nullable().optional(),
  pg_schema: z.string().optional()
});

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

const GenerationHintsSchema = z.object({
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
}).optional();

const WorkspaceModelExportSchema = z.object({
  schema_version: SemVerSchema,
  exported_at: z.string(),
  workspace: WorkspaceMetaSchema,
  tables: z.array(TableExportSchema),
  columns: z.array(ColumnExportSchema).optional().default([]),
  relations: z.array(RelationExportSchema).optional().default([]),
  generation_hints: GenerationHintsSchema,
  validation_warnings: z.array(z.string()).optional().default([])
});

type WorkspaceModelExport = z.infer<typeof WorkspaceModelExportSchema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadExample(filename: string): unknown {
  const path = resolve(CONTRACTS_DIR, "examples", filename);
  return JSON.parse(readFileSync(path, "utf-8"));
}

function parseExport(raw: unknown): WorkspaceModelExport {
  return WorkspaceModelExportSchema.parse(raw);
}

function roundTrip(parsed: WorkspaceModelExport): WorkspaceModelExport {
  const serialized = JSON.stringify(parsed);
  const deserialized = JSON.parse(serialized) as unknown;
  return WorkspaceModelExportSchema.parse(deserialized);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("WorkspaceModelExport contract", () => {
  describe("schema_version field", () => {
    it("accepts valid SemVer strings", () => {
      expect(SemVerSchema.safeParse("1.0.0").success).toBe(true);
      expect(SemVerSchema.safeParse("2.3.11").success).toBe(true);
      expect(SemVerSchema.safeParse("0.1.0").success).toBe(true);
    });

    it("rejects non-SemVer strings", () => {
      expect(SemVerSchema.safeParse("1.0").success).toBe(false);
      expect(SemVerSchema.safeParse("v1.0.0").success).toBe(false);
      expect(SemVerSchema.safeParse("latest").success).toBe(false);
      expect(SemVerSchema.safeParse("").success).toBe(false);
    });
  });

  describe("workspace_id constraints", () => {
    const idSchema = WorkspaceMetaSchema.shape.id;

    it("accepts valid workspace IDs", () => {
      expect(idSchema.safeParse("casino-benchmark").success).toBe(true);
      expect(idSchema.safeParse("ab").success).toBe(true);
      expect(idSchema.safeParse("crm-pipeline").success).toBe(true);
      expect(idSchema.safeParse("project-delivery").success).toBe(true);
    });

    it("rejects invalid workspace IDs", () => {
      expect(idSchema.safeParse("").success).toBe(false);
      expect(idSchema.safeParse("1abc").success).toBe(false);
      expect(idSchema.safeParse("UPPER").success).toBe(false);
      expect(idSchema.safeParse("has space").success).toBe(false);
    });
  });

  describe("enum validation", () => {
    it("validates all TableRole values", () => {
      const validRoles = ["actor", "event", "transaction", "stateful_item", "reference", "hierarchy", "association"];
      for (const role of validRoles) {
        expect(TableRoleSchema.safeParse(role).success, `role ${role} should be valid`).toBe(true);
      }
    });

    it("rejects unknown TableRole values", () => {
      expect(TableRoleSchema.safeParse("unknown").success).toBe(false);
      expect(TableRoleSchema.safeParse("entity").success).toBe(false);
    });

    it("validates all GenerationStrategy values", () => {
      const validStrategies = ["seed_table", "per_parent", "time_series", "sparse_events", "static_ref"];
      for (const strategy of validStrategies) {
        expect(GenerationStrategySchema.safeParse(strategy).success, `strategy ${strategy} should be valid`).toBe(true);
      }
    });

    it("validates all ColumnRole values", () => {
      const validRoles = ["id", "fk", "status", "timestamp", "amount", "score", "category", "owner", "parent_ref", "text_content", "geo", "embedding_source", "label", "flag"];
      for (const role of validRoles) {
        expect(ColumnRoleSchema.safeParse(role).success, `column role ${role} should be valid`).toBe(true);
      }
    });

    it("validates all Cardinality values", () => {
      expect(CardinalitySchema.safeParse("1:1").success).toBe(true);
      expect(CardinalitySchema.safeParse("1:n").success).toBe(true);
      expect(CardinalitySchema.safeParse("n:n").success).toBe(true);
      expect(CardinalitySchema.safeParse("n:1").success).toBe(false);
    });
  });

  describe("minimal valid export", () => {
    it("accepts the minimum required fields", () => {
      const minimal = {
        schema_version: "1.0.0",
        exported_at: "2026-03-31T00:00:00Z",
        workspace: { id: "test-ws", label: "Test Workspace" },
        tables: []
      };
      expect(() => parseExport(minimal)).not.toThrow();
    });

    it("rejects missing schema_version", () => {
      const bad = {
        exported_at: "2026-03-31T00:00:00Z",
        workspace: { id: "test-ws", label: "Test" },
        tables: []
      };
      expect(() => parseExport(bad)).toThrow();
    });

    it("rejects missing workspace", () => {
      const bad = {
        schema_version: "1.0.0",
        exported_at: "2026-03-31T00:00:00Z",
        tables: []
      };
      expect(() => parseExport(bad)).toThrow();
    });

    it("rejects missing tables", () => {
      const bad = {
        schema_version: "1.0.0",
        exported_at: "2026-03-31T00:00:00Z",
        workspace: { id: "test-ws", label: "Test" }
      };
      expect(() => parseExport(bad)).toThrow();
    });
  });
});

describe("Domain example: casino-benchmark", () => {
  const raw = loadExample("casino-benchmark.export.json");
  let parsed: WorkspaceModelExport;

  it("parses without error", () => {
    expect(() => { parsed = parseExport(raw); }).not.toThrow();
  });

  it("has schema_version 1.0.0", () => {
    parsed = parseExport(raw);
    expect(parsed.schema_version).toBe("1.0.0");
  });

  it("has workspace id casino-benchmark", () => {
    parsed = parseExport(raw);
    expect(parsed.workspace.id).toBe("casino-benchmark");
    expect(parsed.workspace.domain_profile).toBe("casino");
  });

  it("has 9 tables with valid roles", () => {
    parsed = parseExport(raw);
    expect(parsed.tables.length).toBe(9);
    for (const table of parsed.tables) {
      expect(TableRoleSchema.safeParse(table.table_role).success).toBe(true);
    }
  });

  it("has a players table as actor with emit_facets and emit_graph_entities", () => {
    parsed = parseExport(raw);
    const players = parsed.tables.find(t => t.table_name === "players");
    expect(players).toBeDefined();
    expect(players!.table_role).toBe("actor");
    expect(players!.emit_facets).toBe(true);
    expect(players!.emit_graph_entities).toBe(true);
  });

  it("has generation_hints with a table_order covering all tables", () => {
    parsed = parseExport(raw);
    expect(parsed.generation_hints).toBeDefined();
    const hints = parsed.generation_hints!;
    expect(hints!.table_order).toBeDefined();
    expect(hints!.table_order!.length).toBe(parsed.tables.length);
  });

  it("has column annotations with valid roles", () => {
    parsed = parseExport(raw);
    expect(parsed.columns!.length).toBeGreaterThan(0);
    for (const col of parsed.columns!) {
      if (col.column_role) {
        expect(ColumnRoleSchema.safeParse(col.column_role).success).toBe(true);
      }
    }
  });

  it("has relation definitions with valid cardinalities", () => {
    parsed = parseExport(raw);
    expect(parsed.relations!.length).toBeGreaterThan(0);
    for (const rel of parsed.relations!) {
      if (rel.cardinality) {
        expect(CardinalitySchema.safeParse(rel.cardinality).success).toBe(true);
      }
    }
  });

  it("survives a round-trip serde without data loss", () => {
    parsed = parseExport(raw);
    const rt = roundTrip(parsed);
    expect(rt.schema_version).toBe(parsed.schema_version);
    expect(rt.workspace.id).toBe(parsed.workspace.id);
    expect(rt.tables.length).toBe(parsed.tables.length);
    expect(rt.columns!.length).toBe(parsed.columns!.length);
    expect(rt.relations!.length).toBe(parsed.relations!.length);
  });
});

describe("Domain example: crm-pipeline", () => {
  const raw = loadExample("crm-pipeline.export.json");

  it("parses without error", () => {
    expect(() => parseExport(raw)).not.toThrow();
  });

  it("has 5 tables", () => {
    const parsed = parseExport(raw);
    expect(parsed.tables.length).toBe(5);
  });

  it("has accounts as actor table", () => {
    const parsed = parseExport(raw);
    const accounts = parsed.tables.find(t => t.table_name === "accounts");
    expect(accounts?.table_role).toBe("actor");
  });

  it("has opportunities as stateful_item", () => {
    const parsed = parseExport(raw);
    const opps = parsed.tables.find(t => t.table_name === "opportunities");
    expect(opps?.table_role).toBe("stateful_item");
    expect(opps?.emit_projections).toBe(true);
  });

  it("survives round-trip serde", () => {
    const parsed = parseExport(raw);
    const rt = roundTrip(parsed);
    expect(rt.tables.length).toBe(parsed.tables.length);
  });
});

describe("Domain example: kanban-board", () => {
  const raw = loadExample("kanban-board.export.json");

  it("parses without error", () => {
    expect(() => parseExport(raw)).not.toThrow();
  });

  it("has 5 tables", () => {
    const parsed = parseExport(raw);
    expect(parsed.tables.length).toBe(5);
  });

  it("has cards as stateful_item with hierarchical relations", () => {
    const parsed = parseExport(raw);
    const cards = parsed.tables.find(t => t.table_name === "cards");
    expect(cards?.table_role).toBe("stateful_item");
    const hierarchical = parsed.relations!.filter(r => r.hierarchical === true);
    expect(hierarchical.length).toBeGreaterThan(0);
  });

  it("survives round-trip serde", () => {
    const parsed = parseExport(raw);
    const rt = roundTrip(parsed);
    expect(rt.tables.length).toBe(parsed.tables.length);
  });
});

describe("Domain example: project-delivery", () => {
  const raw = loadExample("project-delivery.export.json");

  it("parses without error", () => {
    expect(() => parseExport(raw)).not.toThrow();
  });

  it("has 8 tables", () => {
    const parsed = parseExport(raw);
    expect(parsed.tables.length).toBe(8);
  });

  it("has a self-referential relation (tasks blocked_by)", () => {
    const parsed = parseExport(raw);
    const selfRef = parsed.relations!.find(
      r => r.source_table === "tasks" && r.target_table === "tasks"
    );
    expect(selfRef).toBeDefined();
    expect(selfRef?.relation_role).toBe("depends_on");
    expect(selfRef?.graph_label).toBe("BLOCKS");
  });

  it("has risks with emit_projections for alert coverage", () => {
    const parsed = parseExport(raw);
    const risks = parsed.tables.find(t => t.table_name === "risks");
    expect(risks?.emit_projections).toBe(true);
  });

  it("survives round-trip serde", () => {
    const parsed = parseExport(raw);
    const rt = roundTrip(parsed);
    expect(rt.tables.length).toBe(parsed.tables.length);
    expect(rt.relations!.length).toBe(parsed.relations!.length);
  });
});

describe("generation_hints validation", () => {
  it("table_order covers all tables when provided", () => {
    const examples = [
      "casino-benchmark.export.json",
      "crm-pipeline.export.json",
      "kanban-board.export.json",
      "project-delivery.export.json"
    ];

    for (const filename of examples) {
      const parsed = parseExport(loadExample(filename));
      if (parsed.generation_hints?.table_order) {
        expect(
          parsed.generation_hints.table_order.length,
          `${filename}: table_order should cover all tables`
        ).toBe(parsed.tables.length);
      }
    }
  });

  it("all table_order entries match schema.table format", () => {
    const examples = [
      "casino-benchmark.export.json",
      "crm-pipeline.export.json",
      "kanban-board.export.json",
      "project-delivery.export.json"
    ];

    for (const filename of examples) {
      const parsed = parseExport(loadExample(filename));
      if (parsed.generation_hints?.table_order) {
        for (const entry of parsed.generation_hints.table_order) {
          expect(entry, `${filename}: entry "${entry}" should be schema.table format`).toMatch(/^[a-z_]+\.[a-z_]+$/);
        }
      }
    }
  });
});

describe("cross-example schema consistency", () => {
  const examples = [
    "casino-benchmark.export.json",
    "crm-pipeline.export.json",
    "kanban-board.export.json",
    "project-delivery.export.json"
  ];

  it("all examples parse against the same Zod schema", () => {
    for (const filename of examples) {
      const raw = loadExample(filename);
      expect(() => parseExport(raw), `${filename} should parse`).not.toThrow();
    }
  });

  it("all examples have schema_version 1.0.0", () => {
    for (const filename of examples) {
      const parsed = parseExport(loadExample(filename));
      expect(parsed.schema_version, `${filename} should be 1.0.0`).toBe("1.0.0");
    }
  });

  it("all examples have non-empty tables array", () => {
    for (const filename of examples) {
      const parsed = parseExport(loadExample(filename));
      expect(parsed.tables.length, `${filename} should have tables`).toBeGreaterThan(0);
    }
  });

  it("all examples have validation_warnings array (empty or not)", () => {
    for (const filename of examples) {
      const parsed = parseExport(loadExample(filename));
      expect(Array.isArray(parsed.validation_warnings), `${filename} should have validation_warnings`).toBe(true);
    }
  });

  it("all examples survive serde round-trip", () => {
    for (const filename of examples) {
      const raw = loadExample(filename);
      const parsed = parseExport(raw);
      const rt = roundTrip(parsed);
      expect(rt.schema_version).toBe(parsed.schema_version);
      expect(rt.tables.length).toBe(parsed.tables.length);
    }
  });
});
