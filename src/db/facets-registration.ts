import type { DatabaseClient } from "./client.js";
import type { ExtensionCapabilities } from "./extension-probe.js";
import { PG_FACETS_NATIVE_DEFINITIONS } from "./native-facets.js";

export interface FacetsRegistrationReport {
  ok: boolean;
  registered: boolean;
  skipped: boolean;
  reason?: string;
}

function registrationArraySql(definitions = PG_FACETS_NATIVE_DEFINITIONS): string {
  const items = definitions.map((definition) => {
    const factory =
      definition.kind === "boolean" ? "facets.boolean_facet" : "facets.plain_facet";
    return `${factory}('${definition.column}', '${definition.facetName}')`;
  });

  return `ARRAY[
          ${items.join(",\n          ")}
        ]`;
}

/**
 * Register facets with pg_facets for native bitmap-accelerated search/count.
 *
 * Prerequisites:
 * - pg_facets extension must be loaded (CREATE EXTENSION pg_facets).
 * - Migration 008 must have run (adds doc_id bigint GENERATED ALWAYS AS IDENTITY).
 * - Materialized columns from migration 006 must exist (facet_record_id, etc.).
 *
 * This function is idempotent: safe to call multiple times.
 * Registration is a DDL operation — call from CLI maintenance, not from server startup.
 */
export async function registerPgFacetsWithReport(
  database: DatabaseClient,
  extensions: ExtensionCapabilities
): Promise<FacetsRegistrationReport> {
  if (!extensions.pgFacets) {
    return {
      ok: true,
      registered: false,
      skipped: true,
      reason: "pg_facets_not_loaded"
    };
  }

  const [alreadyRegistered] = await database.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM facets.list_tables()
       WHERE tablename = 'facets'
     ) AS exists`
  );

  const [hasDocId] = await database.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'facets'
         AND column_name = 'doc_id'
     ) AS exists`
  );

  if (!hasDocId?.exists) {
    return {
      ok: false,
      registered: false,
      skipped: false,
      reason: "doc_id_column_missing_run_migration_008"
    };
  }

  try {
    if (!alreadyRegistered?.exists) {
      await database.query(`
        SELECT facets.add_faceting_to_table(
          'public.facets'::regclass,
          'doc_id',
          ${registrationArraySql()}
        )
      `);
      return { ok: true, registered: true, skipped: false };
    }

    const existingFacetRows = await database.query<{ facet_name: string }>(
      `SELECT facet_name
       FROM facets.list_table_facets_simple('public.facets'::regclass)`
    );
    const existingFacetNames = new Set(
      existingFacetRows.map((row) => row.facet_name)
    );
    const missingDefinitions = PG_FACETS_NATIVE_DEFINITIONS.filter(
      (definition) => !existingFacetNames.has(definition.facetName)
    );

    if (missingDefinitions.length === 0) {
      return {
        ok: true,
        registered: false,
        skipped: true,
        reason: "already_registered"
      };
    }

    await database.query(`
      SELECT facets.add_facets(
        'public.facets'::regclass,
        ${registrationArraySql(missingDefinitions)},
        true
      )
    `);

    return {
      ok: true,
      registered: true,
      skipped: false
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      registered: false,
      skipped: false,
      reason: message
    };
  }
}
