import { getBasicToolNames } from "./catalog.js";

/**
 * Golden manifest of every GhostCrab MCP tool name.
 * Update this list when adding a tool module; tests fail if the registry diverges.
 */
export const EXPECTED_TOOL_NAMES = [
  "ghostcrab_artifact_get",
  "ghostcrab_collection_facet_search",
  "ghostcrab_collection_reindex",
  "ghostcrab_combined_search",
  "ghostcrab_count",
  "ghostcrab_coverage",
  "ghostcrab_csearch",
  "ghostcrab_ddl_execute",
  "ghostcrab_ddl_list_pending",
  "ghostcrab_ddl_propose",
  "ghostcrab_entity_chunks",
  "ghostcrab_facet_catalog",
  "ghostcrab_facet_inspect",
  "ghostcrab_facet_register",
  "ghostcrab_facet_validate",
  "ghostcrab_graph_diagnostics",
  "ghostcrab_graph_gap_rules",
  "ghostcrab_graph_gap_rules_delete",
  "ghostcrab_graph_gap_rules_import",
  "ghostcrab_graph_path",
  "ghostcrab_graph_reindex",
  "ghostcrab_graph_search",
  "ghostcrab_graph_subgraph",
  "ghostcrab_learn",
  "ghostcrab_live_refresh",
  "ghostcrab_loadout_apply",
  "ghostcrab_loadout_inspect",
  "ghostcrab_loadout_list",
  "ghostcrab_loadout_seed",
  "ghostcrab_loadout_suggest",
  "ghostcrab_modeling_guidance",
  "ghostcrab_onboarding_schemas",
  "ghostcrab_ontology_import",
  "ghostcrab_pack",
  "ghostcrab_projection_get",
  "ghostcrab_project",
  "ghostcrab_remember",
  "ghostcrab_schema_inspect",
  "ghostcrab_schema_list",
  "ghostcrab_schema_register",
  "ghostcrab_search",
  "ghostcrab_status",
  "ghostcrab_tool_search",
  "ghostcrab_traverse",
  "ghostcrab_upsert",
  "ghostcrab_workspace_create",
  "ghostcrab_workspace_delete",
  "ghostcrab_workspace_export_model",
  "ghostcrab_workspace_export_model_toon",
  "ghostcrab_workspace_inspect",
  "ghostcrab_workspace_list",
  "ghostcrab_workspace_reset",
  "ghostcrab_workspace_use"
] as const;

export type ExpectedToolName = (typeof EXPECTED_TOOL_NAMES)[number];

export const BASIC_TOOL_NAMES = getBasicToolNames();

export function getExpectedToolManifest(): {
  total: number;
  basic: number;
  extended: number;
  names: readonly string[];
  basic_names: readonly string[];
  extended_names: string[];
} {
  const basicSet = new Set<string>(BASIC_TOOL_NAMES);
  const extendedNames = EXPECTED_TOOL_NAMES.filter(
    (name) => !basicSet.has(name)
  );

  return {
    total: EXPECTED_TOOL_NAMES.length,
    basic: BASIC_TOOL_NAMES.length,
    extended: extendedNames.length,
    names: EXPECTED_TOOL_NAMES,
    basic_names: BASIC_TOOL_NAMES,
    extended_names: extendedNames
  };
}

export function diffToolNames(
  actual: readonly string[],
  expected: readonly string[] = EXPECTED_TOOL_NAMES
): { missing: string[]; extra: string[] } {
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  const missing = [...expectedSet].filter((name) => !actualSet.has(name)).sort();
  const extra = [...actualSet].filter((name) => !expectedSet.has(name)).sort();
  return { missing, extra };
}
