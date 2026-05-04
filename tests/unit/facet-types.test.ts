import { describe, expect, it } from "vitest";

import {
  FACET_TYPES,
  FacetTypeSchema
} from "../../src/types/facet-types.js";
import { SyncFieldSpecSchema } from "../../src/types/facets.js";
import { TemporalFilterSchema } from "../../src/tools/facets/filter-schemas.js";

describe("facet types and SyncFieldSpec validation", () => {
  it("FacetTypeSchema accepts every declared facet type", () => {
    for (const t of FACET_TYPES) {
      expect(FacetTypeSchema.safeParse(t).success).toBe(true);
    }
  });

  it("FacetTypeSchema rejects unknown literals", () => {
    expect(FacetTypeSchema.safeParse("unknown_type").success).toBe(false);
  });

  it("SyncFieldSpecSchema accepts minimal valid specs", () => {
    const parsed = SyncFieldSpecSchema.safeParse({
      column_name: "tags",
      facet_key: "tags",
      index_in_bm25: true
    });
    expect(parsed.success).toBe(true);
  });

  it("SyncFieldSpecSchema accepts optional facet_type", () => {
    const parsed = SyncFieldSpecSchema.safeParse({
      column_name: "deadline",
      facet_key: "deadline",
      index_in_bm25: false,
      facet_type: "temporal"
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.facet_type).toBe("temporal");
    }
  });

  it("SyncFieldSpecSchema rejects invalid facet_type", () => {
    expect(
      SyncFieldSpecSchema.safeParse({
        column_name: "x",
        facet_key: "x",
        index_in_bm25: true,
        facet_type: "not_a_facet_type"
      }).success
    ).toBe(false);
  });

  it("TemporalFilterSchema rejects empty bounds and mixing relative with absolute", () => {
    expect(TemporalFilterSchema.safeParse({ facet_key: "k" }).success).toBe(
      false
    );
    expect(
      TemporalFilterSchema.safeParse({
        facet_key: "k",
        relative: "last_7_days",
        from: "2026-01-01T00:00:00.000Z"
      }).success
    ).toBe(false);
  });
});
