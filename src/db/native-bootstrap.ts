import type { DatabaseClient } from "./client.js";
import type { ExtensionCapabilities } from "./extension-probe.js";
import { mergeFacetDeltasWithReport } from "./facets-maintenance.js";
import { registerPgFacetsWithReport } from "./facets-registration.js";
import { getNativeRuntimeReadiness } from "./native-readiness.js";
import { refreshEntityDegreeWithReport } from "./maintenance.js";

export interface NativeBootstrapReport {
  merge_facet_deltas: Awaited<ReturnType<typeof mergeFacetDeltasWithReport>>;
  native_readiness: Awaited<ReturnType<typeof getNativeRuntimeReadiness>>;
  ok: boolean;
  refresh_entity_degree: Awaited<
    ReturnType<typeof refreshEntityDegreeWithReport>
  >;
  register_pg_facets: Awaited<ReturnType<typeof registerPgFacetsWithReport>>;
}

export async function bootstrapNativeWithReport(
  database: DatabaseClient,
  extensions: ExtensionCapabilities
): Promise<NativeBootstrapReport> {
  const register_pg_facets = await registerPgFacetsWithReport(
    database,
    extensions
  );
  const merge_facet_deltas = await mergeFacetDeltasWithReport(
    database,
    extensions
  );
  const refresh_entity_degree = await refreshEntityDegreeWithReport(
    database,
    extensions
  );
  const native_readiness = await getNativeRuntimeReadiness(database, extensions);

  return {
    ok:
      register_pg_facets.ok &&
      merge_facet_deltas.ok &&
      refresh_entity_degree.ok,
    register_pg_facets,
    merge_facet_deltas,
    refresh_entity_degree,
    native_readiness
  };
}

export function collectNativeBootstrapIssues(
  extensions: ExtensionCapabilities,
  report: NativeBootstrapReport
): string[] {
  const issues: string[] = [];

  if (!extensions.pgFacets) {
    issues.push("pg_facets is not loaded");
  }
  if (!extensions.pgDgraph) {
    issues.push("pg_dgraph is not loaded");
  }
  if (!extensions.pgPragma) {
    issues.push("pg_pragma is not loaded");
  }
  if (!extensions.pgMindbrain) {
    issues.push("pg_mindbrain is not loaded");
  }

  if (
    !report.register_pg_facets.ok &&
    !report.register_pg_facets.skipped &&
    report.register_pg_facets.reason
  ) {
    issues.push(`pg_facets registration failed: ${report.register_pg_facets.reason}`);
  }

  if (
    !report.merge_facet_deltas.ok &&
    !report.merge_facet_deltas.skipped &&
    report.merge_facet_deltas.reason
  ) {
    issues.push(`pg_facets delta merge failed: ${report.merge_facet_deltas.reason}`);
  }

  if (
    !report.refresh_entity_degree.ok &&
    !report.refresh_entity_degree.skipped &&
    report.refresh_entity_degree.reason
  ) {
    issues.push(
      `pg_dgraph entity_degree refresh failed: ${report.refresh_entity_degree.reason}`
    );
  }

  if (extensions.pgFacets) {
    if (!report.native_readiness.facets.registered) {
      issues.push("pg_facets is loaded but facets is not registered");
    }
    if (!report.native_readiness.facets.deltaMerge) {
      issues.push("pg_facets delta merge readiness is false");
    }
  }

  if (extensions.pgDgraph) {
    if (!report.native_readiness.dgraph.marketplace) {
      issues.push("pg_dgraph marketplace_search readiness is false");
    }
    if (!report.native_readiness.dgraph.patch) {
      issues.push("pg_dgraph apply_knowledge_patch readiness is false");
    }
    if (!report.native_readiness.dgraph.confidenceDecay) {
      issues.push("pg_dgraph confidence_decay readiness is false");
    }
    if (!report.native_readiness.dgraph.entityNeighborhood) {
      issues.push("pg_dgraph entity_neighborhood readiness is false");
    }
    if (!report.native_readiness.dgraph.entityDegree) {
      issues.push("pg_dgraph entity_degree readiness is false");
    }
  }

  if (extensions.pgPragma && !report.native_readiness.pragma.pack) {
    issues.push("pg_pragma pragma_pack_context readiness is false");
  }

  if (extensions.pgMindbrain && !report.native_readiness.ontology.available) {
    issues.push("pg_mindbrain mb_ontology readiness is false");
  }

  return issues;
}

export function nativeBootstrapDockerGuidance(): string {
  return (
    "Start PostgreSQL with the native stack: " +
    "`docker compose -f docker/docker-compose.native.yml up -d --build postgres`"
  );
}
