import { describe, expect, it, beforeEach } from "vitest";
import { ZodError } from "zod";

import {
  executeTool,
  EXIT_ERROR,
  EXIT_OK,
  EXIT_UNKNOWN_TOOL,
  EXIT_VALIDATION
} from "../../src/cli/execute.js";
import type { DatabaseClient } from "../../src/db/client.js";
import { EmbeddingProviderError } from "../../src/embeddings/errors.js";
import { createEmbeddingProvider } from "../../src/embeddings/provider.js";
import {
  clearToolRegistry,
  createJsonToolResult,
  createToolSuccessResult,
  registerTool,
  type ToolExecutionContext
} from "../../src/tools/registry.js";

function createMockDatabase(): DatabaseClient {
  return {
    query: async () => [],
    ping: async () => true,
    close: async () => undefined,
    transaction: async (operation) => operation({ query: async () => [] })
  };
}

function createMockContext(): ToolExecutionContext {
  return {
    database: createMockDatabase(),
    extensions: {
      pgFacets: false,
      pgDgraph: false,
      pgPragma: false
    },
    nativeExtensionsMode: "auto",
    embeddings: createEmbeddingProvider({
      embeddingApiKey: undefined,
      embeddingBaseUrl: undefined,
      embeddingDimensions: 8,
      embeddingFixturePath: undefined,
      embeddingModel: undefined,
      embeddingTimeoutMs: 1_000,
      embeddingsMode: "disabled"
    }),
    retrieval: {
      hybridBm25Weight: 0.6,
      hybridVectorWeight: 0.4
    }
  };
}

describe("executeTool", () => {
  beforeEach(() => {
    clearToolRegistry();
  });

  it("returns EXIT_UNKNOWN_TOOL when the tool is not registered", async () => {
    const { exitCode, result } = await executeTool(
      "ghostcrab_missing",
      {},
      createMockContext()
    );
    expect(exitCode).toBe(EXIT_UNKNOWN_TOOL);
    expect(result.isError).toBe(true);
  });

  it("returns EXIT_OK on success", async () => {
    registerTool({
      definition: {
        name: "ghostcrab_test_ok",
        description: "ok",
        inputSchema: { type: "object", properties: {} }
      },
      handler: async () =>
        createToolSuccessResult("ghostcrab_test_ok", { value: 1 })
    });

    const { exitCode, result } = await executeTool(
      "ghostcrab_test_ok",
      {},
      createMockContext()
    );
    expect(exitCode).toBe(EXIT_OK);
    expect(result.isError).toBe(false);
  });

  it("returns EXIT_VALIDATION when the handler throws ZodError", async () => {
    registerTool({
      definition: {
        name: "ghostcrab_test_zod",
        description: "zod",
        inputSchema: { type: "object", properties: {} }
      },
      handler: async () => {
        throw new ZodError([]);
      }
    });

    const { exitCode, result } = await executeTool(
      "ghostcrab_test_zod",
      {},
      createMockContext()
    );
    expect(exitCode).toBe(EXIT_VALIDATION);
    expect(result.isError).toBe(true);
  });

  it("returns EXIT_ERROR for generic handler failures", async () => {
    registerTool({
      definition: {
        name: "ghostcrab_test_fail",
        description: "fail",
        inputSchema: { type: "object", properties: {} }
      },
      handler: async () => {
        throw new Error("boom");
      }
    });

    const { exitCode, result } = await executeTool(
      "ghostcrab_test_fail",
      {},
      createMockContext()
    );
    expect(exitCode).toBe(EXIT_ERROR);
    expect(result.isError).toBe(true);
  });

  it("returns EXIT_ERROR when the handler returns an error result", async () => {
    registerTool({
      definition: {
        name: "ghostcrab_test_err_result",
        description: "err",
        inputSchema: { type: "object", properties: {} }
      },
      handler: async () =>
        createJsonToolResult({ ok: false, error: "nope" }, true)
    });

    const { exitCode, result } = await executeTool(
      "ghostcrab_test_err_result",
      {},
      createMockContext()
    );
    expect(exitCode).toBe(EXIT_ERROR);
    expect(result.isError).toBe(true);
  });

  it("classifies EmbeddingProviderError as EXIT_ERROR with embedding_error", async () => {
    registerTool({
      definition: {
        name: "ghostcrab_test_embedding_error",
        description: "embedding error",
        inputSchema: { type: "object", properties: {} }
      },
      handler: async () => {
        throw new EmbeddingProviderError("unknown_error", "Provider failed", {
          recoverable: true
        });
      }
    });

    const { exitCode, result } = await executeTool(
      "ghostcrab_test_embedding_error",
      {},
      createMockContext()
    );

    expect(exitCode).toBe(EXIT_ERROR);
    expect(result.structuredContent).toMatchObject({
      error: {
        code: "embedding_error"
      }
    });
  });

  it("classifies postgres-style error codes as database_error", async () => {
    registerTool({
      definition: {
        name: "ghostcrab_test_database_error",
        description: "db error",
        inputSchema: { type: "object", properties: {} }
      },
      handler: async () => {
        const error = new Error("duplicate key value");
        Object.assign(error, { code: "23505" });
        throw error;
      }
    });

    const { exitCode, result } = await executeTool(
      "ghostcrab_test_database_error",
      {},
      createMockContext()
    );

    expect(exitCode).toBe(EXIT_ERROR);
    expect(result.structuredContent).toMatchObject({
      error: {
        code: "database_error"
      }
    });
  });
});
