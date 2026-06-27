import { z } from "zod";

import {
  createToolSuccessResult,
  registerTool,
  type ToolHandler
} from "../registry.js";

export const OntologyListInput = z.object({
  workspace_id: z.string().trim().min(1).optional(),
  domain: z.string().trim().min(1).optional(),
  summary_only: z.boolean().default(false)
});

function parseMetadata(value: string | null | undefined): Record<string, unknown> {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export const ontologyListTool: ToolHandler = {
  definition: {
    name: "ghostcrab_ontology_list",
    description:
      "Read. List imported native ontologies. Use domain to filter ontology_id namespace prefix.",
    inputSchema: {
      type: "object",
      properties: {
        workspace_id: {
          type: "string",
          description:
            "Optional workspace id override. Defaults to the active MCP workspace."
        },
        domain: {
          type: "string",
          description:
            "Optional ontology namespace filter by ontology_id prefix (part before '::'). Example: 'serenity'."
        },
        summary_only: {
          type: "boolean",
          default: false,
          description:
            "When true, return only ontology_id, workspace_id, name, source_kind, and version."
        }
      }
    }
  },
  async handler(args, context) {
    const input = OntologyListInput.parse(args);
    const effectiveWorkspaceId = input.workspace_id ?? context.session.workspace_id;

    const params: unknown[] = [effectiveWorkspaceId];
    const whereClauses = ["workspace_id = ?"];

    if (input.domain) {
      whereClauses.push("ontology_id LIKE ?");
      params.push(`${input.domain}::%`);
    }

    const rows = await context.database.query<{
      ontology_id: string;
      workspace_id: string;
      name: string;
      version: string;
      source_kind: string;
      frozen: number;
      metadata_json: string;
      created_at: string;
    }>(
      `
        SELECT ontology_id, workspace_id, name, version, source_kind, frozen,
               metadata_json, created_at
        FROM ontologies
        WHERE ${whereClauses.join(" AND ")}
        ORDER BY ontology_id ASC
      `,
      params
    );

    const ontologies = rows.map((row) => {
      const base = {
        ontology_id: row.ontology_id,
        workspace_id: row.workspace_id,
        name: row.name,
        version: row.version,
        source_kind: row.source_kind,
        frozen: Boolean(row.frozen)
      };

      if (input.summary_only) {
        return base;
      }

      return {
        ...base,
        created_at: row.created_at,
        metadata: parseMetadata(row.metadata_json)
      };
    });

    return createToolSuccessResult("ghostcrab_ontology_list", {
      workspace_id: effectiveWorkspaceId,
      domain: input.domain ?? null,
      summary_only: input.summary_only,
      total: ontologies.length,
      ontologies
    });
  }
};

registerTool(ontologyListTool);
