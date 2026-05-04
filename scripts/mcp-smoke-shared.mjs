import assert from "node:assert/strict";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgres://ghostcrab:ghostcrab@localhost:5432/ghostcrab";
const defaultTimeoutMs = Number.parseInt(
  process.env.MCP_SMOKE_TIMEOUT_MS ?? "10000",
  10
);

export async function withSmokeClient(clientName, runScenario, options = {}) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["dist/index.js"],
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      ...(options.serverEnv ?? {})
    },
    stderr: "pipe"
  });

  let stderrOutput = "";

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
    await withTimeout(client.connect(transport), defaultTimeoutMs, "connect");

    return await runScenario({
      client,
      getStderrOutput: () => stderrOutput
    });
  } finally {
    await client.close().catch(() => undefined);
  }
}

export async function listTools(client) {
  const toolsResult = await withTimeout(
    client.listTools(),
    defaultTimeoutMs,
    "listTools"
  );

  return toolsResult.tools.map((tool) => tool.name).sort();
}

export async function callToolJson(client, name, args, label = name) {
  const result = await withTimeout(
    client.callTool({
      name,
      arguments: args
    }),
    defaultTimeoutMs,
    label
  );

  return readStructuredContent(result);
}

export function assertToolSuccess(payload, toolName) {
  assert.equal(payload.ok, true, `Expected ${toolName} to return ok=true.`);
  assert.equal(payload.tool, toolName);
  assert.equal(typeof payload.surface_version, "string");
}

export function assertPathContainsNode(payload, nodeId, label) {
  assert.equal(
    payload.path.some((node) => node.node_id === nodeId),
    true,
    label
  );
}

function readStructuredContent(result) {
  if (result.structuredContent) {
    return result.structuredContent;
  }

  const textItem = result.content?.find((item) => item.type === "text");

  assert.ok(textItem, "Expected a text payload from the tool call.");

  return JSON.parse(textItem.text);
}

async function withTimeout(promise, timeoutMs, label) {
  let timeoutId;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(
        new Error(`Timed out while waiting for ${label} after ${timeoutMs}ms`)
      );
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
}
