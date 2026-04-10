import { describe, expect, it } from "vitest";

import { TemporalFilterSchema } from "../../src/tools/facets/filter-schemas.js";
import { resolveTemporalBounds } from "../../src/tools/facets/temporal-resolve.js";

describe("resolveTemporalBounds", () => {
  const fixed = new Date("2026-03-15T12:00:00.000Z");

  it("resolves last_7_days", () => {
    const filter = TemporalFilterSchema.parse({
      facet_key: "d",
      relative: "last_7_days"
    });
    const { from, to } = resolveTemporalBounds(filter, fixed);
    expect(from?.toISOString()).toBe("2026-03-08T12:00:00.000Z");
    expect(to?.toISOString()).toBe("2026-03-15T12:00:00.000Z");
  });

  it("resolves this_month in UTC", () => {
    const filter = TemporalFilterSchema.parse({
      facet_key: "d",
      relative: "this_month"
    });
    const { from, to } = resolveTemporalBounds(filter, fixed);
    expect(from?.toISOString()).toBe("2026-03-01T00:00:00.000Z");
    expect(to?.toISOString()).toBe("2026-03-31T23:59:59.999Z");
  });

  it("resolves this_quarter in UTC", () => {
    const filter = TemporalFilterSchema.parse({
      facet_key: "d",
      relative: "this_quarter"
    });
    const { from, to } = resolveTemporalBounds(filter, fixed);
    expect(from?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(to?.toISOString()).toBe("2026-03-31T23:59:59.999Z");
  });

  it("parses absolute from/to", () => {
    const filter = TemporalFilterSchema.parse({
      facet_key: "deadline",
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-12-31T23:59:59.999Z"
    });
    const { from, to } = resolveTemporalBounds(filter, fixed);
    expect(from?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(to?.toISOString()).toBe("2026-12-31T23:59:59.999Z");
  });
});
