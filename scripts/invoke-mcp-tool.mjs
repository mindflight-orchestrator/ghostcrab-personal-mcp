#!/usr/bin/env node
/**
 * Invoke a GhostCrab MCP tool from the CLI (all 47 tools, not just the Cursor default 12).
 * Usage: node scripts/invoke-mcp-tool.mjs <tool_name> [--stdin-json | key=value ...]
 */
import { readFileSync } from "node:fs";

import { initToolContext } from "../dist/cli/context.js";
import { executeTool } from "../dist/cli/execute.js";
import { extractStructuredJson } from "../dist/cli/runner.js";
import { registerAllTools } from "../dist/tools/register-all.js";

const [toolName, ...rest] = process.argv.slice(2);
if (!toolName || rest.includes("--help") || rest.includes("-h")) {
  console.error(
    "Usage: node scripts/invoke-mcp-tool.mjs <tool_name> [--stdin-json | key=value ...]"
  );
  process.exit(rest.includes("--help") || rest.includes("-h") ? 0 : 1);
}

let args = {};
if (rest.includes("--stdin-json")) {
  args = JSON.parse(readFileSync(0, "utf8"));
} else {
  for (const token of rest) {
    const eq = token.indexOf("=");
    if (eq <= 0) {
      console.error(`Invalid argument: ${token}`);
      process.exit(2);
    }
    const key = token.slice(0, eq);
    const raw = token.slice(eq + 1);
    try {
      args[key] = JSON.parse(raw);
    } catch {
      args[key] = raw;
    }
  }
}

registerAllTools();
const { toolContext, cleanup } = await initToolContext();
try {
  const { result, exitCode } = await executeTool(toolName, args, toolContext);
  console.log(JSON.stringify(extractStructuredJson(result), null, 2));
  process.exit(exitCode);
} finally {
  await cleanup();
}
