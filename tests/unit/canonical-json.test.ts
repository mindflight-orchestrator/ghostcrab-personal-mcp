import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  canonicalJsonHash,
  canonicalJsonText,
  MINDBRAIN_CANONICAL_JSON_FORMAT
} from "../../src/db/canonical-json.js";

type Fixture = {
  format: string;
  vectors: Array<{ value: unknown; canonical: string; sha256: string }>;
};

// Transport vectors shared with pg_mindbrain 2.0 and with ghostcrab-mcp: a
// fact written from either engine must hash to the same source_ref, so the
// canonical encoder is pinned byte-for-byte rather than merely "some hash".

describe("mindbrain canonical JSON parity", () => {
  const fixture = JSON.parse(
    readFileSync(
      new URL("../fixtures/canonical_hash-v1.json", import.meta.url),
      "utf8"
    )
  ) as Fixture;

  it("matches every pg_mindbrain 2.0 transport vector byte-for-byte", () => {
    expect(fixture.format).toBe(MINDBRAIN_CANONICAL_JSON_FORMAT);
    for (const vector of fixture.vectors) {
      expect(canonicalJsonText(vector.value)).toBe(vector.canonical);
      expect(canonicalJsonHash(vector.value)).toBe(vector.sha256);
    }
  });

  it("normalizes key order, decimal spelling and negative zero", () => {
    expect(canonicalJsonHash({ b: 2, a: 1 })).toBe(
      canonicalJsonHash({ a: 1.0, b: 2.0 })
    );
    expect(canonicalJsonText(-0)).toBe("d1:0");
  });
});
