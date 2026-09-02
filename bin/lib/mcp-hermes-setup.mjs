/**
 * gcp brain setup hermes — register GhostCrab MCP in ~/.hermes/config.yaml
 * and install the GhostCrab IDE skill bundle under ~/.hermes/skills/.
 */

import { randomBytes } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import {
  buildMcpLaunch,
  EX_ERR,
  EX_OK,
  getDefaultMcpEnv,
  looksLikeGhostcrabMcpEntry
} from "./mcp-global-setup.mjs";
import { buildPolicy } from "./mcp-permissions-adapters.mjs";

const LEGACY_SERVER_KEYS = ["ghostcrab"];

/**
 * @param {object} [opts]
 * @param {string} [opts.home]
 * @returns {string}
 */
export function resolveHermesHome(opts = {}) {
  const raw = opts.home ?? process.env.HERMES_HOME ?? join(homedir(), ".hermes");
  if (raw.startsWith("~/")) {
    return join(homedir(), raw.slice(2));
  }
  if (raw === "~") {
    return homedir();
  }
  return raw;
}

/**
 * @param {string} hermesHome
 * @returns {string}
 */
export function defaultHermesDbPath(hermesHome) {
  return join(hermesHome, "ghostcrab", "ghostcrab.sqlite");
}

/**
 * @param {string} hermesHome
 * @returns {string}
 */
export function hermesConfigPath(hermesHome) {
  return join(hermesHome, "config.yaml");
}

/**
 * @param {string} hermesHome
 * @returns {string}
 */
export function hermesSetupManifestPath(hermesHome) {
  return join(hermesHome, "ghostcrab", "setup-manifest.json");
}

/**
 * @param {object} launch
 * @param {Record<string, string>} env
 * @param {string[] | null | undefined} toolsInclude
 * @returns {object}
 */
export function hermesStdioEntryFromLaunch(launch, env, toolsInclude) {
  /** @type {Record<string, unknown>} */
  const entry = {
    command: launch.command,
    args: launch.args,
    env
  };
  if (Array.isArray(toolsInclude) && toolsInclude.length > 0) {
    entry.tools = { include: toolsInclude };
  }
  return entry;
}

/**
 * @param {unknown} existing
 * @param {string} serverName
 * @param {object} entry
 * @param {{ force?: boolean, preconfig?: string }} [opts]
 * @returns {{ doc: object, prunedLegacy: string[] } | { error: "exists" }}
 */
export function mergeHermesConfigDocument(existing, serverName, entry, opts = {}) {
  const { force = false, preconfig = "none" } = opts;
  const root =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? structuredClone(existing)
      : {};
  if (!root.mcp_servers || typeof root.mcp_servers !== "object") {
    root.mcp_servers = {};
  }
  if (root.mcp_servers[serverName] && !force) {
    return { error: "exists" };
  }
  root.mcp_servers[serverName] = entry;

  /** @type {string[]} */
  const prunedLegacy = [];
  for (const legacyKey of LEGACY_SERVER_KEYS) {
    if (legacyKey === serverName) continue;
    const candidate = root.mcp_servers[legacyKey];
    if (candidate && looksLikeGhostcrabHermesEntry(candidate)) {
      delete root.mcp_servers[legacyKey];
      prunedLegacy.push(legacyKey);
    }
  }

  if (preconfig === "minimal") {
    if (!root.skills || typeof root.skills !== "object") {
      root.skills = {};
    }
    if (!Array.isArray(root.skills.external_dirs)) {
      root.skills.external_dirs = [];
    }
  }

  if (preconfig === "external-dirs") {
    if (!root.skills || typeof root.skills !== "object") {
      root.skills = {};
    }
    const agentsSkills = join(homedir(), ".agents", "skills");
    const current = Array.isArray(root.skills.external_dirs)
      ? root.skills.external_dirs
      : [];
    if (!current.includes(agentsSkills)) {
      root.skills.external_dirs = [...current, agentsSkills];
    }
  }

  return { doc: root, prunedLegacy };
}

/**
 * Hermes MCP entries omit Cursor's `type: stdio`; env markers match our other installers.
 *
 * @param {unknown} entry
 * @returns {boolean}
 */
export function looksLikeGhostcrabHermesEntry(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
  if (looksLikeGhostcrabMcpEntry(entry)) return true;
  const args = /** @type {{ args?: unknown }} */ (entry).args;
  return (
    Array.isArray(args) &&
    args.some((a) => typeof a === "string" && /\bbrain\b/.test(a))
  );
}

/**
 * @param {string} preset
 * @param {string} serverName
 * @param {string[]} [allowTools]
 * @returns {Promise<string[] | null>}
 */
export async function resolveHermesToolsInclude(preset, serverName, allowTools = []) {
  if (preset === "none") return null;
  const policy = await buildPolicy(preset, { serverName, allowTools });
  const names = policy.allow
    .map((ref) => ref.toolName)
    .filter((name) => typeof name === "string" && name.length > 0);
  return names.length > 0 ? names : null;
}

/**
 * @param {string} configPath
 * @param {object} newDoc
 * @param {{ dryRun?: boolean, backup?: boolean, write?: typeof writeFileSync, exists?: typeof existsSync }} [io]
 */
export function writeHermesConfigFile(configPath, newDoc, io = {}) {
  const {
    dryRun = false,
    backup = true,
    write = writeFileSync,
    exists = existsSync
  } = io;
  if (dryRun) return;

  const dir = dirname(configPath);
  if (!exists(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  if (exists(configPath) && backup) {
    const bak = `${configPath}.bak`;
    try {
      copyFileSync(configPath, bak);
    } catch {
      // ignore
    }
  }

  const header =
    "# GhostCrab Personal MCP — registered by gcp brain setup hermes\n" +
    `# Updated: ${new Date().toISOString()}\n\n`;
  const body = stringifyYaml(newDoc, { lineWidth: 0 });
  const tmp = join(dir, `.config-${randomBytes(8).toString("hex")}.yaml.tmp`);
  write(tmp, header + body, "utf8");
  renameSync(tmp, configPath);
}

/**
 * @param {string} manifestPath
 * @param {object} manifest
 * @param {{ dryRun?: boolean }} [io]
 */
export function writeHermesSetupManifest(manifestPath, manifest, io = {}) {
  if (io.dryRun) return;
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

/**
 * @param {object} opts
 * @param {string} [opts.home]
 * @param {string} opts.packageName
 * @param {'gcp' | 'pnpm' | 'npx' | 'node' | 'auto'} opts.runner
 * @param {string | null} [opts.workspace]
 * @param {string | null} [opts.dbPath]
 * @param {string} [opts.serverName]
 * @param {Record<string, string>} [opts.extraEnv]
 * @param {boolean} [opts.force]
 * @param {boolean} [opts.dryRun]
 * @param {string} [opts.cwd]
 * @param {string} [opts.permissionsPreset]
 * @param {string[]} [opts.allowTools]
 * @param {string} [opts.preconfig]
 * @param {boolean} [opts.writeManifest]
 */
export async function runSetupHermes(opts) {
  const hermesHome = resolveHermesHome({ home: opts.home });
  const configPath = hermesConfigPath(hermesHome);
  const serverName = opts.serverName ?? "ghostcrab-personal-mcp";
  const permissionsPreset = opts.permissionsPreset ?? "basic";

  const launch = buildMcpLaunch({
    runner: opts.runner,
    packageName: opts.packageName,
    workspace: opts.workspace ?? null,
    dbPath: opts.dbPath ?? null,
    cwd: opts.cwd
  });
  const env = { ...getDefaultMcpEnv(), ...(opts.extraEnv ?? {}) };
  const toolsInclude = await resolveHermesToolsInclude(
    permissionsPreset,
    serverName,
    opts.allowTools ?? []
  );
  const entry = hermesStdioEntryFromLaunch(launch, env, toolsInclude);

  let existing = null;
  if (existsSync(configPath)) {
    try {
      const raw = readFileSync(configPath, "utf8");
      existing = raw.trim() ? parseYaml(raw) : null;
    } catch (e) {
      return {
        ok: false,
        code: EX_ERR,
        message: `Could not parse ${configPath}: ${e?.message ?? e}`
      };
    }
  }

  const merged = mergeHermesConfigDocument(existing, serverName, entry, {
    force: opts.force ?? false,
    preconfig: opts.preconfig ?? "none"
  });
  if (merged.error) {
    return {
      ok: false,
      code: EX_ERR,
      message: `Entry "${serverName}" already exists in ${configPath}. Use --force to replace, or --dry-run to preview.`,
      doc: null,
      configPath,
      hermesHome
    };
  }

  const manifest = {
    installer: "gcp brain setup hermes",
    package: opts.packageName,
    runner: launch.runner,
    db_path: opts.dbPath ?? null,
    mcp_server_name: serverName,
    skills_root: join(hermesHome, "skills"),
    hermes_home: hermesHome,
    permissions_preset: permissionsPreset,
    preconfig: opts.preconfig ?? "none",
    installed_at: new Date().toISOString()
  };

  if (opts.dryRun) {
    return {
      ok: true,
      code: EX_OK,
      message: "Dry run — not written.",
      doc: merged.doc,
      entry,
      configPath,
      hermesHome,
      manifest,
      prunedLegacy: merged.prunedLegacy
    };
  }

  try {
    writeHermesConfigFile(configPath, merged.doc, { dryRun: false });
    if (opts.writeManifest !== false) {
      writeHermesSetupManifest(hermesSetupManifestPath(hermesHome), manifest);
    }
  } catch (e) {
    return {
      ok: false,
      code: EX_ERR,
      message: `Write failed: ${e?.message ?? e}`
    };
  }

  return {
    ok: true,
    code: EX_OK,
    message: `Wrote ${configPath}`,
    doc: merged.doc,
    entry,
    configPath,
    hermesHome,
    manifest,
    prunedLegacy: merged.prunedLegacy
  };
}
