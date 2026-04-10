import type { EmbeddingProvider, EmbeddingRuntimeStatus } from "./types.js";
import { createDeterministicUnitVector } from "./vector.js";

export class FakeEmbeddingProvider implements EmbeddingProvider {
  constructor(private readonly dimensions: number) {}

  async embedMany(texts: string[]): Promise<number[][]> {
    return texts.map((text) =>
      createDeterministicUnitVector(text, this.dimensions)
    );
  }

  getStatus(): EmbeddingRuntimeStatus {
    return {
      available: true,
      dimensions: this.dimensions,
      mode: "fake",
      note: "Fake deterministic embeddings are enabled for local validation and tests.",
      vectorSearchReady: true,
      writeEmbeddingsEnabled: true
    };
  }
}
