import { z } from "zod";
import { randomUUID } from "node:crypto";

import {
  createToolErrorResult,
  createToolSuccessResult,
  registerTool,
  type ToolHandler
} from "../registry.js";
import { WorkspaceIdSchema } from "../../types/workspace.js";
import { SyncFieldSpecSchema } from "../../types/facets.js";
import {
  type GeneratedTriggerSQL,
  generateSyncTrigger,
  validateGeneratedSyncTriggerSql,
  validateProposedSql
} from "../../db/trigger-generator.js";
import {
  inferBasicSemantics,
  SemanticProposalSchema,
  TableRoleSchema,
  ColumnRoleSchema,
  SemanticTypeSchema,
  GraphUsageSchema,
  RelationRoleSchema,
  VolumeDriverSchema
} from "../../types/workspace-model.js";
import { persistSemanticProposal } from "./semantic-persist.js";

// ─────────────────────────────────────────────────────────────────────────────
// ghostcrab_ddl_propose
// ─────────────────────────────────────────────────────────────────────────────

const TableSemanticInput = z
  .object({
    table_schema: z.string().min(1).default("public"),
    table_name: z.string().min(1),
    business_role: z.string().optional(),
    generation_strategy: z.string().optional().default("unknown"),
    emit_facets: z.boolean().optional().default(true),
    emit_graph_entity: z.boolean().optional(),
    emit_graph_relation: z.boolean().optional(),
    emit_graph_entities: z.boolean().optional(),
    emit_graph_relations: z.boolean().optional(),
    notes: z.string().optional(),
    // Rich public-contract fields
    table_role: TableRoleSchema.optional(),
    entity_family: z.string().nullable().optional(),
    volume_driver: VolumeDriverSchema.nullable().optional(),
    primary_time_column: z.string().nullable().optional(),
    emit_projections: z.boolean().optional()
  })
  .strict()
  .transform((value) => ({
    ...value,
    entity_family: value.entity_family ?? undefined,
    volume_driver: value.volume_driver ?? undefined,
    primary_time_column: value.primary_time_column ?? undefined,
    emit_graph_entity:
      value.emit_graph_entity ?? value.emit_graph_entities ?? false,
    emit_graph_relation:
      value.emit_graph_relation ?? value.emit_graph_relations ?? false
  }));

const ColumnSemanticInput = z
  .object({
    table_schema: z.string().min(1).default("public"),
    table_name: z.string().min(1),
    column_name: z.string().min(1),
    column_role: z
      .enum(["id", "fk", "timestamp", "status", "attribute", "unknown"])
      .optional()
      .default("unknown"),
    // Rich public-contract fields
    public_column_role: ColumnRoleSchema.optional(),
    semantic_type: SemanticTypeSchema.optional(),
    facet_key: z.string().optional(),
    graph_usage: GraphUsageSchema.optional(),
    projection_signal: z.string().optional(),
    is_nullable: z.boolean().optional(),
    distribution_hint: z.record(z.string(), z.unknown()).optional()
  })
  .strict();

const RelationSemanticInput = z
  .object({
    from_schema: z.string().min(1).default("public"),
    from_table: z.string().min(1),
    to_schema: z.string().min(1).default("public"),
    to_table: z.string().min(1),
    fk_column: z.string().optional(),
    relation_kind: z
      .enum(["many_to_one", "one_to_many", "unknown"])
      .optional()
      .default("unknown"),
    // Rich public-contract fields
    relation_role: RelationRoleSchema.optional(),
    hierarchical: z.boolean().optional(),
    graph_label: z.string().optional(),
    target_column: z.string().optional()
  })
  .strict();

/**
 * Tables that must never be used as a trigger source — they are internal
 * GhostCrab / mindbrain system tables.
 */
const PROTECTED_TABLES = new Set([
  "facets",
  "projections",
  "mindbrain.workspaces",
  "mindbrain.pending_migrations",
  "graph.entity",
  "graph.relation",
  "public.facets",
  "public.projections"
]);

const SOURCE_TABLE_REGEX = /^[a-z_][a-z0-9_]{0,62}(\.[a-z_][a-z0-9_]{0,62})?$/;

const DdlProposeInput = z
  .object({
    workspace_id: WorkspaceIdSchema,
    sql: z.string().min(1).max(65_536),
    rationale: z.string().max(2_048).optional(),
    proposed_by: z.string().optional(),
    sync_spec: z
      .object({
        source_table: z
          .string()
          .min(1)
          .regex(
            SOURCE_TABLE_REGEX,
            "source_table: schema.table lowercase only (a-z, 0-9, _)"
          )
          .refine(
            (t) => !PROTECTED_TABLES.has(t),
            "source_table: protected system table cannot be used as a sync source"
          ),
        fields: z.array(SyncFieldSpecSchema).min(1)
      })
      .strict()
      .optional(),
    table_semantics: z.array(TableSemanticInput).optional(),
    column_semantics: z.array(ColumnSemanticInput).optional(),
    relation_semantics: z.array(RelationSemanticInput).optional()
  })
  .strict();

export const ddlProposeTool: ToolHandler = {
  definition: {
    name: "ghostcrab_ddl_propose",
    description:
      "Propose a DDL migration for human review. The SQL is stored in pending_migrations with status='pending'. DROP and TRUNCATE statements are rejected. Provide sync_spec to auto-generate a trigger preview.",
    inputSchema: {
      type: "object",
      required: ["workspace_id", "sql"],
      properties: {
        workspace_id: {
          type: "string",
          description: "Target workspace id."
        },
        sql: {
          type: "string",
          description:
            "DDL SQL to propose (CREATE TABLE, ALTER TABLE, CREATE INDEX…). DROP and TRUNCATE are blocked."
        },
        rationale: {
          type: "string",
          description: "Why this migration is needed."
        },
        proposed_by: {
          type: "string",
          description: "Agent or user identity submitting this proposal."
        },
        sync_spec: {
          type: "object",
          description:
            "Optional Layer1→Layer2 sync spec. If provided, a trigger SQL preview is generated and stored for review.",
          required: ["source_table", "fields"],
          properties: {
            source_table: { type: "string" },
            fields: {
              type: "array",
              items: {
                type: "object",
                required: ["column_name", "facet_key", "index_in_bm25"],
                properties: {
                  column_name: { type: "string" },
                  facet_key: { type: "string" },
                  index_in_bm25: { type: "boolean" },
                  facet_type: { type: "string" },
                  transform: { type: "string" }
                }
              }
            }
          }
        },
        table_semantics: {
          type: "array",
          description:
            "Optional semantic annotations per table. If omitted (and column/relation blocks omitted), basic semantics are inferred from sql + sync_spec."
        },
        column_semantics: {
          type: "array",
          description:
            "Optional per-column roles. Used together with or without table_semantics."
        },
        relation_semantics: {
          type: "array",
          description: "Optional declared relations between tables."
        }
      }
    }
  },
  async handler(args, context) {
    const input = DdlProposeInput.parse(args);

    const violation = validateProposedSql(input.sql);
    if (violation) {
      return createToolErrorResult(
        "ghostcrab_ddl_propose",
        violation,
        "blocked_ddl_pattern"
      );
    }

    const workspace = await context.database.query<{ id: string }>(
      `SELECT id FROM workspaces WHERE id = ?`,
      [input.workspace_id]
    );
    if (workspace.length === 0) {
      return createToolErrorResult(
        "ghostcrab_ddl_propose",
        `Workspace '${input.workspace_id}' does not exist. Create it first with ghostcrab_workspace_create.`,
        "workspace_not_found"
      );
    }

    let previewTrigger: string | null = null;
    let triggerSummary: string | null = null;
    let syncSpecJson: Record<string, unknown> | null = null;

    if (input.sync_spec) {
      const generated: GeneratedTriggerSQL = generateSyncTrigger({
        sourceTable: input.sync_spec.source_table,
        workspaceId: input.workspace_id,
        fields: input.sync_spec.fields
      });
      const triggerViolation = validateGeneratedSyncTriggerSql(generated.sql);
      if (triggerViolation) {
        return createToolErrorResult(
          "ghostcrab_ddl_propose",
          `Generated trigger blocked: ${triggerViolation}`,
          "blocked_ddl_pattern"
        );
      }
      previewTrigger = generated.sql;
      triggerSummary = generated.summary;
      syncSpecJson = {
        source_table: input.sync_spec.source_table,
        fields: input.sync_spec.fields
      };
    }

    const hasUserSemantics =
      input.table_semantics !== undefined ||
      input.column_semantics !== undefined ||
      input.relation_semantics !== undefined;

    const semanticProposal = hasUserSemantics
      ? SemanticProposalSchema.parse({
          table_semantics: input.table_semantics ?? [],
          column_semantics: input.column_semantics ?? [],
          relation_semantics: input.relation_semantics ?? []
        })
      : inferBasicSemantics(
          input.sql,
          input.sync_spec
            ? {
                source_table: input.sync_spec.source_table,
                fields: input.sync_spec.fields
              }
            : null
        );

    const semanticSpecJson = JSON.stringify(semanticProposal);

    const migrationId = randomUUID();

    await context.database.query(
      `INSERT INTO pending_migrations
         (id, workspace_id, sql, sync_spec, rationale, preview_trigger, proposed_by, status, semantic_spec)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
      [
        migrationId,
        input.workspace_id,
        input.sql,
        syncSpecJson ? JSON.stringify(syncSpecJson) : null,
        input.rationale ?? null,
        previewTrigger,
        input.proposed_by ?? null,
        semanticSpecJson
      ]
    );

    return createToolSuccessResult("ghostcrab_ddl_propose", {
      migration_id: migrationId,
      workspace_id: input.workspace_id,
      status: "pending",
      has_trigger_preview: previewTrigger !== null,
      trigger_summary: triggerSummary,
      semantic_proposal: semanticProposal,
      next_step: `A human must approve this migration before it can be executed:\n  ghostcrab maintenance ddl-approve --id ${migrationId} --by <your-name>\nThen execute it with:\n  ghostcrab maintenance ddl-execute --id ${migrationId}`
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ghostcrab_ddl_list_pending
// ─────────────────────────────────────────────────────────────────────────────

const DdlListPendingInput = z.object({
  workspace_id: WorkspaceIdSchema.optional(),
  status: z.enum(["pending", "approved", "executed", "rejected"]).optional()
});

export const ddlListPendingTool: ToolHandler = {
  definition: {
    name: "ghostcrab_ddl_list_pending",
    description:
      "List DDL migrations from the pending queue. Filter by workspace or status.",
    inputSchema: {
      type: "object",
      properties: {
        workspace_id: {
          type: "string",
          description: "Filter by workspace. Omit for all workspaces."
        },
        status: {
          type: "string",
          enum: ["pending", "approved", "executed", "rejected"],
          description: "Filter by migration status. Omit for all."
        }
      }
    }
  },
  async handler(args, context) {
    const input = DdlListPendingInput.parse(args);

    const whereClauses: string[] = [];
    const params: unknown[] = [];

    if (input.workspace_id) {
      whereClauses.push(`workspace_id = ?`);
      params.push(input.workspace_id);
    }
    if (input.status) {
      whereClauses.push(`status = ?`);
      params.push(input.status);
    }

    const whereClause =
      whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const rows = await context.database.query<{
      id: string;
      workspace_id: string;
      sql: string;
      rationale: string | null;
      preview_trigger: string | null;
      status: string;
      proposed_by: string | null;
      approved_by: string | null;
      proposed_at: string;
      approved_at: string | null;
      executed_at: string | null;
    }>(
      `SELECT id, workspace_id, sql, rationale, preview_trigger,
              status, proposed_by, approved_by, proposed_at, approved_at, executed_at
       FROM pending_migrations
       ${whereClause}
       ORDER BY proposed_at DESC`,
      params
    );

    return createToolSuccessResult("ghostcrab_ddl_list_pending", {
      migrations: rows,
      total: rows.length,
      filter_workspace: input.workspace_id ?? "all",
      filter_status: input.status ?? "all"
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ghostcrab_ddl_execute
// ─────────────────────────────────────────────────────────────────────────────

const DdlExecuteInput = z
  .object({
    migration_id: z.string().uuid()
  })
  .strict();

export const ddlExecuteTool: ToolHandler = {
  definition: {
    name: "ghostcrab_ddl_execute",
    description:
      "Execute an approved DDL migration. The migration must have status='approved' (set via CLI ddl-approve). Executes the DDL + trigger preview atomically in a transaction.",
    inputSchema: {
      type: "object",
      required: ["migration_id"],
      properties: {
        migration_id: {
          type: "string",
          description: "UUID of the migration to execute (must be 'approved')."
        }
      }
    }
  },
  async handler(args, context) {
    const input = DdlExecuteInput.parse(args);

    const [migration] = await context.database.query<{
      id: string;
      workspace_id: string;
      sql: string;
      preview_trigger: string | null;
      status: string;
      semantic_spec: unknown | null;
    }>(
      `SELECT id, workspace_id, sql, preview_trigger, status, semantic_spec
       FROM pending_migrations
       WHERE id = ?`,
      [input.migration_id]
    );

    if (!migration) {
      return createToolErrorResult(
        "ghostcrab_ddl_execute",
        `Migration '${input.migration_id}' not found.`,
        "migration_not_found"
      );
    }

    if (migration.status !== "approved") {
      return createToolErrorResult(
        "ghostcrab_ddl_execute",
        `Migration '${input.migration_id}' has status '${migration.status}'. Only 'approved' migrations can be executed.`,
        "migration_not_approved",
        { current_status: migration.status }
      );
    }

    let semanticsApplied: Record<string, number> | undefined;
    let semanticsError: string | undefined;

    let triggerApplied = false;

    try {
      await context.database.transaction(async (tx) => {
        await tx.query(migration.sql);

        if (
          migration.preview_trigger &&
          isExecutableSqlitePreview(migration.preview_trigger)
        ) {
          await tx.query(migration.preview_trigger);
          triggerApplied = true;
        }

        await tx.query(
          `UPDATE pending_migrations
           SET status = 'executed', executed_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [input.migration_id]
        );
      });
    } catch (error) {
      return createToolErrorResult(
        "ghostcrab_ddl_execute",
        `DDL execution failed: ${error instanceof Error ? error.message : String(error)}`,
        "ddl_execution_failed"
      );
    }

    if (migration.semantic_spec != null) {
      try {
        const persist = await persistSemanticProposal(
          context.database,
          migration.workspace_id,
          parseSemanticSpec(migration.semantic_spec)
        );
        if (persist.applied && persist.counts) {
          semanticsApplied = persist.counts;
        } else if (persist.error) {
          semanticsError = persist.error;
        }
      } catch (semErr) {
        semanticsError =
          semErr instanceof Error ? semErr.message : String(semErr);
      }
    }

    return createToolSuccessResult("ghostcrab_ddl_execute", {
      migration_id: input.migration_id,
      workspace_id: migration.workspace_id,
      status: "executed",
      trigger_applied: triggerApplied,
      applied_sql_preview:
        migration.sql.slice(0, 500) + (migration.sql.length > 500 ? "…" : ""),
      semantics_applied: semanticsApplied,
      semantics_error: semanticsError
    });
  }
};

registerTool(ddlProposeTool);
registerTool(ddlListPendingTool);
registerTool(ddlExecuteTool);

function isExecutableSqlitePreview(sql: string): boolean {
  return !/\bLANGUAGE\s+plpgsql\b/i.test(sql);
}

function parseSemanticSpec(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}
