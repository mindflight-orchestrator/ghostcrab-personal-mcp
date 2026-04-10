import type { EmbeddingProvider, EmbeddingRuntimeStatus } from "./types.js";

export class NullEmbeddingProvider implements EmbeddingProvider {
  constructor(private readonly dimensions: number) {}

  async embedMany(texts: string[]): Promise<number[][]> {
    return texts.map(() => []);
  }

  getStatus(): EmbeddingRuntimeStatus {
    return {
      available: true,
      dimensions: this.dimensions,
      mode: "null",
      note: "Null embeddings are enabled for tests that should never touch vector ranking.",
      vectorSearchReady: false,
      writeEmbeddingsEnabled: false
    };
  }
}
