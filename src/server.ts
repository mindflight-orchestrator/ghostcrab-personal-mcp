import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import { ZodError } from "zod";

import { resolveGhostcrabConfig } from "./config/env.js";
import { createDatabaseClient } from "./db/client.js";
import { EmbeddingProviderError } from "./embeddings/errors.js";
import { createEmbeddingProvider } from "./embeddings/provider.js";
import { ensureBootstrapData } from "./bootstrap/seed.js";
import { getSessionContext } from "./mcp/session-context.js";
import {
  buildMcpInstructions,
  buildReadmeMarkdown,
  GHOSTCRAB_README_URI
} from "./mcp/agent-brief.js";
import { listBasicRegisteredTools } from "./tools/catalog.js";
import { registerAllTools } from "./tools/register-all.js";
import {
  createToolErrorResult,
  createToolSuccessResult,
  getRegisteredTool,
  listRegisteredTools
} from "./tools/registry.js";
import { formatZodValidationError } from "./tools/zod-errors.js";
import { getPackageVersion } from "./version.js";

interface ServerState {
  databaseReady: boolean;
  bootstrapComplete: boolean;
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
    console.error(`[ghostcrab] GHOSTCRAB_MINDBRAIN_URL=${config.mindbrainUrl}`);
    console.error(
      `[ghostcrab] GHOSTCRAB_EMBEDDINGS_MODE=${config.embeddingsMode} (${config.embeddingDimensions} dims${config.embeddingModel ? `, model=${config.embeddingModel}` : ""})`
    );
    console.error(
      `[ghostcrab] GHOSTCRAB_HYBRID_WEIGHTS=bm25:${config.hybridBm25Weight}, vector:${config.hybridVectorWeight}`
    );
    console.error(
      `[ghostcrab] MINDBRAIN_NATIVE_EXTENSIONS=${config.nativeExtensionsMode}`
    );

    const databaseIsReachable = await database.ping();
    const { maybeSendStartupPing } = await import("./telemetry/index.js");

    // Best-effort telemetry must never delay or block server startup.
    void maybeSendStartupPing(config, databaseIsReachable);

    if (databaseIsReachable) {
      serverState.databaseReady = true;
    } else {
      serverState.startupError = `Cannot reach MindBrain backend at ${config.mindbrainUrl}. Ensure the backend is running (ghostcrab-backend), then restart the MCP server.`;
      console.error(`[ghostcrab] WARNING: ${serverState.startupError}`);
      console.error(
        `[ghostcrab] Starting in degraded mode — tools will return errors until the backend is available.`
      );
    }

    const allTools = listRegisteredTools();
    const listedTools = listBasicRegisteredTools(allTools);
    const instructions = buildMcpInstructions({
      backendUrlRedacted: config.mindbrainUrl,
      listedToolCount: listedTools.length,
      extendedToolCount: allTools.length,
      databaseReachable: databaseIsReachable
    });

    const server = new Server(
      {
        name: "ghostcrab",
        version
      },
      {
        capabilities: {
          tools: {},
          resources: {}
        },
        instructions
      }
    );

    server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: [
          {
            uri: GHOSTCRAB_README_URI,
            name: "readme",
            description:
              "GhostCrab agent brief: product role, non-goals, and first-call checklist (markdown).",
            mimeType: "text/markdown"
          }
        ]
      };
    });

    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const uri = request.params.uri;
      if (uri !== GHOSTCRAB_README_URI) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Unknown resource URI: ${uri}. Only ${GHOSTCRAB_README_URI} is available.`
        );
      }
      return {
        contents: [
          {
            uri: GHOSTCRAB_README_URI,
            mimeType: "text/markdown",
            text: buildReadmeMarkdown()
          }
        ]
      };
    });

    server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: listBasicRegisteredTools(listRegisteredTools())
      };
    });

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      // Degraded mode: backend is unreachable. ghostcrab_status returns a
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
              agent_state: "BACKEND_UNREACHABLE",
              backend_url: config.mindbrainUrl,
              hint: "Ensure the ghostcrab-backend (Zig) is running, then restart the MCP server."
            },
            operational: {
              health: "RED",
              state: "BACKEND_UNREACHABLE"
            },
            directives: [
              {
                condition: "backend_unreachable",
                action: "check_backend_and_restart_mcp"
              }
            ],
            next_actions: ["check_backend_and_restart_mcp"]
          });
        }

        return createToolErrorResult(
          request.params.name,
          serverState.startupError ??
            `GhostCrab cannot reach the backend at ${config.mindbrainUrl}.`,
          "backend_unavailable",
          {
            backend_url: config.mindbrainUrl,
            hint: "Ensure ghostcrab-backend is running, then restart the MCP server."
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
          extensions: {
            pgFacets: false,
            pgDgraph: false,
            pgPragma: false,
            pgMindbrain: true
          },
          nativeExtensionsMode: config.nativeExtensionsMode,
          retrieval: {
            hybridBm25Weight: config.hybridBm25Weight,
            hybridVectorWeight: config.hybridVectorWeight
          },
          session: getSessionContext()
        });
      } catch (error) {
        if (error instanceof ZodError) {
          const structured = formatZodValidationError(
            error,
            request.params.name
          );
          console.error(
            "[ghostcrab] ZodError:",
            JSON.stringify(error.issues)
          );
          return createToolErrorResult(
            request.params.name,
            structured.message_plain,
            "validation_error",
            {
              required_fields: structured.required_fields,
              invalid_fields: structured.invalid_fields,
              hint_call: structured.hint_call
            }
          );
        }

        const message =
          error instanceof Error
            ? error.message
            : "Unknown tool execution error";

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
    // the event loop is free, so the ready state is set before any handler fires.
    await server.connect(transport);

    console.error(
      `[ghostcrab] MCP server connected on stdio with ${listRegisteredTools().length} registered tool(s)` +
        (serverState.databaseReady ? "" : " [DEGRADED — backend unreachable]")
    );

    if (serverState.databaseReady) {
      try {
        const seedSummary = await ensureBootstrapData(database);
        serverState.bootstrapComplete = true;
        const insertedFacets =
          seedSummary.insertedSystemEntries +
          seedSummary.insertedSchemas +
          seedSummary.insertedOntologies +
          seedSummary.insertedProductRecords;
        console.error(
          `[ghostcrab] bootstrap seed complete: ${insertedFacets} facets, ` +
          `${seedSummary.insertedGraphNodes} nodes, ${seedSummary.insertedGraphEdges} edges inserted ` +
          `(${seedSummary.skipped} already present)`
        );
      } catch (seedError) {
        const msg = seedError instanceof Error ? seedError.message : String(seedError);
        console.error(`[ghostcrab] WARNING: bootstrap seed failed — ${msg}`);
        if (seedError instanceof Error && seedError.cause != null) {
          const c = seedError.cause;
          if (typeof c === "object" && c !== null && "body" in c) {
            const b = (c as { body?: string }).body;
            if (b) {
              console.error(
                `[ghostcrab] MindBrain error response (same as above, for copy/paste): ${b}`
              );
            }
          }
        }
        const nativeLog = process.env.GHOSTCRAB_NATIVE_LOG?.trim();
        if (nativeLog) {
          console.error(
            `[ghostcrab] For the real sqlite error, read the native backend log: ${nativeLog} ` +
              `(e.g. tail -n 80 "${nativeLog}")`
          );
        }
        console.error(
          `[ghostcrab] The server will continue but some tools may return empty results until the seed is applied.`
        );
        serverState.bootstrapComplete = true;
      }
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown startup error";

    await shutdown(1, message);
  }
}
