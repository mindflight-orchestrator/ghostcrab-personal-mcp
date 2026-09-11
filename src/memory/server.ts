/** Dedicated Personal MCP surface; binding comes only from the trusted host. */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool
} from "@modelcontextprotocol/sdk/types.js";
import { ZodError, z } from "zod";
import { resolveGhostcrabConfig } from "../config/env.js";
import { createDatabaseClient } from "../db/client.js";
import {
  MemoryStore,
  MemoryError,
  MemoryInput,
  bindingFromEnvironment
} from "./store.js";
export async function startMemoryServer() {
  const binding = bindingFromEnvironment(process.env);
  const database = createDatabaseClient(resolveGhostcrabConfig(), {
    requireTransactions: true
  });
  const store = new MemoryStore(database, binding);
  const server = new Server(
    { name: "ghostcrab-personal-memory", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "ghostcrab_memory",
        description:
          "Scoped Personal durable memory. Host-bound identity; transactional writes.",
        inputSchema: z.toJSONSchema(MemoryInput, {
          io: "input"
        }) as Tool["inputSchema"]
      }
    ]
  }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      if (request.params.name !== "ghostcrab_memory")
        throw new MemoryError("unknown_tool");
      const result = await store.execute(request.params.arguments);
      return {
        structuredContent: result,
        content: [{ type: "text", text: JSON.stringify(result) }]
      };
    } catch (error) {
      const code =
        error instanceof MemoryError
          ? error.code
          : error instanceof ZodError
            ? "invalid_arguments"
            : "memory_unavailable";
      return {
        isError: true,
        content: [
          { type: "text", text: JSON.stringify({ status: "error", code }) }
        ]
      };
    }
  });
  process.on("SIGTERM", () => {
    void server
      .close()
      .finally(() => database.close())
      .finally(() => process.exit(0));
  });
  await server.connect(new StdioServerTransport());
}
