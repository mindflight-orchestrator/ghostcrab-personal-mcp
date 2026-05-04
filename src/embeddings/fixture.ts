import { readFile } from "node:fs/promises";

import type { EmbeddingProvider, EmbeddingRuntimeStatus } from "./types.js";
import { FakeEmbeddingProvider } from "./fake.js";

export class FixtureEmbeddingProvider implements EmbeddingProvider {
  private readonly fallbackProvider: FakeEmbeddingProvider;
  private fixturePromise?: Promise<Record<string, number[]>>;

  constructor(
    private readonly dimensions: number,
    private readonly fixturePath: string
  ) {
    this.fallbackProvider = new FakeEmbeddingProvider(dimensions);
  }

  async embedMany(texts: string[]): Promise<number[][]> {
    const fixtures = await this.loadFixtures();

    return Promise.all(
      texts.map(async (text) => {
        const key = text.trim().toLowerCase();
        const fixture = fixtures[key];

        if (Array.isArray(fixture) && fixture.length === this.dimensions) {
          return fixture;
        }

        const [fallback] = await this.fallbackProvider.embedMany([text]);
        return fallback;
      })
    );
  }

  getStatus(): EmbeddingRuntimeStatus {
    return {
      available: true,
      dimensions: this.dimensions,
      mode: "fixture",
      note: "Fixture embeddings are enabled. Unknown texts fall back to deterministic fake embeddings.",
      vectorSearchReady: true,
      writeEmbeddingsEnabled: true
    };
  }

  private async loadFixtures(): Promise<Record<string, number[]>> {
    if (!this.fixturePromise) {
      this.fixturePromise = readFile(this.fixturePath, "utf8").then((raw) => {
        const parsed = JSON.parse(raw) as Record<string, unknown>;

        return Object.fromEntries(
          Object.entries(parsed).filter(
            (entry): entry is [string, number[]] =>
              Array.isArray(entry[1]) &&
              entry[1].every((value) => typeof value === "number")
          )
        );
      });
    }

    return this.fixturePromise;
  }
}
