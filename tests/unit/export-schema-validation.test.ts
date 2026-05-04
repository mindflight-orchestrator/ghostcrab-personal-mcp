/**
 * Validates example export fixtures against the JSON schema contract.
 * Uses structural validation (not ajv) since the schema uses JSON Schema 2020-12
 * which requires ajv v8+, not the v6 that is available as a transitive dep.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const contractsDir = join(__dirname, "../../docs/dev");
const examplesDir = join(contractsDir, "examples");

function loadFixture(filename: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(join(examplesDir, filename), "utf8")
  ) as Record<string, unknown>;
}

const TABLE_ROLES = new Set([
  "actor", "event", "transaction", "stateful_item", "reference", "hierarchy", "association"
]);
const GENERATION_STRATEGIES = new Set([
  "seed_table", "per_parent", "time_series", "sparse_events", "static_ref"
]);
const VOLUME_DRIVERS = new Set(["high", "medium", "low", "tiny"]);
const COLUMN_ROLES = new Set([
  "id", "fk", "status", "timestamp", "amount", "score",
  "category", "owner", "parent_ref", "text_content", "geo",
  "embedding_source", "label", "flag"
]);
const SEMANTIC_TYPES = new Set([
  "identifier", "state", "measure", "enum", "free_text", "temporal", "spatial", "vector", "boolean"
]);
const GRAPH_USAGES = new Set([
  "entity_name", "entity_property", "edge_source", "edge_target", "edge_metadata"
]);
const RELATION_ROLES = new Set([
  "belongs_to", "contains", "depends_on", "targets",
  "registered_for", "works_at", "assigned_to", "references"
]);
const CARDINALITIES = new Set(["1:1", "1:n", "n:n"]);

interface ValidationError {
  path: string;
  message: string;
}

function validateExport(data: Record<string, unknown>, filename: string): ValidationError[] {
  const errors: ValidationError[] = [];
  const e = (path: string, msg: string) => errors.push({ path: `${filename}/${path}`, message: msg });

  if (typeof data.schema_version !== "string") e("schema_version", "must be string");
  if (typeof data.exported_at !== "string") e("exported_at", "must be string");

  // workspace
  const ws = data.workspace as Record<string, unknown> | undefined;
  if (!ws) { e("workspace", "required"); }
  else {
    if (typeof ws.id !== "string") e("workspace.id", "must be string");
    if (typeof ws.label !== "string") e("workspace.label", "must be string");
  }

  // tables (required)
  if (!Array.isArray(data.tables)) { e("tables", "must be array"); }
  else {
    for (const [i, t] of (data.tables as Record<string, unknown>[]).entries()) {
      const tp = `tables[${i}]`;
      if (typeof t.schema_name !== "string") e(`${tp}.schema_name`, "must be string");
      if (typeof t.table_name !== "string") e(`${tp}.table_name`, "must be string");
      if (t.table_role !== null && t.table_role !== undefined && !TABLE_ROLES.has(t.table_role as string)) {
        e(`${tp}.table_role`, `invalid value: ${String(t.table_role)}`);
      }
      if (t.generation_strategy !== null && t.generation_strategy !== undefined
        && !GENERATION_STRATEGIES.has(t.generation_strategy as string)) {
        e(`${tp}.generation_strategy`, `invalid value: ${String(t.generation_strategy)}`);
      }
      if (t.volume_driver !== null && t.volume_driver !== undefined
        && !VOLUME_DRIVERS.has(t.volume_driver as string)) {
        e(`${tp}.volume_driver`, `invalid value: ${String(t.volume_driver)}`);
      }
      if (typeof t.emit_facets !== "boolean") e(`${tp}.emit_facets`, "must be boolean");
      if (typeof t.emit_graph_entities !== "boolean") e(`${tp}.emit_graph_entities`, "must be boolean");
      if (typeof t.emit_graph_relations !== "boolean") e(`${tp}.emit_graph_relations`, "must be boolean");
      if (typeof t.emit_projections !== "boolean") e(`${tp}.emit_projections`, "must be boolean");
    }
  }

  // columns (optional)
  if (data.columns !== undefined) {
    if (!Array.isArray(data.columns)) { e("columns", "must be array"); }
    else {
      for (const [i, c] of (data.columns as Record<string, unknown>[]).entries()) {
        const cp = `columns[${i}]`;
        if (typeof c.schema_name !== "string") e(`${cp}.schema_name`, "must be string");
        if (typeof c.table_name !== "string") e(`${cp}.table_name`, "must be string");
        if (typeof c.column_name !== "string") e(`${cp}.column_name`, "must be string");
        if (c.column_role !== null && c.column_role !== undefined
          && !COLUMN_ROLES.has(c.column_role as string)) {
          e(`${cp}.column_role`, `invalid value: ${String(c.column_role)}`);
        }
        if (c.semantic_type !== null && c.semantic_type !== undefined
          && !SEMANTIC_TYPES.has(c.semantic_type as string)) {
          e(`${cp}.semantic_type`, `invalid value: ${String(c.semantic_type)}`);
        }
        if (c.graph_usage !== null && c.graph_usage !== undefined
          && !GRAPH_USAGES.has(c.graph_usage as string)) {
          e(`${cp}.graph_usage`, `invalid value: ${String(c.graph_usage)}`);
        }
        if (c.is_nullable !== undefined && typeof c.is_nullable !== "boolean") {
          e(`${cp}.is_nullable`, "must be boolean");
        }
      }
    }
  }

  // relations (optional)
  if (data.relations !== undefined) {
    if (!Array.isArray(data.relations)) { e("relations", "must be array"); }
    else {
      for (const [i, r] of (data.relations as Record<string, unknown>[]).entries()) {
        const rp = `relations[${i}]`;
        if (typeof r.source_schema !== "string") e(`${rp}.source_schema`, "must be string");
        if (typeof r.source_table !== "string") e(`${rp}.source_table`, "must be string");
        if (typeof r.source_column !== "string") e(`${rp}.source_column`, "must be string");
        if (typeof r.target_schema !== "string") e(`${rp}.target_schema`, "must be string");
        if (typeof r.target_table !== "string") e(`${rp}.target_table`, "must be string");
        if (typeof r.target_column !== "string") e(`${rp}.target_column`, "must be string");
        if (r.relation_role !== null && r.relation_role !== undefined
          && !RELATION_ROLES.has(r.relation_role as string)) {
          e(`${rp}.relation_role`, `invalid value: ${String(r.relation_role)}`);
        }
        if (r.cardinality !== null && r.cardinality !== undefined
          && !CARDINALITIES.has(r.cardinality as string)) {
          e(`${rp}.cardinality`, `invalid value: ${String(r.cardinality)}`);
        }
        if (r.hierarchical !== undefined && typeof r.hierarchical !== "boolean") {
          e(`${rp}.hierarchical`, "must be boolean");
        }
      }
    }
  }

  return errors;
}

describe("workspace-model-export schema validation", () => {
  it("kanban-board.export.json is structurally valid", () => {
    const fixture = loadFixture("kanban-board.export.json");
    const errors = validateExport(fixture, "kanban-board.export.json");
    if (errors.length > 0) {
      throw new Error(
        `Validation errors:\n${errors.map(e => `  ${e.path}: ${e.message}`).join("\n")}`
      );
    }
    expect(errors).toHaveLength(0);
  });

  it("casino-benchmark.export.json is structurally valid", () => {
    const fixture = loadFixture("casino-benchmark.export.json");
    const errors = validateExport(fixture, "casino-benchmark.export.json");
    if (errors.length > 0) {
      throw new Error(
        `Validation errors:\n${errors.map(e => `  ${e.path}: ${e.message}`).join("\n")}`
      );
    }
    expect(errors).toHaveLength(0);
  });

  it("kanban fixture has non-null table_role on all tables", () => {
    const fixture = loadFixture("kanban-board.export.json");
    const tables = fixture.tables as Array<{ table_name: string; table_role: string | null }>;
    for (const table of tables) {
      expect(table.table_role, `${table.table_name}.table_role`).not.toBeNull();
      expect(table.table_role, `${table.table_name}.table_role`).not.toBeUndefined();
    }
  });

  it("kanban fixture has non-null entity_family on all tables", () => {
    const fixture = loadFixture("kanban-board.export.json");
    const tables = fixture.tables as Array<{ table_name: string; entity_family: string | null }>;
    for (const table of tables) {
      expect(table.entity_family, `${table.table_name}.entity_family`).not.toBeNull();
    }
  });

  it("kanban fixture columns have non-null column_role and semantic_type", () => {
    const fixture = loadFixture("kanban-board.export.json");
    const columns = fixture.columns as Array<{
      column_name: string;
      column_role: string | null;
      semantic_type: string | null;
    }>;
    for (const col of columns) {
      expect(col.column_role, `${col.column_name}.column_role`).not.toBeNull();
      expect(col.semantic_type, `${col.column_name}.semantic_type`).not.toBeNull();
    }
  });

  it("kanban fixture relations have non-null relation_role (except allowed nulls)", () => {
    const fixture = loadFixture("kanban-board.export.json");
    const relations = fixture.relations as Array<{
      source_table: string;
      target_table: string;
      relation_role: string | null;
    }>;
    const withRole = relations.filter(r => r.relation_role !== null);
    // At minimum 3 out of 4 kanban relations have explicit roles
    expect(withRole.length).toBeGreaterThanOrEqual(3);
  });

  it("casino fixture has generation_strategy on all tables", () => {
    const fixture = loadFixture("casino-benchmark.export.json");
    const tables = fixture.tables as Array<{
      table_name: string;
      generation_strategy: string | null;
    }>;
    const withStrategy = tables.filter(t => t.generation_strategy !== null);
    expect(withStrategy.length).toBe(tables.length);
  });

  it("JSON schema seed_multiplier defaults are correct per spec", () => {
    const schema = JSON.parse(
      readFileSync(join(contractsDir, "workspace-model-export.schema.json"), "utf8")
    ) as Record<string, unknown>;

    const defs = schema.$defs as Record<string, unknown>;
    const genHints = defs.GenerationHints as {
      properties: {
        seed_multipliers: {
          properties: {
            tiny: { default: number };
            low: { default: number };
            medium: { default: number };
            high: { default: number };
          };
        };
      };
    };
    const multipliers = genHints.properties.seed_multipliers.properties;
    // Schema documents the defaults — runtime uses these as fallbacks
    expect(multipliers.tiny.default).toBe(20);
    expect(multipliers.low.default).toBe(200);
    expect(multipliers.medium.default).toBe(2000);
    expect(multipliers.high.default).toBe(10000);
  });
});
