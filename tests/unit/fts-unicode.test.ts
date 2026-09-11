import { describe, expect, it } from "vitest";
import { buildFtsMatchExpression } from "../../src/db/facets-fts-search.js";
describe("FTS Unicode tokenization", () => {
  it("preserves letters, normalized accents and non-Latin scripts", () => {
    expect(buildFtsMatchExpression("échéance dépassée")).toBe(
      '"échéance" OR "dépassée"'
    );
    expect(buildFtsMatchExpression("e\u0301che\u0301ance")).toBe('"échéance"');
    expect(buildFtsMatchExpression("東京")).toBe('"東京"');
  });
  it("quotes operators and separates punctuation without concatenating words", () => {
    expect(buildFtsMatchExpression('foo-bar OR "baz"*')).toBe(
      '"foo" OR "bar" OR "OR" OR "baz"'
    );
    expect(buildFtsMatchExpression("*** () :")).toBeNull();
  });
});
