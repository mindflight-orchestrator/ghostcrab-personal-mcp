/**
 * gcp brain setup — register GhostCrab MCP in user-scoped client config (Cursor, Codex, Claude Code).
 */

import { randomBytes } from "node:crypto";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  copyFileSync,
  accessSync,
  constants,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, delimiter } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const PKG_ROOT = join(__dirname, "..", "..");

const SERVER_KEY = "ghostcrab-personal-mcp";

/**
 * Older `gcp brain setup` versions wrote the entry under the bare key "ghostcrab".
 * Cursor still tries to spawn those entries on every launch, so a stale block keeps
 * producing `spawn gcp ENOENT` / `npm error could not determine executable to run`
 * even after the user re-runs setup. We auto-prune them only when the entry's env
 * unambiguously identifies it as one of ours.
 */
const LEGACY_SERVER_KEYS = ["ghostcrab"];

/**
 * Identifies an mcp.json entry that this CLI previously wrote — used to safely prune
 * stale legacy aliases without touching unrelated user-authored servers.
 *
 * @param {unknown} entry
 * @returns {boolean}
 */
export function looksLikeGhostcrabMcpEntry(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
  const env = /** @type {{ env?: Record<string, unknown> }} */ (entry).env;
  if (!env || typeof env !== "object") return false;
  return (
    Object.prototype.hasOwnProperty.call(env, "GHOSTCRAB_DATABASE_KIND") ||
    Object.prototype.hasOwnProperty.call(env, "GHOSTCRAB_EMBEDDINGS_MODE")
  );
}
export const EX_OK = 0;
export const EX_ERR = 1;

const DEFAULT_MCP_ENV = {
  GHOSTCRAB_DATABASE_KIND: "sqlite",
  GHOSTCRAB_EMBEDDINGS_MODE: "disabled",
};

/**
 * @returns {Record<string, string>}
 */
export function getDefaultMcpEnv() {
  return { ...DEFAULT_MCP_ENV };
}

/**
 * @param {string} pkgRoot
 * @returns {string}
 */
export function readNpmPackageName(pkgRoot) {
  const p = join(pkgRoot, "package.json");
  const j = JSON.parse(readFileSync(p, "utf8"));
  if (!j.name || typeof j.name !== "string") {
    throw new Error(`package.json at ${p} has no "name" field`);
  }
  return j.name;
}

/**
 * @param {string} name
 * @returns {string | null} absolute path to executable or null
 */
export function findOnPath(name) {
  const pathDirs = (process.env.PATH ?? process.env.Path ?? "")
    .split(delimiter)
    .filter(Boolean);
  const isWin = process.platform === "win32";
  const names = isWin
    ? [`${name}.exe`, `${name}.cmd`, `${name}.bat`, name]
    : [name];
  for (const dir of pathDirs) {
    for (const n of names) {
      const full = join(dir, n);
      try {
        accessSync(
          full,
          isWin ? constants.F_OK : constants.F_OK | constants.X_OK
        );
        return full;
      } catch {
        // continue
      }
    }
  }
  return null;
}

/**
 * Walk up from `cwd` looking for `node_modules/<packageName>/bin/gcp.mjs`.
 * Returns absolute path when found, else null. Used to prefer a stable, local
 * absolute-path entry in mcp.json over PATH-dependent commands like bare `gcp`
 * or `npx`, which Cursor's spawn environment frequently cannot resolve.
 *
 * @param {string} cwd
 * @param {string} packageName
 * @returns {string | null}
 */
export function findLocalGcpMjs(cwd, packageName) {
  const segments = packageName.split("/");
  let dir = cwd;
  while (dir && dir !== dirname(dir)) {
    const candidate = join(dir, "node_modules", ...segments, "bin", "gcp.mjs");
    try {
      accessSync(candidate, constants.F_OK);
      return candidate;
    } catch {
      // continue walking up
    }
    dir = dirname(dir);
  }
  return null;
}

/**
 * @param {'gcp' | 'pnpm' | 'npx' | 'node' | 'auto'} runner
 * @param {string} packageName
 * @param {string | null} workspace
 * @param {string} [cwd] — directory used to detect a local install. Defaults to process.cwd().
 * @returns {{ runner: 'gcp' | 'pnpm' | 'npx' | 'node', command: string, args: string[] }}
 */
export function buildMcpLaunch({ runner, packageName, workspace, cwd }) {
  const wsArgs = workspace ? ["--workspace", workspace] : [];
  const cwdSafe = cwd ?? process.cwd();
  const localGcpMjs = findLocalGcpMjs(cwdSafe, packageName);
  const gcpPath = findOnPath("gcp");

  // auto: pick the most reliable entry for an MCP host that may not inherit the user's PATH.
  // Priority: local node_modules absolute path > global gcp absolute path > npx with --package=.
  const resolved =
    runner === "auto"
      ? localGcpMjs
        ? "node"
        : gcpPath
          ? "gcp"
          : "npx"
      : runner;

  if (resolved === "node") {
    const target = localGcpMjs ?? findLocalGcpMjs(cwdSafe, packageName);
    if (!target) {
      throw new Error(
        `runner node: could not find ${packageName}/bin/gcp.mjs by walking up from ${cwdSafe}. ` +
          `Install the package locally first (npm install ${packageName}) or use --runner npx.`
      );
    }
    // Use the absolute path of the node binary currently running this setup command.
    // This is the system node the user has on their PATH (nvm, system package, etc.).
    // Cursor and other MCP hosts spawn child processes with a pruned environment that may
    // not include the user's PATH, so bare "node" can resolve to Cursor's own bundled
    // node (e.g. /tmp/.mount_cursor.../node) or fail entirely.
    // Re-run "gcp brain setup cursor --force" after a Node version upgrade to refresh.
    return {
      runner: "node",
      command: process.execPath,
      args: [target, "brain", "up", ...wsArgs],
    };
  }

  if (resolved === "gcp") {
    if (!gcpPath) {
      throw new Error(
        "runner gcp: no gcp on PATH. Install the package globally or use --runner npx."
      );
    }
    return {
      runner: "gcp",
      // Absolute path so MCP clients (e.g. Cursor) do not fail with `spawn gcp ENOENT`
      // when their inherited PATH does not include the npm-global bin directory.
      command: gcpPath,
      args: workspace ? ["brain", "up", "--workspace", workspace] : ["brain", "up"],
    };
  }

  if (resolved === "pnpm") {
    return {
      runner: "pnpm",
      command: "pnpm",
      args: [
        "dlx",
        `${packageName}@latest`,
        "gcp",
        "brain",
        "up",
        ...wsArgs,
      ],
    };
  }

  if (resolved === "npx") {
    // Even when --runner npx is requested explicitly, prefer a local install if present.
    // It is faster and not subject to the "npm error could not determine executable to run"
    // failure mode that bites scoped packages whose name does not match the bin name.
    if (localGcpMjs) {
      // Same reasoning as the explicit "node" runner: use the system node absolute path.
      return {
        runner: "node",
        command: process.execPath,
        args: [localGcpMjs, "brain", "up", ...wsArgs],
      };
    }
    // Use --package=<scoped>@latest + bin name so npx unambiguously picks the gcp binary.
    // The legacy form `npx -y @scope/pkg@latest gcp brain up` failed with
    // `npm error could not determine executable to run` on npm 10/11 for scoped packages.
    // Prefer the absolute path to npx so Cursor does not resolve it to its own bundled npx.
    const npxPath = findOnPath("npx") ?? "npx";
    return {
      runner: "npx",
      command: npxPath,
      args: [
        "-y",
        `--package=${packageName}@latest`,
        "gcp",
        "brain",
        "up",
        ...wsArgs,
      ],
    };
  }

  throw new Error(`buildMcpLaunch: unknown runner "${resolved}"`);
}

/**
 * @param {Record<string, string>} defaultEnv
 * @param {Record<string, string>} extra
 */
function mergeEnv(defaultEnv, extra) {
  return { ...defaultEnv, ...extra };
}

/**
 * @param {object | null} existing
 * @param {object} entry — stdio block: { type, command, args, env? }
 * @param {{ force?: boolean, serverName?: string }} opts
 * @returns {{ doc: object, prunedLegacy: string[] } | { error: 'exists' }}
 */
export function mergeCursorMcpDocument(existing, entry, opts = {}) {
  const { force = false, serverName = SERVER_KEY } = opts;
  const root =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? structuredClone(existing)
      : { mcpServers: {} };
  if (!root.mcpServers || typeof root.mcpServers !== "object") {
    root.mcpServers = {};
  }
  if (root.mcpServers[serverName] && !force) {
    return { error: "exists" };
  }
  root.mcpServers[serverName] = entry;

  // Drop any pre-0.2.10 entries that we wrote ourselves under a different key.
  // Restricted to LEGACY_SERVER_KEYS and gated on looksLikeGhostcrabMcpEntry so
  // we never touch a server the user added by hand.
  /** @type {string[]} */
  const prunedLegacy = [];
  for (const legacyKey of LEGACY_SERVER_KEYS) {
    if (legacyKey === serverName) continue;
    const candidate = root.mcpServers[legacyKey];
    if (candidate && looksLikeGhostcrabMcpEntry(candidate)) {
      delete root.mcpServers[legacyKey];
      prunedLegacy.push(legacyKey);
    }
  }
  return { doc: root, prunedLegacy };
}

/**
 * @param {object} launch
 * @param {Record<string, string>} env
 * @returns {object}
 */
export function cursorStdioEntryFromLaunch(launch, env) {
  return {
    type: "stdio",
    command: launch.command,
    args: launch.args,
    env: env,
  };
}

/**
 * @param {string} mcpJsonPath
 * @param {object} newDoc
 * @param {{ dryRun: boolean, backup: boolean, write?: typeof writeFileSync, read?: typeof readFileSync, exists?: typeof existsSync }} [io]
 */
export function writeCursorMcpFile(mcpJsonPath, newDoc, io = {}) {
  const {
    dryRun = false,
    backup = true,
    write = writeFileSync,
    exists = existsSync,
  } = io;
  if (dryRun) {
    return;
  }
  const dir = dirname(mcpJsonPath);
  if (!exists(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  if (exists(mcpJsonPath) && backup) {
    const bak = `${mcpJsonPath}.bak`;
    try {
      copyFileSync(mcpJsonPath, bak);
    } catch {
      // ignore
    }
  }
  const tmp = join(
    dir,
    `.mcp-${randomBytes(8).toString("hex")}.json.tmp`
  );
  const text = JSON.stringify(newDoc, null, 2) + "\n";
  write(tmp, text, "utf8");
  renameSync(tmp, mcpJsonPath);
}

/**
 * @param {object} opts
 * @param {string} [opts.home]
 * @param {string} opts.packageName
 * @param {'gcp' | 'pnpm' | 'npx' | 'node' | 'auto'} opts.runner
 * @param {string | null} [opts.workspace]
 * @param {Record<string, string>} [opts.extraEnv]
 * @param {boolean} [opts.force]
 * @param {boolean} [opts.dryRun]
 * @param {boolean} [opts.writeBackup]
 * @param {string} [opts.cursorPath]
 * @param {string} [opts.cwd]
 */
export function runSetupCursor(opts) {
  const home = opts.home ?? homedir();
  const mcpPath = opts.cursorPath ?? join(home, ".cursor", "mcp.json");
  const launch = buildMcpLaunch({
    runner: opts.runner,
    packageName: opts.packageName,
    workspace: opts.workspace ?? null,
    cwd: opts.cwd,
  });
  const env = mergeEnv(getDefaultMcpEnv(), opts.extraEnv ?? {});

  let existing = null;
  if (existsSync(mcpPath)) {
    try {
      const raw = readFileSync(mcpPath, "utf8");
      existing = raw.trim() ? JSON.parse(raw) : null;
    } catch (e) {
      return {
        ok: false,
        code: EX_ERR,
        message: `Could not parse ${mcpPath}: ${e?.message ?? e}`,
      };
    }
  }

  const entry = cursorStdioEntryFromLaunch(launch, env);
  const merged = mergeCursorMcpDocument(existing, entry, {
    force: opts.force ?? false,
  });
  if (merged.error) {
    return {
      ok: false,
      code: EX_ERR,
      message: `Entry "${SERVER_KEY}" already exists. Use --force to replace, or --dry-run to preview.`,
      doc: null,
      mcpPath,
    };
  }
  if (opts.dryRun) {
    return {
      ok: true,
      code: EX_OK,
      message: "Dry run — not written.",
      doc: merged.doc,
      mcpPath,
      prunedLegacy: merged.prunedLegacy,
    };
  }
  try {
    writeCursorMcpFile(mcpPath, merged.doc, {
      dryRun: false,
      backup: opts.writeBackup !== false,
    });
  } catch (e) {
    return {
      ok: false,
      code: EX_ERR,
      message: `Write failed: ${e?.message ?? e}`,
    };
  }
  return {
    ok: true,
    code: EX_OK,
    message: `Wrote ${mcpPath}`,
    doc: merged.doc,
    mcpPath,
    prunedLegacy: merged.prunedLegacy,
  };
}

/**
 * TOML fragment for [mcp_servers.ghostcrab] (Codex `config.toml` style).
 * @param {string} command
 * @param {string[]} args
 * @param {Record<string, string>} env
 */
export function formatCodexTomlBlock(command, args, env) {
  const lines = [`[mcp_servers.${SERVER_KEY}]`, `command = "${command}"`];
  const arr = args.map((a) => JSON.stringify(a)).join(", ");
  lines.push(`args = [${arr}]`);
  const envKeys = Object.keys(env);
  if (envKeys.length > 0) {
    lines.push(``);
    lines.push(`[mcp_servers.${SERVER_KEY}.env]`);
    for (const k of envKeys) {
      lines.push(`${k} = ${JSON.stringify(env[k])}`);
    }
  }
  return lines.join("\n");
}

/**
 * @param {object} opts
 * @param {string} opts.packageName
 * @param {'gcp' | 'pnpm' | 'npx' | 'node' | 'auto'} opts.runner
 * @param {string | null} [opts.workspace]
 * @param {Record<string, string>} [opts.extraEnv]
 * @param {boolean} [opts.dryRun]
 * @param {string} [opts.codexBin] — e.g. full path in tests
 * @param {string} [opts.cwd]
 */
export function runSetupCodex(opts) {
  const env = mergeEnv(getDefaultMcpEnv(), opts.extraEnv ?? {});
  const launch = buildMcpLaunch({
    runner: opts.runner,
    packageName: opts.packageName,
    workspace: opts.workspace ?? null,
    cwd: opts.cwd,
  });
  const shellParts = [launch.command, ...launch.args].map((s) =>
    /\s/.test(s) ? `"${s}"` : s
  );
  const mcpLine = shellParts.join(" ");
  const toml = formatCodexTomlBlock(launch.command, launch.args, env);
  const shell = `codex mcp add ${SERVER_KEY} -- ${mcpLine}`;
  if (opts.dryRun) {
    return { ok: true, code: EX_OK, dryRun: true, mcpLine, launch, env, toml, shell };
  }
  const bin = opts.codexBin ?? "codex";

  const r = spawnSync(
    bin,
    ["mcp", "add", SERVER_KEY, "--", launch.command, ...launch.args],
    { stdio: "inherit", env: process.env }
  );

  if (r.error) {
    if (r.error.code === "ENOENT") {
      return {
        ok: false,
        code: EX_ERR,
        message:
          "The Codex CLI (codex) was not found on PATH. Add the block below to ~/.codex/config.toml, or install Codex and retry.\n",
        toml,
        shell,
        mcpLine,
        launch,
        env,
      };
    }
    return {
      ok: false,
      code: EX_ERR,
      message: `codex failed: ${r.error.message}`,
      toml,
      shell,
      mcpLine,
      launch,
      env,
    };
  }
  if (r.status === 0) {
    return { ok: true, code: EX_OK, message: "codex mcp add completed." };
  }
  return {
    ok: false,
    code: EX_ERR,
    message: `codex mcp add exited with status ${r.status}. Check whether "${SERVER_KEY}" is already registered. TOML fallback:\n`,
    toml,
    shell,
    mcpLine,
    launch,
    env,
  };
}

/**
 * @param {object} opts
 * @param {string} opts.packageName
 * @param {'gcp' | 'pnpm' | 'npx' | 'node' | 'auto'} opts.runner
 * @param {string | null} [opts.workspace]
 * @param {Record<string, string>} [opts.extraEnv]
 * @param {boolean} [opts.dryRun]
 * @param {boolean} [opts.scopeProject] — if true, add --scope project
 * @param {string} [opts.claudeBin]
 * @param {string} [opts.cwd]
 */
export function runSetupClaude(opts) {
  const envMap = mergeEnv(getDefaultMcpEnv(), opts.extraEnv ?? {});
  const launch = buildMcpLaunch({
    runner: opts.runner,
    packageName: opts.packageName,
    workspace: opts.workspace ?? null,
    cwd: opts.cwd,
  });
  const mcpLine = [launch.command, ...launch.args]
    .map((s) => (/\s/.test(s) ? `"${s}"` : s))
    .join(" ");

  if (opts.dryRun) {
    return {
      ok: true,
      code: EX_OK,
      dryRun: true,
      mcpLine,
      envMap,
      launch,
      shell: formatClaudeMcpAdd(mcpLine, envMap, Boolean(opts.scopeProject)),
    };
  }

  const baseArgs = ["mcp", "add", "--transport", "stdio"];
  for (const [k, v] of Object.entries(envMap)) {
    baseArgs.push("--env", `${k}=${v}`);
  }
  if (opts.scopeProject) {
    baseArgs.push("--scope", "project");
  }
  baseArgs.push(SERVER_KEY, "--", launch.command, ...launch.args);
  const bin = opts.claudeBin ?? "claude";

  const r = spawnSync(bin, baseArgs, { stdio: "inherit", env: process.env });

  if (r.error) {
    if (r.error.code === "ENOENT") {
      return claudeNotFound(mcpLine, envMap, opts.scopeProject, null);
    }
    return claudeNotFound(
      mcpLine,
      envMap,
      opts.scopeProject,
      r.error.message
    );
  }
  if (r.status === 0) {
    return { ok: true, code: EX_OK, message: "claude mcp add completed." };
  }
  return claudeNotFound(mcpLine, envMap, opts.scopeProject, r.status);
}

/**
 * @param {string} mcpLine
 * @param {Record<string, string>} envMap
 * @param {boolean} scopeProject
 * @returns {string}
 */
export function formatClaudeMcpAdd(mcpLine, envMap, scopeProject) {
  const body = ["claude mcp add --transport stdio"];
  for (const [k, v] of Object.entries(envMap)) {
    body[body.length - 1] += " \\";
    body.push(`  --env ${k}=${v}`);
  }
  if (scopeProject) {
    body[body.length - 1] += " \\";
    body.push("  --scope project");
  }
  body[body.length - 1] += " \\";
  body.push(`  ${SERVER_KEY} -- ${mcpLine}`);
  return body.join("\n");
}

/**
 * @param {string|number|null} detail
 */
function claudeNotFound(mcpLine, envMap, scopeProject, detail) {
  const cleanShell = formatClaudeMcpAdd(mcpLine, envMap, Boolean(scopeProject));

  const msgBase =
    detail === null
      ? "The Claude Code CLI (claude) was not found on PATH.\n"
      : typeof detail === "string"
        ? `claude: ${detail}\n`
        : `claude mcp add exited with status ${detail}.\n`;
  return {
    ok: false,
    code: EX_ERR,
    printClaude: true,
    mcpLine,
    shell: cleanShell,
    message: msgBase + "Run the following, or see README_CLAUDE_CODE_MCP.md:\n",
  };
}
