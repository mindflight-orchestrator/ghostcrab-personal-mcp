import { resolveGhostcrabConfig } from "../config/env.js";
import { createDatabaseClient } from "../db/client.js";
import { createEmbeddingProvider } from "../embeddings/provider.js";
import { getSessionContext } from "../mcp/session-context.js";
import type { ToolExecutionContext } from "../tools/registry.js";

export interface CliContext {
  toolContext: ToolExecutionContext;
  cleanup: () => Promise<void>;
}

export async function initToolContext(options?: {
  verbose?: boolean;
}): Promise<CliContext> {
  const config = resolveGhostcrabConfig();
  const database = createDatabaseClient(config);
  const embeddings = createEmbeddingProvider(config);

  const reachable = await database.ping();
  if (!reachable) {
    throw new Error(
      `Cannot reach MindBrain backend at ${config.mindbrainUrl}. Check GHOSTCRAB_MINDBRAIN_URL and ensure ghostcrab-backend is running.`
    );
  }

  if (options?.verbose) {
    console.error(
      `[ghostcrab-cli] Connected to MindBrain-backed SQLite at ${config.mindbrainUrl}`
    );
  }

  return {
    toolContext: {
      database,
      embeddings,
      extensions: {
        pgFacets: false,
        pgDgraph: false,
        pgPragma: false,
        pgMindbrain: false
      },
      nativeExtensionsMode: config.nativeExtensionsMode,
      retrieval: {
        hybridBm25Weight: config.hybridBm25Weight,
        hybridVectorWeight: config.hybridVectorWeight
      },
      session: getSessionContext()
    },
    cleanup: async () => {
      await database.close();
    }
  };
}
