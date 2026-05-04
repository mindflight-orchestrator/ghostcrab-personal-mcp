import type { GhostcrabConfig } from "../config/env.js";
import { FakeEmbeddingProvider } from "./fake.js";
import { FixtureEmbeddingProvider } from "./fixture.js";
import { NullEmbeddingProvider } from "./null.js";
import { OpenRouterEmbeddingProvider } from "./openrouter.js";
import type { EmbeddingProvider, EmbeddingRuntimeStatus } from "./types.js";

export type { EmbeddingProvider, EmbeddingRuntimeStatus } from "./types.js";

export function createEmbeddingProvider(
  config: Pick<
    GhostcrabConfig,
    | "embeddingApiKey"
    | "embeddingBaseUrl"
    | "embeddingDimensions"
    | "embeddingFixturePath"
    | "embeddingModel"
    | "embeddingTimeoutMs"
    | "embeddingsMode"
  >
): EmbeddingProvider {
  if (config.embeddingsMode === "openrouter") {
    if (!config.embeddingApiKey) {
      throw new Error(
        "OpenRouter embeddings require GHOSTCRAB_EMBEDDINGS_API_KEY or OPENROUTER_API_KEY."
      );
    }

    if (!config.embeddingModel) {
      throw new Error(
        "OpenRouter embeddings require GHOSTCRAB_EMBEDDINGS_MODEL or embeddings.model in config.yaml."
      );
    }

    return new OpenRouterEmbeddingProvider({
      apiKey: config.embeddingApiKey,
      baseUrl: config.embeddingBaseUrl,
      dimensions: config.embeddingDimensions,
      model: config.embeddingModel,
      timeoutMs: config.embeddingTimeoutMs
    });
  }

  if (config.embeddingsMode === "fake") {
    return new FakeEmbeddingProvider(config.embeddingDimensions);
  }

  if (config.embeddingsMode === "fixture") {
    if (!config.embeddingFixturePath) {
      throw new Error(
        "Fixture embeddings require GHOSTCRAB_EMBEDDINGS_FIXTURE_PATH to be set."
      );
    }

    return new FixtureEmbeddingProvider(
      config.embeddingDimensions,
      config.embeddingFixturePath
    );
  }

  if (config.embeddingsMode === "null") {
    return new NullEmbeddingProvider(config.embeddingDimensions);
  }

  return {
    async embedMany() {
      throw new Error(
        "Embeddings are disabled. Set GHOSTCRAB_EMBEDDINGS_MODE=fake, fixture, or a real provider later."
      );
    },
    getStatus() {
      return {
        available: false,
        dimensions: config.embeddingDimensions,
        mode: "disabled",
        note: "Embeddings are disabled. BM25 remains the active ranking path until vectors are produced and queried end-to-end.",
        vectorSearchReady: false,
        writeEmbeddingsEnabled: false
      };
    }
  };
}

export function getEmbeddingRuntimeStatus(
  config: Pick<
    GhostcrabConfig,
    | "embeddingApiKey"
    | "embeddingBaseUrl"
    | "embeddingDimensions"
    | "embeddingFixturePath"
    | "embeddingModel"
    | "embeddingTimeoutMs"
    | "embeddingsMode"
  >
): EmbeddingRuntimeStatus {
  return createEmbeddingProvider(config).getStatus();
}
