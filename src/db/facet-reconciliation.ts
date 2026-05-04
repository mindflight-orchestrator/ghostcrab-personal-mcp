import type { DatabaseClient } from "./client.js";
import type { ExtensionCapabilities } from "./extension-probe.js";
import { FACET_CATALOG, isKnownFacetName } from "./facet-catalog.js";
import {
  loadPersistedFacetDefinitionRecords,
  type FacetDefinitionRecord,
  type FacetDefinitionNativeKind
} from "./facet-vocabulary.js";
import {
  loadRuntimeNativeFacetDefinitions,
  type NativeFacetDefinition
} from "./native-facets.js";

export interface FacetReconciliationMissingColumn {
  facet_name: string;
  native_column: string;
  reason: "column_missing";
}

export interface FacetReconciliationBlockedNativeFacet {
  facet_name: string;
  native_column: string | null;
  native_kind: FacetDefinitionNativeKind | null;
  reasons: Array<"native_definition_incomplete" | "column_missing">;
}

export interface FacetReconciliationReport {
  ok: boolean;
  applied: boolean;
  skipped: boolean;
  reason?: string;
  catalog_count: number;
  persisted_count: number;
  persisted_native_count: number;
  runtime_native_count: number;
  registerable_native_count: number;
  registered_count: number;
  missing_registration: string[];
  missing_columns: FacetReconciliationMissingColumn[];
  blocked_native_facets: FacetReconciliationBlockedNativeFacet[];
  extra_registered: string[];
  persisted_only: string[];
}

async function listRegisteredFacetNames(
  database: DatabaseClient,
  extensions: ExtensionCapabilities
): Promise<Set<string>> {
  if (!extensions.pgFacets) {
    return new Set();
  }

  try {
    const rows = await database.query<{ facet_name: string }>(
      `SELECT facet_name
       FROM facets.list_table_facets_simple('public.facets'::regclass)`
    );
    return new Set(rows.map((row) => row.facet_name));
  } catch {
    return new Set();
  }
}

async function listExistingColumns(
  database: DatabaseClient
): Promise<Set<string>> {
  const rows = await database.query<{ name: string }>(`PRAGMA table_info(facets)`);
  return new Set(rows.map((row) => row.name));
}

function getBlockedNativeFacetReasons(params: {
  definition: FacetDefinitionRecord | NativeFacetDefinition;
  existingColumns: Set<string>;
  persisted?: FacetDefinitionRecord | undefined;
}): FacetReconciliationBlockedNativeFacet | null {
  const nativeColumn =
    "native_column" in params.definition
      ? params.definition.native_column
      : "column" in params.definition
        ? params.definition.column
        : null;
  const nativeKind =
    "native_kind" in params.definition
      ? params.definition.native_kind
      : "kind" in params.definition
        ? params.definition.kind
        : null;
  const reasons: FacetReconciliationBlockedNativeFacet["reasons"] = [];

  if (params.persisted && params.persisted.native) {
    if (!params.persisted.native_column || !params.persisted.native_kind) {
      reasons.push("native_definition_incomplete");
    }
  }

  if (!nativeColumn || !nativeKind) {
    reasons.push("native_definition_incomplete");
  } else if (!params.existingColumns.has(nativeColumn)) {
    reasons.push("column_missing");
  }

  if (reasons.length === 0) {
    return null;
  }

  return {
    facet_name:
      "facetName" in params.definition
        ? params.definition.facetName
        : params.definition.facet_name,
    native_column: nativeColumn,
    native_kind: nativeKind,
    reasons: [...new Set(reasons)]
  };
}

export async function reconcileFacetVocabularyWithReport(
  database: DatabaseClient,
  extensions: ExtensionCapabilities,
  options?: {
    apply?: boolean;
  }
): Promise<FacetReconciliationReport> {
  const apply = Boolean(options?.apply);
  const persistedDefinitions = await loadPersistedFacetDefinitionRecords(database);
  const runtimeNativeDefinitions = await loadRuntimeNativeFacetDefinitions(database);
  const registeredFacetNames = await listRegisteredFacetNames(database, extensions);
  const existingColumns = await listExistingColumns(database);

  const catalogFacetNames = FACET_CATALOG.map((entry) => entry.facetName);
  const persistedNativeDefinitions = persistedDefinitions.filter(
    (definition) => definition.native
  );
  const persistedOnly = persistedDefinitions
    .map((definition) => definition.facet_name)
    .filter((facetName) => !isKnownFacetName(facetName))
    .sort((left, right) => left.localeCompare(right));

  const blockedNativeFacetMap = new Map<
    string,
    FacetReconciliationBlockedNativeFacet
  >();

  for (const report of [
    ...runtimeNativeDefinitions.map((definition) =>
      getBlockedNativeFacetReasons({ definition, existingColumns })
    ),
    ...persistedNativeDefinitions.map((definition) =>
      getBlockedNativeFacetReasons({
        definition,
        existingColumns,
        persisted: definition
      })
    )
  ]) {
    if (!report) {
      continue;
    }

    const existing = blockedNativeFacetMap.get(report.facet_name);
    if (!existing) {
      blockedNativeFacetMap.set(report.facet_name, {
        ...report,
        reasons: [...report.reasons]
      });
      continue;
    }

    blockedNativeFacetMap.set(report.facet_name, {
      facet_name: report.facet_name,
      native_column: existing.native_column ?? report.native_column,
      native_kind: existing.native_kind ?? report.native_kind,
      reasons: [...new Set([...existing.reasons, ...report.reasons])]
    });
  }

  const blockedNativeFacets = [...blockedNativeFacetMap.values()].sort((left, right) =>
    left.facet_name.localeCompare(right.facet_name)
  );

  const missingColumns = blockedNativeFacets
    .filter((definition) => definition.reasons.includes("column_missing"))
    .map((definition) => ({
      facet_name: definition.facet_name,
      native_column: definition.native_column ?? "",
      reason: "column_missing" as const
    }));

  const registerableRuntimeNativeNames = runtimeNativeDefinitions
    .filter((definition) => existingColumns.has(definition.column))
    .map((definition) => definition.facetName);
  const missingRegistration = registerableRuntimeNativeNames
    .filter((facetName) => !registeredFacetNames.has(facetName))
    .sort((left, right) => left.localeCompare(right));
  const extraRegistered = [...registeredFacetNames]
    .filter((facetName) => !registerableRuntimeNativeNames.includes(facetName))
    .sort((left, right) => left.localeCompare(right));

  const nativeRegistrationSupported = extensions.pgFacets;
  const ok =
    blockedNativeFacets.length === 0 &&
    extraRegistered.length === 0 &&
    (!nativeRegistrationSupported || missingRegistration.length === 0);

  return {
    ok,
    applied: false,
    skipped: !apply || !nativeRegistrationSupported || missingRegistration.length === 0,
    reason:
      blockedNativeFacets.length > 0
        ? "native_registration_blocked"
        : nativeRegistrationSupported
          ? undefined
          : "native_registration_not_supported",
    catalog_count: catalogFacetNames.length,
    persisted_count: persistedDefinitions.length,
    persisted_native_count: persistedNativeDefinitions.length,
    runtime_native_count: runtimeNativeDefinitions.length,
    registerable_native_count: registerableRuntimeNativeNames.length,
    registered_count: registeredFacetNames.size,
    missing_registration: missingRegistration,
    missing_columns: missingColumns,
    blocked_native_facets: blockedNativeFacets,
    extra_registered: extraRegistered,
    persisted_only: persistedOnly
  };
}
