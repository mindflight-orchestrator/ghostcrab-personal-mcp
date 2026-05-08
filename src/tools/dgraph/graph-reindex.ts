import { z } from "zod";

import {
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
      "Write. Rebuild derived graph_entity, graph_relation, graph_entity_document, and graph_entity_chunk rows from MindBrain raw collection graph tables for a workspace.",
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

    const report = await context.database.transaction(async (database) => {
      const [{ count: entityCount } = { count: 0 }] = await database.query<{
        count: number;
      }>(
        `
          SELECT COUNT(*) AS count
          FROM entities_raw
          WHERE workspace_id = ?
        `,
        [workspaceId]
      );

      const [{ count: aliasCount } = { count: 0 }] = await database.query<{
        count: number;
      }>(
        `
          SELECT COUNT(*) AS count
          FROM entity_aliases_raw
          WHERE workspace_id = ?
        `,
        [workspaceId]
      );

      const [{ count: relationCount } = { count: 0 }] = await database.query<{
        count: number;
      }>(
        `
          SELECT COUNT(*) AS count
          FROM relations_raw
          WHERE workspace_id = ?
        `,
        [workspaceId]
      );

      await database.query(
        `
          INSERT OR REPLACE INTO graph_entity (
            entity_id,
            workspace_id,
            entity_type,
            name,
            confidence,
            metadata_json,
            deprecated_at
          )
          SELECT
            entity_id,
            workspace_id,
            entity_type,
            name,
            confidence,
            metadata_json,
            NULL
          FROM entities_raw
          WHERE workspace_id = ?
        `,
        [workspaceId]
      );

      await database.query(
        `
          INSERT OR REPLACE INTO graph_entity_alias (term, entity_id, confidence)
          SELECT term, entity_id, confidence
          FROM entity_aliases_raw
          WHERE workspace_id = ?
        `,
        [workspaceId]
      );

      await database.query(
        `
          INSERT OR REPLACE INTO graph_relation (
            relation_id,
            workspace_id,
            relation_type,
            source_id,
            target_id,
            valid_from_unix,
            valid_to_unix,
            confidence,
            metadata_json,
            deprecated_at
          )
          SELECT
            relation_id,
            workspace_id,
            edge_type,
            source_entity_id,
            target_entity_id,
            unixepoch(valid_from),
            unixepoch(valid_to),
            confidence,
            metadata_json,
            NULL
          FROM relations_raw
          WHERE workspace_id = ?
        `,
        [workspaceId]
      );

      let documentLinkCount = 0;
      if (
        input.include_document_links &&
        input.document_table_id !== undefined
      ) {
        await database.query(
          `
            DELETE FROM graph_entity_document
            WHERE table_id = ?
              AND entity_id IN (
                SELECT entity_id
                FROM graph_entity
                WHERE workspace_id = ?
              )
          `,
          [input.document_table_id, workspaceId]
        );

        const [{ count = 0 } = { count: 0 }] = await database.query<{
          count: number;
        }>(
          `
            SELECT COUNT(*) AS count
            FROM (
              SELECT entity_id, doc_id
              FROM entity_documents_raw
              WHERE workspace_id = ?
              GROUP BY entity_id, doc_id
            )
          `,
          [workspaceId]
        );
        documentLinkCount = Number(count);

        await database.query(
          `
            INSERT OR REPLACE INTO graph_entity_document (
              entity_id,
              doc_id,
              table_id,
              role,
              confidence
            )
            SELECT
              entity_id,
              doc_id,
              ?,
              role,
              MAX(confidence)
            FROM entity_documents_raw
            WHERE workspace_id = ?
            GROUP BY entity_id, doc_id
          `,
          [input.document_table_id, workspaceId]
        );
      }

      let chunkLinkCount = 0;
      if (input.include_chunk_links) {
        await database.query(
          `
            DELETE FROM graph_entity_chunk
            WHERE workspace_id = ?
          `,
          [workspaceId]
        );

        const [{ count = 0 } = { count: 0 }] = await database.query<{
          count: number;
        }>(
          `
            SELECT COUNT(*) AS count
            FROM (
              SELECT entity_id, collection_id, doc_id, chunk_index
              FROM entity_chunks_raw
              WHERE workspace_id = ?
              GROUP BY entity_id, collection_id, doc_id, chunk_index
            )
          `,
          [workspaceId]
        );
        chunkLinkCount = Number(count);

        await database.query(
          `
            INSERT OR REPLACE INTO graph_entity_chunk (
              entity_id,
              workspace_id,
              collection_id,
              doc_id,
              chunk_index,
              role,
              confidence,
              metadata_json
            )
            SELECT
              entity_id,
              workspace_id,
              collection_id,
              doc_id,
              chunk_index,
              role,
              MAX(confidence),
              '{}'
            FROM entity_chunks_raw
            WHERE workspace_id = ?
            GROUP BY entity_id, collection_id, doc_id, chunk_index
          `,
          [workspaceId]
        );
      }

      return {
        entity_count: Number(entityCount),
        alias_count: Number(aliasCount),
        relation_count: Number(relationCount),
        document_link_count: documentLinkCount,
        chunk_link_count: chunkLinkCount
      };
    });

    return createToolSuccessResult("ghostcrab_graph_reindex", {
      workspace_id: workspaceId,
      document_table_id: input.document_table_id ?? null,
      include_document_links: input.include_document_links,
      include_chunk_links: input.include_chunk_links,
      backend: "sql",
      ...report,
      projected_count:
        report.entity_count +
        report.alias_count +
        report.relation_count +
        report.document_link_count +
        report.chunk_link_count
    });
  }
};

registerTool(graphReindexTool);
