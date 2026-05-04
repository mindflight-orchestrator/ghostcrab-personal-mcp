import { beforeEach, describe, expect, it } from "vitest";

import type { DatabaseClient } from "../../src/db/client.js";
import { createEmbeddingProvider } from "../../src/embeddings/provider.js";
import {
  clearToolRegistry,
  createToolErrorResult,
  createToolSuccessResult,
  createJsonToolResult,
  createTextToolResult,
  getRegisteredTool,
  listRegisteredTools,
  registerTool
} from "../../src/tools/registry.js";

function createMockDatabase(): DatabaseClient {
  return {
    query: async () => [],
    ping: async () => true,
    close: async () => undefined,
    transaction: async (operation) => operation({ query: async () => [] })
  };
}

function createMockEmbeddings() {
  return createEmbeddingProvider({
    embeddingApiKey: undefined,
    embeddingBaseUrl: undefined,
    embeddingDimensions: 8,
    embeddingFixturePath: undefined,
    embeddingModel: undefined,
    embeddingTimeoutMs: 1_000,
    embeddingsMode: "disabled"
  });
}

describe("tool registry", () => {
  beforeEach(() => {
    clearToolRegistry();
  });

  it("starts empty so phase 1 does not promise tools too early", () => {
    expect(listRegisteredTools()).toEqual([]);
  });

  it("registers and resolves tools by name", async () => {
    registerTool({
      definition: {
        name: "ghostcrab_test",
        description: "Test tool",
        inputSchema: {
          type: "object",
          properties: {}
        }
      },
      handler: async () => createJsonToolResult({ ok: true })
    });

    const tool = getRegisteredTool("ghostcrab_test");

    expect(listRegisteredTools()).toHaveLength(1);
    expect(tool?.definition.name).toBe("ghostcrab_test");
    await expect(
      tool?.handler(
        {},
        {
          database: createMockDatabase(),
          embeddings: createMockEmbeddings(),
          extensions: {
            pgFacets: false,
            pgDgraph: false,
            pgPragma: false
          },
          nativeExtensionsMode: "auto",
          retrieval: {
            hybridBm25Weight: 0.6,
            hybridVectorWeight: 0.4
          }
        }
      )
    ).resolves.toEqual(createJsonToolResult({ ok: true }));
  });

  it("rejects duplicate tool registration", () => {
    const tool = {
      definition: {
        name: "ghostcrab_test",
        inputSchema: {
          type: "object",
          properties: {}
        }
      },
      handler: async () => createTextToolResult("ok")
    };

    registerTool(tool);

    expect(() => registerTool(tool)).toThrow("Tool already registered");
  });

  it("wraps structured tool payloads in a stable public envelope", () => {
    const result = createToolSuccessResult("ghostcrab_test", { value: 1 });

    expect(result.structuredContent).toMatchObject({
      ok: true,
      tool: "ghostcrab_test",
      value: 1
    });
  });

  it("returns structured tool errors with error metadata", () => {
    const result = createToolErrorResult(
      "ghostcrab_test",
      "Something failed",
      "test_error"
    );

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      ok: false,
      tool: "ghostcrab_test",
      error: {
        code: "test_error",
        message: "Something failed"
      }
    });
  });
});
