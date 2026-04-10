import type { DatabaseClient } from "./client.js";
import type { ExtensionCapabilities } from "./extension-probe.js";
import { getPgFacetsTableStatus } from "./facets-runtime.js";

export interface NativeRuntimeReadiness {
  dgraph: {
    confidenceDecay: boolean;
    entityDegree: boolean;
    entityNeighborhood: boolean;
    marketplace: boolean;
    patch: boolean;
  };
  facets: {
    bm25: boolean;
    count: boolean;
    deltaMerge: boolean;
    hierarchy: boolean;
    registered: boolean;
  };
  pragma: {
    pack: boolean;
  };
  ontology: {
    available: boolean;
    resolveWorkspace: boolean;
    coverageByDomain: boolean;
    marketplaceByDomain: boolean;
    exportModel: boolean;
    validateDdl: boolean;
  };
}

async function functionExists(
  database: DatabaseClient,
  signature: string
): Promise<boolean> {
  const [row] = await database.query<{ exists: boolean }>(
    `SELECT to_regprocedure($1) IS NOT NULL AS exists`,
    [signature]
  );
  return row?.exists ?? false;
}

async function relationExists(
  database: DatabaseClient,
  qualifiedName: string
): Promise<boolean> {
  const [row] = await database.query<{ exists: boolean }>(
    `SELECT to_regclass($1) IS NOT NULL AS exists`,
    [qualifiedName]
  );
  return row?.exists ?? false;
}

export async function getNativeRuntimeReadiness(
  database: DatabaseClient,
  extensions: ExtensionCapabilities
): Promise<NativeRuntimeReadiness> {
  const facetsStatus = extensions.pgFacets
    ? await getPgFacetsTableStatus(database).catch(() => ({
        registered: false,
        hasBm25: false,
        hasDelta: false
      }))
    : {
        registered: false,
        hasBm25: false,
        hasDelta: false
      };

  const [
    dgraphMarketplace,
    dgraphPatch,
    dgraphConfidenceDecay,
    dgraphEntityNeighborhood,
    dgraphEntityDegree,
    pragmaPack,
    ontologyResolveWorkspace,
    ontologyCoverageByDomain,
    ontologyMarketplaceByDomain,
    ontologyExportModel,
    ontologyValidateDdl
  ] = await Promise.all([
    extensions.pgDgraph
      ? functionExists(
          database,
          "graph.marketplace_search(text,text,real,integer,integer)"
        )
      : Promise.resolve(false),
    extensions.pgDgraph
      ? functionExists(database, "graph.apply_knowledge_patch(bigint,text)")
      : Promise.resolve(false),
    extensions.pgDgraph
      ? functionExists(database, "graph.confidence_decay(bigint,integer)")
      : Promise.resolve(false),
    extensions.pgDgraph
      ? functionExists(
          database,
          "graph.entity_neighborhood(bigint,integer,integer,real)"
        )
      : Promise.resolve(false),
    extensions.pgDgraph
      ? relationExists(database, "graph.entity_degree")
      : Promise.resolve(false),
    extensions.pgPragma
      ? functionExists(database, "pragma_pack_context(text,text,integer)")
      : Promise.resolve(false),
    extensions.pgMindbrain
      ? functionExists(database, "mb_ontology.resolve_workspace(text)")
      : Promise.resolve(false),
    extensions.pgMindbrain
      ? functionExists(
          database,
          "mb_ontology.coverage_by_domain(text,text[],double precision,integer)"
        )
      : Promise.resolve(false),
    extensions.pgMindbrain
      ? functionExists(
          database,
          "mb_ontology.marketplace_search_by_domain(text,text,uuid[],double precision,integer,facets.facet_filter[],integer)"
        )
      : Promise.resolve(false),
    extensions.pgMindbrain
      ? functionExists(database, "mb_ontology.export_workspace_model(text)")
      : Promise.resolve(false),
    extensions.pgMindbrain
      ? functionExists(
          database,
          "mb_ontology.validate_ddl_proposal(text,text,jsonb,jsonb)"
        )
      : Promise.resolve(false)
  ]);

  const ontologyAvailable =
    ontologyResolveWorkspace &&
    ontologyCoverageByDomain &&
    ontologyMarketplaceByDomain &&
    ontologyExportModel &&
    ontologyValidateDdl;

  return {
    facets: {
      registered: facetsStatus.registered,
      count: facetsStatus.registered,
      hierarchy: facetsStatus.registered,
      bm25: facetsStatus.hasBm25,
      deltaMerge: facetsStatus.hasDelta
    },
    dgraph: {
      marketplace: dgraphMarketplace,
      patch: dgraphPatch,
      confidenceDecay: dgraphConfidenceDecay,
      entityNeighborhood: dgraphEntityNeighborhood,
      entityDegree: dgraphEntityDegree
    },
    pragma: {
      pack: pragmaPack
    },
    ontology: {
      available: ontologyAvailable,
      resolveWorkspace: ontologyResolveWorkspace,
      coverageByDomain: ontologyCoverageByDomain,
      marketplaceByDomain: ontologyMarketplaceByDomain,
      exportModel: ontologyExportModel,
      validateDdl: ontologyValidateDdl
    }
  };
}
