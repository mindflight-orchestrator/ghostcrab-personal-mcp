import { describe, expect, it } from "vitest";

import { readCountFromSqlPayload } from "../../bin/lib/backend-sqlite-alignment.mjs";

describe("backend sqlite alignment", () => {
  it("reads count from the real MindBrain SQL response shape", () => {
    expect(
      readCountFromSqlPayload({
        ok: true,
        columns: ["count"],
        rows: [[3]],
        changes: 0
      })
    ).toBe(3);
  });

  it("falls back to object rows for defensive compatibility", () => {
    expect(
      readCountFromSqlPayload({
        rows: [{ count: 5 }]
      })
    ).toBe(5);
  });

  it("uses the first column when SQL columns are omitted", () => {
    expect(
      readCountFromSqlPayload({
        rows: [[7]]
      })
    ).toBe(7);
  });
});
