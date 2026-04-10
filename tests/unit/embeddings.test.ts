import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createEmbeddingProvider } from "../../src/embeddings/provider.js";

describe("embedding provider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports disabled mode by default", () => {
    const provider = createEmbeddingProvider({
      embeddingApiKey: undefined,
      embeddingBaseUrl: undefined,
      embeddingsMode: "disabled",
      embeddingDimensions: 8,
      embeddingModel: undefined,
      embeddingTimeoutMs: 1_000
    });

    expect(provider.getStatus()).toMatchObject({
      available: false,
      dimensions: 8,
      mode: "disabled",
      vectorSearchReady: false,
      writeEmbeddingsEnabled: false
    });
  });

  it("returns deterministic fake vectors when enabled", async () => {
    const provider = createEmbeddingProvider({
      embeddingApiKey: undefined,
      embeddingBaseUrl: undefined,
      embeddingFixturePath: undefined,
      embeddingsMode: "fake",
      embeddingDimensions: 8,
      embeddingModel: undefined,
      embeddingTimeoutMs: 1_000
    });

    const [first, second] = await provider.embedMany(["ghostcrab", "ghostcrab"]);
    const [different] = await provider.embedMany(["postgres"]);

    expect(first).toEqual(second);
    expect(first).not.toEqual(different);
    expect(first).toHaveLength(8);
  });

  it("returns empty vectors for the null provider", async () => {
    const provider = createEmbeddingProvider({
      embeddingApiKey: undefined,
      embeddingBaseUrl: undefined,
      embeddingFixturePath: undefined,
      embeddingsMode: "null",
      embeddingDimensions: 8,
      embeddingModel: undefined,
      embeddingTimeoutMs: 1_000
    });

    const [first] = await provider.embedMany(["ghostcrab"]);

    expect(first).toEqual([]);
    expect(provider.getStatus()).toMatchObject({
      mode: "null",
      vectorSearchReady: false,
      writeEmbeddingsEnabled: false
    });
  });

  it("loads vectors from fixtures and falls back to fake embeddings", async () => {
    const fixturePath = path.join(
      process.cwd(),
      "tests/fixtures/embeddings.small.json"
    );
    const provider = createEmbeddingProvider({
      embeddingApiKey: undefined,
      embeddingBaseUrl: undefined,
      embeddingFixturePath: fixturePath,
      embeddingsMode: "fixture",
      embeddingDimensions: 8,
      embeddingModel: undefined,
      embeddingTimeoutMs: 1_000
    });

    const [fixtureVector, fallbackVector] = await provider.embedMany([
      "gdpr article 49",
      "unknown text"
    ]);

    expect(fixtureVector).toEqual([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.2, 0.1]);
    expect(fallbackVector).toHaveLength(8);
    expect(provider.getStatus()).toMatchObject({
      mode: "fixture",
      vectorSearchReady: true,
      writeEmbeddingsEnabled: true
    });
  });

  it("calls OpenRouter and validates vector dimensions", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            index: 0,
            embedding: [0.1, 0.2, 0.3, 0.4]
          }
        ]
      })
    });

    vi.stubGlobal("fetch", fetchMock);

    const provider = createEmbeddingProvider({
      embeddingApiKey: "test-key",
      embeddingBaseUrl: "https://openrouter.ai/api/v1",
      embeddingDimensions: 4,
      embeddingFixturePath: undefined,
      embeddingModel: "openai/text-embedding-3-small",
      embeddingTimeoutMs: 1_000,
      embeddingsMode: "openrouter"
    });

    const [vector] = await provider.embedMany(["ghostcrab"]);

    expect(vector).toEqual([0.1, 0.2, 0.3, 0.4]);
    expect(provider.getStatus()).toMatchObject({
      available: true,
      dimensions: 4,
      mode: "openrouter",
      model: "openai/text-embedding-3-small",
      vectorSearchReady: true,
      writeEmbeddingsEnabled: true
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("marks auth failures as non-recoverable", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      json: async () => ({
        error: {
          message: "Invalid API key"
        }
      })
    });

    vi.stubGlobal("fetch", fetchMock);

    const provider = createEmbeddingProvider({
      embeddingApiKey: "bad-key",
      embeddingBaseUrl: "https://openrouter.ai/api/v1",
      embeddingDimensions: 4,
      embeddingFixturePath: undefined,
      embeddingModel: "openai/text-embedding-3-small",
      embeddingTimeoutMs: 1_000,
      embeddingsMode: "openrouter"
    });

    await expect(provider.embedMany(["ghostcrab"])).rejects.toThrow(
      "Invalid API key"
    );
    expect(provider.getStatus()).toMatchObject({
      available: false,
      mode: "openrouter",
      vectorSearchReady: false,
      writeEmbeddingsEnabled: false,
      failure: {
        code: "auth_error",
        recoverable: false
      }
    });
  });
});
