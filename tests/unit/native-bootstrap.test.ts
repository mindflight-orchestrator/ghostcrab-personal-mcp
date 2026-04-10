import { beforeEach, describe, expect, it, vi } from "vitest";

describe("bootstrapNativeWithReport", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("runs native bootstrap steps and aggregates readiness", async () => {
    vi.doMock("../../src/db/facets-registration.js", () => ({
      registerPgFacetsWithReport: vi.fn(async () => ({
        ok: true,
        registered: true,
        skipped: false,
        bm25_ready: true
      }))
    }));
    vi.doMock("../../src/db/facets-maintenance.js", () => ({
      mergeFacetDeltasWithReport: vi.fn(async () => ({
        ok: true,
        merged: true,
        skipped: false
      }))
    }));
    vi.doMock("../../src/db/maintenance.js", () => ({
      refreshEntityDegreeWithReport: vi.fn(async () => ({
        ok: true,
        refreshed: true,
        skipped: false
      }))
    }));
    vi.doMock("../../src/db/native-readiness.js", () => ({
      getNativeRuntimeReadiness: vi.fn(async () => ({
        facets: {
          registered: true,
          count: true,
          hierarchy: true,
          bm25: true,
          deltaMerge: true
        },
        dgraph: {
          marketplace: true,
          patch: true,
          confidenceDecay: true,
          entityNeighborhood: true,
          entityDegree: true
        },
        pragma: {
          pack: true
        },
        ontology: {
          available: true,
          resolveWorkspace: true,
          coverageByDomain: true,
          marketplaceByDomain: true,
          exportModel: true,
          validateDdl: true
        }
      }))
    }));

    const { bootstrapNativeWithReport } = await import(
      "../../src/db/native-bootstrap.js"
    );

    await expect(
      bootstrapNativeWithReport(
        "db" as never,
        { pgFacets: true, pgDgraph: true, pgPragma: true }
      )
    ).resolves.toMatchObject({
      ok: true,
      register_pg_facets: { ok: true },
      merge_facet_deltas: { ok: true },
      refresh_entity_degree: { ok: true },
      native_readiness: {
        facets: { bm25: true },
        dgraph: { marketplace: true },
        pragma: { pack: true },
        ontology: { available: true }
      }
    });
  });

  it("reports actionable issues when native extensions are missing or unreadable", async () => {
    const { collectNativeBootstrapIssues } = await import(
      "../../src/db/native-bootstrap.js"
    );

    expect(
      collectNativeBootstrapIssues(
        { pgFacets: false, pgDgraph: true, pgPragma: false, pgMindbrain: false },
        {
          ok: true,
          register_pg_facets: {
            ok: true,
            registered: false,
            skipped: true,
            reason: "pg_facets_not_loaded"
          },
          merge_facet_deltas: {
            ok: true,
            merged: false,
            skipped: true,
            reason: "pg_facets_not_loaded"
          },
          refresh_entity_degree: {
            ok: false,
            refreshed: false,
            skipped: false,
            reason: "entity_degree missing"
          },
          native_readiness: {
            facets: {
              registered: false,
              count: false,
              hierarchy: false,
              bm25: false,
              deltaMerge: false
            },
            dgraph: {
              marketplace: true,
              patch: true,
              confidenceDecay: true,
              entityNeighborhood: true,
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
              validateDdl: false
            }
          }
        }
      )
    ).toEqual([
      "pg_facets is not loaded",
      "pg_pragma is not loaded",
      "pg_mindbrain is not loaded",
      "pg_dgraph entity_degree refresh failed: entity_degree missing",
      "pg_dgraph entity_degree readiness is false"
    ]);
  });
});
