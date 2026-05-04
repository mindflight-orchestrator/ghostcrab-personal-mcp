import { describe, expect, it, vi } from "vitest";

import type { DatabaseClient } from "../../src/db/client.js";
import type { ExtensionCapabilities } from "../../src/db/extension-probe.js";
import { getNativeRuntimeReadiness } from "../../src/db/native-readiness.js";

function createMockDatabase(query: DatabaseClient["query"]): DatabaseClient {
  return {
    query,
    ping: async () => true,
    close: async () => undefined,
    transaction: async (op) => op({ query: vi.fn(async () => []) })
  };
}

describe("getNativeRuntimeReadiness", () => {
  it("returns all false when no extensions are loaded", async () => {
    const db = createMockDatabase(vi.fn(async () => []));
    const extensions: ExtensionCapabilities = {
      pgFacets: false,
      pgDgraph: false,
      pgPragma: false,
      pgMindbrain: false
    };

    await expect(getNativeRuntimeReadiness(db, extensions)).resolves.toEqual({
      facets: {
        registered: false,
        count: false,
        hierarchy: false,
        bm25: false,
        deltaMerge: false
      },
      dgraph: {
        marketplace: false,
        patch: false,
        confidenceDecay: false,
        entityNeighborhood: false,
        entityDegree: false
      },
      pragma: {
        pack: false
      },
      ontology: {
        available: false,
        resolveWorkspace: false,
        coverageByDomain: false,
        marketplaceByDomain: false,
        exportModel: false,
        validateDdl: false,
        registerEntityType: false,
        registerRelationType: false,
        compareWorkspaces: false,
        bridgeWorkspaces: false,
        findEntityBridges: false,
        detectConflicts: false,
        federatedSearch: false,
        computeOntologyCoverage: false,
        ingestKnowledgeChunk: false,
        ingestKnowledgeBatch: false,
        createProjectTemplate: false,
        instantiateProject: false,
        checkpointProject: false
      }
    });
  });

  it("derives readiness from pg_facets table status plus function presence", async () => {
    const query = vi.fn<DatabaseClient["query"]>(async (sql, params) => {
      if (sql.includes("facets.list_tables")) {
        return [{ has_bm25: true, has_delta: true }];
      }

      if (sql.includes("to_regprocedure")) {
        const signature = String(params?.[0] ?? "");
        return [{
          exists:
            signature.includes("marketplace_search") ||
            signature.includes("resolve_workspace") ||
            signature.includes("coverage_by_domain") ||
            signature.includes("marketplace_search_by_domain") ||
            signature.includes("export_workspace_model") ||
            signature.includes("validate_ddl_proposal") ||
            signature.includes("register_entity_type") ||
            signature.includes("register_relation_type") ||
            signature.includes("compare_workspaces") ||
            signature.includes("bridge_workspaces") ||
            signature.includes("find_entity_bridges") ||
            signature.includes("detect_conflicts") ||
            signature.includes("federated_search") ||
            signature.includes("compute_ontology_coverage") ||
            signature.includes("ingest_knowledge_chunk") ||
            signature.includes("ingest_knowledge_batch") ||
            signature.includes("create_project_template") ||
            signature.includes("instantiate_project") ||
            signature.includes("checkpoint_project")
        }];
      }

      if (sql.includes("to_regclass")) {
        return [{ exists: false }];
      }

      return [];
    });
    const db = createMockDatabase(query);
    const extensions: ExtensionCapabilities = {
      pgFacets: true,
      pgDgraph: true,
      pgPragma: false,
      pgMindbrain: true
    };

    await expect(getNativeRuntimeReadiness(db, extensions)).resolves.toEqual({
      facets: {
        registered: true,
        count: true,
        hierarchy: true,
        bm25: true,
        deltaMerge: true
      },
      dgraph: {
        marketplace: true,
        patch: false,
        confidenceDecay: false,
        entityNeighborhood: false,
        entityDegree: false
      },
      pragma: {
        pack: false
      },
      ontology: {
        available: true,
        resolveWorkspace: true,
        coverageByDomain: true,
        marketplaceByDomain: true,
        exportModel: true,
        validateDdl: true,
        registerEntityType: true,
        registerRelationType: true,
        compareWorkspaces: true,
        bridgeWorkspaces: true,
        findEntityBridges: true,
        detectConflicts: true,
        federatedSearch: true,
        computeOntologyCoverage: true,
        ingestKnowledgeChunk: true,
        ingestKnowledgeBatch: true,
        createProjectTemplate: true,
        instantiateProject: true,
        checkpointProject: true
      }
    });
  });
});
