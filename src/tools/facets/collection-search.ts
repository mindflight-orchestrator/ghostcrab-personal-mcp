import { z } from "zod";

import { resolveGhostcrabConfig } from "../../config/env.js";
import {
  probeMindbrainCapabilities,
  runStandaloneCollectionFacetSearch
} from "../../db/standalone-mindbrain.js";
import {
  createToolSuccessResult,
  registerTool,
  type ToolHandler
} from "../registry.js";

export const CollectionFacetSearchInput = z
  .object({
    workspace_id: z.string().trim().min(1).optional(),
    collection_id: z.string().trim().min(1),
    table_id: z.coerce.number().int().positive().optional(),
    target_kind: z.enum(["doc", "chunk"]).optional(),
    doc_id: z
      .union([
        z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
        z
          .string()
          .regex(/^\d{1,20}$/)
          .refine(
            (value) =>
              /^\d{1,20}$/.test(value) &&
              BigInt(value) <= 18_446_744_073_709_551_615n
          )
      ])
      .optional(),
    chunk_index: z.coerce.number().int().min(0).max(4_294_967_295).optional(),
    ontology_id: z.string().trim().min(1).optional(),
    namespace: z.string().trim().min(1).optional(),
    dimension: z.string().trim().min(1).optional(),
    value: z.string().trim().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25)
  })
  .refine(
    (input) => input.target_kind !== "doc" || input.chunk_index === undefined,
    {
      message: "chunk_index cannot be used with target_kind=doc",
      path: ["chunk_index"]
    }
  );

export const collectionFacetSearchTool: ToolHandler = {
  definition: {
    name: "ghostcrab_collection_facet_search",
    description:
      "Read. Search collection facets for a workspace/collection. After reindex, reads Roaring bitmaps from facet_postings (namespace+dimension required). Falls back to facet_assignments_raw when postings are absent or namespace/dimension are omitted. Extended tool for collection-imported taxonomy facets (distinct from agent facets table).",
    inputSchema: {
      type: "object",
      required: ["collection_id"],
      properties: {
        workspace_id: {
          type: "string",
          description: "Target workspace id. Defaults to session workspace."
        },
        collection_id: {
          type: "string",
          description: "Collection id within the workspace."
        },
        table_id: {
          type: "integer",
          description:
            "Optional facet table id (facet_tables.table_id). When set, enables facet_postings Roaring search after reindex."
        },
        target_kind: {
          type: "string",
          enum: ["doc", "chunk"],
          description:
            "Read original document or chunk assignments. Chunk assignments retain their exact chunk_index."
        },
        doc_id: {
          type: ["integer", "string"],
          description:
            "Exact document id; use a decimal string for ids above JavaScript safe integer range."
        },
        chunk_index: { type: "integer", minimum: 0, maximum: 4294967295 },
        ontology_id: {
          type: "string",
          description: "Exact taxonomy/ontology identity owning the assignment."
        },
        namespace: {
          type: "string",
          description: "Optional ontology namespace filter."
        },
        dimension: {
          type: "string",
          description: "Optional facet dimension filter."
        },
        value: {
          type: "string",
          description: "Optional substring match on facet value."
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          default: 25
        }
      }
    }
  },
  async handler(args, context) {
    const input = CollectionFacetSearchInput.parse(args);
    const workspaceId = input.workspace_id ?? context.session.workspace_id;
    const config = resolveGhostcrabConfig();
    const hasTargetFilter =
      input.target_kind !== undefined ||
      input.doc_id !== undefined ||
      input.chunk_index !== undefined ||
      input.ontology_id !== undefined;
    // Older bundled engines cannot apply exact filters to bitmap results.
    // Keep their raw fallback until a capability advertises the native contract.
    const capabilities = hasTargetFilter
      ? await probeMindbrainCapabilities(
          config.mindbrainUrl,
          config.mindbrainHttpTimeoutMs
        )
      : null;
    if (
      hasTargetFilter &&
      !(
        capabilities?.ok &&
        capabilities.capabilities.features.collection_facet_targets
      )
    ) {
      const predicates = ["workspace_id = ?", "collection_id = ?"];
      const params: unknown[] = [workspaceId, input.collection_id];
      for (const [column, value] of [
        ["target_kind", input.target_kind],
        ["doc_id", input.doc_id],
        ["chunk_index", input.chunk_index],
        ["ontology_id", input.ontology_id],
        ["namespace", input.namespace],
        ["dimension", input.dimension]
      ] as const) {
        if (value !== undefined) {
          predicates.push(`${column} = ?`);
          // SQLite stores native u64 IDs as their signed 64-bit bit pattern.
          params.push(
            column === "doc_id" && typeof value === "string"
              ? BigInt.asIntN(64, BigInt(value)).toString()
              : value
          );
        }
      }
      if (input.chunk_index !== undefined)
        predicates.push("target_kind = 'chunk'");
      if (input.value !== undefined) {
        predicates.push("value LIKE ?");
        params.push(`%${input.value}%`);
      }
      const rows = await context.database.query<Record<string, unknown>>(
        `
        SELECT workspace_id, collection_id, target_kind, ontology_id,
               CAST(doc_id AS TEXT) AS doc_id,
               CASE WHEN target_kind = 'chunk' THEN chunk_index ELSE NULL END AS chunk_index,
               namespace, dimension, value, weight, source AS assignment_source
        FROM facet_assignments_raw
        WHERE ${predicates.join(" AND ")}
        ORDER BY weight DESC, facet_assignments_raw.doc_id, chunk_index, ontology_id, namespace, dimension, value
        LIMIT ?
      `,
        [...params, input.limit]
      );
      const matches = rows.map((row) => ({
        ...row,
        doc_id: BigInt.asUintN(64, BigInt(String(row.doc_id))).toString()
      }));
      return createToolSuccessResult("ghostcrab_collection_facet_search", {
        workspace_id: workspaceId,
        collection_id: input.collection_id,
        target_kind: input.target_kind ?? null,
        doc_id: input.doc_id ?? null,
        chunk_index: input.chunk_index ?? null,
        ontology_id: input.ontology_id ?? null,
        namespace: input.namespace ?? null,
        dimension: input.dimension ?? null,
        value: input.value ?? null,
        returned: matches.length,
        matches,
        source: "facet_assignments_raw"
      });
    }

    const result = await runStandaloneCollectionFacetSearch({
      mindbrainUrl: config.mindbrainUrl,
      timeoutMs: config.mindbrainHttpTimeoutMs,
      workspaceId,
      collectionId: input.collection_id,
      tableId: input.table_id,
      targetKind: input.target_kind,
      docId: input.doc_id,
      chunkIndex: input.chunk_index,
      ontologyId: input.ontology_id,
      namespace: input.namespace,
      dimension: input.dimension,
      value: input.value,
      limit: input.limit
    });

    return createToolSuccessResult("ghostcrab_collection_facet_search", {
      workspace_id: workspaceId,
      collection_id: input.collection_id,
      namespace: input.namespace ?? null,
      dimension: input.dimension ?? null,
      value: input.value ?? null,
      returned: result.returned,
      matches: result.matches,
      source: result.source
    });
  }
};

registerTool(collectionFacetSearchTool);
