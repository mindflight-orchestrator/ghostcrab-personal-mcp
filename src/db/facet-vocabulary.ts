import type { DatabaseClient } from "./client.js";
import {
  FACET_CATALOG,
  getFacetCatalogEntry,
  isKnownFacetName,
  type FacetCatalogEntry
} from "./facet-catalog.js";
import {
  SQLITE_FACT_STORE_TABLE,
  SQLITE_NEXT_FACT_DOC_ID_EXPR,
  safeParseFacetJson,
  sqliteFacetJsonExtractClause
} from "./fact-store.js";

export const FACET_DEFINITION_SCHEMA_ID = "mindbrain:facet-definition";

export type FacetDefinitionNativeKind = "plain" | "boolean";

export interface FacetDefinitionRecord {
  facet_name: string;
  label: string;
  description: string;
  native: boolean;
  native_column: string | null;
  native_kind: FacetDefinitionNativeKind | null;
}

export interface FacetValidationIssue {
  code:
    | "unknown_facet"
    | "unknown_lookup_facet"
    | "unknown_definition_key"
    | "missing_required_field"
    | "invalid_definition_field";
  facet_name?: string;
  key?: string;
  message: string;
  path: string;
  record_index?: number;
}

export interface FacetValidationRecordInput {
  schema_id?: string;
  facets?: Record<string, unknown>;
  lookup_facets?: Record<string, unknown>;
}

const FACET_DEFINITION_ALLOWED_KEYS = new Set([
  "facet_name",
  "label",
  "description",
  "native",
  "native_column",
  "native_kind"
]);

function humanizeFacetName(facetName: string): string {
  return facetName
    .replace(/_/g, " ")
    .replace(/\b([a-z])/g, (match) => match.toUpperCase());
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toFacetNameSet(
  facetNames: Iterable<string> | undefined
): Set<string> {
  return new Set(facetNames ?? []);
}

export function getFacetCatalogSnapshot(): Array<
  FacetCatalogEntry & {
    description: string;
    native_column: string | null;
    native_kind: FacetDefinitionNativeKind | null;
  }
> {
  return FACET_CATALOG.map((entry) => ({
    ...entry,
    description: `Declared GhostCrab facet key for ${humanizeFacetName(
      entry.facetName
    ).toLowerCase()}.`,
    native_column: entry.native?.column ?? null,
    native_kind: entry.native?.kind ?? null
  }));
}

export function buildFacetDefinitionRecord(
  facetName: string,
  overrides?: Partial<FacetDefinitionRecord>
): FacetDefinitionRecord {
  const catalogEntry = getFacetCatalogEntry(facetName);
  const label = overrides?.label ?? humanizeFacetName(facetName);
  const description =
    overrides?.description ??
    `Declared GhostCrab facet key for ${humanizeFacetName(facetName).toLowerCase()}.`;

  return {
    facet_name: facetName,
    label,
    description,
    native: overrides?.native ?? Boolean(catalogEntry?.native),
    native_column:
      overrides?.native_column ?? catalogEntry?.native?.column ?? null,
    native_kind:
      overrides?.native_kind ?? (catalogEntry?.native?.kind ?? null)
  };
}

export function validateFacetRecordInput(
  record: FacetValidationRecordInput,
  recordIndex = 0,
  allowedFacetNames?: Iterable<string>
): FacetValidationIssue[] {
  const issues: FacetValidationIssue[] = [];
  const facets = record.facets ?? {};
  const lookupFacets = record.lookup_facets ?? {};
  const isDefinition = record.schema_id === FACET_DEFINITION_SCHEMA_ID;
  const allowedFacetNameSet = toFacetNameSet(allowedFacetNames);

  if (!isPlainObject(facets)) {
    issues.push({
      code: "missing_required_field",
      path: "facets",
      record_index: recordIndex,
      message: "facets must be an object"
    });
    return issues;
  }

  if (!isPlainObject(lookupFacets)) {
    issues.push({
      code: "missing_required_field",
      path: "lookup_facets",
      record_index: recordIndex,
      message: "lookup_facets must be an object"
    });
    return issues;
  }

  if (isDefinition) {
    for (const key of Object.keys(facets)) {
      if (!FACET_DEFINITION_ALLOWED_KEYS.has(key)) {
        issues.push({
          code: "unknown_definition_key",
          key,
          path: `facets.${key}`,
          record_index: recordIndex,
          message: `Facet definition uses unsupported key: ${key}`
        });
      }
    }

    const facetName = String(facets.facet_name ?? "");
    if (!facetName) {
      issues.push({
        code: "missing_required_field",
        key: "facet_name",
        path: "facets.facet_name",
        record_index: recordIndex,
        message: "Facet definition requires facet_name"
      });
    }

    if (facets.native !== undefined && typeof facets.native !== "boolean") {
      issues.push({
        code: "invalid_definition_field",
        key: "native",
        path: "facets.native",
        record_index: recordIndex,
        message: "Facet definition native flag must be boolean"
      });
    }

    if (
      facets.native_column !== undefined &&
      facets.native_column !== null &&
      typeof facets.native_column !== "string"
    ) {
      issues.push({
        code: "invalid_definition_field",
        key: "native_column",
        path: "facets.native_column",
        record_index: recordIndex,
        message: "Facet definition native_column must be a string or null"
      });
    }

    if (
      facets.native_kind !== undefined &&
      facets.native_kind !== null &&
      facets.native_kind !== "plain" &&
      facets.native_kind !== "boolean"
    ) {
      issues.push({
        code: "invalid_definition_field",
        key: "native_kind",
        path: "facets.native_kind",
        record_index: recordIndex,
        message: "Facet definition native_kind must be 'plain', 'boolean', or null"
      });
    }

    return issues;
  }

  for (const key of Object.keys(facets)) {
    if (!isKnownFacetName(key) && !allowedFacetNameSet.has(key)) {
      issues.push({
        code: "unknown_facet",
        facet_name: key,
        path: `facets.${key}`,
        record_index: recordIndex,
        message: `Unknown facet key: ${key}`
      });
    }
  }

  for (const key of Object.keys(lookupFacets)) {
    if (!isKnownFacetName(key) && !allowedFacetNameSet.has(key)) {
      issues.push({
        code: "unknown_lookup_facet",
        facet_name: key,
        path: `lookup_facets.${key}`,
        record_index: recordIndex,
        message: `Unknown lookup facet key: ${key}`
      });
    }
  }

  return issues;
}

export function validateFacetRecordBatch(
  records: FacetValidationRecordInput[],
  allowedFacetNames?: Iterable<string>
): FacetValidationIssue[] {
  return records.flatMap((record, index) =>
    validateFacetRecordInput(record, index, allowedFacetNames)
  );
}

export async function listPersistedFacetDefinitions(
  database: DatabaseClient
): Promise<
  Array<{
    content: string;
    facets: Record<string, unknown>;
    id: string;
    created_at: string;
  }>
> {
  return database.query<{
    content: string;
    facets: string;
    id: string;
    created_at_unix: number;
  }>(
    `
      SELECT id, content, facets_json AS facets, created_at_unix
      FROM ${SQLITE_FACT_STORE_TABLE}
      WHERE schema_id = ?
      ORDER BY created_at_unix ASC
    `,
    [FACET_DEFINITION_SCHEMA_ID]
  ).then((rows) =>
    rows.map((row) => ({
      id: row.id,
      content: row.content,
      facets: safeParseFacetJson(row.facets),
      created_at: new Date(Number(row.created_at_unix) * 1000).toISOString()
    }))
  );
}

export function parseFacetDefinitionRecord(row: {
  content: string;
  facets?: Record<string, unknown> | null;
}): FacetDefinitionRecord | null {
  let parsedContent: Record<string, unknown> = {};
  const rowFacets =
    row.facets && typeof row.facets === "object" && !Array.isArray(row.facets)
      ? row.facets
      : {};

  try {
    const parsed = JSON.parse(row.content) as unknown;
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      parsedContent = parsed as Record<string, unknown>;
    }
  } catch {
    parsedContent = {};
  }

  const facetName = String(
    parsedContent.facet_name ?? rowFacets.facet_name ?? ""
  ).trim();
  if (!facetName) {
    return null;
  }

  const label = String(parsedContent.label ?? "").trim();
  const description = String(parsedContent.description ?? "").trim();
  const nativeRaw = parsedContent.native ?? rowFacets.native ?? false;
  const nativeColumnRaw =
    parsedContent.native_column ?? rowFacets.native_column ?? null;
  const nativeKindRaw =
    parsedContent.native_kind ?? rowFacets.native_kind ?? null;

  const nativeColumn =
    nativeColumnRaw === null
      ? null
      : typeof nativeColumnRaw === "string"
        ? nativeColumnRaw
        : null;
  const nativeKind =
    nativeKindRaw === null
      ? null
      : nativeKindRaw === "plain" || nativeKindRaw === "boolean"
        ? nativeKindRaw
        : null;

  return {
    facet_name: facetName,
    label: label.length > 0 ? label : facetName,
    description:
      description.length > 0
        ? description
        : `Declared GhostCrab facet key for ${facetName}.`,
    native: Boolean(nativeRaw),
    native_column: nativeColumn,
    native_kind: nativeKind
  };
}

export async function loadPersistedFacetDefinitionRecords(
  database: DatabaseClient
): Promise<FacetDefinitionRecord[]> {
  const rows = await listPersistedFacetDefinitions(database);
  return rows
    .map((row) => parseFacetDefinitionRecord(row))
    .filter((row): row is FacetDefinitionRecord => row !== null);
}

export async function loadPersistedFacetDefinition(
  database: DatabaseClient,
  facetName: string
): Promise<
  | {
      content: string;
      facets: Record<string, unknown>;
      id: string;
      created_at: string;
    }
  | null
> {
  const [row] = await database.query<{
    content: string;
    facets_json: string;
    id: string;
    created_at_unix: number;
  }>(
    `
      SELECT id, content, facets_json, created_at_unix
      FROM ${SQLITE_FACT_STORE_TABLE}
      WHERE schema_id = ?
        AND ${sqliteFacetJsonExtractClause("facet_name")} = ?
      LIMIT 1
    `,
    [FACET_DEFINITION_SCHEMA_ID, facetName]
  );

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    content: row.content,
    facets: safeParseFacetJson(row.facets_json),
    created_at: new Date(Number(row.created_at_unix) * 1000).toISOString()
  };
}

export async function upsertFacetDefinitionRecord(
  database: DatabaseClient,
  definition: FacetDefinitionRecord
): Promise<{
  id: string;
  created: boolean;
}> {
  const existing = await loadPersistedFacetDefinition(database, definition.facet_name);
  const serializedContent = JSON.stringify(definition, null, 2);
  const serializedFacets = JSON.stringify({
    facet_name: definition.facet_name,
    native: definition.native,
    native_column: definition.native_column,
    native_kind: definition.native_kind
  });

  if (existing) {
    await database.query(
      `
        UPDATE ${SQLITE_FACT_STORE_TABLE}
        SET content = ?,
            facets_json = ?,
            updated_at_unix = strftime('%s','now')
        WHERE id = ?
      `,
      [serializedContent, serializedFacets, existing.id]
    );

    return { id: existing.id, created: false };
  }

  const { randomUUID } = await import("node:crypto");
  const id = randomUUID();

  await database.query(
    `
      INSERT INTO ${SQLITE_FACT_STORE_TABLE} (
        id,
        schema_id,
        content,
        facets_json,
        created_at_unix,
        updated_at_unix,
        doc_id,
        workspace_id
      )
      VALUES (?, ?, ?, ?, strftime('%s','now'), strftime('%s','now'), ${SQLITE_NEXT_FACT_DOC_ID_EXPR}, ?)
    `,
    [
      id,
      FACET_DEFINITION_SCHEMA_ID,
      serializedContent,
      serializedFacets,
      "default"
    ]
  );

  return { id, created: true };
}
