/**
 * gcp env — GhostCrab CLI / MCP environment (~/.config/ghostcrab/config.json).
 *
 * Same behaviour as the legacy   gcp config   command, JTBD-friendly naming.
 */

import { cmdConfig } from "./config-cmd.mjs";

export async function cmdEnv(args) {
  return cmdConfig(args, { label: "gcp env" });
}
