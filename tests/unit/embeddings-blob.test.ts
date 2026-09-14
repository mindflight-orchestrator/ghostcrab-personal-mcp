import { describe, expect, it } from "vitest";

import { encodeEmbedding } from "../../src/embeddings/blob.js";

describe("encodeEmbedding", () => {
  it("produces the legacy JSON-array write payload", () => {
    expect(encodeEmbedding([0.1, 0.2, 0.3])).toBe("[0.1,0.2,0.3]");
  });

  it("preserves zero, negative, and large magnitudes", () => {
    expect(encodeEmbedding([0, -1, 1.5e10])).toBe("[0,-1,15000000000]");
  });
});
