import { z } from "zod";

import { resolveGhostcrabConfig } from "../../config/env.js";
import { runSqlGraphReindex } from "../../db/graph-reindex-sql.js";
import { runStandaloneReindexGraph } from "../../db/standalone-mindbrain.js";
import {
  createToolErrorFromException,
  createToolErrorResult,
  createToolSuccessResult,
  registerTool,
  type ToolHandler
} from "../registry.js";

export const GraphReindexInput = z.object({
  workspace_id: z.string().trim().min(1).optional(),
  document_table_id: z.coerce.number().int().positive().optional(),
  include_document_links: z.boolean().default(true),
  include_chunk_links: z.boolean().default(true)
});

export const graphReindexTool: ToolHandler = {
  definition: {
    name: "ghostcrab_graph_reindex",
    description:
      "Write. Rebuild derived graph_entity, graph_relation, graph_entity_document, and graph_entity_chunk rows from MindBrain raw collection graph tables for a workspace. Prefers native MindBrain reindex (includes adjacency rebuild) with SQL fallback.",
    inputSchema: {
      type: "object",
      properties: {
        workspace_id: {
          type: "string",
          description:
            "Target workspace id. Overrides session context for this call only."
        },
        document_table_id: {
          type: "integer",
          minimum: 1,
          description:
            "Optional facet table_id used when projecting entity_documents_raw into graph_entity_document."
        },
        include_document_links: {
          type: "boolean",
          default: true,
          description:
            "When true and document_table_id is provided, rebuild graph_entity_document links for the workspace."
        },
        include_chunk_links: {
          type: "boolean",
          default: true,
          description:
            "When true, rebuild graph_entity_chunk links for the workspace."
        }
      }
    }
  },
  async handler(args, context) {
    const input = GraphReindexInput.parse(args);
    const workspaceId = input.workspace_id ?? context.session.workspace_id;
    const config = resolveGhostcrabConfig();

    try {
      const native = await runStandaloneReindexGraph({
        mindbrainUrl: config.mindbrainUrl,
        timeoutMs: config.mindbrainHttpTimeoutMs,
        workspaceId,
        documentTableId: input.document_table_id
      });

      return createToolSuccessResult("ghostcrab_graph_reindex", {
        workspace_id: workspaceId,
        document_table_id: input.document_table_id ?? null,
        include_document_links: input.include_document_links,
        include_chunk_links: input.include_chunk_links,
        backend: "mindbrain/reindex/graph",
        projected_count: native.projected_count,
        adjacency_rebuilt: native.adjacency_rebuilt ?? true,
        entity_count: null,
        alias_count: null,
        relation_count: null,
        relation_property_count: null,
        document_link_count: null,
        chunk_link_count: null
      });
    } catch (error) {
      if (!shouldFallbackToSqlReindex(error)) {
        return createToolErrorFromException(
          "ghostcrab_graph_reindex",
          error,
          "backend_reindex_failed",
          "native graph reindex failed"
        );
      }

      const report = await context.database.transaction(async (database) =>
        runSqlGraphReindex(database, {
          workspaceId,
          documentTableId: input.document_table_id,
          includeDocumentLinks: input.include_document_links,
          includeChunkLinks: input.include_chunk_links
        })
      );

      return createToolSuccessResult("ghostcrab_graph_reindex", {
        workspace_id: workspaceId,
        document_table_id: input.document_table_id ?? null,
        include_document_links: input.include_document_links,
        include_chunk_links: input.include_chunk_links,
        backend: "sql",
        adjacency_rebuilt: false,
        warnings: [
          "SQL fallback reindex did not rebuild graph_lj_out/graph_lj_in; graph_path and graph_subgraph may be stale until native reindex succeeds."
        ],
        ...report,
        projected_count:
          report.entity_count +
          report.alias_count +
          report.relation_count +
          report.relation_property_count +
          report.document_link_count +
          report.chunk_link_count
      });
    }
  }
};

registerTool(graphReindexTool);

function shouldFallbackToSqlReindex(error: unknown): boolean {
  const cause =
    error instanceof Error &&
    error.cause &&
    typeof error.cause === "object"
      ? (error.cause as { status?: unknown })
      : null;
  const status = typeof cause?.status === "number" ? cause.status : null;
  if (status !== null) {
    return status === 404 || status === 405;
  }

  if (!(error instanceof Error)) {
    return true;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("fetch failed") ||
    message.includes("failed to fetch") ||
    message.includes("econnrefused") ||
    message.includes("backend unavailable")
  );
}
