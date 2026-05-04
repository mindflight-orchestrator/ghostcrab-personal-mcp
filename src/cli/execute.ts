import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { ZodError } from "zod";

import { EmbeddingProviderError } from "../embeddings/errors.js";
import {
  createToolErrorResult,
  getRegisteredTool,
  listRegisteredTools,
  type ToolExecutionContext
} from "../tools/registry.js";

export const EXIT_OK = 0;
export const EXIT_ERROR = 1;
export const EXIT_VALIDATION = 2;
export const EXIT_UNKNOWN_TOOL = 3;

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

export function exitCodeForResult(
  result: CallToolResult,
  error?: unknown
): number {
  if (!result.isError) {
    return EXIT_OK;
  }

  if (error instanceof ZodError) {
    return EXIT_VALIDATION;
  }

  const structured = result.structuredContent as
    | {
        error?: { code?: unknown };
      }
    | undefined;

  const code = structured?.error?.code;
  if (code === "validation_error") {
    return EXIT_VALIDATION;
  }

  if (code === "unknown_tool") {
    return EXIT_UNKNOWN_TOOL;
  }

  return EXIT_ERROR;
}

export async function executeTool(
  mcpToolName: string,
  args: Record<string, unknown>,
  context: ToolExecutionContext
): Promise<{ result: CallToolResult; exitCode: number }> {
  const tool = getRegisteredTool(mcpToolName);

  if (!tool) {
    const result = createToolErrorResult(
      mcpToolName,
      `Unknown tool: ${mcpToolName}`,
      "unknown_tool",
      {
        available_tools: listRegisteredTools().map((item) => item.name)
      }
    );

    return { result, exitCode: EXIT_UNKNOWN_TOOL };
  }

  try {
    const result = await tool.handler(args, context);
    if (!result.isError) {
      return { result, exitCode: EXIT_OK };
    }

    return {
      result,
      exitCode: exitCodeForResult(result)
    };
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

    const result = createToolErrorResult(
      mcpToolName,
      message,
      classifyToolExecutionError(error)
    );

    return {
      result,
      exitCode: exitCodeForResult(result, error)
    };
  }
}
