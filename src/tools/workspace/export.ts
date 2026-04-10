import { z } from "zod";

import {
  createToolErrorResult,
  createToolSuccessResult,
  registerTool,
  type ToolHandler
} from "../registry.js";
import { callNativeOrFallback } from "../../db/dispatch.js";
import { WorkspaceIdSchema } from "../../types/workspace.js";
import {
  ExportDepthSchema,
  WORKSPACE_MODEL_SCHEMA_VERSION,
  validateSemanticsAgainstCatalog,
  buildGenerationHints,
  mapDbColumnRole,
  type TableRole,
  type ColumnRole,
  type SemanticType,
  type GraphUsage,
  type RelationRole,
  type VolumeDriver,
  type TableSemantic,
  type ColumnSemantic,
  type RelationSemantic,
  type ExportDepth,
  type GenerationStrategy,
  type TableExport,
  type ColumnExport,
  type RelationExport
} from "../../types/workspace-model.js";

const WorkspaceExportInput = z.object({
  workspace_id: WorkspaceIdSchema,
  depth: ExportDepthSchema.optional().default("tables_and_columns")
});

// ─────────────────────────────────────────────────────────────────────────────
// DB row → internal semantic types
// ─────────────────────────────────────────────────────────────────────────────

function rowToTableSemantic(r: Record<string, unknown>): TableSemantic {
  return {
    table_schema: String(r.table_schema ?? "public"),
    table_name: String(r.table_name ?? ""),
    business_role: (r.business_role as string | null | undefined) ?? undefined,
    generation_strategy: (r.generation_strategy as string | null) === "unknown" ||
      r.generation_strategy == null ? "unknown" :
      (r.generation_strategy as "synthetic" | "replay" | "hybrid" | "unknown"),
    emit_facets: Boolean(r.emit_facets ?? true),
    emit_graph_entity: Boolean(r.emit_graph_entity ?? false),
    emit_graph_relation: Boolean(r.emit_graph_relation ?? false),
    notes: (r.notes as string | undefined) ?? undefined
  };
}

function parseJsonb(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null;
  if (typeof raw === "object") return raw as Record<string, unknown>;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch (err) {
      console.debug(
        "[ghostcrab:export] JSON parse failed for jsonb field:",
        err instanceof Error ? err.message : err
      );
      return null;
    }
  }
  return null;
}

function rowToColumnSemantic(r: Record<string, unknown>): ColumnSemantic {
  const richMeta = parseJsonb(r.rich_meta);
  return {
    table_schema: String(r.table_schema ?? "public"),
    table_name: String(r.table_name ?? ""),
    column_name: String(r.column_name ?? ""),
    column_role: (r.column_role as ColumnSemantic["column_role"]) ?? "unknown",
    // Rich fields from rich_meta JSONB
    public_column_role: (richMeta?.public_column_role as ColumnRole | undefined) ?? undefined,
    semantic_type: (richMeta?.semantic_type as SemanticType | undefined) ?? undefined,
    facet_key: (richMeta?.facet_key as string | undefined) ?? undefined,
    graph_usage: (richMeta?.graph_usage as GraphUsage | undefined) ?? undefined,
    projection_signal: (richMeta?.projection_signal as string | undefined) ?? undefined,
    is_nullable: (richMeta?.is_nullable as boolean | undefined) ?? undefined,
    distribution_hint: (richMeta?.distribution_hint as Record<string, unknown> | undefined) ?? undefined
  };
}

function rowToRelationSemantic(r: Record<string, unknown>): RelationSemantic {
  const richMeta = parseJsonb(r.rich_meta);
  return {
    from_schema: String(r.from_schema ?? "public"),
    from_table: String(r.from_table ?? ""),
    to_schema: String(r.to_schema ?? "public"),
    to_table: String(r.to_table ?? ""),
    fk_column: (r.fk_column as string) === "" ? undefined : (r.fk_column as string | undefined),
    relation_kind: (r.relation_kind as RelationSemantic["relation_kind"]) ?? "unknown",
    // Rich fields from rich_meta JSONB
    relation_role: (richMeta?.relation_role as RelationRole | undefined) ?? undefined,
    hierarchical: (richMeta?.hierarchical as boolean | undefined) ?? undefined,
    graph_label: (richMeta?.graph_label as string | undefined) ?? undefined,
    target_column: (richMeta?.target_column as string | undefined) ?? undefined
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal semantic → public contract 1.0.0
// ─────────────────────────────────────────────────────────────────────────────

const PUBLIC_TABLE_ROLES = new Set<TableRole>([
  "actor",
  "event",
  "transaction",
  "stateful_item",
  "reference",
  "hierarchy",
  "association"
]);

function parseNotes(
  notes: string | Record<string, unknown> | undefined
): Record<string, unknown> | null {
  if (notes && typeof notes === "string") {
    try {
      return JSON.parse(notes) as Record<string, unknown>;
    } catch (err) {
      console.debug(
        "[ghostcrab:export] JSON parse failed for notes:",
        err instanceof Error ? err.message : err
      );
      return null;
    }
  }
  if (notes && typeof notes === "object") {
    return notes as Record<string, unknown>;
  }
  return null;
}

function mapBusinessRoleToTableRole(
  role: string | undefined
): TableRole | null {
  if (!role) {
    return null;
  }
  return PUBLIC_TABLE_ROLES.has(role as TableRole)
    ? (role as TableRole)
    : null;
}

function mapDbGenerationStrategyToPublic(
  strategy: TableSemantic["generation_strategy"] | undefined,
  tableName: string,
  relations: RelationSemantic[]
): GenerationStrategy | null {
  if (!strategy || strategy === "unknown") {
    return null;
  }

  if (strategy === "synthetic") {
    // from_table = the child (FK holder). If this table is from_table, it has a parent.
    const hasParent = relations.some(
      (relation) => relation.from_table === tableName
    );
    return hasParent ? "per_parent" : "seed_table";
  }
  if (strategy === "replay") {
    return "time_series";
  }
  if (strategy === "hybrid") {
    return "per_parent";
  }
  return null;
}

function inferPrimaryTimeColumn(
  table: TableSemantic,
  columns: ColumnSemantic[]
): string | null {
  const timestampColumns = columns
    .filter(
      (column) =>
        column.table_schema === table.table_schema &&
        column.table_name === table.table_name &&
        column.column_role === "timestamp"
    )
    .map((column) => column.column_name);

  if (timestampColumns.length === 0) {
    return null;
  }

  const preferred = [
    "created_at",
    "occurred_at",
    "joined_at",
    "updated_at",
    "started_at",
    "event_at"
  ];
  for (const columnName of preferred) {
    if (timestampColumns.includes(columnName)) {
      return columnName;
    }
  }

  return timestampColumns[0] ?? null;
}

function inferSemanticType(column: ColumnSemantic): SemanticType | null {
  switch (column.column_role) {
    case "id":
    case "fk":
      return "identifier";
    case "status":
      return "state";
    case "timestamp":
      return "temporal";
    case "attribute": {
      const lower = column.column_name.toLowerCase();
      if (
        lower.includes("name") ||
        lower.includes("title") ||
        lower.includes("label") ||
        lower.includes("description") ||
        lower.includes("reason") ||
        lower.includes("summary")
      ) {
        return "free_text";
      }
      if (
        lower.includes("priority") ||
        lower.includes("type") ||
        lower.includes("role") ||
        lower.includes("visibility")
      ) {
        return "enum";
      }
      return null;
    }
    default:
      return null;
  }
}

function inferGraphUsage(column: ColumnSemantic): GraphUsage | null {
  switch (column.column_role) {
    case "id":
      return "entity_name";
    case "fk":
      return "edge_target";
    case "status":
      return "entity_property";
    case "attribute": {
      const lower = column.column_name.toLowerCase();
      if (
        lower.includes("name") ||
        lower.includes("title") ||
        lower.includes("label") ||
        lower.includes("description") ||
        lower.includes("reason")
      ) {
        return "entity_property";
      }
      return null;
    }
    default:
      return null;
  }
}

function toPublicTable(
  t: TableSemantic,
  columns: ColumnSemantic[],
  relations: RelationSemantic[]
): TableExport {
  const notes = parseNotes(t.notes);

  // Precedence: explicit rich field > notes JSON key > heuristic > null
  const tableRole: TableRole | null =
    t.table_role ?? mapBusinessRoleToTableRole(t.business_role);

  const entityFamily: string | null =
    t.entity_family ??
    (typeof notes?.entity_family === "string" ? notes.entity_family : null);

  const volumeDriver: VolumeDriver | null =
    t.volume_driver ??
    (typeof notes?.volume_driver === "string" ? notes.volume_driver as VolumeDriver : null);

  const primaryTimeColumn: string | null =
    t.primary_time_column ??
    (typeof notes?.primary_time_column === "string" ? notes.primary_time_column : null) ??
    inferPrimaryTimeColumn(t, columns);

  const emitProjections: boolean =
    t.emit_projections ??
    Boolean(notes?.emit_projections ?? false);

  return {
    schema_name: t.table_schema,
    table_name: t.table_name,
    table_role: tableRole,
    entity_family: entityFamily,
    primary_time_column: primaryTimeColumn,
    volume_driver: volumeDriver,
    generation_strategy: mapDbGenerationStrategyToPublic(
      t.generation_strategy,
      t.table_name,
      relations
    ),
    emit_facets: t.emit_facets,
    emit_graph_entities: t.emit_graph_entity,
    emit_graph_relations: t.emit_graph_relation,
    emit_projections: emitProjections,
    notes
  };
}

function toPublicColumn(c: ColumnSemantic, catalogNullable?: boolean): ColumnExport {
  // Precedence: explicit rich field > catalog > heuristic > null/default
  const columnRole = c.public_column_role ?? mapDbColumnRole(c.column_role);
  const semanticType = c.semantic_type ?? inferSemanticType(c);
  const graphUsage = c.graph_usage ?? inferGraphUsage(c);
  const isNullable = c.is_nullable ?? catalogNullable ?? true;

  return {
    schema_name: c.table_schema,
    table_name: c.table_name,
    column_name: c.column_name,
    column_role: columnRole,
    semantic_type: semanticType,
    facet_key: c.facet_key ?? null,
    graph_usage: graphUsage,
    projection_signal: c.projection_signal ?? null,
    is_nullable: isNullable,
    distribution_hint: c.distribution_hint ?? null
  };
}

function toPublicRelation(
  r: RelationSemantic,
  pkLookup: Map<string, string>
): RelationExport {
  // Cardinality from the source (FK-holder) perspective.
  // Both many_to_one and one_to_many map to "1:n" — the parent has 1, child has n.
  const cardinality = r.relation_kind === "many_to_one" ? "1:n" :
    r.relation_kind === "one_to_many" ? "1:n" : null;

  const targetKey = `${r.to_schema}.${r.to_table}`.toLowerCase();
  // Precedence: explicit rich field > catalog PK lookup > fallback "id"
  const targetColumn = r.target_column ?? pkLookup.get(targetKey) ?? "id";

  return {
    source_schema: r.from_schema,
    source_table: r.from_table,
    source_column: r.fk_column ?? "",
    target_schema: r.to_schema,
    target_table: r.to_table,
    target_column: targetColumn,
    relation_role: r.relation_role ?? null,
    hierarchical: r.hierarchical ?? false,
    graph_label: r.graph_label ?? null,
    cardinality
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool handler
// ─────────────────────────────────────────────────────────────────────────────

export const workspaceExportModelTool: ToolHandler = {
  definition: {
    name: "ghostcrab_workspace_export_model",
    description:
      "Export workspace semantic model as a public 1.0.0 JSON contract for synthetic data generators. Includes workspace metadata, table/column/relation semantics, generation_hints, and validation_warnings.",
    inputSchema: {
      type: "object",
      required: ["workspace_id"],
      properties: {
        workspace_id: {
          type: "string",
          description: "Target workspace id."
        },
        depth: {
          type: "string",
          enum: ["tables_only", "tables_and_columns", "full"],
          description:
            "Export granularity: tables_only, tables_and_columns (default), or full (includes relations)."
        }
      }
    }
  },
  async handler(args, context) {
    const input = WorkspaceExportInput.parse(args);

    const { value: result } = await callNativeOrFallback({
      useNative:
        context.extensions.pgFacets ||
        context.extensions.pgDgraph ||
        context.extensions.pgPragma,
      native: async () => {
        const rows = await context.database.query<{ payload: Record<string, unknown> }>(
          `SELECT mb_ontology.export_workspace_model($1::text) AS payload`,
          [input.workspace_id]
        );

        const payload = rows[0]?.payload;
        const workspace = payload?.workspace as Record<string, unknown> | null | undefined;
        if (!payload || !workspace || !workspace.id) {
          return createToolErrorResult(
            "ghostcrab_workspace_export_model",
            `Workspace '${input.workspace_id}' does not exist.`,
            "workspace_not_found"
          );
        }

        if (input.depth === "tables_only") {
          delete payload.columns;
          delete payload.relations;
        } else if (input.depth === "tables_and_columns") {
          delete payload.relations;
        }

        return createToolSuccessResult("ghostcrab_workspace_export_model", payload);
      },
      fallback: async () => {
        if (context.database.kind === "sqlite") {
          const wsRows = await context.database.query<{
            id: string;
            label: string;
            description: string | null;
            pg_schema: string;
            domain_profile: string | null;
          }>(
            `SELECT id, label, description, pg_schema, domain_profile
             FROM workspaces
             WHERE id = ?`,
            [input.workspace_id]
          );

          if (wsRows.length === 0) {
            return createToolErrorResult(
              "ghostcrab_workspace_export_model",
              `Workspace '${input.workspace_id}' does not exist.`,
              "workspace_not_found"
            );
          }

          const wsRow = wsRows[0];
          const depth: ExportDepth = input.depth;

          const tableRows = await context.database.query<Record<string, unknown>>(
            `SELECT table_schema, table_name, business_role, generation_strategy,
                    emit_facets, emit_graph_entity, emit_graph_relation, notes
             FROM table_semantics
             WHERE workspace_id = ?
             ORDER BY table_schema, table_name`,
            [input.workspace_id]
          );

          const columnRows =
            depth === "tables_and_columns" || depth === "full"
              ? await context.database.query<Record<string, unknown>>(
                  `SELECT table_schema, table_name, column_name, column_role, rich_meta
                   FROM column_semantics
                   WHERE workspace_id = ?
                   ORDER BY table_schema, table_name, column_name`,
                  [input.workspace_id]
                )
              : [];

          const relationRows =
            depth === "full"
              ? await context.database.query<Record<string, unknown>>(
                  `SELECT from_schema, from_table, to_schema, to_table, fk_column, relation_kind, rich_meta
                   FROM relation_semantics
                   WHERE workspace_id = ?
                   ORDER BY from_schema, from_table, to_schema, to_table`,
                  [input.workspace_id]
                )
              : [];

          const internalTables = tableRows.map(rowToTableSemantic);
          const internalColumns = columnRows.map(rowToColumnSemantic);
          const internalRelations = relationRows.map(rowToRelationSemantic);

          const catalogTables = await listSqliteTables(context.database);
          const catalogColumns = await listSqliteColumns(context.database, catalogTables);
          const tableNames = new Set(catalogTables.map((tableName) => tableName.toLowerCase()));
          const existingTables = new Set<string>();
          const existingColumns = new Set<string>();
          const nullableLookup = new Map<string, boolean>();
          const pkLookup = new Map<string, string>();

          for (const table of internalTables) {
            if (!tableNames.has(table.table_name.toLowerCase())) {
              continue;
            }

            const key = `${table.table_schema}.${table.table_name}`.toLowerCase();
            existingTables.add(key);

            for (const column of catalogColumns) {
              if (column.table_name.toLowerCase() !== table.table_name.toLowerCase()) {
                continue;
              }

              const columnKey =
                `${table.table_schema}.${table.table_name}.${column.column_name}`.toLowerCase();
              existingColumns.add(columnKey);
              nullableLookup.set(columnKey, column.is_nullable);

              if (column.pk && !pkLookup.has(key)) {
                pkLookup.set(key, column.column_name);
              }
            }
          }

          const validationWarnings = validateSemanticsAgainstCatalog({
            existingTables,
            existingColumns,
            tableSemantics: internalTables,
            columnSemantics: internalColumns
          });

          const publicTables: TableExport[] = internalTables.map((table) =>
            toPublicTable(table, internalColumns, internalRelations)
          );
          const publicColumns: ColumnExport[] = internalColumns.map((column) => {
            const key =
              `${column.table_schema}.${column.table_name}.${column.column_name}`.toLowerCase();
            return toPublicColumn(column, nullableLookup.get(key));
          });
          const publicRelations: RelationExport[] = internalRelations.map((relation) =>
            toPublicRelation(relation, pkLookup)
          );

          const domainProfile =
            wsRow.domain_profile ?? wsRow.id.split("-")[0] ?? null;
          const relationEdges = internalRelations.map((relation) => ({
            from_schema: relation.from_schema,
            from_table: relation.from_table,
            to_schema: relation.to_schema,
            to_table: relation.to_table
          }));
          const baseHints = buildGenerationHints({
            domainProfile,
            tables: publicTables.map((table) => ({
              schema_name: table.schema_name,
              table_name: table.table_name
            })),
            edges: relationEdges
          });
          const multipliers = baseHints.seed_multipliers ?? {
            tiny: 20,
            low: 200,
            medium: 2000,
            high: 10000
          };
          const estimatedTotalRows = publicTables.reduce((sum, table) => {
            const driver = table.volume_driver;
            return sum + (driver ? (multipliers[driver] ?? 0) : 0);
          }, 0);

          const payload: Record<string, unknown> = {
            schema_version: WORKSPACE_MODEL_SCHEMA_VERSION,
            exported_at: new Date().toISOString(),
            workspace: {
              id: wsRow.id,
              label: wsRow.label,
              description: wsRow.description ?? null,
              domain_profile: domainProfile,
              pg_schema: wsRow.pg_schema
            },
            tables: publicTables,
            generation_hints: {
              ...baseHints,
              estimated_total_rows:
                estimatedTotalRows > 0 ? estimatedTotalRows : undefined
            },
            validation_warnings: validationWarnings
          };

          if (depth !== "tables_only") {
            payload.columns = publicColumns;
          }
          if (depth === "full") {
            payload.relations = publicRelations;
          }

          return createToolSuccessResult("ghostcrab_workspace_export_model", payload);
        }

        // Try to read domain_profile (added by migration 013); fall back gracefully if not yet migrated.
        let wsRows: Array<{
          id: string;
          label: string;
          description: string | null;
          pg_schema: string;
          domain_profile?: string | null;
        }>;
        try {
          wsRows = await context.database.query(
            `SELECT id, label, description, pg_schema, domain_profile
             FROM mindbrain.workspaces WHERE id = $1`,
            [input.workspace_id]
          );
        } catch (err) {
          console.debug(
            "[ghostcrab:export] domain_profile column query failed, falling back:",
            err instanceof Error ? err.message : err
          );
          wsRows = await context.database.query(
            `SELECT id, label, description, pg_schema
             FROM mindbrain.workspaces WHERE id = $1`,
            [input.workspace_id]
          );
        }

        if (wsRows.length === 0) {
          return createToolErrorResult(
            "ghostcrab_workspace_export_model",
            `Workspace '${input.workspace_id}' does not exist.`,
            "workspace_not_found"
          );
        }

        const wsRow = wsRows[0];
        const pgSchema = wsRow.pg_schema;
        const depth: ExportDepth = input.depth;

    // ── Layer 1: table semantics ─────────────────────────────────────────────
        const tableRows = await context.database.query<Record<string, unknown>>(
          `SELECT table_schema, table_name, business_role, generation_strategy,
                  emit_facets, emit_graph_entity, emit_graph_relation, notes
           FROM mindbrain.table_semantics
           WHERE workspace_id = $1
           ORDER BY table_schema, table_name`,
          [input.workspace_id]
        );

    // ── Layer 2: column / relation semantics ─────────────────────────────────
        let columnRows: Record<string, unknown>[] = [];
        let relationRows: Record<string, unknown>[] = [];

        if (depth === "tables_and_columns" || depth === "full") {
      // Try to read rich_meta if migration 013 has run; fall back gracefully.
      try {
        columnRows = await context.database.query<Record<string, unknown>>(
          `SELECT table_schema, table_name, column_name, column_role, rich_meta
           FROM mindbrain.column_semantics
           WHERE workspace_id = $1
           ORDER BY table_schema, table_name, column_name`,
          [input.workspace_id]
        );
      } catch (err) {
        console.debug(
          "[ghostcrab:export] rich_meta column query failed, falling back:",
          err instanceof Error ? err.message : err
        );
        columnRows = await context.database.query<Record<string, unknown>>(
          `SELECT table_schema, table_name, column_name, column_role
           FROM mindbrain.column_semantics
           WHERE workspace_id = $1
           ORDER BY table_schema, table_name, column_name`,
          [input.workspace_id]
        );
      }
    }

        if (depth === "full") {
      try {
        relationRows = await context.database.query<Record<string, unknown>>(
          `SELECT from_schema, from_table, to_schema, to_table, fk_column, relation_kind, rich_meta
           FROM mindbrain.relation_semantics
           WHERE workspace_id = $1
           ORDER BY from_schema, from_table, to_schema, to_table`,
          [input.workspace_id]
        );
      } catch (err) {
        console.debug(
          "[ghostcrab:export] relation rich_meta query failed, falling back:",
          err instanceof Error ? err.message : err
        );
        relationRows = await context.database.query<Record<string, unknown>>(
          `SELECT from_schema, from_table, to_schema, to_table, fk_column, relation_kind
           FROM mindbrain.relation_semantics
           WHERE workspace_id = $1
           ORDER BY from_schema, from_table, to_schema, to_table`,
          [input.workspace_id]
        );
      }
    }

    // ── Catalog validation ───────────────────────────────────────────────────
        const catalogTables = await context.database.query<{
      table_schema: string;
      table_name: string;
    }>(
      `SELECT table_schema, table_name
       FROM information_schema.tables
       WHERE table_schema = $1 AND table_type = 'BASE TABLE'`,
      [pgSchema]
    );

        const catalogColumns = await context.database.query<{
      table_schema: string;
      table_name: string;
      column_name: string;
      is_nullable?: string;
    }>(
      `SELECT table_schema, table_name, column_name, is_nullable
       FROM information_schema.columns
       WHERE table_schema = $1`,
      [pgSchema]
    );

        const existingTables = new Set(
      catalogTables.map((t) =>
        `${t.table_schema}.${t.table_name}`.toLowerCase()
      )
    );
        const existingColumns = new Set(
      catalogColumns.map(
        (c) =>
          `${c.table_schema}.${c.table_name}.${c.column_name}`.toLowerCase()
      )
    );

    // Build nullable lookup: "schema.table.column" → boolean
        const nullableLookup = new Map<string, boolean>(
      catalogColumns.map((c) => [
        `${c.table_schema}.${c.table_name}.${c.column_name}`.toLowerCase(),
        c.is_nullable === "YES"
      ])
    );

    // ── Map to internal types ────────────────────────────────────────────────
        const internalTables = tableRows.map(rowToTableSemantic);
        const internalColumns = columnRows.map(rowToColumnSemantic);
        const internalRelations = relationRows.map(rowToRelationSemantic);

    // ── Validation warnings ──────────────────────────────────────────────────
        const validationWarnings = validateSemanticsAgainstCatalog({
          existingTables,
          existingColumns,
          tableSemantics: internalTables,
          columnSemantics: internalColumns
        });

    // ── PK lookup for target_column resolution ───────────────────────────────
        const pkRows = await context.database.query<{
      table_schema: string;
      table_name: string;
      column_name: string;
    }>(
      `SELECT kcu.table_schema, kcu.table_name, kcu.column_name
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON kcu.constraint_name = tc.constraint_name
        AND kcu.table_schema = tc.table_schema
        AND kcu.table_name = tc.table_name
       WHERE tc.constraint_type = 'PRIMARY KEY'
         AND kcu.ordinal_position = 1`,
      []
    );
        const pkLookup = new Map<string, string>(
          pkRows.map((r) => [`${r.table_schema}.${r.table_name}`.toLowerCase(), r.column_name])
        );

    // ── Map to public contract 1.0.0 shapes ─────────────────────────────────
        const publicTables: TableExport[] = internalTables.map((table) =>
          toPublicTable(table, internalColumns, internalRelations)
        );
        const publicColumns: ColumnExport[] = internalColumns.map((c) => {
          const colKey = `${c.table_schema}.${c.table_name}.${c.column_name}`.toLowerCase();
          const catalogNullable = nullableLookup.get(colKey);
          return toPublicColumn(c, catalogNullable);
        });
        const publicRelations: RelationExport[] = internalRelations.map((r) =>
          toPublicRelation(r, pkLookup)
        );

    // ── generation_hints ─────────────────────────────────────────────────────
    // domain_profile: explicit DB column (migration 013) > id prefix fallback.
        const domainProfile =
          (wsRow as { domain_profile?: string | null }).domain_profile ??
          wsRow.id.split("-")[0] ??
          null;

        const relationEdges = internalRelations.map(r => ({
          from_schema: r.from_schema,
          from_table: r.from_table,
          to_schema: r.to_schema,
          to_table: r.to_table
        }));

        const baseHints = buildGenerationHints({
          domainProfile,
          tables: publicTables.map(t => ({ schema_name: t.schema_name, table_name: t.table_name })),
          edges: relationEdges
        });

    // Compute estimated_total_rows from volume_driver × seed_multipliers per table.
        const multipliers = baseHints.seed_multipliers ?? { tiny: 20, low: 200, medium: 2000, high: 10000 };
        const estimatedTotalRows = publicTables.reduce((sum, t) => {
          const driver = t.volume_driver;
          const count = driver ? (multipliers[driver] ?? 0) : 0;
          return sum + count;
        }, 0);

        const generationHints = {
          ...baseHints,
          estimated_total_rows: estimatedTotalRows > 0 ? estimatedTotalRows : undefined
        };

    // ── Assemble public payload ──────────────────────────────────────────────
        const payload: Record<string, unknown> = {
          schema_version: WORKSPACE_MODEL_SCHEMA_VERSION,
          exported_at: new Date().toISOString(),
          workspace: {
            id: wsRow.id,
            label: wsRow.label,
            description: wsRow.description ?? null,
            domain_profile: domainProfile,
            pg_schema: pgSchema
          },
          tables: publicTables,
          generation_hints: generationHints,
          validation_warnings: validationWarnings
        };

        if (depth !== "tables_only") {
          payload.columns = publicColumns;
        }
        if (depth === "full") {
          payload.relations = publicRelations;
        }

        return createToolSuccessResult("ghostcrab_workspace_export_model", payload);
      }
    });

    return result;
  }
};

registerTool(workspaceExportModelTool);

async function listSqliteTables(database: {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<T[]>;
}): Promise<string[]> {
  const rows = await database.query<{ name: string }>(
    `SELECT name
     FROM sqlite_master
     WHERE type = 'table'
       AND name NOT LIKE 'sqlite_%'`
  );

  return rows
    .map((row) => row.name)
    .filter((name) => !["workspaces", "pending_migrations", "table_semantics", "column_semantics", "relation_semantics"].includes(name));
}

async function listSqliteColumns(
  database: {
    query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<T[]>;
  },
  tables: string[]
): Promise<Array<{ table_name: string; column_name: string; is_nullable: boolean; pk: boolean }>> {
  const columns: Array<{
    table_name: string;
    column_name: string;
    is_nullable: boolean;
    pk: boolean;
  }> = [];

  for (const tableName of tables) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(tableName)) {
      continue;
    }

    const tableColumns = await database.query<{
      name: string;
      notnull: number;
      pk: number;
    }>(`PRAGMA table_info(${tableName})`);

    for (const column of tableColumns) {
      columns.push({
        table_name: tableName,
        column_name: column.name,
        is_nullable: Number(column.notnull) === 0,
        pk: Number(column.pk) > 0
      });
    }
  }

  return columns;
}
