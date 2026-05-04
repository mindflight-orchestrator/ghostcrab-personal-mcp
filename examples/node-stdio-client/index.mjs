import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgres://ghostcrab:ghostcrab@localhost:5432/ghostcrab";
const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(currentDirectory, "../..");
const serverEntry = path.join(packageRoot, "dist/index.js");

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [serverEntry],
  cwd: packageRoot,
  env: {
    ...process.env,
    DATABASE_URL: databaseUrl
  },
  stderr: "pipe"
});

const client = new Client(
  {
    name: "ghostcrab-example-node-client",
    version: "0.1.0"
  },
  {
    capabilities: {}
  }
);

try {
  await withTimeout(client.connect(transport), 10_000, "connect");

  const toolsResult = await withTimeout(
    client.listTools(),
    10_000,
    "listTools"
  );
  const toolNames = toolsResult.tools.map((tool) => tool.name).sort();
  const statusPayload = await callToolJson(
    client,
    "ghostcrab_status",
    {
      agent_id: "agent:self"
    },
    "ghostcrab_status"
  );
  const packPayload = await callToolJson(
    client,
    "ghostcrab_pack",
    {
      query: "native extension build package distribution",
      agent_id: "agent:self",
      scope: "native-build"
    },
    "ghostcrab_pack"
  );

  console.log(
    JSON.stringify({
      server_entry: "dist/index.js",
      tool_count: toolNames.length,
      tools: toolNames,
      status: {
        health: statusPayload.summary.health,
        next_actions: statusPayload.next_actions
      },
      pack: {
        has_blocking_constraint: packPayload.has_blocking_constraint,
        recommended_next_step: packPayload.recommended_next_step,
        item_count: packPayload.item_count
      }
    })
  );
} finally {
  await client.close().catch(() => undefined);
}

async function callToolJson(client, name, args, label) {
  const result = await withTimeout(
    client.callTool({
      name,
      arguments: args
    }),
    10_000,
    label
  );

  if (result.structuredContent) {
    return result.structuredContent;
  }

  const textItem = result.content?.find((item) => item.type === "text");

  if (!textItem) {
    throw new Error(`Tool ${name} returned no JSON payload.`);
  }

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
