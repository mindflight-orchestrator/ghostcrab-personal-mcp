import { z } from "zod";

import type { SyncFieldSpec } from "./facets.js";

// ─────────────────────────────────────────────────────────────────────────────
// Contract version — public consumers MUST check this before processing
// ─────────────────────────────────────────────────────────────────────────────

export const WORKSPACE_MODEL_SCHEMA_VERSION = "1.0.0";

// ─────────────────────────────────────────────────────────────────────────────
// Public contract enums (match docs/dev/workspace-model-export.schema.json)
// ─────────────────────────────────────────────────────────────────────────────

export const TableRoleSchema = z.enum([
  "actor",
  "event",
  "transaction",
  "stateful_item",
  "reference",
  "hierarchy",
  "association"
]);
export type TableRole = z.infer<typeof TableRoleSchema>;

export const GenerationStrategySchema = z.enum([
  "seed_table",
  "per_parent",
  "time_series",
  "sparse_events",
  "static_ref"
]);
export type GenerationStrategy = z.infer<typeof GenerationStrategySchema>;

export const VolumeDriverSchema = z.enum(["high", "medium", "low", "tiny"]);
export type VolumeDriver = z.infer<typeof VolumeDriverSchema>;

export const ColumnRoleSchema = z.enum([
  "id",
  "fk",
  "status",
  "timestamp",
  "amount",
  "score",
  "category",
  "owner",
  "parent_ref",
  "text_content",
  "geo",
  "embedding_source",
  "label",
  "flag"
]);
export type ColumnRole = z.infer<typeof ColumnRoleSchema>;

export const SemanticTypeSchema = z.enum([
  "identifier",
  "state",
  "measure",
  "enum",
  "free_text",
  "temporal",
  "spatial",
  "vector",
  "boolean"
]);
export type SemanticType = z.infer<typeof SemanticTypeSchema>;

export const GraphUsageSchema = z.enum([
  "entity_name",
  "entity_property",
  "edge_source",
  "edge_target",
  "edge_metadata"
]);
export type GraphUsage = z.infer<typeof GraphUsageSchema>;

export const RelationRoleSchema = z.enum([
  "belongs_to",
  "contains",
  "depends_on",
  "targets",
  "registered_for",
  "works_at",
  "assigned_to",
  "references"
]);
export type RelationRole = z.infer<typeof RelationRoleSchema>;

export const CardinalitySchema = z.enum(["1:1", "1:n", "n:n"]);
export type Cardinality = z.infer<typeof CardinalitySchema>;

export const ExportDepthSchema = z.enum([
  "tables_only",
  "tables_and_columns",
  "full"
]);
export type ExportDepth = z.infer<typeof ExportDepthSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Public contract shapes (1.0.0)
// ─────────────────────────────────────────────────────────────────────────────

export const WorkspaceMetaSchema = z.object({
  id: z.string(),
  label: z.string().min(1).max(200),
  description: z.string().nullable().optional(),
  domain_profile: z.string().nullable().optional(),
  pg_schema: z.string().optional()
});
export type WorkspaceMeta = z.infer<typeof WorkspaceMetaSchema>;

export const TableExportSchema = z.object({
  schema_name: z.string().min(1),
  table_name: z.string().min(1),
  table_role: TableRoleSchema.nullable().optional(),
  entity_family: z.string().nullable().optional(),
  primary_time_column: z.string().nullable().optional(),
  volume_driver: VolumeDriverSchema.nullable().optional(),
  generation_strategy: GenerationStrategySchema.nullable().optional(),
  emit_facets: z.boolean().default(false),
  emit_graph_entities: z.boolean().default(false),
  emit_graph_relations: z.boolean().default(false),
  emit_projections: z.boolean().default(false),
  notes: z.record(z.string(), z.unknown()).nullable().optional()
});
export type TableExport = z.infer<typeof TableExportSchema>;

export const ColumnExportSchema = z.object({
  schema_name: z.string().min(1),
  table_name: z.string().min(1),
  column_name: z.string().min(1),
  column_role: ColumnRoleSchema.nullable().optional(),
  semantic_type: SemanticTypeSchema.nullable().optional(),
  facet_key: z.string().nullable().optional(),
  graph_usage: GraphUsageSchema.nullable().optional(),
  projection_signal: z.string().nullable().optional(),
  is_nullable: z.boolean().optional().default(true),
  distribution_hint: z.record(z.string(), z.unknown()).nullable().optional()
});
export type ColumnExport = z.infer<typeof ColumnExportSchema>;

export const RelationExportSchema = z.object({
  source_schema: z.string().min(1),
  source_table: z.string().min(1),
  source_column: z.string().optional().default(""),
  target_schema: z.string().min(1),
  target_table: z.string().min(1),
  target_column: z.string().optional().default(""),
  relation_role: RelationRoleSchema.nullable().optional(),
  hierarchical: z.boolean().optional().default(false),
  graph_label: z.string().nullable().optional(),
  cardinality: CardinalitySchema.nullable().optional(),
  notes: z.record(z.string(), z.unknown()).nullable().optional()
});
export type RelationExport = z.infer<typeof RelationExportSchema>;

export const GenerationHintsSchema = z.object({
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
});
export type GenerationHints = z.infer<typeof GenerationHintsSchema>;

export const WorkspaceModelExportSchema = z.object({
  schema_version: z.string().regex(/^\d+\.\d+\.\d+$/),
  exported_at: z.string(),
  workspace: WorkspaceMetaSchema,
  tables: z.array(TableExportSchema),
  columns: z.array(ColumnExportSchema).optional().default([]),
  relations: z.array(RelationExportSchema).optional().default([]),
  generation_hints: GenerationHintsSchema.optional(),
  validation_warnings: z.array(z.string()).optional().default([])
});
export type WorkspaceModelExport = z.infer<typeof WorkspaceModelExportSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Internal storage types (mindbrain.* DB layer — NOT the public contract)
// These use the legacy enum values stored in migration 012.
// ─────────────────────────────────────────────────────────────────────────────

/** DB-level column role values (constrained by migration 012 CHECK). */
export type DbColumnRole = "id" | "fk" | "timestamp" | "status" | "attribute" | "unknown";

/** DB-level generation strategy values (constrained by migration 012 CHECK). */
export type DbGenerationStrategy = "synthetic" | "replay" | "hybrid" | "unknown";

/**
 * Internal semantic proposal stored in pending_migrations.semantic_spec and
 * persisted to mindbrain.* on ddl_execute.
 *
 * All rich fields are optional — minimal payloads (legacy) still parse identically.
 * Rich fields are stored in column_semantics.rich_meta / relation_semantics.rich_meta JSONB.
 */
export const SemanticProposalSchema = z.object({
  table_semantics: z.array(z.object({
    table_schema: z.string().min(1).default("public"),
    table_name: z.string().min(1),
    business_role: z.string().optional(),
    generation_strategy: z.string().optional().default("unknown"),
    emit_facets: z.boolean().default(true),
    emit_graph_entity: z.boolean().default(false),
    emit_graph_relation: z.boolean().default(false),
    notes: z.string().optional(),
    // Rich public-contract fields (stored in notes JSON)
    table_role: TableRoleSchema.optional(),
    entity_family: z.string().nullable().optional(),
    volume_driver: VolumeDriverSchema.nullable().optional(),
    primary_time_column: z.string().nullable().optional(),
    emit_projections: z.boolean().optional()
  })).default([]),
  column_semantics: z.array(z.object({
    table_schema: z.string().min(1).default("public"),
    table_name: z.string().min(1),
    column_name: z.string().min(1),
    column_role: z.enum(["id", "fk", "timestamp", "status", "attribute", "unknown"]).default("unknown"),
    // Rich public-contract fields (stored in column_semantics.rich_meta JSONB)
    public_column_role: ColumnRoleSchema.optional(),
    semantic_type: SemanticTypeSchema.optional(),
    facet_key: z.string().optional(),
    graph_usage: GraphUsageSchema.optional(),
    projection_signal: z.string().optional(),
    is_nullable: z.boolean().optional(),
    distribution_hint: z.record(z.string(), z.unknown()).optional()
  })).default([]),
  relation_semantics: z.array(z.object({
    from_schema: z.string().min(1).default("public"),
    from_table: z.string().min(1),
    to_schema: z.string().min(1).default("public"),
    to_table: z.string().min(1),
    fk_column: z.string().optional(),
    relation_kind: z.enum(["many_to_one", "one_to_many", "unknown"]).default("unknown"),
    // Rich public-contract fields (stored in relation_semantics.rich_meta JSONB)
    relation_role: RelationRoleSchema.optional(),
    hierarchical: z.boolean().optional(),
    graph_label: z.string().optional(),
    target_column: z.string().optional()
  })).default([])
});
export type SemanticProposal = z.infer<typeof SemanticProposalSchema>;

// For backward compat: named aliases used internally by ddl.ts / export.ts
// These mirror the SemanticProposalSchema item shapes exactly.
export const TableSemanticSchema = z.object({
  table_schema: z.string().min(1).default("public"),
  table_name: z.string().min(1),
  business_role: z.string().optional(),
  generation_strategy: z.string().optional().default("unknown"),
  emit_facets: z.boolean().default(true),
  emit_graph_entity: z.boolean().default(false),
  emit_graph_relation: z.boolean().default(false),
  notes: z.string().optional(),
  table_role: TableRoleSchema.optional(),
  entity_family: z.string().nullable().optional(),
  volume_driver: VolumeDriverSchema.nullable().optional(),
  primary_time_column: z.string().nullable().optional(),
  emit_projections: z.boolean().optional()
});
export type TableSemantic = z.infer<typeof TableSemanticSchema>;

export const ColumnSemanticSchema = z.object({
  table_schema: z.string().min(1).default("public"),
  table_name: z.string().min(1),
  column_name: z.string().min(1),
  column_role: z.enum(["id", "fk", "timestamp", "status", "attribute", "unknown"]).default("unknown"),
  public_column_role: ColumnRoleSchema.optional(),
  semantic_type: SemanticTypeSchema.optional(),
  facet_key: z.string().optional(),
  graph_usage: GraphUsageSchema.optional(),
  projection_signal: z.string().optional(),
  is_nullable: z.boolean().optional(),
  distribution_hint: z.record(z.string(), z.unknown()).optional()
});
export type ColumnSemantic = z.infer<typeof ColumnSemanticSchema>;

export const RelationSemanticSchema = z.object({
  from_schema: z.string().min(1).default("public"),
  from_table: z.string().min(1),
  to_schema: z.string().min(1).default("public"),
  to_table: z.string().min(1),
  fk_column: z.string().optional(),
  relation_kind: z.enum(["many_to_one", "one_to_many", "unknown"]).default("unknown"),
  relation_role: RelationRoleSchema.optional(),
  hierarchical: z.boolean().optional(),
  graph_label: z.string().optional(),
  target_column: z.string().optional()
});
export type RelationSemantic = z.infer<typeof RelationSemanticSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Mapping helpers: DB storage → public contract 1.0.0
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Map DB column_role (migration 012 enum) to the public contract ColumnRole.
 * 'attribute' and 'unknown' remain unmapped (null) so consumers can handle them.
 */
export function mapDbColumnRole(dbRole: string | null | undefined): ColumnRole | null {
  switch (dbRole) {
    case "id": return "id";
    case "fk": return "fk";
    case "timestamp": return "timestamp";
    case "status": return "status";
    default: return null;
  }
}

/**
 * Map public contract ColumnRole to DB-safe column_role value.
 * Roles not present in migration 012 fall back to 'attribute'.
 */
export function mapPublicColumnRoleToDb(role: ColumnRole): DbColumnRole {
  switch (role) {
    case "id": return "id";
    case "fk": return "fk";
    case "timestamp": return "timestamp";
    case "status": return "status";
    default: return "attribute";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// generation_hints computation from table/relation semantics
// ─────────────────────────────────────────────────────────────────────────────

interface RelationEdge {
  from_table: string;
  from_schema: string;
  to_table: string;
  to_schema: string;
}

/**
 * Compute topological insertion order from relation edges (parents before children).
 * Falls back to alphabetical order on cycles or disconnected graphs.
 */
export function computeTableOrder(
  tables: Array<{ schema_name: string; table_name: string }>,
  edges: RelationEdge[]
): string[] {
  const keys = tables.map(t => `${t.schema_name}.${t.table_name}`);
  const keySet = new Set(keys);

  // Build adjacency: child -> parents
  const parents = new Map<string, Set<string>>();
  const children = new Map<string, Set<string>>();
  for (const k of keys) {
    parents.set(k, new Set());
    children.set(k, new Set());
  }

  for (const e of edges) {
    const child = `${e.from_schema}.${e.from_table}`;
    const parent = `${e.to_schema}.${e.to_table}`;
    if (keySet.has(child) && keySet.has(parent) && child !== parent) {
      parents.get(child)?.add(parent);
      children.get(parent)?.add(child);
    }
  }

  // Kahn's algorithm
  const inDegree = new Map<string, number>();
  for (const k of keys) {
    inDegree.set(k, parents.get(k)?.size ?? 0);
  }

  const queue = keys.filter(k => (inDegree.get(k) ?? 0) === 0).sort();
  const result: string[] = [];

  while (queue.length > 0) {
    const node = queue.shift()!;
    result.push(node);
    const kids = [...(children.get(node) ?? [])].sort();
    for (const kid of kids) {
      const deg = (inDegree.get(kid) ?? 1) - 1;
      inDegree.set(kid, deg);
      if (deg === 0) {
        queue.push(kid);
        queue.sort();
      }
    }
  }

  // Append any remaining (cycles) in alphabetical order
  for (const k of keys) {
    if (!result.includes(k)) result.push(k);
  }

  return result;
}

/**
 * Build GenerationHints from workspace label, tables, and relations.
 */
export function buildGenerationHints(params: {
  domainProfile: string | null | undefined;
  tables: Array<{ schema_name: string; table_name: string }>;
  edges: RelationEdge[];
}): GenerationHints {
  return {
    table_order: computeTableOrder(params.tables, params.edges),
    seed_multipliers: { tiny: 20, low: 200, medium: 2000, high: 10000 },
    domain_profile: params.domainProfile ?? null,
    time_window_days: 90
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// DDL inference helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Layer1→Layer2 sync spec shape (subset used for inference). */
export interface SyncSpecInferenceInput {
  source_table: string;
  fields: SyncFieldSpec[];
}

function splitTopLevelCommas(inner: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < inner.length; i += 1) {
    const c = inner[i];
    if (c === "(") depth += 1;
    else if (c === ")") depth -= 1;
    else if (c === "," && depth === 0) {
      parts.push(inner.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(inner.slice(start).trim());
  return parts.filter((p) => p.length > 0);
}

function inferDbColumnRole(columnName: string): DbColumnRole {
  const lower = columnName.toLowerCase();
  if (lower === "id") return "id";
  if (lower.endsWith("_id")) return "fk";
  if (lower === "status" || lower === "state") return "status";
  if (lower.endsWith("_at") || lower.endsWith("_date") || lower.endsWith("_time")) {
    return "timestamp";
  }
  return "attribute";
}

function parseQualifiedTable(qualified: string): { schema: string; name: string } {
  const trimmed = qualified.trim().replace(/^["']|["']$/g, "");
  const dot = trimmed.indexOf(".");
  if (dot === -1) {
    return { schema: "public", name: trimmed };
  }
  return { schema: trimmed.slice(0, dot), name: trimmed.slice(dot + 1) };
}

const CREATE_TABLE_RE =
  /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:(\w+)\.)?(\w+)\s*\(/gi;

/**
 * Naive inference from DDL text + optional sync_spec.
 * sync_spec drives emit_facets for the mapped source table; column heuristics follow naming conventions.
 */
export function inferBasicSemantics(
  sql: string,
  syncSpec?: SyncSpecInferenceInput | null
): SemanticProposal {
  const tableSemantics: TableSemantic[] = [];
  const columnSemantics: ColumnSemantic[] = [];
  const relationSemantics: RelationSemantic[] = [];

  const seenTables = new Set<string>();

  let match: RegExpExecArray | null;
  const re = new RegExp(CREATE_TABLE_RE.source, CREATE_TABLE_RE.flags);
  while ((match = re.exec(sql)) !== null) {
    const schema = (match[1] ?? "public").toLowerCase();
    const table = (match[2] ?? "").toLowerCase();
    if (!table) continue;

    const key = `${schema}.${table}`;
    if (seenTables.has(key)) continue;
    seenTables.add(key);

    const openIdx = match.index + match[0].length - 1;
    let depth = 1;
    let i = openIdx + 1;
    for (; i < sql.length && depth > 0; i += 1) {
      if (sql[i] === "(") depth += 1;
      else if (sql[i] === ")") depth -= 1;
    }
    const body = sql.slice(openIdx + 1, i - 1);

    tableSemantics.push({
      table_schema: schema,
      table_name: table,
      generation_strategy: "unknown",
      emit_facets: false,
      emit_graph_entity: false,
      emit_graph_relation: false
    });

    for (const part of splitTopLevelCommas(body)) {
      const t = part.trim();
      if (
        /^(PRIMARY|UNIQUE|CONSTRAINT|FOREIGN|CHECK|INDEX)\b/i.test(t) ||
        /^\s*PRIMARY\s+KEY\b/i.test(t)
      ) {
        // Table-level REFERENCES (e.g., FOREIGN KEY (col) REFERENCES tbl(id))
        const rm = /REFERENCES\s+(?:(\w+)\.)?(\w+)\s*\(/i.exec(t);
        if (rm) {
          const toSch = (rm[1] ?? "public").toLowerCase();
          const toTbl = (rm[2] ?? "").toLowerCase();
          const fkColMatch = t.match(/FOREIGN\s+KEY\s*\(\s*(\w+)\s*\)/i);
          const fkCol = fkColMatch?.[1] ?? undefined;
          relationSemantics.push({
            from_schema: schema,
            from_table: table,
            to_schema: toSch,
            to_table: toTbl,
            fk_column: fkCol,
            relation_kind: "many_to_one"
          });
        }
        continue;
      }
      const colMatch = t.match(/^(\w+)\s+/);
      if (!colMatch) continue;
      const colName = colMatch[1];
      columnSemantics.push({
        table_schema: schema,
        table_name: table,
        column_name: colName,
        column_role: inferDbColumnRole(colName)
      });
      // Inline REFERENCES (e.g., customer_id INT REFERENCES customers(id))
      const inlineRef = /\bREFERENCES\s+(?:(\w+)\.)?(\w+)\s*\(/i.exec(t);
      if (inlineRef) {
        const toSch = (inlineRef[1] ?? "public").toLowerCase();
        const toTbl = (inlineRef[2] ?? "").toLowerCase();
        relationSemantics.push({
          from_schema: schema,
          from_table: table,
          to_schema: toSch,
          to_table: toTbl,
          fk_column: colName,
          relation_kind: "many_to_one"
        });
      }
    }
  }

  if (syncSpec?.source_table) {
    const { schema, name } = parseQualifiedTable(syncSpec.source_table);
    const tkey = `${schema}.${name}`.toLowerCase();
    const existing = tableSemantics.find(
      (t) =>
        `${t.table_schema}.${t.table_name}`.toLowerCase() === tkey
    );
    if (existing) {
      existing.emit_facets = true;
    } else {
      tableSemantics.push({
        table_schema: schema,
        table_name: name,
        generation_strategy: "unknown",
        emit_facets: true,
        emit_graph_entity: false,
        emit_graph_relation: false
      });
    }
    for (const f of syncSpec.fields) {
      const col = columnSemantics.find(
        (c) =>
          c.table_schema.toLowerCase() === schema &&
          c.table_name.toLowerCase() === name.toLowerCase() &&
          c.column_name.toLowerCase() === f.column_name.toLowerCase()
      );
      if (col) {
        col.column_role = "attribute";
      } else {
        columnSemantics.push({
          table_schema: schema,
          table_name: name,
          column_name: f.column_name,
          column_role: "attribute"
        });
      }
    }
  }

  return SemanticProposalSchema.parse({
    table_semantics: tableSemantics,
    column_semantics: columnSemantics,
    relation_semantics: relationSemantics
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Catalog validation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compare declared semantics to information_schema-derived sets (lower-case keys).
 * Keys: tables `schema.name`, columns `schema.table.column`.
 */
export function validateSemanticsAgainstCatalog(params: {
  existingTables: Set<string>;
  existingColumns: Set<string>;
  tableSemantics: TableSemantic[];
  columnSemantics: ColumnSemantic[];
}): string[] {
  const warnings: string[] = [];

  for (const t of params.tableSemantics) {
    const key = `${t.table_schema}.${t.table_name}`.toLowerCase();
    if (!params.existingTables.has(key)) {
      warnings.push(`table_semantics: no table "${t.table_schema}.${t.table_name}" in information_schema`);
    }
  }

  for (const c of params.columnSemantics) {
    const tkey = `${c.table_schema}.${c.table_name}`.toLowerCase();
    if (!params.existingTables.has(tkey)) {
      warnings.push(
        `column_semantics: parent table missing for "${c.table_schema}.${c.table_name}.${c.column_name}"`
      );
      continue;
    }
    const ckey = `${c.table_schema}.${c.table_name}.${c.column_name}`.toLowerCase();
    if (!params.existingColumns.has(ckey)) {
      warnings.push(
        `column_semantics: no column "${c.table_schema}.${c.table_name}.${c.column_name}" in information_schema`
      );
    }
  }

  return warnings;
}
