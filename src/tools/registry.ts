import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";

import type { DatabaseClient } from "../db/client.js";
import type { EmbeddingProvider } from "../embeddings/provider.js";
import type { SessionContext } from "../mcp/session-context.js";

export const GHOSTCRAB_MCP_SURFACE_VERSION = "2026-03-23";

export interface ToolExecutionContext {
  database: DatabaseClient;
  embeddings: EmbeddingProvider;
  retrieval: {
    hybridBm25Weight: number;
    hybridVectorWeight: number;
  };
  /** In-memory session context: active workspace_id and schema_id defaults. */
  session: SessionContext;
}

export interface ToolHandler {
  definition: Tool;
  handler: (
    args: Record<string, unknown>,
    context: ToolExecutionContext
  ) => Promise<CallToolResult>;
}

const toolRegistry = new Map<string, ToolHandler>();

export function clearToolRegistry(): void {
  toolRegistry.clear();
}

export function registerTool(tool: ToolHandler): void {
  if (toolRegistry.has(tool.definition.name)) {
    throw new Error(`Tool already registered: ${tool.definition.name}`);
  }

  toolRegistry.set(tool.definition.name, tool);
}

export function listRegisteredTools(): Tool[] {
  return [...toolRegistry.values()].map(({ definition }) => definition);
}

export function getRegisteredTool(name: string): ToolHandler | undefined {
  return toolRegistry.get(name);
}

export function createTextToolResult(
  text: string,
  isError = false
): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text
      }
    ],
    isError
  };
}

export function createJsonToolResult(
  data: Record<string, unknown>,
  isError = false
): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(data, null, 2)
      }
    ],
    structuredContent: data,
    isError
  };
}

export function createToolSuccessResult(
  toolName: string,
  data: Record<string, unknown>
): CallToolResult {
  return createJsonToolResult({
    ok: true,
    tool: toolName,
    surface_version: GHOSTCRAB_MCP_SURFACE_VERSION,
    generated_at: new Date().toISOString(),
    ...data
  });
}

export function createToolErrorResult(
  toolName: string,
  message: string,
  code = "tool_error",
  details?: Record<string, unknown>
): CallToolResult {
  return createJsonToolResult(
    {
      ok: false,
      tool: toolName,
      surface_version: GHOSTCRAB_MCP_SURFACE_VERSION,
      generated_at: new Date().toISOString(),
      error: {
        code,
        message,
        ...(details ? { details } : {})
      }
    },
    true
  );
}
