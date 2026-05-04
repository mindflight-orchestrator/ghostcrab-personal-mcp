export type FacetNativeKind = "plain" | "boolean";

export interface FacetCatalogEntry {
  facetName: string;
  native?: {
    column: string;
    kind: FacetNativeKind;
  };
}

export const FACET_CATALOG: readonly FacetCatalogEntry[] = [
  { facetName: "action" },
  {
    facetName: "activity_family",
    native: { column: "facet_activity_family", kind: "plain" }
  },
  { facetName: "applies_to" },
  { facetName: "autonomy_level" },
  { facetName: "blocker" },
  { facetName: "candidate_activity_families" },
  { facetName: "capability" },
  { facetName: "category" },
  { facetName: "channel" },
  { facetName: "compatibility_state" },
  { facetName: "component" },
  { facetName: "confirmation_required" },
  { facetName: "criticality" },
  { facetName: "customer" },
  { facetName: "default_action" },
  { facetName: "default_projection" },
  { facetName: "default_scope" },
  { facetName: "delivery_surface" },
  { facetName: "domain" },
  { facetName: "examples" },
  { facetName: "endpoint_kind" },
  { facetName: "entry_slug" },
  { facetName: "entry_type" },
  { facetName: "environment" },
  { facetName: "escalation_mode" },
  { facetName: "facet_key" },
  { facetName: "fact_schema_hint" },
  { facetName: "fallback" },
  { facetName: "graph_edge_labels" },
  { facetName: "graph_node_hint" },
  { facetName: "implies_tracking" },
  { facetName: "intent_id" },
  { facetName: "job" },
  { facetName: "keywords" },
  { facetName: "label", native: { column: "facet_label", kind: "plain" } },
  { facetName: "layer" },
  { facetName: "level" },
  { facetName: "maturity" },
  { facetName: "metric_name" },
  { facetName: "node_id" },
  { facetName: "note_kind" },
  { facetName: "owner" },
  { facetName: "pattern_id" },
  { facetName: "phase" },
  { facetName: "platform" },
  { facetName: "policy_id" },
  { facetName: "postgres_major" },
  { facetName: "pr_id" },
  { facetName: "preferred_kpis" },
  { facetName: "preferred_output_formats" },
  { facetName: "preferred_proj_type" },
  { facetName: "priority" },
  { facetName: "privacy_mode" },
  { facetName: "project" },
  { facetName: "projection_kind" },
  { facetName: "provisional_namespace" },
  { facetName: "public_name" },
  { facetName: "readiness" },
  { facetName: "recipe_stage" },
  { facetName: "recommended_action" },
  { facetName: "recommended_activity_family" },
  { facetName: "recommended_schema" },
  { facetName: "record_id", native: { column: "facet_record_id", kind: "plain" } },
  { facetName: "region" },
  { facetName: "render_sections" },
  { facetName: "requires_confirmation" },
  { facetName: "requires_ghostcrab" },
  { facetName: "roadmap_phase" },
  { facetName: "runtime" },
  { facetName: "schema_id", native: { column: "schema_id", kind: "plain" } },
  { facetName: "scope" },
  { facetName: "severity" },
  { facetName: "signal_id" },
  { facetName: "signal_type" },
  { facetName: "source_kind" },
  { facetName: "source_ref" },
  { facetName: "status" },
  { facetName: "surface" },
  { facetName: "system_name" },
  { facetName: "target" },
  { facetName: "target_budget" },
  { facetName: "title", native: { column: "facet_title", kind: "plain" } },
  { facetName: "tool_name" },
  { facetName: "transport" },
  { facetName: "trigger" },
  { facetName: "uri" },
  { facetName: "use_when" },
  { facetName: "version" },
  { facetName: "tier", native: { column: "facet_tier", kind: "plain" } },
  {
    facetName: "app_segment",
    native: { column: "facet_app_segment", kind: "plain" }
  },
  {
    facetName: "churn_risk",
    native: { column: "facet_churn_risk", kind: "plain" }
  },
  {
    facetName: "nationality",
    native: { column: "facet_nationality", kind: "plain" }
  },
  {
    facetName: "game_type",
    native: { column: "facet_game_type", kind: "plain" }
  },
  { facetName: "is_vip", native: { column: "facet_is_vip", kind: "boolean" } },
  {
    facetName: "marketing_consent",
    native: { column: "facet_marketing_consent", kind: "boolean" }
  }
] as const;

const FACET_CATALOG_BY_NAME = new Map(
  FACET_CATALOG.map((entry) => [entry.facetName, entry])
);

export function isKnownFacetName(facetName: string): boolean {
  return FACET_CATALOG_BY_NAME.has(facetName);
}

export function getFacetCatalogEntry(
  facetName: string
): FacetCatalogEntry | null {
  return FACET_CATALOG_BY_NAME.get(facetName) ?? null;
}

export function getNativeFacetCatalogEntries(): Array<{
  column: string;
  facetName: string;
  kind: FacetNativeKind;
}> {
  return FACET_CATALOG.flatMap((entry) =>
    entry.native
      ? [
          {
            column: entry.native.column,
            facetName: entry.facetName,
            kind: entry.native.kind
          }
        ]
      : []
  );
}

function humanizeFacetName(facetName: string): string {
  return facetName
    .replace(/_/g, " ")
    .replace(/\b([a-z])/g, (match) => match.toUpperCase());
}

export function buildFacetDefinitionSeedEntries(): Array<{
  content: Record<string, unknown>;
  facets: Record<string, unknown>;
  lookupFacets: Record<string, unknown>;
  schemaId: string;
}> {
  return FACET_CATALOG.map((entry) => ({
    schemaId: "mindbrain:facet-definition",
    content: {
      facet_name: entry.facetName,
      label: humanizeFacetName(entry.facetName),
      description: `Declared GhostCrab facet key for ${humanizeFacetName(entry.facetName).toLowerCase()}.`,
      native: Boolean(entry.native),
      native_column: entry.native?.column ?? null,
      native_kind: entry.native?.kind ?? null
    },
    facets: {
      facet_name: entry.facetName,
      native: Boolean(entry.native)
    },
    lookupFacets: {
      facet_name: entry.facetName
    }
  }));
}
