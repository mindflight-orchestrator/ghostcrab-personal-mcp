import { describe, it, expect, vi } from "vitest";

import { geoQueryTool } from "../../src/tools/facets/geo.js";
import type { ToolExecutionContext } from "../../src/tools/registry.js";

function makeContext(rowSets: unknown[][]): ToolExecutionContext {
  let callIndex = 0;
  return {
    database: {
      query: vi.fn().mockImplementation(() => {
        const result = rowSets[callIndex] ?? [];
        callIndex += 1;
        return Promise.resolve(result);
      }),
      transaction: vi.fn()
    } as unknown as ToolExecutionContext["database"],
    embeddings: {} as ToolExecutionContext["embeddings"],
    extensions: { pgFacets: false, pgDgraph: false, pgPragma: false },
    nativeExtensionsMode: "sql-only",
    retrieval: { hybridBm25Weight: 0.5, hybridVectorWeight: 0.5 }
  };
}

describe("ghostcrab_query_geo", () => {
  it("returns structured error when geo_entities table does not exist (PostGIS optional)", async () => {
    const ctx = makeContext([[{ exists: false }]]);
    const result = await geoQueryTool.handler(
      { mode: "distance", lat: 48.8566, lon: 2.3522, radius_m: 1000 },
      ctx
    );
    expect(result.isError).toBe(true);
    const data = JSON.parse((result.content[0] as { text: string }).text) as Record<string, unknown>;
    const err = data.error as Record<string, unknown>;
    expect(err.code).toBe("geo_feature_not_available");
    // Error includes PostGIS setup guidance
    expect(String(err.message)).toContain("PostGIS");
    expect(String(err.message)).toContain("migration 010");
    // Details expose the requires field so callers can act programmatically
    const details = err.details as Record<string, unknown>;
    expect(details.feature_status).toBe("optional");
    expect(String(details.requires)).toContain("PostGIS");
  });

  it("returns error when distance mode missing lat/lon/radius", async () => {
    const ctx = makeContext([[{ exists: true }]]);
    const result = await geoQueryTool.handler({ mode: "distance" }, ctx);
    expect(result.isError).toBe(true);
    const data = JSON.parse((result.content[0] as { text: string }).text) as Record<string, unknown>;
    expect((data.error as Record<string, unknown>).code).toBe("missing_parameters");
  });

  it("returns error when bbox mode missing bbox", async () => {
    const ctx = makeContext([[{ exists: true }]]);
    const result = await geoQueryTool.handler({ mode: "bbox" }, ctx);
    expect(result.isError).toBe(true);
  });

  it("queries distance mode and returns results", async () => {
    const fakeRow = {
      source_ref: "place:1",
      workspace_id: "default",
      schema_id: "poi",
      distance_m: 456.7,
      geom_geojson: '{"type":"Point","coordinates":[2.352,48.856]}'
    };
    const ctx = makeContext([[{ exists: true }], [fakeRow]]);
    const result = await geoQueryTool.handler(
      { mode: "distance", lat: 48.8566, lon: 2.3522, radius_m: 1000 },
      ctx
    );
    expect(result.isError).toBeFalsy();
    const data = JSON.parse((result.content[0] as { text: string }).text) as Record<string, unknown>;
    expect(data.ok).toBe(true);
    expect(data.returned).toBe(1);
    const results = data.results as Array<Record<string, unknown>>;
    expect(results[0].source_ref).toBe("place:1");
    expect(results[0].distance_m).toBe(456.7);
    expect(results[0].geometry).toMatchObject({ type: "Point" });
  });

  it("queries bbox mode and returns results", async () => {
    const fakeRow = {
      source_ref: "place:2",
      workspace_id: "default",
      schema_id: null,
      distance_m: null,
      geom_geojson: null
    };
    const ctx = makeContext([[{ exists: true }], [fakeRow]]);
    const result = await geoQueryTool.handler(
      {
        mode: "bbox",
        bbox: { min_lon: 2.0, min_lat: 48.5, max_lon: 2.5, max_lat: 49.0 }
      },
      ctx
    );
    const data = JSON.parse((result.content[0] as { text: string }).text) as Record<string, unknown>;
    expect(data.mode).toBe("bbox");
    expect(data.returned).toBe(1);
  });

  it("applies workspace_id filter", async () => {
    const ctx = makeContext([[{ exists: true }], []]);
    await geoQueryTool.handler(
      { mode: "distance", lat: 0, lon: 0, radius_m: 1000, workspace_id: "my-ws" },
      ctx
    );
    const distanceQuery = (ctx.database.query as ReturnType<typeof vi.fn>).mock.calls[1][0] as string;
    expect(distanceQuery).toContain("workspace_id = $1");
  });

  it("rejects invalid lat (out of range)", async () => {
    const ctx = makeContext([]);
    await expect(
      geoQueryTool.handler({ mode: "distance", lat: 200, lon: 0, radius_m: 100 }, ctx)
    ).rejects.toThrow();
  });
});
