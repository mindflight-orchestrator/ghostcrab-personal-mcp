import { randomUUID } from "node:crypto";

import { z } from "zod";

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
  definition: schemaDefinitionInput
});

export const SchemaListInput = z.object({
  target: z.enum(["facets", "graph_node", "graph_edge", "all"]).default("all")
});

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
      "Register a new facet schema, graph node type, or graph edge label in the self-describing schema store.",
    inputSchema: {
      type: "object",
      required: ["definition"],
      properties: {
        target: {
          type: "string",
          enum: ["facets", "graph_node", "graph_edge"],
          default: "facets"
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
    if (context.database.kind === "sqlite") {
      const [existing] = await context.database.query<{ id: string }>(
        `
          SELECT id
          FROM mfo_facets
          WHERE schema_id = 'mfo:schema'
            AND json_extract(facets_json, '$.schema_id') = ?
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
      const id = randomUUID();
      const [docIdRow] = await context.database.query<{ next_doc_id: number }>(
        `SELECT COALESCE(MAX(doc_id), 0) + 1 AS next_doc_id FROM mfo_facets`
      );

      await context.database.query(
        `
          INSERT INTO mfo_facets (
            id,
            schema_id,
            content,
            facets_json,
            workspace_id,
            doc_id
          )
          VALUES (?, 'mfo:schema', ?, ?, 'default', ?)
        `,
        [
          id,
          JSON.stringify(input.definition, null, 2),
          JSON.stringify({
            schema_id: input.definition.schema_id,
            target: input.target,
            version
          }),
          Number(docIdRow?.next_doc_id ?? 1)
        ]
      );

      return createToolSuccessResult("ghostcrab_schema_register", {
        registered: true,
        id,
        schema_id: input.definition.schema_id
      });
    }

    const [existing] = await context.database.query<{ id: string }>(
      `
        SELECT id
        FROM mfo_facets
        WHERE schema_id = 'mfo:schema'
          AND facets @> $1::jsonb
        LIMIT 1
      `,
      [JSON.stringify({ schema_id: input.definition.schema_id })]
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

    const [row] = await context.database.query<{ id: string }>(
      `
        INSERT INTO mfo_facets (schema_id, content, facets)
        VALUES ('mfo:schema', $1, $2::jsonb)
        RETURNING id
      `,
      [
        JSON.stringify(input.definition, null, 2),
        JSON.stringify({
          schema_id: input.definition.schema_id,
          target: input.target,
          version
        })
      ]
    );

    if (!row?.id) {
      throw new Error(
        "INSERT returned no row — possible constraint violation"
      );
    }

    return createToolSuccessResult("ghostcrab_schema_register", {
      registered: true,
      id: row.id,
      schema_id: input.definition.schema_id
    });
  }
};

export const schemaListTool: ToolHandler = {
  definition: {
    name: "ghostcrab_schema_list",
    description:
      "List all registered schemas stored in the self-describing schema store.",
    inputSchema: {
      type: "object",
      properties: {
        target: {
          type: "string",
          enum: ["facets", "graph_node", "graph_edge", "all"],
          default: "all"
        }
      }
    }
  },
  async handler(args, context) {
    const input = SchemaListInput.parse(args);
    if (context.database.kind === "sqlite") {
      const params: unknown[] = [];
      const whereClauses = ["schema_id = 'mfo:schema'"];

      if (input.target !== "all") {
        params.push(input.target);
        whereClauses.push(`json_extract(facets_json, '$.target') = ?`);
      }

      const rows = await context.database.query<{
        content: string;
        created_at_unix: number;
        facets_json: string;
        id: string;
      }>(
        `
          SELECT id, facets_json, content, created_at_unix
          FROM mfo_facets
          WHERE ${whereClauses.join(" AND ")}
          ORDER BY created_at_unix ASC
        `,
        params
      );

      return createToolSuccessResult("ghostcrab_schema_list", {
        target: input.target,
        schemas: rows.map((row) => ({
          id: row.id,
          ...parseDefinition(row.facets_json),
          definition: parseDefinition(row.content)
        }))
      });
    }

    const params: unknown[] = [];
    const whereClauses = ["schema_id = 'mfo:schema'"];

    if (input.target !== "all") {
      params.push(JSON.stringify({ target: input.target }));
      whereClauses.push(`facets @> $${params.length}::jsonb`);
    }

    const rows = await context.database.query<{
      content: string;
      created_at: string;
      facets: Record<string, unknown>;
      id: string;
    }>(
      `
        SELECT id, facets, content, created_at
        FROM mfo_facets
        WHERE ${whereClauses.join(" AND ")}
        ORDER BY created_at ASC
      `,
      params
    );

    return createToolSuccessResult("ghostcrab_schema_list", {
      target: input.target,
      schemas: rows.map((row) => ({
        id: row.id,
        ...row.facets,
        definition: parseDefinition(row.content)
      }))
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
    if (context.database.kind === "sqlite") {
      const [row] = await context.database.query<{
        content: string;
        facets_json: string;
        id: string;
      }>(
        `
          SELECT id, content, facets_json
          FROM mfo_facets
          WHERE schema_id = 'mfo:schema'
            AND json_extract(facets_json, '$.schema_id') = ?
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
        meta: parseDefinition(row.facets_json),
        id: row.id
      });
    }

    const [row] = await context.database.query<{
      content: string;
      facets: Record<string, unknown>;
      id: string;
    }>(
      `
        SELECT id, content, facets
        FROM mfo_facets
        WHERE schema_id = 'mfo:schema'
          AND facets @> $1::jsonb
        LIMIT 1
      `,
      [JSON.stringify({ schema_id: input.schema_id })]
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
      meta: row.facets,
      id: row.id
    });
  }
};

registerTool(schemaRegisterTool);
registerTool(schemaListTool);
registerTool(schemaInspectTool);
