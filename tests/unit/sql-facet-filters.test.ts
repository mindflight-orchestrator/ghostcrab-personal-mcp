import { describe, expect, it } from "vitest";

import { appendStructuredFacetFilters } from "../../src/tools/facets/sql-facet-filters.js";

describe("appendStructuredFacetFilters", () => {
  it("builds temporal BETWEEN and increments param indices", () => {
    const where: string[] = [];
    const params: unknown[] = [];
    const now = new Date("2026-06-01T10:00:00.000Z");
    const next = appendStructuredFacetFilters(
      where,
      params,
      1,
      {
        temporal_filters: [
          {
            facet_key: "deadline",
            from: "2026-05-01T00:00:00.000Z",
            to: "2026-05-31T23:59:59.999Z"
          }
        ],
        array_filters: {},
        range_filters: []
      },
      now
    );
    expect(next).toBe(4);
    expect(where).toHaveLength(1);
    expect(where[0]).toContain("BETWEEN $2::timestamptz AND $3::timestamptz");
    expect(params[0]).toBe("deadline");
  });

  it("builds array ?| clause", () => {
    const where: string[] = [];
    const params: unknown[] = [];
    const next = appendStructuredFacetFilters(where, params, 1, {
      temporal_filters: [],
      array_filters: { tags: ["Go", "Rust"] },
      range_filters: []
    });
    expect(next).toBe(4);
    expect(where[0]).toContain("?|");
    expect(where[0]).toContain("ARRAY[$2, $3]::text[]");
    expect(params).toEqual(["tags", "Go", "Rust"]);
  });

  it("adds FALSE for empty array filter values", () => {
    const where: string[] = [];
    const params: unknown[] = [];
    appendStructuredFacetFilters(where, params, 1, {
      temporal_filters: [],
      array_filters: { tags: [] },
      range_filters: []
    });
    expect(where).toContain("FALSE");
  });

  it("builds numeric range with open max", () => {
    const where: string[] = [];
    const params: unknown[] = [];
    appendStructuredFacetFilters(where, params, 1, {
      temporal_filters: [],
      array_filters: {},
      range_filters: [{ facet_key: "prix", min: 10 }]
    });
    expect(where[0]).toContain(">=");
    expect(params).toEqual(["prix", 10]);
  });
});
