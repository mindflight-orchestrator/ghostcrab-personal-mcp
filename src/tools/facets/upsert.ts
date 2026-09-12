import { isNativeFactIndexOwned } from "../../runtime/facets-fts-state.js";
import { reconcileWorkspaceFacts } from "../../db/native-facts-maintenance.js";
import { z } from "zod";
import { randomUUID } from "node:crypto";

import { resolveGhostcrabConfig } from "../../config/env.js";
import { canonicalJsonHash } from "../../db/canonical-json.js";
import {
  FACETS_SEARCH_TABLE_ID,
  SQLITE_FACT_STORE_TABLE,
  SQLITE_NEXT_FACT_DOC_ID_EXPR
} from "../../db/fact-store.js";
import {
  ARCHIVE_CLOSE_UNIX_EXPR,
  OPEN_FACT_ROW_SQL
} from "../../db/temporal.js";
import { encodeEmbedding } from "../../embeddings/blob.js";
import { runStandaloneSearchEmbeddingUpsert } from "../../db/standalone-mindbrain.js";
import {
  createToolErrorResult,
  createToolSuccessResult,
  registerTool,
  type ToolHandler
} from "../registry.js";

const isoDate = (field: string) =>
  z
    .string()
    .regex(
      /^\d{4}-\d{2}-\d{2}$/,
      `${field} must be an ISO date in YYYY-MM-DD format.`
    );

const isoDateSchema = isoDate("valid_until");

/** Stable stringify so a facet reorder is not mistaken for a state change. */
function facetsFingerprint(facets: Record<string, unknown>): string {
  return JSON.stringify(
    Object.keys(facets)
      .sort()
      .map((key) => [key, facets[key]])
  );
}

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
    valid_from: isoDate("valid_from").optional(),
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
      'Write. Update current-state facts in place by exact match, or create if missing. Read before writing. The row keeps its id across updates, and the state it replaces is archived automatically as a closed row that the current row supersedes, so transition history is preserved without any extra call. Do not use on a first-turn fuzzy onboarding request. match uses match.id (row UUID) and/or match.facets; facet selectors must live under match.facets, not at the root of match (wrong: {"match":{"label":"X"}}; right: {"match":{"facets":{"label":"X"}}}). Prefer a stable record_id in match.facets over labels that may change. When create_if_missing is true and no row matches, set_content is required for the new row.',
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
        valid_from: {
          type: "string",
          description:
            "Optional start of validity in YYYY-MM-DD format, applied only when creating a new record. Ignored on an update: rewriting the start date of an existing record would falsify its history."
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

    let pendingEmbeddingSync: { docId: number; embedding: number[] } | null =
      null;

    // Selector split. Scalar values on plain keys become SQL so the scan is
    // bounded by the store rather than by JavaScript memory; everything else
    // is compared in the caller, canonically — which is also what fixes the
    // old `===` test that could never match an object or an array.
    //
    // A key only reaches the SQL side when it is a bare identifier. The JSON
    // path is spliced into the statement, so restricting the charset is what
    // makes that safe; and a dotted key such as `administrative.formule_service`
    // would otherwise read as a nested path instead of the top-level key it is.
    const PLAIN_FACET_KEY = /^[A-Za-z0-9_]+$/;
    const sqlFacetClauses: string[] = [];
    const sqlFacetParams: unknown[] = [];
    const residualFacets: Array<[string, unknown]> = [];
    for (const [key, value] of Object.entries(input.match.facets)) {
      const scalar =
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean";
      if (!scalar || !PLAIN_FACET_KEY.test(key)) {
        residualFacets.push([key, value]);
        continue;
      }
      sqlFacetClauses.push(`json_extract(facets_json, '$.${key}') = ?`);
      // json_extract renders JSON booleans as 0/1.
      sqlFacetParams.push(typeof value === "boolean" ? (value ? 1 : 0) : value);
    }

    const result = await context.database.transaction(async (queryable) => {
      const candidates = await queryable.query<{
        content: string;
        created_at_unix: number;
        created_by: string | null;
        facets_json: string;
        id: string;
        valid_from_unix: number | null;
        valid_until_unix: number | null;
        source_ref: string | null;
        supersedes: string | null;
        version: number;
      }>(
        `
          SELECT
            id,
            content,
            facets_json,
            created_by,
            valid_from_unix,
            valid_until_unix,
            source_ref,
            supersedes,
            created_at_unix,
            version
          FROM ${SQLITE_FACT_STORE_TABLE}
          WHERE schema_id = ?
            AND workspace_id = ?
            AND ${OPEN_FACT_ROW_SQL}
            ${input.match.id ? "AND id = ?" : ""}
            ${sqlFacetClauses.map((clause) => `AND ${clause}`).join("\n            ")}
          ORDER BY updated_at_unix DESC, created_at_unix DESC
          ${residualFacets.length === 0 ? "LIMIT 1" : ""}
        `,
        [
          input.schema_id,
          effectiveWorkspaceId,
          ...(input.match.id ? [input.match.id] : []),
          ...sqlFacetParams
        ]
      );

      const existing = candidates.find((row) => {
        const parsedFacets = safeParseJsonObject(row.facets_json);
        return residualFacets.every(([key, value]) => {
          // A missing key is not a match, not even against a null selector.
          if (!(key in parsedFacets)) {
            return false;
          }
          return (
            canonicalJsonHash(parsedFacets[key]) === canonicalJsonHash(value)
          );
        });
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
      // Deterministic provenance: the same logical selector yields the same
      // source_ref across sessions and across the Postgres build, which is what
      // makes "where does this row come from" answerable. Kept null when the
      // selector carries no facets (match.id only): the hash would then be the
      // same for every record of the schema, and the partial unique index would
      // make two unrelated rows fight over one provenance.
      const sourceRef =
        existing?.source_ref ??
        (Object.keys(input.match.facets).length > 0
          ? `ghostcrab://upsert/${canonicalJsonHash({
              match: input.match.facets,
              schema_id: input.schema_id
            })}`
          : null);
      const nextValidUntilUnix =
        input.valid_until !== undefined
          ? input.valid_until === null
            ? null
            : Math.floor(Date.parse(`${input.valid_until}T00:00:00Z`) / 1000)
          : (existing?.valid_until_unix ?? null);

      let embeddingStored = false;
      let embeddingValue: string | null = null;
      let rawEmbedding: number[] | null = null;
      const contentChanged =
        input.set_content !== undefined &&
        input.set_content !== (existing?.content ?? null);
      const facetsChanged =
        existing !== undefined &&
        facetsFingerprint(existingFacets) !== facetsFingerprint(nextFacets);
      // A state transition is a change of content or facets. Touching only
      // valid_until re-dates a fact without changing what it says, so it is
      // not worth an archive row.
      const stateChanged = contentChanged || facetsChanged;

      if (contentChanged && embeddingRuntime.writeEmbeddingsEnabled) {
        try {
          const [embedding] = await context.embeddings.embedMany([nextContent]);
          if (embedding.length > 0) {
            rawEmbedding = embedding;
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

        // Rows written before provenance was wired have none. Adopt it now, so
        // the archive taken just below inherits a traceable "#v<n>" ref instead
        // of a NULL. Guarded on IS NULL: an existing ref is never rewritten.
        if (existing.source_ref === null && sourceRef !== null) {
          await queryable.query(
            `
              UPDATE ${SQLITE_FACT_STORE_TABLE}
              SET source_ref = ?
              WHERE id = ? AND source_ref IS NULL
            `,
            [sourceRef, existing.id]
          );
        }

        // Copy-on-write history: the current row keeps its id (callers hold
        // onto it), and the state it is about to lose is preserved as a closed
        // archive row that the current row then supersedes. Selecting from the
        // row itself snapshots the pre-update state without re-sending it.
        //
        // doc_id is written as NULL but does not stay NULL: the schema's
        // trg_sync_agent_facts_compat_after_insert trigger backfills any NULL
        // doc_id, and forcing it back to NULL afterwards is not an option — a
        // past migration required doc_id IS NOT NULL and NULL rows blocked it.
        // Archives are kept out of the BM25 corpus on the index side instead:
        // the search sync only mirrors open rows (see facets-fts-sync.ts).
        //
        // facets and facets_json are both written: the Zig write path keeps
        // the pair in sync, and an archive that only filled one of them would
        // be a snapshot of a state that never existed.
        let archivedId: string | null = null;
        if (stateChanged) {
          const archiveId = randomUUID();
          await queryable.query(
            `
              INSERT INTO ${SQLITE_FACT_STORE_TABLE} (
                id, workspace_id, schema_id, source_ref, content,
                facets, facets_json, created_by, created_at_unix,
                updated_at_unix, valid_from_unix, valid_until_unix,
                version, supersedes, doc_id
              )
              SELECT
                ?,
                workspace_id,
                schema_id,
                CASE
                  WHEN source_ref IS NULL THEN NULL
                  ELSE source_ref || '#v' || version
                END,
                content,
                facets_json,
                facets_json,
                created_by,
                created_at_unix,
                ?,
                valid_from_unix,
                ${ARCHIVE_CLOSE_UNIX_EXPR},
                version,
                supersedes,
                NULL
              FROM ${SQLITE_FACT_STORE_TABLE}
              WHERE id = ?
            `,
            [archiveId, nowUnix, existing.id]
          );

          // Read the archive back rather than trusting the generated id: an
          // INSERT ... SELECT that matched nothing would leave no row, and
          // overwriting the current state after a silent no-op is data loss.
          const [archived] = await queryable.query<{ id: string }>(
            `SELECT id FROM ${SQLITE_FACT_STORE_TABLE} WHERE id = ?`,
            [archiveId]
          );
          if (!archived?.id) {
            throw new Error(
              "Archiving the superseded state returned no row - refusing to overwrite it"
            );
          }
          archivedId = archived.id;
        }

        await queryable.query(
          `
            UPDATE ${SQLITE_FACT_STORE_TABLE}
            SET content = ?,
                facets = ?,
                facets_json = ?,
                -- Only a content change may touch the vector. A facets-only
                -- update leaves the text alone, so blanking the embedding here
                -- would drop the row out of the semantic pool
                -- (embedding_blob IS NOT NULL) for content that never changed,
                -- while search_embeddings still holds the old vector.
                embedding_blob = CASE WHEN ? = 1 THEN ? ELSE embedding_blob END,
                created_by = ?,
                valid_until_unix = ?,
                updated_at_unix = ?,
                supersedes = COALESCE(?, supersedes),
                version = version + 1
            WHERE id = ?
          `,
          [
            nextContent,
            JSON.stringify(nextFacets),
            JSON.stringify(nextFacets),
            contentChanged ? 1 : 0,
            embeddingValue,
            nextCreatedBy,
            nextValidUntilUnix,
            nowUnix,
            archivedId,
            existing.id
          ]
        );

        const [updated] = await queryable.query<{
          id: string;
          doc_id: number;
          updated_at_unix: number;
          version: number;
        }>(
          `
            SELECT id, doc_id, updated_at_unix, version
            FROM ${SQLITE_FACT_STORE_TABLE}
            WHERE id = ?
          `,
          [existing.id]
        );

        if (rawEmbedding !== null && updated?.doc_id) {
          pendingEmbeddingSync = {
            docId: Number(updated.doc_id),
            embedding: rawEmbedding
          };
        }

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
            supersedes: archivedId,
            archived_previous_state: archivedId !== null,
            notes
          })
        };
      }

      const nowUnix = Math.floor(Date.now() / 1000);
      const id = randomUUID();

      // A closed row keeps its source_ref, so a fact that expired and is now
      // being recreated under the same selector would collide with the partial
      // unique index. Postgres resolves that with ON CONFLICT DO UPDATE; the
      // SQLite upsert clause takes the same conflict target, partial-index
      // predicate included.
      await queryable.query(
        `
          INSERT INTO ${SQLITE_FACT_STORE_TABLE} (
            id,
            schema_id,
            source_ref,
            content,
            facets,
            facets_json,
            embedding_blob,
            created_by,
            created_at_unix,
            updated_at_unix,
            valid_from_unix,
            valid_until_unix,
            version,
            doc_id,
            workspace_id
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ${SQLITE_NEXT_FACT_DOC_ID_EXPR}, ?)
          ON CONFLICT(source_ref, workspace_id) WHERE source_ref IS NOT NULL
          DO UPDATE SET
            schema_id = excluded.schema_id,
            content = excluded.content,
            facets = excluded.facets,
            facets_json = excluded.facets_json,
            embedding_blob = COALESCE(
              excluded.embedding_blob,
              ${SQLITE_FACT_STORE_TABLE}.embedding_blob
            ),
            created_by = COALESCE(
              excluded.created_by,
              ${SQLITE_FACT_STORE_TABLE}.created_by
            ),
            updated_at_unix = excluded.updated_at_unix,
            valid_until_unix = excluded.valid_until_unix,
            version = ${SQLITE_FACT_STORE_TABLE}.version + 1
        `,
        [
          id,
          input.schema_id,
          sourceRef,
          nextContent,
          JSON.stringify(nextFacets),
          JSON.stringify(nextFacets),
          embeddingValue,
          nextCreatedBy,
          nowUnix,
          nowUnix,
          input.valid_from
            ? Math.floor(Date.parse(`${input.valid_from}T00:00:00Z`) / 1000)
            : nowUnix,
          nextValidUntilUnix,
          effectiveWorkspaceId
        ]
      );

      // Our generated id is only the winner when the INSERT actually inserted.
      // On the conflict branch the surviving row is the one that already held
      // the source_ref, so report its id and version rather than inventing a
      // creation that did not happen.
      const [written] = await queryable.query<{
        created_at_unix: number;
        doc_id: number | null;
        id: string;
        version: number;
      }>(
        `
          SELECT id, doc_id, created_at_unix, version
          FROM ${SQLITE_FACT_STORE_TABLE}
          WHERE id = ?
        `,
        [id]
      );

      const revived =
        written === undefined && sourceRef !== null
          ? (
              await queryable.query<{
                created_at_unix: number;
                doc_id: number | null;
                id: string;
                version: number;
              }>(
                `
                  SELECT id, doc_id, created_at_unix, version
                  FROM ${SQLITE_FACT_STORE_TABLE}
                  WHERE workspace_id = ? AND source_ref = ?
                `,
                [effectiveWorkspaceId, sourceRef]
              )
            )[0]
          : undefined;

      const row = written ?? revived;
      if (!row?.id) {
        throw new Error(
          "Creating the fact returned no row - refusing to report a write that did not land"
        );
      }

      if (rawEmbedding !== null && row.doc_id) {
        pendingEmbeddingSync = {
          docId: Number(row.doc_id),
          embedding: rawEmbedding
        };
      }

      const created = written !== undefined;
      return {
        kind: "success" as const,
        result: createToolSuccessResult("ghostcrab_upsert", {
          updated: !created,
          created,
          matched_existing: false,
          id: row.id,
          schema_id: input.schema_id,
          match: input.match,
          embedding_runtime: embeddingRuntime,
          embedding_stored: embeddingStored,
          created_at: new Date(
            Number(row.created_at_unix) * 1000
          ).toISOString(),
          version: row.version,
          supersedes: null,
          archived_previous_state: false,
          notes
        })
      };
    });

    // Mirror the embedding into search_embeddings after the transaction
    // commits so the MindBrain native hybrid engine can find it. Best-effort.
    // pendingEmbeddingSync is set inside an async callback so TypeScript cannot
    // narrow it after the await — we use a cast to preserve the union type.
    if (pendingEmbeddingSync) {
      const sync = pendingEmbeddingSync as {
        docId: number;
        embedding: number[];
      };
      try {
        const config = resolveGhostcrabConfig();
        await runStandaloneSearchEmbeddingUpsert({
          mindbrainUrl: config.mindbrainUrl,
          timeoutMs: config.mindbrainHttpTimeoutMs,
          tableId: FACETS_SEARCH_TABLE_ID,
          docId: sync.docId,
          embedding: sync.embedding
        });
      } catch {
        notes.push(
          "Embedding mirrored to facets but search_embeddings sync failed; native hybrid search will not find this row until backfill runs."
        );
      }
    }

    if (isNativeFactIndexOwned() && !result.result.isError) {
      // The SQL upsert owns its archive transaction. Reconcile through the
      // engine in this explicit write phase, never during a subsequent search.
      const index = await reconcileWorkspaceFacts(
        context.database,
        effectiveWorkspaceId
      );
      return createToolSuccessResult("ghostcrab_upsert", {
        ...result.result.structuredContent,
        native_index: {
          ready: index.ready,
          repaired: index.documentsInserted,
          error: index.error
        }
      });
    }
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
