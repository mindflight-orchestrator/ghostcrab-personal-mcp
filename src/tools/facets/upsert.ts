import { z } from "zod";
import { randomUUID } from "node:crypto";

import { SQLITE_NEXT_FACT_DOC_ID_EXPR } from "../../db/fact-store.js";
import { encodeEmbedding } from "../../embeddings/blob.js";
import {
  createToolErrorResult,
  createToolSuccessResult,
  registerTool,
  type ToolHandler
} from "../registry.js";

const isoDateSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}$/,
    "valid_until must be an ISO date in YYYY-MM-DD format."
  );

export const UpsertInput = z
  .object({
    schema_id: z.string().min(1),
    workspace_id: z.string().min(1).optional(),
    match: z
      .object({
        id: z.string().uuid().optional(),
        facets: z.record(z.string(), z.unknown()).default({})
      })
      .strict()
      .refine(
        (value) =>
          value.id !== undefined || Object.keys(value.facets).length > 0,
        "match must include id and/or at least one exact facet filter."
      ),
    set_content: z.string().trim().min(1).optional(),
    set_facets: z.record(z.string(), z.unknown()).default({}),
    created_by: z.string().min(1).optional(),
    valid_until: z.union([isoDateSchema, z.null()]).optional(),
    create_if_missing: z.boolean().default(false)
  })
  .strict()
  .refine(
    (value) =>
      value.set_content !== undefined ||
      Object.keys(value.set_facets).length > 0 ||
      value.valid_until !== undefined,
    "Provide at least one mutation via set_content, set_facets, or valid_until."
  );

export const upsertTool: ToolHandler = {
  definition: {
    name: "ghostcrab_upsert",
    description:
      'Write. Update current-state facts in place by exact match, or create if missing. Read before writing. Before replacing meaningful tracker state, preserve transition rationale when losing it would hurt recovery. Do not use on a first-turn fuzzy onboarding request. match uses match.id (row UUID) and/or match.facets; facet selectors must live under match.facets, not at the root of match (wrong: {"match":{"label":"X"}}; right: {"match":{"facets":{"label":"X"}}}). Prefer a stable record_id in match.facets over labels that may change. When create_if_missing is true and no row matches, set_content is required for the new row.',
    inputSchema: {
      type: "object",
      required: ["schema_id", "match"],
      properties: {
        schema_id: {
          type: "string",
          description: "Logical record family to update."
        },
        workspace_id: {
          type: "string",
          description:
            "Target workspace id. Overrides session context for this call only."
        },
        match: {
          type: "object",
          description:
            'Exact match selector. Must include at least one of: id (row UUID from a prior write) or facets (non-empty object). All facet keys used for matching must appear under match.facets — do not put them at the root of match (e.g. use {"facets":{"label":"Deal A"}} not {"label":"Deal A"}). Multiple facet entries are ANDed via JSONB containment.',
          properties: {
            id: {
              type: "string",
              format: "uuid",
              description:
                "Database row id (UUID) when already known from ghostcrab_remember or a previous upsert response."
            },
            facets: {
              type: "object",
              additionalProperties: true,
              description:
                'Exact facet key-value pairs that the stored row must contain. Example: {"record_id":"opp:nexum-abm"} or {"label":"Plateforme ABM"}. Prefer a dedicated stable record_id facet over free-text labels when possible.'
            }
          },
          additionalProperties: false
        },
        set_content: {
          type: "string",
          description: "Replacement content for the current-state record."
        },
        set_facets: {
          type: "object",
          description:
            "Facet keys to merge into the current-state record. New keys overwrite old keys.",
          additionalProperties: true
        },
        created_by: {
          type: "string",
          description:
            "Optional actor label for the update or create operation."
        },
        valid_until: {
          type: ["string", "null"],
          description:
            "Optional expiry date in YYYY-MM-DD format, or null to clear it."
        },
        create_if_missing: {
          type: "boolean",
          default: false,
          description: "When true, create the record if no exact match exists."
        }
      }
    }
  },
  async handler(args, context) {
    const input = UpsertInput.parse(args);
    const effectiveWorkspaceId =
      input.workspace_id ?? context.session.workspace_id;
    let embeddingRuntime = context.embeddings.getStatus();
    const notes: string[] = [];

    const result = await context.database.transaction(async (queryable) => {
      const candidates = await queryable.query<{
        content: string;
        created_at_unix: number;
        created_by: string | null;
        facets_json: string;
        id: string;
        valid_until_unix: number | null;
        version: number;
      }>(
        `
          SELECT
            id,
            content,
            facets_json,
            created_by,
            valid_until_unix,
            created_at_unix,
            version
          FROM facets
          WHERE schema_id = ?
            AND workspace_id = ?
          ORDER BY updated_at_unix DESC, created_at_unix DESC
        `,
        [input.schema_id, effectiveWorkspaceId]
      );

      const existing = candidates.find((row) => {
        if (input.match.id && row.id !== input.match.id) {
          return false;
        }

        const parsedFacets = safeParseJsonObject(row.facets_json);
        return Object.entries(input.match.facets).every(
          ([key, value]) => parsedFacets[key] === value
        );
      });

      if (!existing && !input.create_if_missing) {
        return {
          kind: "error" as const,
          result: createToolErrorResult(
            "ghostcrab_upsert",
            "No existing record matched schema_id plus the provided exact selector.",
            "record_not_found",
            {
              schema_id: input.schema_id,
              match: input.match
            }
          )
        };
      }

      if (!existing && input.set_content === undefined) {
        return {
          kind: "error" as const,
          result: createToolErrorResult(
            "ghostcrab_upsert",
            "set_content is required when create_if_missing=true and no record matched.",
            "missing_create_content",
            {
              schema_id: input.schema_id,
              match: input.match
            }
          )
        };
      }

      const existingFacets = existing
        ? safeParseJsonObject(existing.facets_json)
        : {};
      const nextContent = input.set_content ?? existing?.content ?? "";
      const nextFacets = {
        ...existingFacets,
        ...input.match.facets,
        ...input.set_facets
      };
      const nextCreatedBy = input.created_by ?? existing?.created_by ?? null;
      const nextValidUntilUnix =
        input.valid_until !== undefined
          ? input.valid_until === null
            ? null
            : Math.floor(Date.parse(`${input.valid_until}T00:00:00Z`) / 1000)
          : (existing?.valid_until_unix ?? null);

      let embeddingStored = false;
      let embeddingValue: string | null = null;
      const contentChanged =
        input.set_content !== undefined &&
        input.set_content !== (existing?.content ?? null);

      if (contentChanged && embeddingRuntime.writeEmbeddingsEnabled) {
        try {
          const [embedding] = await context.embeddings.embedMany([nextContent]);
          if (embedding.length > 0) {
            embeddingValue = encodeEmbedding(embedding);
            embeddingStored = true;
          }
        } catch (error) {
          embeddingRuntime = context.embeddings.getStatus();
          notes.push(
            `Embeddings write skipped during upsert: ${error instanceof Error ? error.message : "Unknown embeddings error"}`
          );
        }
      } else if (contentChanged) {
        notes.push(
          "Content changed while embeddings writes were unavailable. Existing embedding was cleared to avoid stale semantic state."
        );
      }

      if (existing) {
        const nowUnix = Math.floor(Date.now() / 1000);
        await queryable.query(
          `
            UPDATE facets
            SET content = ?,
                facets_json = ?,
                embedding_blob = ?,
                created_by = ?,
                valid_until_unix = ?,
                updated_at_unix = ?,
                version = version + 1
            WHERE id = ?
          `,
          [
            nextContent,
            JSON.stringify(nextFacets),
            contentChanged ? embeddingValue : null,
            nextCreatedBy,
            nextValidUntilUnix,
            nowUnix,
            existing.id
          ]
        );

        const [updated] = await queryable.query<{
          id: string;
          updated_at_unix: number;
          version: number;
        }>(
          `
            SELECT id, updated_at_unix, version
            FROM facets
            WHERE id = ?
          `,
          [existing.id]
        );

        return {
          kind: "success" as const,
          result: createToolSuccessResult("ghostcrab_upsert", {
            updated: true,
            created: false,
            matched_existing: true,
            id: updated.id,
            schema_id: input.schema_id,
            match: input.match,
            embedding_runtime: embeddingRuntime,
            embedding_stored: embeddingStored,
            updated_at: new Date(
              Number(updated.updated_at_unix) * 1000
            ).toISOString(),
            version: updated.version,
            notes
          })
        };
      }

      const nowUnix = Math.floor(Date.now() / 1000);
      const id = randomUUID();

      await queryable.query(
        `
          INSERT INTO facets (
            id,
            schema_id,
            content,
            facets_json,
            embedding_blob,
            created_by,
            created_at_unix,
            updated_at_unix,
            valid_until_unix,
            version,
            doc_id,
            workspace_id
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ${SQLITE_NEXT_FACT_DOC_ID_EXPR}, ?)
        `,
        [
          id,
          input.schema_id,
          nextContent,
          JSON.stringify(nextFacets),
          embeddingValue,
          nextCreatedBy,
          nowUnix,
          nowUnix,
          nextValidUntilUnix,
          effectiveWorkspaceId
        ]
      );

      return {
        kind: "success" as const,
        result: createToolSuccessResult("ghostcrab_upsert", {
          updated: false,
          created: true,
          matched_existing: false,
          id,
          schema_id: input.schema_id,
          match: input.match,
          embedding_runtime: embeddingRuntime,
          embedding_stored: embeddingStored,
          created_at: new Date(nowUnix * 1000).toISOString(),
          version: 1,
          notes
        })
      };
    });

    return result.result;
  }
};

registerTool(upsertTool);

function safeParseJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
