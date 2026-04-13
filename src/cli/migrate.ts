import { ensureBootstrapData } from "../bootstrap/seed.js";
import { redactDatabaseUrl, resolveGhostcrabConfig } from "../config/env.js";
import { createDatabaseClient } from "../db/client.js";
import {
  resolveExtensionCapabilities
} from "../db/extension-probe.js";
import { runMigrations } from "../db/migrate.js";
import {
  bootstrapNativeWithReport,
  collectNativeBootstrapIssues,
  nativeBootstrapDockerGuidance
} from "../db/native-bootstrap.js";

async function main(): Promise<void> {
  const config = resolveGhostcrabConfig();
  const database = createDatabaseClient(config);

  try {
    console.error(
      `[ghostcrab] Running migrations against ${redactDatabaseUrl(config.databaseUrl)}`
    );
    console.error(
      `[ghostcrab] MFO_NATIVE_EXTENSIONS=${config.nativeExtensionsMode}`
    );

    if (config.databaseKind === "sqlite") {
      console.error(
        `[ghostcrab] SQLite mode is backed by MindBrain at ${config.mindbrainUrl}; schema bootstrap is handled there, so migrate is a no-op.`
      );
      return;
    }

    const summary = await runMigrations(database);
    const bootstrapSummary = await ensureBootstrapData(database);

    console.error(
      `[ghostcrab] Migration summary: applied=${summary.applied.length}, skipped=${summary.skipped.length}, discovered=${summary.discovered.length}`
    );

    if (summary.applied.length > 0) {
      console.error(`[ghostcrab] Applied: ${summary.applied.join(", ")}`);
    }

    console.error(
      `[ghostcrab] Bootstrap summary: system=${bootstrapSummary.insertedSystemEntries}, schemas=${bootstrapSummary.insertedSchemas}, ontologies=${bootstrapSummary.insertedOntologies}, records=${bootstrapSummary.insertedProductRecords}, graph_nodes=${bootstrapSummary.insertedGraphNodes}, graph_edges=${bootstrapSummary.insertedGraphEdges}, agent_states=${bootstrapSummary.insertedAgentStates}, projections=${bootstrapSummary.insertedProjections}, skipped=${bootstrapSummary.skipped}`
    );

    if (config.nativeExtensionsMode !== "sql-only") {
      const extensions = await resolveExtensionCapabilities(
        database,
        config.nativeExtensionsMode
      );
      const nativeBootstrap = await bootstrapNativeWithReport(
        database,
        extensions
      );
      const issues = collectNativeBootstrapIssues(extensions, nativeBootstrap);

      if (issues.length > 0) {
        const message =
          `Bootstrap/seed requires a native PostgreSQL stack with pg_facets, pg_dgraph, and pg_pragma. ` +
          `Issues: ${issues.join("; ")}. ${nativeBootstrapDockerGuidance()}`;

        if (config.nativeExtensionsMode === "native") {
          throw new Error(message);
        }

        console.error(`[ghostcrab] WARNING: ${message}`);
      }
    }
  } finally {
    await database.close();
  }
}

void main().catch((error) => {
  console.error(
    `[ghostcrab] Migration failure: ${error instanceof Error ? error.message : String(error)}`
  );
  process.exit(1);
});
