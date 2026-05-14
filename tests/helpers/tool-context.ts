import type { DatabaseClient } from "../../src/db/client.js";
import { createEmbeddingProvider } from "../../src/embeddings/provider.js";
import type { SessionContext } from "../../src/mcp/session-context.js";
import type { ToolExecutionContext } from "../../src/tools/registry.js";

export function createToolContext(
  database: DatabaseClient,
  options?: {
    embeddingDimensions?: number;
    embeddingFixturePath?: string;
    embeddingsMode?: "disabled" | "fake" | "fixture" | "null" | "openrouter";
    hybridBm25Weight?: number;
    hybridVectorWeight?: number;
  }
): ToolExecutionContext {
  return {
    database,
    embeddings: createEmbeddingProvider({
      embeddingApiKey: undefined,
      embeddingBaseUrl: undefined,
      embeddingDimensions: options?.embeddingDimensions ?? 8,
      embeddingFixturePath: options?.embeddingFixturePath,
      embeddingModel: undefined,
      embeddingTimeoutMs: 1_000,
      embeddingsMode: options?.embeddingsMode ?? "disabled"
    }),
    retrieval: {
      hybridBm25Weight: options?.hybridBm25Weight ?? 0.6,
      hybridVectorWeight: options?.hybridVectorWeight ?? 0.4
    },
    session: {
      workspace_id: "default",
      schema_id: null
    } satisfies SessionContext
  };
}
