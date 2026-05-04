import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { resolveGhostcrabConfig } from "../../src/config/env.js";

describe("resolveGhostcrabConfig", () => {
  it("uses stable defaults for the phase 0 scaffold", () => {
    const config = resolveGhostcrabConfig({});

    expect(config).toEqual({
      embeddingApiKey: undefined,
      embeddingBaseUrl: "https://openrouter.ai/api/v1",
      embeddingDimensions: 1536,
      embeddingFixturePath: undefined,
      embeddingModel: undefined,
      embeddingTimeoutMs: 30000,
      embeddingsMode: "disabled",
      hybridBm25Weight: 0.6,
      hybridVectorWeight: 0.4,
      mindbrainUrl: "http://127.0.0.1:8091",
      nativeExtensionsMode: "auto",
      nodeEnv: "development",
      resolvedConfigPath: undefined,
      sqlitePath: path.join(process.cwd(), "ghostcrab.sqlite"),
      telemetryEnabled: false,
      telemetryEndpoint: undefined,
      telemetryTimeoutMs: 1500,
      telemetryStateDir: path.join(os.homedir(), ".ghostcrab"),
      telemetryDebug: false,
      agentHost: undefined,
      agentHostSource: undefined,
      executionMode: undefined
    });
  });

  it("parses explicit overrides", () => {
    const config = resolveGhostcrabConfig({
      GHOSTCRAB_MINDBRAIN_URL: "http://mindbrain.internal:8091",
      GHOSTCRAB_SQLITE_PATH: "/tmp/ghostcrab.sqlite",
      MINDBRAIN_NATIVE_EXTENSIONS: "sql-only",
      NODE_ENV: "test",
      GHOSTCRAB_EMBEDDINGS_FIXTURE_PATH: "/tmp/fixtures.json",
      GHOSTCRAB_EMBEDDING_DIMENSIONS: "768",
      GHOSTCRAB_EMBEDDINGS_MODE: "stub"
    });

    expect(config).toEqual({
      embeddingApiKey: undefined,
      embeddingBaseUrl: "https://openrouter.ai/api/v1",
      embeddingDimensions: 768,
      embeddingFixturePath: "/tmp/fixtures.json",
      embeddingModel: undefined,
      embeddingTimeoutMs: 30000,
      embeddingsMode: "fake",
      hybridBm25Weight: 0.6,
      hybridVectorWeight: 0.4,
      mindbrainUrl: "http://mindbrain.internal:8091",
      nativeExtensionsMode: "sql-only",
      nodeEnv: "test",
      resolvedConfigPath: undefined,
      sqlitePath: "/tmp/ghostcrab.sqlite",
      telemetryEnabled: false,
      telemetryEndpoint: undefined,
      telemetryTimeoutMs: 1500,
      telemetryStateDir: path.join(os.homedir(), ".ghostcrab"),
      telemetryDebug: false,
      agentHost: undefined,
      agentHostSource: undefined,
      executionMode: undefined
    });
  });

  it("loads embeddings settings from config.yaml and interpolates env values", () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "ghostcrab-config-"));
    const configPath = path.join(tempDir, "config.yaml");

    writeFileSync(
      configPath,
      [
        "embeddings:",
        "  provider: openrouter",
        "  model: openai/text-embedding-3-small",
        '  api_key: "${OPENROUTER_API_KEY}"',
        "  dimensions: 1536",
        "  timeout_ms: 45000",
        "retrieval:",
        "  hybrid_bm25_weight: 0.7",
        "  hybrid_vector_weight: 0.3"
      ].join("\n"),
      "utf8"
    );

    const config = resolveGhostcrabConfig({
      OPENROUTER_API_KEY: "test-key",
      GHOSTCRAB_CONFIG_PATH: configPath
    });

    expect(config).toMatchObject({
      embeddingApiKey: "test-key",
      embeddingBaseUrl: "https://openrouter.ai/api/v1",
      embeddingDimensions: 1536,
      embeddingModel: "openai/text-embedding-3-small",
      embeddingTimeoutMs: 45000,
      embeddingsMode: "openrouter",
      hybridBm25Weight: 0.7,
      hybridVectorWeight: 0.3,
      resolvedConfigPath: configPath
    });
  });

  it("lets env overrides win over config.yaml for embeddings mode", () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "ghostcrab-config-"));
    const configPath = path.join(tempDir, "config.yaml");

    writeFileSync(
      configPath,
      [
        "embeddings:",
        "  provider: openrouter",
        "  model: openai/text-embedding-3-small",
        "  enabled: true"
      ].join("\n"),
      "utf8"
    );

    const config = resolveGhostcrabConfig({
      GHOSTCRAB_CONFIG_PATH: configPath,
      GHOSTCRAB_EMBEDDINGS_MODE: "fake"
    });

    expect(config.embeddingsMode).toBe("fake");
  });
});
