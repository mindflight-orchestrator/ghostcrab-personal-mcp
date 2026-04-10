import type { Queryable } from "../../db/client.js";
import { SemanticProposalSchema } from "../../types/workspace-model.js";

export async function persistSemanticProposal(
  tx: Queryable,
  workspaceId: string,
  raw: unknown
): Promise<{ applied: boolean; error?: string; counts?: Record<string, number> }> {
  const parsed = SemanticProposalSchema.safeParse(raw);
  if (!parsed.success) {
    return { applied: false, error: parsed.error.message };
  }
  const p = parsed.data;
  let tableCount = 0;
  let columnCount = 0;
  let relationCount = 0;

  for (const t of p.table_semantics) {
    // Pack rich table fields into notes JSON (table_semantics.notes is TEXT).
    // We merge with any existing plain-text notes by always treating as structured JSON.
    const richTableMeta: Record<string, unknown> = {};
    if (t.table_role !== undefined) richTableMeta.table_role = t.table_role;
    if (t.entity_family !== undefined) richTableMeta.entity_family = t.entity_family;
    if (t.volume_driver !== undefined) richTableMeta.volume_driver = t.volume_driver;
    if (t.primary_time_column !== undefined) richTableMeta.primary_time_column = t.primary_time_column;
    if (t.emit_projections !== undefined) richTableMeta.emit_projections = t.emit_projections;

    // Merge with pre-existing notes content if provided as JSON string
    let notesJson: string | null = null;
    if (t.notes) {
      try {
        const existing = JSON.parse(t.notes) as Record<string, unknown>;
        notesJson = JSON.stringify({ ...existing, ...richTableMeta });
      } catch {
        // plain-text notes: wrap and merge
        notesJson = JSON.stringify({ text: t.notes, ...richTableMeta });
      }
    } else if (Object.keys(richTableMeta).length > 0) {
      notesJson = JSON.stringify(richTableMeta);
    }

    await tx.query(
      tx.kind === "sqlite"
        ? `INSERT INTO table_semantics (
             workspace_id, table_schema, table_name, business_role, generation_strategy,
             emit_facets, emit_graph_entity, emit_graph_relation, notes, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT (workspace_id, table_schema, table_name) DO UPDATE SET
             business_role = excluded.business_role,
             generation_strategy = excluded.generation_strategy,
             emit_facets = excluded.emit_facets,
             emit_graph_entity = excluded.emit_graph_entity,
             emit_graph_relation = excluded.emit_graph_relation,
             notes = excluded.notes,
             updated_at = CURRENT_TIMESTAMP`
        : `INSERT INTO mindbrain.table_semantics (
             workspace_id, table_schema, table_name, business_role, generation_strategy,
             emit_facets, emit_graph_entity, emit_graph_relation, notes, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
           ON CONFLICT (workspace_id, table_schema, table_name) DO UPDATE SET
             business_role = EXCLUDED.business_role,
             generation_strategy = EXCLUDED.generation_strategy,
             emit_facets = EXCLUDED.emit_facets,
             emit_graph_entity = EXCLUDED.emit_graph_entity,
             emit_graph_relation = EXCLUDED.emit_graph_relation,
             notes = EXCLUDED.notes,
             updated_at = now()`,
      [
        workspaceId,
        t.table_schema,
        t.table_name,
        t.business_role ?? null,
        t.generation_strategy,
        t.emit_facets,
        t.emit_graph_entity,
        t.emit_graph_relation,
        notesJson
      ]
    );
    tableCount += 1;
  }

  for (const c of p.column_semantics) {
    // Build rich_meta JSONB from optional rich fields
    const richMeta: Record<string, unknown> = {};
    if (c.public_column_role !== undefined) richMeta.public_column_role = c.public_column_role;
    if (c.semantic_type !== undefined) richMeta.semantic_type = c.semantic_type;
    if (c.facet_key !== undefined) richMeta.facet_key = c.facet_key;
    if (c.graph_usage !== undefined) richMeta.graph_usage = c.graph_usage;
    if (c.projection_signal !== undefined) richMeta.projection_signal = c.projection_signal;
    if (c.is_nullable !== undefined) richMeta.is_nullable = c.is_nullable;
    if (c.distribution_hint !== undefined) richMeta.distribution_hint = c.distribution_hint;

    const richMetaJson = Object.keys(richMeta).length > 0 ? richMeta : null;

    await tx.query(
      tx.kind === "sqlite"
        ? `INSERT INTO column_semantics (
             workspace_id, table_schema, table_name, column_name, column_role, rich_meta, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT (workspace_id, table_schema, table_name, column_name) DO UPDATE SET
             column_role = excluded.column_role,
             rich_meta = excluded.rich_meta,
             updated_at = CURRENT_TIMESTAMP`
        : `INSERT INTO mindbrain.column_semantics (
             workspace_id, table_schema, table_name, column_name, column_role, rich_meta, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, now())
           ON CONFLICT (workspace_id, table_schema, table_name, column_name) DO UPDATE SET
             column_role = EXCLUDED.column_role,
             rich_meta = EXCLUDED.rich_meta,
             updated_at = now()`,
      [
        workspaceId,
        c.table_schema,
        c.table_name,
        c.column_name,
        c.column_role,
        richMetaJson ? JSON.stringify(richMetaJson) : null
      ]
    );
    columnCount += 1;
  }

  for (const r of p.relation_semantics) {
    const fk = r.fk_column ?? "";

    // Build rich_meta JSONB from optional rich fields
    const richMeta: Record<string, unknown> = {};
    if (r.relation_role !== undefined) richMeta.relation_role = r.relation_role;
    if (r.hierarchical !== undefined) richMeta.hierarchical = r.hierarchical;
    if (r.graph_label !== undefined) richMeta.graph_label = r.graph_label;
    if (r.target_column !== undefined) richMeta.target_column = r.target_column;

    const richMetaJson = Object.keys(richMeta).length > 0 ? richMeta : null;

    await tx.query(
      tx.kind === "sqlite"
        ? `INSERT INTO relation_semantics (
             workspace_id, from_schema, from_table, to_schema, to_table, fk_column, relation_kind, rich_meta, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT (workspace_id, from_schema, from_table, to_schema, to_table, fk_column) DO UPDATE SET
             relation_kind = excluded.relation_kind,
             rich_meta = excluded.rich_meta,
             updated_at = CURRENT_TIMESTAMP`
        : `INSERT INTO mindbrain.relation_semantics (
             workspace_id, from_schema, from_table, to_schema, to_table, fk_column, relation_kind, rich_meta, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, now())
           ON CONFLICT (workspace_id, from_schema, from_table, to_schema, to_table, fk_column) DO UPDATE SET
             relation_kind = EXCLUDED.relation_kind,
             rich_meta = EXCLUDED.rich_meta,
             updated_at = now()`,
      [
        workspaceId,
        r.from_schema,
        r.from_table,
        r.to_schema,
        r.to_table,
        fk,
        r.relation_kind,
        richMetaJson ? JSON.stringify(richMetaJson) : null
      ]
    );
    relationCount += 1;
  }

  return {
    applied: true,
    counts: {
      table_semantics: tableCount,
      column_semantics: columnCount,
      relation_semantics: relationCount
    }
  };
}
