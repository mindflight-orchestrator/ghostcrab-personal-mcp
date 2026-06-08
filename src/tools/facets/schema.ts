import { z } from "zod";

import {
  SQLITE_FACT_STORE_TABLE,
  SQLITE_FACTS_COLUMN,
  SQLITE_NEXT_FACT_DOC_ID_EXPR,
  safeParseFacetJson,
  sqliteFacetJsonExtractClause
} from "../../db/fact-store.js";
import {
  createToolSuccessResult,
  registerTool,
  type ToolExecutionContext,
  type ToolHandler
} from "../registry.js";

export const schemaDefinitionInput = z
  .object({
    schema_id: z.string().min(1),
    description: z.string().min(1)
  })
  .passthrough();

export const SchemaRegisterInput = z.object({
  target: z.enum(["facets", "graph_node", "graph_edge"]).default("facets"),
  definition: schemaDefinitionInput,
  workspace_id: z.string().min(1).optional()
});

export const SchemaListInput = z.object({
  target: z.enum(["facets", "graph_node", "graph_edge", "all"]).default("all"),
  domain: z.string().min(1).optional(),
  summary_only: z.boolean().default(false)
});

export const ONBOARDING_SCHEMA_IDS = [
  "ghostcrab:modeling-recipe",
  "ghostcrab:activity-family",
  "ghostcrab:projection-recipe",
  "ghostcrab:signal-pattern"
] as const;

const ONBOARDING_SCHEMA_ROLES: Record<string, string> = {
  "ghostcrab:modeling-recipe":
    "Defines how to model a domain: which fact schema to use, which graph nodes/edges to create, and which projection recipe to apply.",
  "ghostcrab:activity-family":
    "Describes a known domain type and the default projection and signal patterns attached to it.",
  "ghostcrab:projection-recipe":
    "Describes how to generate a working view or heartbeat projection for a domain.",
  "ghostcrab:signal-pattern":
    "Contains phrase and keyword patterns that help map user goals to activity families."
};

export const SchemaInspectInput = z.object({
  schema_id: z.string().min(1),
  workspace_id: z.string().min(1).optional()
});

export const SchemaGetInput = SchemaInspectInput;

export const SchemaSyncPreviewInput = SchemaInspectInput;

export const SchemaSyncApplyInput = z.object({
  schema_id: z.string().min(1),
  workspace_id: z.string().min(1).optional(),
  action: z.enum([
    "create_registry_projection_from_ontology",
    "update_registry_projection_from_ontology",
    "create_ontology_from_registry"
  ]),
  confirm: z.boolean().default(false)
});

function parseDefinition(content: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(content);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

async function readRegistrySchema(
  context: ToolExecutionContext,
  schemaId: string,
  workspaceId?: string
): Promise<
  | {
      content: string;
      facets_json: string;
      id: string;
      workspace_id: string;
    }
  | undefined
> {
  const effectiveWorkspaceId = workspaceId ?? context.session.workspace_id;
  const [row] = await context.database.query<{
    content: string;
    facets_json: string;
    id: string;
    workspace_id: string;
  }>(
    `
      SELECT id, content, ${SQLITE_FACTS_COLUMN} AS facets_json, workspace_id
      FROM ${SQLITE_FACT_STORE_TABLE}
      WHERE schema_id = 'mindbrain:schema'
        AND ${sqliteFacetJsonExtractClause("schema_id")} = ?
        AND workspace_id = ?
      LIMIT 1
    `,
    [schemaId, effectiveWorkspaceId]
  );
  return row;
}

async function readOntologyView(
  context: ToolExecutionContext,
  ontologyId: string,
  workspaceId?: string
): Promise<Record<string, unknown> | null> {
  const params: unknown[] = [ontologyId];
  const workspaceClause = workspaceId ? " AND workspace_id = ?" : "";
  if (workspaceId) params.push(workspaceId);
  const [ontology] = await context.database.query<Record<string, unknown>>(
    `
      SELECT ontology_id, workspace_id, name, version, source_kind, frozen, metadata_json
      FROM ontologies
      WHERE ontology_id = ?${workspaceClause}
      LIMIT 1
    `,
    params
  );
  if (!ontology) return null;

  const [namespaces, dimensions, values, entityTypes, edgeTypes] =
    await Promise.all([
      context.database.query<Record<string, unknown>>(
        `
          SELECT namespace, label, parent_namespace, metadata_json
          FROM ontology_namespaces
          WHERE ontology_id = ?
          ORDER BY namespace
        `,
        [ontologyId]
      ),
      context.database.query<Record<string, unknown>>(
        `
          SELECT namespace, dimension, value_type, is_multi, hierarchy_kind, metadata_json
          FROM ontology_dimensions
          WHERE ontology_id = ?
          ORDER BY namespace, dimension
        `,
        [ontologyId]
      ),
      context.database.query<Record<string, unknown>>(
        `
          SELECT namespace, dimension, value_id, value, parent_value_id, label, metadata_json
          FROM ontology_values
          WHERE ontology_id = ?
          ORDER BY namespace, dimension, value_id
        `,
        [ontologyId]
      ),
      context.database.query<Record<string, unknown>>(
        `
          SELECT entity_type, label, metadata_json
          FROM ontology_entity_types
          WHERE ontology_id = ?
          ORDER BY entity_type
        `,
        [ontologyId]
      ),
      context.database.query<Record<string, unknown>>(
        `
          SELECT edge_type, directed, source_entity_type, target_entity_type, metadata_json
          FROM ontology_edge_types
          WHERE ontology_id = ?
          ORDER BY edge_type
        `,
        [ontologyId]
      )
    ]);

  return {
    ...ontology,
    namespaces,
    dimensions,
    values,
    entity_types: entityTypes,
    edge_types: edgeTypes
  };
}

function syncStatus(
  schemaId: string,
  registryFound: boolean,
  ontologyFound: boolean,
  registrySchema?: Record<string, unknown>,
  ontology?: Record<string, unknown> | null
): "in_sync" | "registry_missing" | "ontology_missing" | "drift" {
  if (!registryFound && ontologyFound) return "registry_missing";
  if (registryFound && !ontologyFound) return "ontology_missing";
  if (!registryFound && !ontologyFound) return "ontology_missing";
  const projectedOntology = ontologyProjectionDefinition(
    schemaId,
    ontology as Record<string, unknown>
  );
  return JSON.stringify(registrySchema) === JSON.stringify(projectedOntology)
    ? "in_sync"
    : "drift";
}

function recommendedActions(status: string): string[] {
  if (status === "registry_missing")
    return ["create_registry_projection_from_ontology"];
  if (status === "ontology_missing") return ["create_ontology_from_registry"];
  if (status === "drift") return ["preview_ontology_to_registry_sync"];
  return [];
}

function ontologyProjectionDefinition(
  schemaId: string,
  ontology: Record<string, unknown>
): Record<string, unknown> {
  return {
    schema_id: schemaId,
    description: String(ontology.name ?? schemaId),
    target: "ontology",
    ontology
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asInteger(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.trunc(value)
    : fallback;
}

function metadataJsonString(row: Record<string, unknown>): string {
  const raw = row.metadata_json ?? row.metadata;
  if (typeof raw === "string") return raw;
  if (isRecord(raw)) return JSON.stringify(raw);
  return "{}";
}

async function createOntologyFromRegistryProjection(
  context: ToolExecutionContext,
  schemaId: string,
  workspaceId: string,
  registrySchema: Record<string, unknown>
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (
    registrySchema.target !== "ontology" ||
    !isRecord(registrySchema.ontology)
  ) {
    return {
      ok: false,
      reason:
        "Registry schema is not an ontology projection. Use LinkML/ontology import for arbitrary schema packs."
    };
  }

  const ontology = registrySchema.ontology;
  const ontologyId = asString(ontology.ontology_id, schemaId);
  if (ontologyId !== schemaId) {
    return {
      ok: false,
      reason:
        "Registry ontology projection schema_id and ontology.ontology_id do not match."
    };
  }

  await context.database.query(
    `
      INSERT INTO ontologies (
        ontology_id,
        workspace_id,
        name,
        version,
        source_kind,
        frozen,
        metadata_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      schemaId,
      workspaceId,
      asString(ontology.name, schemaId),
      asString(ontology.version, "1.0.0"),
      asString(ontology.source_kind, "registry_projection"),
      ontology.frozen === true || ontology.frozen === 1 ? 1 : 0,
      metadataJsonString(ontology)
    ]
  );

  for (const row of asArray(ontology.namespaces)) {
    await context.database.query(
      `
        INSERT INTO ontology_namespaces (
          ontology_id,
          namespace,
          label,
          parent_namespace,
          metadata_json
        )
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(ontology_id, namespace) DO UPDATE SET
          label = excluded.label,
          parent_namespace = excluded.parent_namespace,
          metadata_json = excluded.metadata_json
      `,
      [
        schemaId,
        asString(row.namespace),
        asNullableString(row.label) ?? asString(row.namespace),
        asNullableString(row.parent_namespace),
        metadataJsonString(row)
      ]
    );
  }

  for (const row of asArray(ontology.dimensions)) {
    await context.database.query(
      `
        INSERT INTO ontology_dimensions (
          ontology_id,
          namespace,
          dimension,
          value_type,
          is_multi,
          hierarchy_kind,
          metadata_json
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(ontology_id, namespace, dimension) DO UPDATE SET
          value_type = excluded.value_type,
          is_multi = excluded.is_multi,
          hierarchy_kind = excluded.hierarchy_kind,
          metadata_json = excluded.metadata_json
      `,
      [
        schemaId,
        asString(row.namespace),
        asString(row.dimension),
        asString(row.value_type, "string"),
        row.is_multi === true || row.is_multi === 1 ? 1 : 0,
        asString(row.hierarchy_kind, "flat"),
        metadataJsonString(row)
      ]
    );
  }

  for (const row of asArray(ontology.values)) {
    await context.database.query(
      `
        INSERT INTO ontology_values (
          ontology_id,
          namespace,
          dimension,
          value_id,
          value,
          parent_value_id,
          label,
          metadata_json
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(ontology_id, namespace, dimension, value) DO UPDATE SET
          value_id = excluded.value_id,
          parent_value_id = excluded.parent_value_id,
          label = excluded.label,
          metadata_json = excluded.metadata_json
      `,
      [
        schemaId,
        asString(row.namespace),
        asString(row.dimension),
        asInteger(row.value_id),
        asString(row.value),
        typeof row.parent_value_id === "number"
          ? asInteger(row.parent_value_id)
          : null,
        asNullableString(row.label),
        metadataJsonString(row)
      ]
    );
  }

  for (const row of asArray(ontology.entity_types)) {
    await context.database.query(
      `
        INSERT INTO ontology_entity_types (
          ontology_id,
          entity_type,
          label,
          metadata_json
        )
        VALUES (?, ?, ?, ?)
        ON CONFLICT(ontology_id, entity_type) DO UPDATE SET
          label = excluded.label,
          metadata_json = excluded.metadata_json
      `,
      [
        schemaId,
        asString(row.entity_type),
        asNullableString(row.label),
        metadataJsonString(row)
      ]
    );
  }

  for (const row of asArray(ontology.edge_types)) {
    await context.database.query(
      `
        INSERT INTO ontology_edge_types (
          ontology_id,
          edge_type,
          directed,
          source_entity_type,
          target_entity_type,
          metadata_json
        )
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(ontology_id, edge_type) DO UPDATE SET
          directed = excluded.directed,
          source_entity_type = excluded.source_entity_type,
          target_entity_type = excluded.target_entity_type,
          metadata_json = excluded.metadata_json
      `,
      [
        schemaId,
        asString(row.edge_type),
        row.directed === false || row.directed === 0 ? 0 : 1,
        asNullableString(row.source_entity_type),
        asNullableString(row.target_entity_type),
        metadataJsonString(row)
      ]
    );
  }

  return { ok: true };
}

export const schemaRegisterTool: ToolHandler = {
  definition: {
    name: "ghostcrab_schema_register",
    description:
      "Write. Freeze-level action: register a facet schema, graph node type, or edge label in the self-describing schema store. Never call on a first-turn fuzzy onboarding request. Only register a canonical or custom schema after a confirmed modeling gap and explicit user confirmation.",
    inputSchema: {
      type: "object",
      required: ["definition"],
      properties: {
        target: {
          type: "string",
          enum: ["facets", "graph_node", "graph_edge"],
          default: "facets"
        },
        workspace_id: {
          type: "string",
          description:
            "Target workspace id. Overrides session context for this call only."
        },
        definition: {
          type: "object",
          description:
            "Nested schema document. Put schema_id and description here only — do not place schema_id at the payload root next to target (Zod expects schema_id inside definition). Additional keys (e.g. facets, field specs) are accepted and stored with the definition (passthrough).",
          required: ["schema_id", "description"],
          additionalProperties: true,
          properties: {
            schema_id: {
              type: "string",
              minLength: 1,
              description: "Unique schema identifier (required)."
            },
            description: {
              type: "string",
              minLength: 1,
              description: "Human-readable summary of what this schema models."
            },
            version: {
              type: "number",
              description:
                "Optional integer version; handler defaults to 1 when omitted or non-integer."
            }
          }
        }
      }
    }
  },
  async handler(args, context) {
    const input = SchemaRegisterInput.parse(args);
    const effectiveWorkspaceId =
      input.workspace_id ?? context.session.workspace_id;
    const [existing] = await context.database.query<{ id: string }>(
      `
        SELECT id
        FROM ${SQLITE_FACT_STORE_TABLE}
        WHERE schema_id = 'mindbrain:schema'
          AND ${sqliteFacetJsonExtractClause("schema_id")} = ?
          AND workspace_id = ?
        LIMIT 1
      `,
      [input.definition.schema_id, effectiveWorkspaceId]
    );

    if (existing) {
      return createToolSuccessResult("ghostcrab_schema_register", {
        registered: false,
        reason:
          "Schema already exists. Inspect it first and publish a new version if needed.",
        existing_id: existing.id,
        schema_id: input.definition.schema_id
      });
    }

    const version =
      typeof input.definition.version === "number" &&
      Number.isInteger(input.definition.version)
        ? input.definition.version
        : 1;
    const { randomUUID } = await import("node:crypto");
    const id = randomUUID();

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
      [
        id,
        JSON.stringify(input.definition, null, 2),
        JSON.stringify({
          schema_id: input.definition.schema_id,
          target: input.target,
          version
        }),
        effectiveWorkspaceId
      ]
    );

    return createToolSuccessResult("ghostcrab_schema_register", {
      registered: true,
      id,
      schema_id: input.definition.schema_id
    });
  }
};

export const schemaGetTool: ToolHandler = {
  definition: {
    name: "ghostcrab_schema_get",
    description:
      "Read. Return the raw registered schema definition from the MCP schema registry only. Does not inspect native ontology_* tables or compute sync status.",
    inputSchema: {
      type: "object",
      required: ["schema_id"],
      properties: {
        schema_id: {
          type: "string"
        },
        workspace_id: {
          type: "string",
          description:
            "Target workspace id. Defaults to the current MCP session workspace."
        }
      }
    }
  },
  async handler(args, context) {
    const input = SchemaGetInput.parse(args);
    const row = await readRegistrySchema(
      context,
      input.schema_id,
      input.workspace_id
    );

    if (!row) {
      return createToolSuccessResult("ghostcrab_schema_get", {
        found: false,
        schema_id: input.schema_id,
        workspace_id: input.workspace_id ?? context.session.workspace_id
      });
    }

    return createToolSuccessResult("ghostcrab_schema_get", {
      found: true,
      schema_id: input.schema_id,
      workspace_id: row.workspace_id,
      schema: parseDefinition(row.content),
      meta: safeParseFacetJson(row.facets_json),
      id: row.id
    });
  }
};

export const schemaListTool: ToolHandler = {
  definition: {
    name: "ghostcrab_schema_list",
    description:
      "Read. List registered schemas. Use 'domain' to filter by namespace prefix and 'summary_only' to avoid a full definition dump.",
    inputSchema: {
      type: "object",
      properties: {
        target: {
          type: "string",
          enum: ["facets", "graph_node", "graph_edge", "all"],
          default: "all"
        },
        domain: {
          type: "string",
          description:
            "Filter by schema_id namespace prefix (part before ':'). Example: 'ghostcrab'."
        },
        summary_only: {
          type: "boolean",
          default: false,
          description:
            "When true, return only schema_id, description, target, and version."
        }
      }
    }
  },
  async handler(args, context) {
    const input = SchemaListInput.parse(args);
    const params: unknown[] = [];
    const whereClauses = ["schema_id = 'mindbrain:schema'"];

    if (input.target !== "all") {
      whereClauses.push(`${sqliteFacetJsonExtractClause("target")} = ?`);
      params.push(input.target);
    }

    if (input.domain) {
      whereClauses.push(`${sqliteFacetJsonExtractClause("schema_id")} LIKE ?`);
      params.push(`${input.domain}:%`);
    }

    const rows = await context.database.query<{
      content: string;
      created_at_unix: number;
      facets_json: string;
      id: string;
    }>(
      `
        SELECT id, ${SQLITE_FACTS_COLUMN} AS facets_json, content, created_at_unix
        FROM ${SQLITE_FACT_STORE_TABLE}
        WHERE ${whereClauses.join(" AND ")}
        ORDER BY created_at_unix ASC
      `,
      params
    );

    const schemas = rows.map((row) => {
      const meta = safeParseFacetJson(row.facets_json);
      const definition = parseDefinition(row.content);
      const base = {
        id: row.id,
        schema_id: String(meta.schema_id ?? ""),
        target: meta.target,
        version: meta.version
      };

      if (input.summary_only) {
        return {
          ...base,
          description:
            (definition.description as string | undefined) ??
            (meta.description as string | undefined) ??
            ""
        };
      }

      return {
        ...base,
        ...meta,
        description:
          (definition.description as string | undefined) ??
          (meta.description as string | undefined) ??
          "",
        definition
      };
    });

    const notes: string[] = [];
    if (!input.domain && !input.summary_only && schemas.length > 20) {
      notes.push(
        `Returned ${schemas.length} schemas. For a smaller payload, use domain='ghostcrab' or summary_only=true. For onboarding schemas only, call ghostcrab_onboarding_schemas.`
      );
    }

    return createToolSuccessResult("ghostcrab_schema_list", {
      target: input.target,
      domain: input.domain ?? null,
      summary_only: input.summary_only,
      total: schemas.length,
      schemas,
      ...(notes.length > 0 ? { notes } : {})
    });
  }
};

export const schemaInspectTool: ToolHandler = {
  definition: {
    name: "ghostcrab_schema_inspect",
    description: "Inspect a registered schema by its schema_id.",
    inputSchema: {
      type: "object",
      required: ["schema_id"],
      properties: {
        schema_id: {
          type: "string"
        }
      }
    }
  },
  async handler(args, context) {
    const input = SchemaInspectInput.parse(args);
    const row = await readRegistrySchema(
      context,
      input.schema_id,
      input.workspace_id
    );
    const ontology = await readOntologyView(
      context,
      input.schema_id,
      input.workspace_id ?? context.session.workspace_id
    );
    const registrySchema = row ? parseDefinition(row.content) : undefined;
    const status = syncStatus(
      input.schema_id,
      Boolean(row),
      Boolean(ontology),
      registrySchema,
      ontology
    );

    if (!row && !ontology) {
      return createToolSuccessResult("ghostcrab_schema_inspect", {
        found: false,
        schema_id: input.schema_id,
        workspace_id: input.workspace_id ?? context.session.workspace_id,
        registry_found: false,
        ontology_found: false,
        sync_status: status,
        recommended_actions: recommendedActions(status)
      });
    }

    return createToolSuccessResult("ghostcrab_schema_inspect", {
      found: true,
      schema_id: input.schema_id,
      workspace_id:
        row?.workspace_id ??
        String(
          ontology?.workspace_id ??
            input.workspace_id ??
            context.session.workspace_id
        ),
      registry_found: Boolean(row),
      ontology_found: Boolean(ontology),
      canonical_source: ontology ? "ontology" : "registry",
      sync_status: status,
      recommended_actions: recommendedActions(status),
      schema: ontology
        ? {
            schema_id: input.schema_id,
            description: ontology.name,
            ontology
          }
        : registrySchema,
      registry: row
        ? {
            id: row.id,
            schema: registrySchema,
            meta: safeParseFacetJson(row.facets_json)
          }
        : null,
      ontology,
      ...(row ? { id: row.id, meta: safeParseFacetJson(row.facets_json) } : {})
    });
  }
};

export const schemaSyncPreviewTool: ToolHandler = {
  definition: {
    name: "ghostcrab_schema_sync_preview",
    description:
      "Read. Preview registry/native ontology synchronization actions for a schema_id without mutating either store.",
    inputSchema: {
      type: "object",
      required: ["schema_id"],
      properties: {
        schema_id: { type: "string" },
        workspace_id: {
          type: "string",
          description:
            "Target workspace id. Defaults to the current MCP session workspace."
        }
      }
    }
  },
  async handler(args, context) {
    const input = SchemaSyncPreviewInput.parse(args);
    const row = await readRegistrySchema(
      context,
      input.schema_id,
      input.workspace_id
    );
    const ontology = await readOntologyView(
      context,
      input.schema_id,
      input.workspace_id ?? context.session.workspace_id
    );
    const registrySchema = row ? parseDefinition(row.content) : undefined;
    const status = syncStatus(
      input.schema_id,
      Boolean(row),
      Boolean(ontology),
      registrySchema,
      ontology
    );

    return createToolSuccessResult("ghostcrab_schema_sync_preview", {
      schema_id: input.schema_id,
      workspace_id:
        row?.workspace_id ??
        String(
          ontology?.workspace_id ??
            input.workspace_id ??
            context.session.workspace_id
        ),
      registry_found: Boolean(row),
      ontology_found: Boolean(ontology),
      sync_status: status,
      canonical_source: ontology ? "ontology" : "registry",
      actions: recommendedActions(status),
      mutates: false
    });
  }
};

export const schemaSyncApplyTool: ToolHandler = {
  definition: {
    name: "ghostcrab_schema_sync_apply",
    description:
      "Write. Apply an explicitly confirmed schema synchronization action between the MCP schema registry and native ontology_* tables. Arbitrary schema packs still require LinkML/native ontology import.",
    inputSchema: {
      type: "object",
      required: ["schema_id", "action", "confirm"],
      properties: {
        schema_id: { type: "string" },
        workspace_id: {
          type: "string",
          description:
            "Target workspace id. Defaults to the current MCP session workspace."
        },
        action: {
          type: "string",
          enum: [
            "create_registry_projection_from_ontology",
            "update_registry_projection_from_ontology",
            "create_ontology_from_registry"
          ]
        },
        confirm: {
          type: "boolean",
          default: false,
          description: "Must be true to mutate the registry projection."
        }
      }
    }
  },
  async handler(args, context) {
    const input = SchemaSyncApplyInput.parse(args);
    if (!input.confirm) {
      return createToolSuccessResult("ghostcrab_schema_sync_apply", {
        applied: false,
        reason: "confirm must be true to apply schema synchronization.",
        schema_id: input.schema_id
      });
    }

    const workspaceId = input.workspace_id ?? context.session.workspace_id;
    const ontology = await readOntologyView(
      context,
      input.schema_id,
      workspaceId
    );
    const row = await readRegistrySchema(context, input.schema_id, workspaceId);

    if (input.action === "create_ontology_from_registry") {
      if (ontology) {
        return createToolSuccessResult("ghostcrab_schema_sync_apply", {
          applied: false,
          reason: "Native ontology already exists for this schema_id.",
          schema_id: input.schema_id,
          workspace_id: workspaceId
        });
      }
      if (!row) {
        return createToolSuccessResult("ghostcrab_schema_sync_apply", {
          applied: false,
          reason: "Registry schema was not found.",
          schema_id: input.schema_id,
          workspace_id: workspaceId
        });
      }

      const registrySchema = parseDefinition(row.content);
      const created = await createOntologyFromRegistryProjection(
        context,
        input.schema_id,
        workspaceId,
        registrySchema
      );
      if (!created.ok) {
        return createToolSuccessResult("ghostcrab_schema_sync_apply", {
          applied: false,
          reason: created.reason,
          schema_id: input.schema_id,
          workspace_id: workspaceId
        });
      }

      return createToolSuccessResult("ghostcrab_schema_sync_apply", {
        applied: true,
        action: input.action,
        schema_id: input.schema_id,
        workspace_id: workspaceId
      });
    }

    if (!ontology) {
      return createToolSuccessResult("ghostcrab_schema_sync_apply", {
        applied: false,
        reason:
          "Native ontology was not found. Registry-to-ontology creation requires an explicit LinkML/ontology import workflow.",
        schema_id: input.schema_id,
        workspace_id: workspaceId
      });
    }

    const projection = ontologyProjectionDefinition(input.schema_id, ontology);
    const version =
      typeof row?.facets_json === "string"
        ? Number(safeParseFacetJson(row.facets_json).version ?? 1)
        : 1;

    if (row) {
      await context.database.query(
        `
          UPDATE ${SQLITE_FACT_STORE_TABLE}
          SET content = ?,
              ${SQLITE_FACTS_COLUMN} = ?,
              updated_at_unix = strftime('%s','now')
          WHERE id = ?
        `,
        [
          JSON.stringify(projection, null, 2),
          JSON.stringify({
            schema_id: input.schema_id,
            target: "ontology",
            version
          }),
          row.id
        ]
      );
      return createToolSuccessResult("ghostcrab_schema_sync_apply", {
        applied: true,
        action: input.action,
        schema_id: input.schema_id,
        workspace_id: workspaceId,
        updated_id: row.id
      });
    }

    const { randomUUID } = await import("node:crypto");
    const id = randomUUID();
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
      [
        id,
        JSON.stringify(projection, null, 2),
        JSON.stringify({
          schema_id: input.schema_id,
          target: "ontology",
          version: 1
        }),
        workspaceId
      ]
    );

    return createToolSuccessResult("ghostcrab_schema_sync_apply", {
      applied: true,
      action: input.action,
      schema_id: input.schema_id,
      workspace_id: workspaceId,
      id
    });
  }
};

export const schemaOnboardingTool: ToolHandler = {
  definition: {
    name: "ghostcrab_onboarding_schemas",
    description:
      "Bootstrap. Return the curated schema ids most useful during domain modeling onboarding.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  async handler(_args, context) {
    const rows = await context.database.query<{
      content: string;
      facets_json: string;
      id: string;
    }>(
      `
        SELECT id, ${SQLITE_FACTS_COLUMN} AS facets_json, content
        FROM ${SQLITE_FACT_STORE_TABLE}
        WHERE schema_id = 'mindbrain:schema'
          AND ${sqliteFacetJsonExtractClause("schema_id")} IN (${ONBOARDING_SCHEMA_IDS.map(() => "?").join(", ")})
        ORDER BY created_at_unix ASC
      `,
      [...ONBOARDING_SCHEMA_IDS]
    );

    const found = new Map<
      string,
      {
        description: string;
        id: string;
        meta: Record<string, unknown>;
      }
    >();

    for (const row of rows) {
      const meta = safeParseFacetJson(row.facets_json);
      const schemaId = String(meta.schema_id ?? "");
      if (!schemaId) {
        continue;
      }

      const parsed = parseDefinition(row.content);
      found.set(schemaId, {
        id: row.id,
        meta,
        description:
          (parsed.description as string | undefined) ??
          (meta.description as string | undefined) ??
          ""
      });
    }

    const schemas = ONBOARDING_SCHEMA_IDS.map((schemaId) => {
      const row = found.get(schemaId);
      return {
        schema_id: schemaId,
        onboarding_role: ONBOARDING_SCHEMA_ROLES[schemaId] ?? "",
        found_in_db: row !== undefined,
        id: row?.id ?? null,
        target: row?.meta.target ?? null,
        version: row?.meta.version ?? null,
        description: row?.description ?? null,
        inspect_hint: `Call ghostcrab_schema_inspect with schema_id: "${schemaId}" to inspect the full contract.`
      };
    });

    return createToolSuccessResult("ghostcrab_onboarding_schemas", {
      total: schemas.length,
      schemas,
      note: "These are the curated onboarding schemas. Inspect them individually for the full contract, then apply the matching loadout or modeling recipe."
    });
  }
};

registerTool(schemaRegisterTool);
registerTool(schemaGetTool);
registerTool(schemaListTool);
registerTool(schemaInspectTool);
registerTool(schemaSyncPreviewTool);
registerTool(schemaSyncApplyTool);
registerTool(schemaOnboardingTool);
