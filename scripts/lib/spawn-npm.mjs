/**
 * Windows-safe npm/pnpm spawn helpers.
 *
 * On Windows, spawnSync("npm.cmd", …) often fails with EINVAL because .cmd
 * shims require a shell. Prefer node + npm-cli.js; fall back to cmd.exe /c.
 */
import { realpathSync } from "node:fs";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

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
 * On some environments, invoking the `npm`/`pnpm` shims directly can return EPERM.
 * Fall back to executing the resolved shim target through `node` with the same args.
 */
function resolveNodeManagerCli(tool) {
  const pathEnv = process.env.PATH ?? "";
  const paths = pathEnv.split(":");
  for (const dir of paths) {
    if (!dir) continue;
    const candidate = join(dir, tool);
    if (!existsSync(candidate)) {
      continue;
    }
    try {
      const target = realpathSync(candidate);
      if (target) {
        return target;
      }
    } catch (_err) {
      continue;
    }
  }
  return null;
}

function hasRuntimeSuccess(result) {
  return result.status === 0 && !result.signal;
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
    const result = spawnSync(tool, args, spawnOpts);
    if (hasRuntimeSuccess(result)) {
      return result;
    }
    if (result.error.code === "EPERM" || result.error.code === "ENOENT") {
      const cliPath = resolveNodeManagerCli(tool);
      if (cliPath) {
        const cliResult = spawnSync(process.execPath, [cliPath, ...args], spawnOpts);
        if (hasRuntimeSuccess(cliResult)) {
          return cliResult;
        }
      }

      const shellCommand = `${tool} ${args.map((arg) => JSON.stringify(arg)).join(" ")}`;
      return spawnSync("/bin/sh", ["-lc", shellCommand], spawnOpts);
    }
    return result;
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
  const result = spawnPackageManager("pnpm", args, opts);
  if (result.error && (result.error.code === "EPERM" || result.error.code === "ENOENT")) {
    return spawnPackageManager("npm", args, opts);
  }
  return result;
}
