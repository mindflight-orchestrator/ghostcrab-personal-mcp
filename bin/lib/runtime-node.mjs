/**
 * Resolve a stable Node binary for PATH shims and MCP host configs.
 * Cursor's integrated terminal often runs under an AppImage node
 * (/tmp/.mount_cursor…/node) that other processes cannot spawn.
 */
import { spawnSync } from "node:child_process";
import { accessSync, constants } from "node:fs";

/**
 * @param {string} nodePath
 * @returns {boolean}
 */
export function isEphemeralNodePath(nodePath) {
  const normalized = String(nodePath);
  return (
    normalized.includes("/.mount_") ||
    (normalized.includes("cursor") && normalized.includes("/resources/"))
  );
}

/**
 * @param {string} [preferred]
 * @returns {string}
 */
export function resolveRuntimeNodePath(preferred = process.execPath) {
  if (preferred && !isEphemeralNodePath(preferred)) {
    try {
      accessSync(preferred, constants.X_OK);
      return preferred;
    } catch {
      // fall through
    }
  }

  for (const candidate of ["/usr/bin/node", "/usr/local/bin/node"]) {
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // continue
    }
  }

  const which = spawnSync("which", ["node"], { encoding: "utf8" });
  if (which.status === 0) {
    const resolved = which.stdout.trim();
    if (resolved && !isEphemeralNodePath(resolved)) {
      try {
        accessSync(resolved, constants.X_OK);
        return resolved;
      } catch {
        // continue
      }
    }
  }

  return preferred;
}
