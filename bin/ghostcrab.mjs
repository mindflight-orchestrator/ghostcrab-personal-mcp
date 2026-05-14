#!/usr/bin/env node
/**
 * GhostCrab MCP launcher — backward-compatible shim.
 *
 * Existing MCP client configs that point to "ghostcrab" keep working.
 * New setups should use: { "command": "gcp", "args": ["brain", "up"] }  or  ["up"]  (legacy: ["serve"])
 */

import { runServe } from "./commands/serve.mjs";

const args = process.argv.slice(2);
const [cmd, ...rest] = args;

if (["smoke", "status", "tools", "maintenance"].includes(cmd)) {
  const { runCli } = await import("../dist/cli/runner.js");
  await runCli([cmd, ...rest]);
} else {
  // Pass through any args (e.g. --workspace) so the shim stays fully capable.
  await runServe(args);
}
