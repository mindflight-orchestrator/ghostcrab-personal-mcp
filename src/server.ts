import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import { ZodError } from "zod";

import { ensureBootstrapData } from "./bootstrap/seed.js";
import { redactDatabaseUrl, resolveGhostcrabConfig } from "./config/env.js";
import { createDatabaseClient } from "./db/client.js";
import { getFacetsEmbeddingColumnDimension } from "./db/embedding-dimension.js";
import {
  type ExtensionCapabilities,
  resolveExtensionCapabilities
} from "./db/extension-probe.js";
import {
  bootstrapNativeWithReport,
  collectNativeBootstrapIssues,
  nativeBootstrapDockerGuidance
} from "./db/native-bootstrap.js";
import { EmbeddingProviderError } from "./embeddings/errors.js";
import { createEmbeddingProvider } from "./embeddings/provider.js";
import { registerAllTools } from "./tools/register-all.js";
import {
  createToolErrorResult,
  createToolSuccessResult,
  getRegisteredTool,
  listRegisteredTools
} from "./tools/registry.js";
import { getPackageVersion } from "./version.js";

interface ServerState {
  databaseReady: boolean;
  bootstrapComplete: boolean;
  extensions: ExtensionCapabilities;
  startupError: string | null;
}

function classifyToolExecutionError(error: unknown): string {
  if (error instanceof ZodError) {
    return "validation_error";
  }

  if (error instanceof EmbeddingProviderError) {
    return "embedding_error";
  }

  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) {
      return "database_error";
    }
  }

  return "tool_execution_error";
}

export async function startMcpServer(): Promise<void> {
  registerAllTools();

  const config = resolveGhostcrabConfig();
  const version = await getPackageVersion();
  const database = createDatabaseClient(config);
  const embeddings = createEmbeddingProvider(config);
  const transport = new StdioServerTransport();

  const serverState: ServerState = {
    databaseReady: false,
    bootstrapComplete: false,
    extensions: { pgFacets: false, pgDgraph: false, pgPragma: false },
    startupError: null
  };

  let isShuttingDown = false;

  const shutdown = async (code: number, reason: string): Promise<void> => {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;
    console.error(`[ghostcrab] ${reason}`);

    await database.close().catch((error) => {
      console.error("[ghostcrab] Failed to close database handle:", error);
    });

    process.exit(code);
  };

  try {
    console.error(`[ghostcrab] Starting MCP server v${version}`);
    console.error(`[ghostcrab] GHOSTCRAB_DATABASE_KIND=${config.databaseKind}`);
    if (config.databaseKind === "postgres") {
      console.error(
        `[ghostcrab] DATABASE_URL=${redactDatabaseUrl(config.databaseUrl)}`
      );
      console.error(`[ghostcrab] PG_POOL_MAX=${config.pgPoolMax}`);
    } else {
      console.error(`[ghostcrab] GHOSTCRAB_MINDBRAIN_URL=${config.mindbrainUrl}`);
    }
    console.error(
      `[ghostcrab] GHOSTCRAB_EMBEDDINGS_MODE=${config.embeddingsMode} (${config.embeddingDimensions} dims${config.embeddingModel ? `, model=${config.embeddingModel}` : ""})`
    );
    console.error(
      `[ghostcrab] GHOSTCRAB_HYBRID_WEIGHTS=bm25:${config.hybridBm25Weight}, vector:${config.hybridVectorWeight}`
    );
    console.error(
      `[ghostcrab] MFO_NATIVE_EXTENSIONS=${config.nativeExtensionsMode}`
    );

    const databaseIsReachable = await database.ping();
    const { maybeSendStartupPing } = await import("./telemetry/index.js");

    // Best-effort telemetry must never delay or block server startup.
    void maybeSendStartupPing(config, databaseIsReachable);

    if (databaseIsReachable) {
      if (config.databaseKind === "postgres") {
        const embeddingColumnDimension =
          await getFacetsEmbeddingColumnDimension(database);

        if (
          embeddingColumnDimension !== null &&
          embeddingColumnDimension !== config.embeddingDimensions
        ) {
          throw new Error(
            `Embedding dimension mismatch: mfo_facets.embedding is vector(${embeddingColumnDimension}) in the database but GHOSTCRAB_EMBEDDING_DIMENSIONS=${config.embeddingDimensions}. Align them or adjust migrations.`
          );
        }

        serverState.extensions = await resolveExtensionCapabilities(
          database,
          config.nativeExtensionsMode
        );
      } else {
        serverState.extensions = {
          pgFacets: false,
          pgDgraph: false,
          pgPragma: false,
          pgMindbrain: false
        };
      }

      serverState.databaseReady = true;
    } else {
      serverState.startupError =
        config.databaseKind === "postgres"
          ? `Cannot reach PostgreSQL at ${redactDatabaseUrl(config.databaseUrl)}. Ensure the database is running and DATABASE_URL is correct, then restart the MCP server.`
          : `Cannot reach MindBrain at ${config.mindbrainUrl}. Ensure the MindBrain server is running, then restart the MCP server.`;
      console.error(`[ghostcrab] WARNING: ${serverState.startupError}`);
      console.error(
        `[ghostcrab] Starting in degraded mode — tools will return errors until the database is available.`
      );
    }

    const instructions = databaseIsReachable
      ? config.databaseKind === "postgres"
        ? `GhostCrab is a PostgreSQL-backed MCP memory server. Target database: ${redactDatabaseUrl(config.databaseUrl)}. Database is reachable. ${listRegisteredTools().length} tools available.`
        : `GhostCrab is an MCP proxy for MindBrain-backed SQLite. MindBrain URL: ${config.mindbrainUrl}. Database is reachable. ${listRegisteredTools().length} tools available.`
      : config.databaseKind === "postgres"
        ? `GhostCrab is a PostgreSQL-backed MCP memory server. Target database: ${redactDatabaseUrl(config.databaseUrl)}. WARNING: database is unreachable. Call ghostcrab_status for diagnostics. Tools will return errors until the database is available and the MCP server is restarted.`
        : `GhostCrab is an MCP proxy for MindBrain-backed SQLite. MindBrain URL: ${config.mindbrainUrl}. WARNING: database is unreachable. Call ghostcrab_status for diagnostics. Tools will return errors until the database is available and the MCP server is restarted.`;

    const server = new Server(
      {
        name: "ghostcrab",
        version
      },
      {
        capabilities: {
          tools: {}
        },
        instructions
      }
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: listRegisteredTools()
      };
    });

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      // Degraded mode: database is unreachable. ghostcrab_status returns a
      // diagnostic snapshot; all other tools return a structured error.
      if (!serverState.databaseReady) {
        if (request.params.name === "ghostcrab_status") {
          return createToolSuccessResult("ghostcrab_status", {
            agent_id:
              typeof request.params.arguments?.agent_id === "string"
                ? request.params.arguments.agent_id
                : "agent:self",
            snapshot_at: new Date().toISOString(),
            summary: {
              health: "RED",
              agent_state: "DB_UNREACHABLE",
              database_url: redactDatabaseUrl(config.databaseUrl),
              hint: "Ensure PostgreSQL is running, then restart the MCP server."
            },
            operational: {
              health: "RED",
              state: "DB_UNREACHABLE"
            },
            directives: [
              {
                condition: "database_unreachable",
                action: "check_database_and_restart_mcp"
              }
            ],
            next_actions: ["check_database_and_restart_mcp"]
          });
        }

        return createToolErrorResult(
          request.params.name,
          serverState.startupError ??
            `GhostCrab cannot reach PostgreSQL at ${redactDatabaseUrl(config.databaseUrl)}.`,
          "database_unavailable",
          {
            database_url: redactDatabaseUrl(config.databaseUrl),
            hint: "Ensure PostgreSQL is running and DATABASE_URL is correct, then restart the MCP server."
          }
        );
      }

      const tool = getRegisteredTool(request.params.name);

      if (!tool) {
        return createToolErrorResult(
          request.params.name,
          `Unknown tool: ${request.params.name}`,
          "unknown_tool",
          {
            available_tools: listRegisteredTools().map((item) => item.name)
          }
        );
      }

      try {
        return await tool.handler(request.params.arguments ?? {}, {
          database,
          embeddings,
          extensions: serverState.extensions,
          nativeExtensionsMode: config.nativeExtensionsMode,
          retrieval: {
            hybridBm25Weight: config.hybridBm25Weight,
            hybridVectorWeight: config.hybridVectorWeight
          }
        });
      } catch (error) {
        const message =
          error instanceof ZodError
            ? "Invalid tool arguments. Check the tool schema."
            : error instanceof Error
              ? error.message
              : "Unknown tool execution error";

        if (error instanceof ZodError) {
          console.error("[ghostcrab] ZodError:", JSON.stringify(error.issues));
        }

        return createToolErrorResult(
          request.params.name,
          message,
          classifyToolExecutionError(error)
        );
      }
    });

    transport.onerror = (error) => {
      console.error("[ghostcrab] Stdio transport error:", error);
    };

    transport.onclose = () => {
      void shutdown(0, "Stdio transport closed");
    };

    process.once("SIGINT", () => {
      void shutdown(0, "Received SIGINT");
    });

    process.once("SIGTERM", () => {
      void shutdown(0, "Received SIGTERM");
    });

    // Connect transport first so Cursor receives the handshake immediately.
    // Bootstrap runs after connect: the SDK buffers incoming tool calls until
    // the event loop is free, so ensureBootstrapData completes before any
    // tool handler is invoked.
    await server.connect(transport);

    console.error(
      `[ghostcrab] MCP server connected on stdio with ${listRegisteredTools().length} registered tool(s)` +
        (serverState.databaseReady ? "" : " [DEGRADED — database unreachable]")
    );

    if (serverState.databaseReady && config.databaseKind === "postgres") {
      const bootstrapSummary = await ensureBootstrapData(database);
      if (config.nativeExtensionsMode !== "sql-only") {
        const nativeBootstrap = await bootstrapNativeWithReport(
          database,
          serverState.extensions
        );
        const issues = collectNativeBootstrapIssues(
          serverState.extensions,
          nativeBootstrap
        );

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
      serverState.bootstrapComplete = true;
      console.error(
        `[ghostcrab] Bootstrap summary: system=${bootstrapSummary.insertedSystemEntries}, schemas=${bootstrapSummary.insertedSchemas}, ontologies=${bootstrapSummary.insertedOntologies}, records=${bootstrapSummary.insertedProductRecords}, graph_nodes=${bootstrapSummary.insertedGraphNodes}, graph_edges=${bootstrapSummary.insertedGraphEdges}, agent_states=${bootstrapSummary.insertedAgentStates}, projections=${bootstrapSummary.insertedProjections}, skipped=${bootstrapSummary.skipped}`
      );
    } else if (serverState.databaseReady) {
      serverState.bootstrapComplete = true;
      console.error(
        "[ghostcrab] MindBrain-backed SQLite mode enabled; default workspace seed is handled by MindBrain"
      );
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown startup error";

    await shutdown(1, message);
  }
}
