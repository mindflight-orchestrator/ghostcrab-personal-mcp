/**
 * XDG-compliant data and config directories for GhostCrab.
 *
 * Linux  : $XDG_DATA_HOME/ghostcrab  (~/.local/share/ghostcrab)
 *          $XDG_CONFIG_HOME/ghostcrab (~/.config/ghostcrab)
 * macOS  : ~/Library/Application Support/ghostcrab
 * Windows: %APPDATA%\ghostcrab
 */

import { homedir } from "node:os";
import { join } from "node:path";

export function getConfigDir() {
  if (process.env.GHOSTCRAB_CONFIG_DIR) return process.env.GHOSTCRAB_CONFIG_DIR;
  if (process.platform === "win32") {
    return join(process.env.APPDATA ?? homedir(), "ghostcrab");
  }
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support", "ghostcrab");
  }
  return join(
    process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"),
    "ghostcrab"
  );
}

export function getDataDir() {
  if (process.env.GHOSTCRAB_DATA_DIR) return process.env.GHOSTCRAB_DATA_DIR;
  if (process.platform === "win32") {
    return join(process.env.APPDATA ?? homedir(), "ghostcrab");
  }
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support", "ghostcrab");
  }
  return join(
    process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"),
    "ghostcrab"
  );
}
