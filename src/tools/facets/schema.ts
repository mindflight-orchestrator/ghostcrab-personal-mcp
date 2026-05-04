import { z } from "zod";

import {
  SQLITE_FACT_STORE_TABLE,
  SQLITE_FACTS_COLUMN,
  safeParseFacetJson,
  sqliteFacetJsonExtractClause
} from "../../db/fact-store.js";
import {
  createToolSuccessResult,
  registerTool,
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
  schema_id: z.string().min(1)
});

function parseDefinition(content: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(content);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
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
          description: "Target workspace id. Overrides session context for this call only."
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
    const effectiveWorkspaceId = input.workspace_id ?? context.session.workspace_id;
    const [existing] = await context.database.query<{ id: string }>(
      `
        SELECT id
        FROM ${SQLITE_FACT_STORE_TABLE}
        WHERE schema_id = 'mindbrain:schema'
          AND ${sqliteFacetJsonExtractClause("schema_id")} = ?
        LIMIT 1
      `,
      [input.definition.schema_id]
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
    const [docIdRow] = await context.database.query<{ next_doc_id: number }>(
      `SELECT COALESCE(MAX(doc_id), 0) + 1 AS next_doc_id FROM ${SQLITE_FACT_STORE_TABLE}`
    );

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
        VALUES (?, 'mindbrain:schema', ?, ?, ?, ?, strftime('%s','now'), strftime('%s','now'))
      `,
      [
        id,
        JSON.stringify(input.definition, null, 2),
        JSON.stringify({
          schema_id: input.definition.schema_id,
          target: input.target,
          version
        }),
        effectiveWorkspaceId,
        Number(docIdRow?.next_doc_id ?? 1)
      ]
    );

    return createToolSuccessResult("ghostcrab_schema_register", {
      registered: true,
      id,
      schema_id: input.definition.schema_id
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
    const [row] = await context.database.query<{
      content: string;
      facets_json: string;
      id: string;
    }>(
      `
        SELECT id, content, ${SQLITE_FACTS_COLUMN} AS facets_json
        FROM ${SQLITE_FACT_STORE_TABLE}
        WHERE schema_id = 'mindbrain:schema'
          AND ${sqliteFacetJsonExtractClause("schema_id")} = ?
        LIMIT 1
      `,
      [input.schema_id]
    );

    if (!row) {
      return createToolSuccessResult("ghostcrab_schema_inspect", {
        found: false,
        schema_id: input.schema_id
      });
    }

    return createToolSuccessResult("ghostcrab_schema_inspect", {
      found: true,
      schema_id: input.schema_id,
      schema: parseDefinition(row.content),
      meta: safeParseFacetJson(row.facets_json),
      id: row.id
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
      note:
        "These are the curated onboarding schemas. Inspect them individually for the full contract, then apply the matching loadout or modeling recipe."
    });
  }
};

registerTool(schemaRegisterTool);
registerTool(schemaListTool);
registerTool(schemaInspectTool);
registerTool(schemaOnboardingTool);
