import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";

import type { DatabaseClient } from "../db/client.js";
import type { EmbeddingProvider } from "../embeddings/provider.js";
import type { SessionContext } from "../mcp/session-context.js";
import { GHOSTCRAB_MCP_SURFACE_VERSION } from "../version.js";

export { GHOSTCRAB_MCP_SURFACE_VERSION };

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

export interface BackendErrorInfo {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

const MAX_ERROR_BODY_LENGTH = 4096;

function clampText(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
}

function parseMaybeJson(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

function normalizeBackendStatus(status: unknown): number | null {
  return typeof status === "number" && Number.isFinite(status)
    ? status
    : null;
}

function normalizeErrorCode(
  status: number | null,
  fallbackCode: string
): string {
  if (status === null) {
    return fallbackCode;
  }
  const shouldMapBackendCode =
    fallbackCode === "tool_execution_error" ||
    fallbackCode === "tool_error" ||
    fallbackCode === "backend_unavailable" ||
    fallbackCode === "backend_error" ||
    fallbackCode === "backend_not_found";
  if (status === 404) {
    return shouldMapBackendCode ? "backend_not_found" : fallbackCode;
  }
  if (status >= 500) {
    return shouldMapBackendCode ? "backend_unavailable" : fallbackCode;
  }
  if (status >= 400) {
    return shouldMapBackendCode ? "backend_error" : fallbackCode;
  }
  return fallbackCode;
}

export function createToolErrorFromException(
  toolName: string,
  error: unknown,
  fallbackCode = "tool_execution_error",
  fallbackMessage = "Tool execution failed"
): CallToolResult {
  const message =
    error instanceof Error ? error.message : String(error) || fallbackMessage;

  const cause = error instanceof Error ? error.cause : undefined;
  const causeObj =
    cause && typeof cause === "object" ? (cause as Record<string, unknown>) : {};
  const status = normalizeBackendStatus(causeObj.status);

  const rawBody =
    typeof causeObj.body === "string"
      ? clampText(causeObj.body, MAX_ERROR_BODY_LENGTH)
      : typeof causeObj.body === "object" && causeObj.body !== null
        ? clampText(JSON.stringify(causeObj.body), MAX_ERROR_BODY_LENGTH)
        : undefined;
  const parsedBody =
    typeof rawBody === "string" ? parseMaybeJson(rawBody) : undefined;

  const bodyMessage =
    typeof parsedBody === "object" &&
    parsedBody !== null &&
    "detail" in parsedBody
      ? typeof parsedBody.detail === "string"
        ? parsedBody.detail
        : undefined
      : undefined;
  const errorSymbol =
    typeof parsedBody === "object" &&
    parsedBody !== null &&
    "error" in parsedBody
      ? typeof parsedBody.error === "string"
        ? parsedBody.error
        : undefined
      : undefined;

  const details: Record<string, unknown> = {
    ...(causeObj.path ? { path: causeObj.path } : {}),
    ...(status !== null ? { status } : {}),
    ...(rawBody ? { backend_body: rawBody } : {}),
    ...(errorSymbol ? { backend_error: errorSymbol } : {}),
    ...(bodyMessage ? { backend_message: bodyMessage } : {})
  };

  if (Object.keys(details).length === 0) {
    if (parsedBody !== null && parsedBody !== undefined) {
      details.body = parsedBody;
    } else if (message) {
      details.message = message;
    } else {
      details.message = fallbackMessage;
    }
  }

  const normalizedMessage =
    message !== fallbackMessage
      ? message
      : fallbackMessage;
  const detailsMessage =
    normalizedMessage.includes("MindBrain request failed") && errorSymbol
      ? `${normalizedMessage} (${errorSymbol})`
      : normalizedMessage;

  return createToolErrorResult(
    toolName,
    detailsMessage,
    normalizeErrorCode(status, fallbackCode),
    details
  );
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
