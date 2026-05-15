import { describe, expect, it } from "vitest";

import {
  cosineSimilarity,
  decodeEmbedding,
  encodeEmbedding
} from "../../src/embeddings/blob.js";

describe("encodeEmbedding", () => {
  it("produces the canonical JSON-array text payload", () => {
    expect(encodeEmbedding([0.1, 0.2, 0.3])).toBe("[0.1,0.2,0.3]");
  });

  it("preserves zero, negative, and large magnitudes", () => {
    expect(encodeEmbedding([0, -1, 1.5e10])).toBe("[0,-1,15000000000]");
  });

  it("produces an empty bracket pair for an empty vector", () => {
    expect(encodeEmbedding([])).toBe("[]");
  });
});

describe("decodeEmbedding", () => {
  it("round-trips through encodeEmbedding", () => {
    const values = [0.123, -0.456, 1.0, 0];
    const encoded = encodeEmbedding(values);
    expect(decodeEmbedding(encoded)).toEqual(values);
  });

  it("handles whitespace and surrounding noise", () => {
    expect(decodeEmbedding("  [ 0.1 , 0.2 , 0.3 ] ")).toEqual([0.1, 0.2, 0.3]);
  });

  it("returns null for null, undefined, empty, or malformed payloads", () => {
    expect(decodeEmbedding(null)).toBeNull();
    expect(decodeEmbedding(undefined)).toBeNull();
    expect(decodeEmbedding("")).toBeNull();
    expect(decodeEmbedding("not-a-vector")).toBeNull();
    expect(decodeEmbedding("[1, NaN]")).toBeNull();
    expect(decodeEmbedding("[1, , 2]")).toBeNull();
  });

  it("returns an empty array for an empty vector payload", () => {
    expect(decodeEmbedding("[]")).toEqual([]);
  });

  it("decodes a Uint8Array payload", () => {
    const payload = new TextEncoder().encode("[0.5,0.5]");
    expect(decodeEmbedding(payload)).toEqual([0.5, 0.5]);
  });

  it("decodes a Buffer-style JSON payload", () => {
    const bytes = Array.from(new TextEncoder().encode("[0.25,-0.25]"));
    expect(decodeEmbedding({ type: "Buffer", data: bytes })).toEqual([
      0.25, -0.25
    ]);
  });
});

describe("cosineSimilarity", () => {
  it("returns 1 for identical unit vectors", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1, 10);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 10);
  });

  it("returns -1 for opposite vectors", () => {
    expect(cosineSimilarity([1, 1], [-1, -1])).toBeCloseTo(-1, 10);
  });

  it("returns 0 for zero-norm or empty inputs", () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
    expect(cosineSimilarity([], [1, 1])).toBe(0);
    expect(cosineSimilarity([1, 1], [])).toBe(0);
  });

  it("ignores trailing components when lengths differ", () => {
    // The shared prefix [1, 0] is identical → cosine should be 1.
    const result = cosineSimilarity([1, 0], [1, 0, 99]);
    expect(result).toBeCloseTo(1, 10);
  });
});
