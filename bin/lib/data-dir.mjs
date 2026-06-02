/**
 * User-local data and config directories for GhostCrab.
 *
 * Default on Linux/macOS/Windows:
 *   ~/.ghostcrab
 *
 * Override priority:
 *   config: GHOSTCRAB_CONFIG_DIR → GHOSTCRAB_HOME → ~/.ghostcrab
 *   data  : GHOSTCRAB_DATA_DIR   → GHOSTCRAB_HOME → ~/.ghostcrab
 */

import { homedir } from "node:os";
import { join } from "node:path";

export function getConfigDir() {
  if (process.env.GHOSTCRAB_CONFIG_DIR) return process.env.GHOSTCRAB_CONFIG_DIR;
  if (process.env.GHOSTCRAB_HOME) return process.env.GHOSTCRAB_HOME;
  return join(homedir(), ".ghostcrab");
}

export function getDataDir() {
  if (process.env.GHOSTCRAB_DATA_DIR) return process.env.GHOSTCRAB_DATA_DIR;
  if (process.env.GHOSTCRAB_HOME) return process.env.GHOSTCRAB_HOME;
  return join(homedir(), ".ghostcrab");
}
