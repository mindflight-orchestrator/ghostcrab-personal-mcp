/**
 * Windows-safe npm/pnpm spawn helpers.
 *
 * On Windows, spawnSync("npm.cmd", …) often fails with EINVAL because .cmd
 * shims require a shell. Prefer node + npm-cli.js; fall back to cmd.exe /c.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * @param {import("node:child_process").SpawnSyncReturns<string | Buffer>} r
 * @returns {string}
 */
export function formatSpawnFailure(r) {
  const parts = [`exit=${r.status ?? "null"}`];
  if (r.signal) {
    parts.push(`signal=${r.signal}`);
  }
  if (r.error) {
    parts.push(`error=${r.error.code ?? "unknown"}: ${r.error.message}`);
  }
  return parts.join(", ");
}

/**
 * @param {"npm" | "pnpm"} tool
 * @returns {{ command: string, argsPrefix: string[] } | null}
 */
function resolveWindowsCli(tool) {
  const nodeDir = dirname(process.execPath);
  const cliByTool = {
    npm: join(nodeDir, "node_modules", "npm", "bin", "npm-cli.js"),
    pnpm: join(nodeDir, "node_modules", "pnpm", "bin", "pnpm.cjs")
  };
  const cliPath = cliByTool[tool];
  if (cliPath && existsSync(cliPath)) {
    return { command: process.execPath, argsPrefix: [cliPath] };
  }
  return null;
}

/**
 * @param {"npm" | "pnpm"} tool
 * @param {string[]} args
 * @param {import("node:child_process").SpawnSyncOptionsWithStringEncoding} [opts]
 */
function spawnPackageManager(tool, args, opts = {}) {
  const spawnOpts = {
    encoding: "utf8",
    env: process.env,
    ...opts
  };

  if (process.platform !== "win32") {
    return spawnSync(tool, args, spawnOpts);
  }

  const resolved = resolveWindowsCli(tool);
  if (resolved) {
    return spawnSync(
      resolved.command,
      [...resolved.argsPrefix, ...args],
      spawnOpts
    );
  }

  const comspec = process.env.ComSpec ?? "cmd.exe";
  return spawnSync(comspec, ["/d", "/s", "/c", tool, ...args], spawnOpts);
}

/**
 * @param {string[]} args
 * @param {import("node:child_process").SpawnSyncOptionsWithStringEncoding} [opts]
 */
export function spawnNpm(args, opts = {}) {
  return spawnPackageManager("npm", args, opts);
}

/**
 * @param {string[]} args
 * @param {import("node:child_process").SpawnSyncOptionsWithStringEncoding} [opts]
 */
export function spawnPnpm(args, opts = {}) {
  return spawnPackageManager("pnpm", args, opts);
}
