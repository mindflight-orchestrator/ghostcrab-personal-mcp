import { resolveGhostcrabConfig } from "../config/env.js";
import { createDatabaseClient } from "../db/client.js";
import { getFacetsEmbeddingColumnDimension } from "../db/embedding-dimension.js";
import { resolveExtensionCapabilities } from "../db/extension-probe.js";
import { createEmbeddingProvider } from "../embeddings/provider.js";
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
      config.databaseKind === "postgres"
        ? "Cannot connect to PostgreSQL. Check DATABASE_URL and run `npm run migrate`."
        : `Cannot reach MindBrain at ${config.mindbrainUrl}. Check GHOSTCRAB_MINDBRAIN_URL and start the backend.`
    );
  }

  const embeddingColumnDimension =
    await getFacetsEmbeddingColumnDimension(database);
  if (
    embeddingColumnDimension !== null &&
    embeddingColumnDimension !== config.embeddingDimensions
  ) {
    throw new Error(
      `Embedding dimension mismatch: vector(${embeddingColumnDimension}) vs config ${config.embeddingDimensions}.`
    );
  }

  if (options?.verbose) {
    console.error(
      `[ghostcrab-cli] Connected to ${config.databaseKind === "postgres" ? "PostgreSQL" : `MindBrain-backed SQLite at ${config.mindbrainUrl}`}`
    );
  }

  const extensions =
    config.databaseKind === "postgres"
      ? await resolveExtensionCapabilities(database, config.nativeExtensionsMode)
      : {
          pgFacets: false,
          pgDgraph: false,
          pgPragma: false,
          pgMindbrain: false
        };

  return {
    toolContext: {
      database,
      embeddings,
      extensions,
      nativeExtensionsMode: config.nativeExtensionsMode,
      retrieval: {
        hybridBm25Weight: config.hybridBm25Weight,
        hybridVectorWeight: config.hybridVectorWeight
      }
    },
    cleanup: async () => {
      await database.close();
    }
  };
}
