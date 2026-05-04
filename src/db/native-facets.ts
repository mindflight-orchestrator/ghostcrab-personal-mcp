import type { DatabaseClient } from "./client.js";
import {
  loadPersistedFacetDefinitionRecords,
  type FacetDefinitionRecord
} from "./facet-vocabulary.js";
import { getNativeFacetCatalogEntries } from "./facet-catalog.js";

export type NativeFacetKind = "plain" | "boolean";
export type NativeFacetScalar = boolean | number | string;

export interface NativeFacetDefinition {
  column: string;
  facetName: string;
  kind: NativeFacetKind;
}

export interface NativeFacetBitmapSql {
  ctesSql: string;
  bitmapExpr: string;
  params: unknown[];
}

export const PG_FACETS_NATIVE_DEFINITIONS: readonly NativeFacetDefinition[] =
  getNativeFacetCatalogEntries();

function mergeNativeDefinitions(
  baseDefinitions: readonly NativeFacetDefinition[],
  extraDefinitions: readonly NativeFacetDefinition[]
): NativeFacetDefinition[] {
  const merged = new Map<string, NativeFacetDefinition>();

  for (const definition of baseDefinitions) {
    merged.set(definition.facetName, definition);
  }

  for (const definition of extraDefinitions) {
    if (definition.column && definition.kind) {
      merged.set(definition.facetName, definition);
    }
  }

  return [...merged.values()];
}

async function listExistingNativeFacetColumns(
  database: DatabaseClient
): Promise<Set<string>> {
  const rows = await database.query<{ name: string }>(
    `PRAGMA table_info(facets)`
  );
  return new Set(rows.map((row) => row.name));
}

export async function loadRuntimeNativeFacetDefinitions(
  database: DatabaseClient
): Promise<NativeFacetDefinition[]> {
  const persistedDefinitions = await loadPersistedFacetDefinitionRecords(database);
  const extraDefinitions = persistedDefinitions
    .filter(
      (definition): definition is FacetDefinitionRecord & { native: true } =>
        Boolean(definition.native)
    )
    .flatMap((definition) =>
      definition.native_column && definition.native_kind
        ? [
            {
              facetName: definition.facet_name,
              column: definition.native_column,
              kind: definition.native_kind
            }
          ]
        : []
    );

  return mergeNativeDefinitions(PG_FACETS_NATIVE_DEFINITIONS, extraDefinitions);
}

export async function loadRegisterableNativeFacetDefinitions(
  database: DatabaseClient
): Promise<NativeFacetDefinition[]> {
  const runtimeDefinitions = await loadRuntimeNativeFacetDefinitions(database);
  const existingColumns = await listExistingNativeFacetColumns(database);

  return runtimeDefinitions.filter((definition) =>
    existingColumns.has(definition.column)
  );
}

const FACET_NAME_TO_DEFINITION = new Map(
  PG_FACETS_NATIVE_DEFINITIONS.map((definition) => [
    definition.facetName,
    definition
  ])
);

const COLUMN_TO_DEFINITION = new Map(
  PG_FACETS_NATIVE_DEFINITIONS.map((definition) => [definition.column, definition])
);

export function getNativeFacetDefinition(
  facetName: string
): NativeFacetDefinition | null {
  return FACET_NAME_TO_DEFINITION.get(facetName) ?? null;
}

export function isRegisteredNativeFacetName(facetName: string): boolean {
  return FACET_NAME_TO_DEFINITION.has(facetName);
}

export function toMaterializedFacetColumn(facetName: string): string | null {
  if (COLUMN_TO_DEFINITION.has(facetName)) {
    return facetName;
  }

  return FACET_NAME_TO_DEFINITION.get(facetName)?.column ?? null;
}

export function isNativeFacetScalar(value: unknown): value is NativeFacetScalar {
  return (
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  );
}

export function isSupportedNativeFacetFilterValue(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.length > 0 && value.every((candidate) => isNativeFacetScalar(candidate));
  }

  return isNativeFacetScalar(value);
}

export function areNativeFacetFiltersSupported(
  filters: Record<string, unknown>,
  schemaId?: string
): boolean {
  if (schemaId && !isRegisteredNativeFacetName("schema_id")) {
    return false;
  }

  return Object.entries(filters).every(
    ([key, value]) =>
      isRegisteredNativeFacetName(key) &&
      isSupportedNativeFacetFilterValue(value)
  );
}

export function expandNativeFacetFilterCombinations(params: {
  filters: Record<string, unknown>;
  maxCombinations?: number;
  schemaId?: string;
}): Array<Record<string, NativeFacetScalar>> {
  const entries: Array<[string, NativeFacetScalar[]]> = [];

  if (params.schemaId) {
    entries.push(["schema_id", [params.schemaId]]);
  }

  for (const [key, rawValue] of Object.entries(params.filters)) {
    if (!isRegisteredNativeFacetName(key)) {
      return [];
    }

    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    if (!values.every((candidate) => isNativeFacetScalar(candidate))) {
      return [];
    }

    if (values.length === 0) {
      return [];
    }

    entries.push([key, values]);
  }

  let combinations: Array<Record<string, NativeFacetScalar>> = [{}];
  const maxCombinations = params.maxCombinations ?? 64;

  for (const [key, values] of entries) {
    const next = combinations.flatMap((combo) =>
      values.map((value) => ({ ...combo, [key]: value }))
    );

    if (next.length > maxCombinations) {
      return [];
    }

    combinations = next;
  }

  return combinations;
}

export function buildNativeFacetBitmapSql(params: {
  filters: Record<string, unknown>;
  schemaId?: string;
}): NativeFacetBitmapSql | null {
  const entries: Array<[string, NativeFacetScalar[]]> = [];

  if (params.schemaId) {
    entries.push(["schema_id", [params.schemaId]]);
  }

  for (const [key, rawValue] of Object.entries(params.filters)) {
    if (!isRegisteredNativeFacetName(key)) {
      return null;
    }

    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    if (!values.every((candidate) => isNativeFacetScalar(candidate))) {
      return null;
    }

    if (values.length === 0) {
      return null;
    }

    entries.push([key, values]);
  }

  if (entries.length === 0) {
    return null;
  }

  const paramsList: unknown[] = [];
  const ctes: string[] = [];
  const aliases: string[] = [];

  for (const [index, [facetName, values]] of entries.entries()) {
    const alias = `bitmap_${index + 1}`;
    const definition = getNativeFacetDefinition(facetName);
    if (!definition) {
      return null;
    }

    const facetParam = paramsList.push(facetName);
    aliases.push(alias);

    if (definition.kind === "boolean") {
      if (!values.every((value) => typeof value === "boolean")) {
        return null;
      }

      const valuesParam = paramsList.push(values);
      ctes.push(`
        ${alias} AS (
          SELECT COALESCE(
            rb_or_agg(
              facets.get_documents_with_boolean_facet(
                'public.facets'::regclass::oid,
                $${facetParam}::text,
                candidate.value
              )
            ),
            rb_build(ARRAY[]::integer[])
          ) AS bitmap
          FROM unnest($${valuesParam}::boolean[]) AS candidate(value)
        )
      `.trim());
      continue;
    }

    const textValues = values.map((value) => String(value));
    const valuesParam = paramsList.push(textValues);
    ctes.push(`
      ${alias} AS (
        SELECT COALESCE(
          rb_or_agg(
            facets.get_documents_with_facet(
              'public.facets'::regclass::oid,
              $${facetParam}::text,
              candidate.value
            )
          ),
          rb_build(ARRAY[]::integer[])
        ) AS bitmap
        FROM unnest($${valuesParam}::text[]) AS candidate(value)
      )
    `.trim());
  }

  return {
    ctesSql: ctes.join(",\n"),
    bitmapExpr: aliases.map((alias) => `${alias}.bitmap`).join(" & "),
    params: paramsList
  };
}
