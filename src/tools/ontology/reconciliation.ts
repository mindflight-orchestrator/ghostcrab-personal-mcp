import { randomUUID } from "node:crypto";
import { z } from "zod";

import { resolveGhostcrabConfig } from "../../config/env.js";
import {
  SQLITE_FACT_STORE_TABLE,
  SQLITE_FACTS_COLUMN,
  SQLITE_NEXT_FACT_DOC_ID_EXPR,
  safeParseFacetJson,
  sqliteFacetJsonExtractClause
} from "../../db/fact-store.js";
import { runStandaloneOntologyReconciliation } from "../../db/standalone-mindbrain.js";
import {
  createToolErrorFromException,
  createToolSuccessResult,
  registerTool,
  type ToolExecutionContext,
  type ToolHandler
} from "../registry.js";

const ReconciliationReportInput = z.object({
  workspace_id: z.string().trim().min(1).optional(),
  ontology_id: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200)
});

const ReconciliationApplyInput = z.object({
  workspace_id: z.string().trim().min(1).optional(),
  ontology_id: z.string().trim().min(1),
  include_per_type: z.boolean().default(true),
  overwrite_custom: z.boolean().default(false)
});

type OntologyRow = {
  ontology_id: string;
  workspace_id: string;
  name: string | null;
  version: string | null;
  source_kind: string | null;
  metadata_json: string | null;
};

type EntityTypeRow = {
  entity_type: string;
  label: string | null;
  metadata_json: string | null;
};

type EdgeTypeRow = {
  edge_type: string;
  directed: number;
  source_entity_type: string | null;
  target_entity_type: string | null;
  metadata_json: string | null;
};

function parseJsonObject(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

async function loadOntologyProjection(
  context: ToolExecutionContext,
  workspaceId: string,
  ontologyId: string
): Promise<{
  ontology: OntologyRow;
  entityTypes: EntityTypeRow[];
  edgeTypes: EdgeTypeRow[];
}> {
  const [ontology] = await context.database.query<OntologyRow>(
    `
      SELECT ontology_id, workspace_id, name, version, source_kind, metadata_json
      FROM ontologies
      WHERE ontology_id = ? AND workspace_id = ?
      LIMIT 1
    `,
    [ontologyId, workspaceId]
  );
  if (!ontology) {
    throw new Error(
      `Ontology ${ontologyId} was not found in workspace ${workspaceId}.`
    );
  }

  const entityTypes = await context.database.query<EntityTypeRow>(
    `
      SELECT entity_type, label, metadata_json
      FROM ontology_entity_types
      WHERE ontology_id = ?
      ORDER BY entity_type
    `,
    [ontologyId]
  );
  const edgeTypes = await context.database.query<EdgeTypeRow>(
    `
      SELECT edge_type, directed, source_entity_type, target_entity_type, metadata_json
      FROM ontology_edge_types
      WHERE ontology_id = ?
      ORDER BY edge_type
    `,
    [ontologyId]
  );

  return { ontology, entityTypes, edgeTypes };
}

function aggregateDefinition(input: {
  ontology: OntologyRow;
  entityTypes: EntityTypeRow[];
  edgeTypes: EdgeTypeRow[];
}): Record<string, unknown> {
  return {
    schema_id: input.ontology.ontology_id,
    description: `Generated registry projection for ontology ${input.ontology.ontology_id}`,
    target: "ontology",
    version: input.ontology.version ?? 1,
    generated_from: "ontology",
    ontology: {
      ontology_id: input.ontology.ontology_id,
      workspace_id: input.ontology.workspace_id,
      name: input.ontology.name,
      source_kind: input.ontology.source_kind,
      metadata: parseJsonObject(input.ontology.metadata_json)
    },
    entity_types: input.entityTypes.map((row) => ({
      entity_type: row.entity_type,
      label: row.label,
      metadata: parseJsonObject(row.metadata_json)
    })),
    edge_types: input.edgeTypes.map((row) => ({
      edge_type: row.edge_type,
      directed: row.directed !== 0,
      source_entity_type: row.source_entity_type,
      target_entity_type: row.target_entity_type,
      metadata: parseJsonObject(row.metadata_json)
    }))
  };
}

function entityDefinition(
  ontologyId: string,
  row: EntityTypeRow
): Record<string, unknown> {
  return {
    schema_id: `${ontologyId}:entity:${row.entity_type}`,
    description: `Generated registry projection for ontology entity type ${row.entity_type}`,
    target: "graph_node",
    generated_from: "ontology",
    ontology_id: ontologyId,
    entity_type: row.entity_type,
    label: row.label,
    metadata: parseJsonObject(row.metadata_json)
  };
}

function edgeDefinition(
  ontologyId: string,
  row: EdgeTypeRow
): Record<string, unknown> {
  return {
    schema_id: `${ontologyId}:edge:${row.edge_type}`,
    description: `Generated registry projection for ontology edge type ${row.edge_type}`,
    target: "graph_edge",
    generated_from: "ontology",
    ontology_id: ontologyId,
    edge_type: row.edge_type,
    directed: row.directed !== 0,
    source_entity_type: row.source_entity_type,
    target_entity_type: row.target_entity_type,
    metadata: parseJsonObject(row.metadata_json)
  };
}

async function upsertGeneratedSchema(
  context: ToolExecutionContext,
  workspaceId: string,
  ontologyId: string,
  definition: Record<string, unknown>,
  target: "ontology" | "graph_node" | "graph_edge",
  overwriteCustom: boolean
): Promise<"created" | "updated" | "skipped_custom"> {
  const schemaId = String(definition.schema_id ?? "");
  const [existing] = await context.database.query<{
    id: string;
    facets_json: string;
  }>(
    `
      SELECT id, ${SQLITE_FACTS_COLUMN} AS facets_json
      FROM ${SQLITE_FACT_STORE_TABLE}
      WHERE schema_id = 'mindbrain:schema'
        AND ${sqliteFacetJsonExtractClause("schema_id")} = ?
        AND workspace_id = ?
      LIMIT 1
    `,
    [schemaId, workspaceId]
  );

  const facets = {
    schema_id: schemaId,
    target,
    ontology_id: ontologyId,
    generated_from: "ontology",
    version: definition.version ?? 1
  };
  const content = JSON.stringify(definition, null, 2);

  if (existing) {
    const existingFacets = safeParseFacetJson(existing.facets_json);
    if (!overwriteCustom && existingFacets.generated_from !== "ontology") {
      return "skipped_custom";
    }
    await context.database.query(
      `
        UPDATE ${SQLITE_FACT_STORE_TABLE}
        SET content = ?,
            ${SQLITE_FACTS_COLUMN} = ?,
            updated_at_unix = strftime('%s','now'),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [content, JSON.stringify(facets), existing.id]
    );
    return "updated";
  }

  await context.database.query(
    `
      INSERT INTO ${SQLITE_FACT_STORE_TABLE} (
        id,
        schema_id,
        content,
        ${SQLITE_FACTS_COLUMN},
        workspace_id,
        doc_id,
        created_at_unix,
        updated_at_unix
      )
      VALUES (?, 'mindbrain:schema', ?, ?, ?, ${SQLITE_NEXT_FACT_DOC_ID_EXPR}, strftime('%s','now'), strftime('%s','now'))
    `,
    [randomUUID(), content, JSON.stringify(facets), workspaceId]
  );
  return "created";
}

export const ontologyReconciliationReportTool: ToolHandler = {
  definition: {
    name: "ghostcrab_ontology_reconcile_report",
    description:
      "Read. Compare one workspace ontology with MCP schema registry projections, raw graph rows, runtime graph rows, collection facet assignments, collection ontology bindings, and closed-world gap rules.",
    inputSchema: {
      type: "object",
      properties: {
        workspace_id: {
          type: "string",
          description:
            "Target workspace id. Defaults to the current MCP session workspace."
        },
        ontology_id: {
          type: "string",
          description:
            "Ontology id to reconcile. When omitted, MindBrain resolves the workspace default ontology."
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 500,
          default: 200,
          description: "Maximum issue rows to return."
        }
      }
    }
  },
  async handler(args, context) {
    const input = ReconciliationReportInput.parse(args);
    const workspaceId = input.workspace_id ?? context.session.workspace_id;
    const config = resolveGhostcrabConfig();

    try {
      const report = await runStandaloneOntologyReconciliation({
        mindbrainUrl: config.mindbrainUrl,
        timeoutMs: config.mindbrainHttpTimeoutMs,
        workspaceId,
        ontologyId: input.ontology_id,
        limit: input.limit
      });
      return createToolSuccessResult("ghostcrab_ontology_reconcile_report", {
        workspace_id: workspaceId,
        ontology_id:
          typeof report.summary.ontology_id === "string"
            ? report.summary.ontology_id
            : (input.ontology_id ?? null),
        backend: "mindbrain/ontology/reconciliation",
        summary: report.summary,
        issues: Array.isArray(report.issues) ? report.issues : []
      });
    } catch (error) {
      return createToolErrorFromException(
        "ghostcrab_ontology_reconcile_report",
        error,
        "backend_unavailable",
        "MindBrain ontology reconciliation backend unavailable"
      );
    }
  }
};

export const ontologyReconciliationApplyTool: ToolHandler = {
  definition: {
    name: "ghostcrab_ontology_reconcile_apply",
    description:
      "Write. Apply only safe ontology reconciliation actions: generate or refresh ontology-derived MCP schema registry rows in agent_facts. Does not mutate raw graph, runtime graph, facets, or gap rules.",
    inputSchema: {
      type: "object",
      required: ["ontology_id"],
      properties: {
        workspace_id: {
          type: "string",
          description:
            "Target workspace id. Defaults to the current MCP session workspace."
        },
        ontology_id: {
          type: "string",
          description: "Ontology id to project into the MCP schema registry."
        },
        include_per_type: {
          type: "boolean",
          default: true,
          description:
            "When true, also generate per-entity and per-edge registry schema projections."
        },
        overwrite_custom: {
          type: "boolean",
          default: false,
          description:
            "When false, existing custom registry rows are skipped unless they were previously generated from ontology."
        }
      }
    }
  },
  async handler(args, context) {
    const input = ReconciliationApplyInput.parse(args);
    const workspaceId = input.workspace_id ?? context.session.workspace_id;
    const projection = await loadOntologyProjection(
      context,
      workspaceId,
      input.ontology_id
    );

    const results: Array<{ schema_id: string; status: string }> = [];
    const aggregate = aggregateDefinition(projection);
    results.push({
      schema_id: String(aggregate.schema_id),
      status: await upsertGeneratedSchema(
        context,
        workspaceId,
        input.ontology_id,
        aggregate,
        "ontology",
        input.overwrite_custom
      )
    });

    if (input.include_per_type) {
      for (const row of projection.entityTypes) {
        const definition = entityDefinition(input.ontology_id, row);
        results.push({
          schema_id: String(definition.schema_id),
          status: await upsertGeneratedSchema(
            context,
            workspaceId,
            input.ontology_id,
            definition,
            "graph_node",
            input.overwrite_custom
          )
        });
      }
      for (const row of projection.edgeTypes) {
        const definition = edgeDefinition(input.ontology_id, row);
        results.push({
          schema_id: String(definition.schema_id),
          status: await upsertGeneratedSchema(
            context,
            workspaceId,
            input.ontology_id,
            definition,
            "graph_edge",
            input.overwrite_custom
          )
        });
      }
    }

    return createToolSuccessResult("ghostcrab_ontology_reconcile_apply", {
      workspace_id: workspaceId,
      ontology_id: input.ontology_id,
      applied_scope: "mcp_schema_registry",
      untouched_layers: [
        "raw_graph",
        "runtime_graph",
        "collection_facets",
        "gap_rules"
      ],
      results
    });
  }
};

registerTool(ontologyReconciliationReportTool);
registerTool(ontologyReconciliationApplyTool);
