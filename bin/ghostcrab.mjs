#!/usr/bin/env node
/**
 * GhostCrab MCP launcher — backward-compatible shim.
 *
 * Existing MCP client configs that point to "ghostcrab" keep working.
 * New setups should use: { "command": "gcp", "args": ["brain", "up"] }  or  ["up"]  (legacy: ["serve"])
 */

import { runServe } from "./commands/serve.mjs";

// Pass through any args (e.g. --workspace) so the shim stays fully capable.
await runServe(process.argv.slice(2));
