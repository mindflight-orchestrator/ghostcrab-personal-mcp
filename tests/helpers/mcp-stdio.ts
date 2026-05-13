import assert from "node:assert/strict";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const defaultTimeoutMs = Number.parseInt(
  process.env.MCP_SMOKE_TIMEOUT_MS ?? "10000",
  10
);

export interface McpSession {
  client: Client;
  getStderrOutput: () => string;
  getTrace: () => McpTraceRecord[];
}

export interface McpTraceRecord {
  duration_ms?: number;
  kind: "list_tools" | "call_tool";
  name: string;
  ok: boolean;
  request?: Record<string, unknown>;
  response?: Record<string, unknown>;
}

export async function withMcpStdioClient<T>(
  clientName: string,
  runScenario: (session: McpSession) => Promise<T>,
  options: {
    cwd?: string;
    serverEnv?: Record<string, string>;
    timeoutMs?: number;
  } = {}
): Promise<T> {
  const mindbrainUrlFromEnv =
    options.serverEnv?.GHOSTCRAB_MINDBRAIN_URL ??
    process.env.GHOSTCRAB_MINDBRAIN_URL ??
    "http://127.0.0.1:8091";

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["dist/index.js"],
    cwd: options.cwd ?? process.cwd(),
    env: {
      ...process.env,
      GHOSTCRAB_DATABASE_KIND: "sqlite",
      GHOSTCRAB_MINDBRAIN_URL: mindbrainUrlFromEnv,
      GHOSTCRAB_EMBEDDINGS_MODE: "disabled",
      MCP_TELEMETRY: "0",
      ...(options.serverEnv ?? {})
    },
    stderr: "pipe"
  });

  let stderrOutput = "";
  const traceRecords: McpTraceRecord[] = [];
  if (transport.stderr) {
    transport.stderr.setEncoding("utf8");
    transport.stderr.on("data", (chunk) => {
      stderrOutput += String(chunk);
    });
  }

  const client = new Client(
    {
      name: clientName,
      version: "0.1.0"
    },
    {
      capabilities: {}
    }
  );

  try {
    try {
      await withTimeout(
        client.connect(transport),
        options.timeoutMs ?? defaultTimeoutMs,
        "connect"
      );
    } catch (error) {
      const suffix =
        stderrOutput.trim().length > 0
          ? `\nServer stderr:\n${stderrOutput.trim()}`
          : "";
      throw new Error(
        `Failed to connect to GhostCrab MCP server.${suffix}`,
        { cause: error }
      );
    }

    return await runScenario({
      client,
      getStderrOutput: () => stderrOutput,
      getTrace: () => traceRecords
    });
  } finally {
    await client.close().catch(() => undefined);
    await transport.close().catch(() => undefined);
  }
}

export async function listToolNames(
  client: Client,
  trace?: McpTraceRecord[]
): Promise<string[]> {
  const startedAt = Date.now();
  const toolsResult = await withTimeout(
    client.listTools(),
    defaultTimeoutMs,
    "listTools"
  );
  trace?.push({
    kind: "list_tools",
    name: "tools/list",
    ok: true,
    duration_ms: Date.now() - startedAt,
    response: {
      tool_names: toolsResult.tools.map((tool) => tool.name).sort()
    }
  });

  return toolsResult.tools.map((tool) => tool.name).sort();
}

export async function callToolJson(
  client: Client,
  name: string,
  args: Record<string, unknown>,
  label = name,
  trace?: McpTraceRecord[]
): Promise<Record<string, unknown>> {
  const startedAt = Date.now();
  const result = await withTimeout(
    client.callTool({
      name,
      arguments: args
    }),
    defaultTimeoutMs,
    label
  );

  const payload = readStructuredContent(result) as Record<string, unknown>;
  trace?.push({
    kind: "call_tool",
    name,
    ok: payload.ok === true,
    request: args,
    response: summarizePayload(payload),
    duration_ms: Date.now() - startedAt
  });

  return payload;
}

function readStructuredContent(result: {
  structuredContent?: unknown;
  content?: Array<{ type: string; text?: string }>;
}): unknown {
  if (result.structuredContent) {
    return result.structuredContent;
  }

  const textItem = result.content?.find((item) => item.type === "text");
  assert.ok(textItem?.text, "Expected a text payload from the MCP tool call.");
  return JSON.parse(textItem.text);
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(
        new Error(`Timed out while waiting for ${label} after ${timeoutMs}ms`)
      );
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function summarizePayload(
  payload: Record<string, unknown>
): Record<string, unknown> {
  const summary: Record<string, unknown> = {
    ok: payload.ok,
    tool: payload.tool,
    error: payload.error,
    backend: payload.backend
  };

  if ("runtime" in payload && typeof payload.runtime === "object") {
    summary.runtime = payload.runtime;
  }
  if ("returned" in payload) {
    summary.returned = payload.returned;
  }
  if ("counts" in payload) {
    summary.counts = payload.counts;
  }
  if ("results" in payload && Array.isArray(payload.results)) {
    summary.results_preview = payload.results.slice(0, 3);
  }
  if ("path" in payload && Array.isArray(payload.path)) {
    summary.path_preview = payload.path.slice(0, 3);
  }
  if ("migrations" in payload && Array.isArray(payload.migrations)) {
    summary.migrations_preview = payload.migrations.slice(0, 3);
  }

  return summary;
}
