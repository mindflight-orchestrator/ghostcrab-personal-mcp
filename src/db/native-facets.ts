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

export const PG_FACETS_NATIVE_DEFINITIONS: readonly NativeFacetDefinition[] = [
  { column: "facet_record_id", facetName: "record_id", kind: "plain" },
  {
    column: "facet_activity_family",
    facetName: "activity_family",
    kind: "plain"
  },
  { column: "facet_title", facetName: "title", kind: "plain" },
  { column: "facet_label", facetName: "label", kind: "plain" },
  { column: "schema_id", facetName: "schema_id", kind: "plain" },
  { column: "facet_tier", facetName: "tier", kind: "plain" },
  { column: "facet_app_segment", facetName: "app_segment", kind: "plain" },
  { column: "facet_churn_risk", facetName: "churn_risk", kind: "plain" },
  { column: "facet_nationality", facetName: "nationality", kind: "plain" },
  { column: "facet_game_type", facetName: "game_type", kind: "plain" },
  { column: "facet_is_vip", facetName: "is_vip", kind: "boolean" },
  {
    column: "facet_marketing_consent",
    facetName: "marketing_consent",
    kind: "boolean"
  }
] as const;

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
                'public.mfo_facets'::regclass::oid,
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
              'public.mfo_facets'::regclass::oid,
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
