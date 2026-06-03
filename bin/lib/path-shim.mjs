/**
 * Cross-platform PATH shim for invoking gcp from any shell.
 * Installs a wrapper under ~/.ghostcrab/bin (or %USERPROFILE%\.ghostcrab\bin).
 */
import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from "node:fs";
import { homedir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { findOnPath } from "./mcp-global-setup.mjs";

export const SHIM_MARKER = "# ghostcrab-path-shim";

/**
 * @returns {string}
 */
export function getGhostcrabBinDir() {
  return join(homedir(), ".ghostcrab", "bin");
}

/**
 * @param {string} pkgRoot
 * @returns {string}
 */
export function resolveGcpMjsPath(pkgRoot) {
  return resolve(pkgRoot, "bin", "gcp.mjs");
}

/**
 * @param {"sh" | "zsh" | "bash" | "fish" | "powershell"} shell
 * @param {string} binDir
 * @returns {string}
 */
export function getPathSnippet(shell, binDir = getGhostcrabBinDir()) {
  if (shell === "fish") {
    return `fish_add_path -a "${binDir}"`;
  }
  if (shell === "powershell") {
    return `$env:Path = "${binDir};" + $env:Path`;
  }
  return `export PATH="${binDir}${delimiter}$PATH"`;
}

/**
 * @returns {"sh" | "zsh" | "bash" | "fish" | "powershell"}
 */
export function detectShellKind() {
  if (process.platform === "win32") {
    return "powershell";
  }
  const shell = process.env.SHELL ?? "";
  if (shell.includes("fish")) return "fish";
  if (shell.includes("zsh")) return "zsh";
  if (shell.includes("bash")) return "bash";
  return "sh";
}

/**
 * @param {string} [binDir]
 * @returns {string | null}
 */
export function resolveProfilePath(binDir = getGhostcrabBinDir()) {
  if (process.platform === "win32") {
    return process.env.PROFILE ?? join(homedir(), "Documents", "PowerShell", "Microsoft.PowerShell_profile.ps1");
  }
  const shell = process.env.SHELL ?? "";
  if (shell.includes("zsh")) {
    return join(homedir(), ".zshrc");
  }
  if (shell.includes("bash")) {
    return join(homedir(), ".bashrc");
  }
  if (shell.includes("fish")) {
    return join(homedir(), ".config", "fish", "config.fish");
  }
  return join(homedir(), ".profile");
}

/**
 * @param {string} profilePath
 * @param {string} snippet
 * @returns {"appended" | "present" | "dry-run"}
 */
export function appendProfileSnippet(profilePath, snippet) {
  const block = `\n${SHIM_MARKER}\n${snippet}\n`;
  if (existsSync(profilePath)) {
    const existing = readFileSync(profilePath, "utf8");
    if (existing.includes(SHIM_MARKER)) {
      return "present";
    }
    appendFileSync(profilePath, block, "utf8");
    return "appended";
  }
  writeFileSync(profilePath, block.trimStart() + "\n", "utf8");
  return "appended";
}

/**
 * @param {{ nodePath: string, gcpMjsPath: string, binDir?: string }} opts
 * @returns {{ shimPath: string, binDir: string }}
 */
export function writeGcpShim(opts) {
  const binDir = opts.binDir ?? getGhostcrabBinDir();
  mkdirSync(binDir, { recursive: true });
  const nodePath = opts.nodePath;
  const gcpMjsPath = opts.gcpMjsPath;

  if (process.platform === "win32") {
    const shimPath = join(binDir, "gcp.cmd");
    const content =
      `@echo off\r\n` +
      `"${nodePath}" "${gcpMjsPath}" %*\r\n`;
    writeFileSync(shimPath, content, "utf8");
    return { shimPath, binDir };
  }

  const shimPath = join(binDir, "gcp");
  const content =
    `#!/usr/bin/env sh\n` +
    `exec "${nodePath}" "${gcpMjsPath}" "$@"\n`;
  writeFileSync(shimPath, content, "utf8");
  try {
    chmodSync(shimPath, 0o755);
  } catch {
    // best effort
  }
  return { shimPath, binDir };
}

/**
 * @param {string} [binDir]
 * @returns {boolean}
 */
export function isGhostcrabBinOnPath(binDir = getGhostcrabBinDir()) {
  const pathDirs = (process.env.PATH ?? process.env.Path ?? "")
    .split(delimiter)
    .filter(Boolean);
  const normalized = resolve(binDir);
  return pathDirs.some((dir) => resolve(dir) === normalized);
}

/**
 * @param {{ pkgRoot: string, writeProfile?: boolean, dryRun?: boolean, nodePath?: string }} opts
 * @returns {{
 *   binDir: string,
 *   shimPath: string,
 *   gcpMjsPath: string,
 *   nodePath: string,
 *   shell: ReturnType<typeof detectShellKind>,
 *   snippet: string,
 *   profilePath: string,
 *   profileStatus: "appended" | "present" | "skipped" | "dry-run",
 *   onPath: boolean
 * }}
 */
export function installPathShim(opts) {
  const binDir = getGhostcrabBinDir();
  const gcpMjsPath = resolveGcpMjsPath(opts.pkgRoot);
  const nodePath = opts.nodePath ?? process.execPath;
  const shell = detectShellKind();
  const snippet = getPathSnippet(shell, binDir);
  const profilePath = resolveProfilePath(binDir);
  const onPath = isGhostcrabBinOnPath(binDir);

  if (opts.dryRun) {
    return {
      binDir,
      shimPath: process.platform === "win32" ? join(binDir, "gcp.cmd") : join(binDir, "gcp"),
      gcpMjsPath,
      nodePath,
      shell,
      snippet,
      profilePath,
      profileStatus: "dry-run",
      onPath
    };
  }

  const { shimPath } = writeGcpShim({ nodePath, gcpMjsPath, binDir });

  let profileStatus = "skipped";
  if (opts.writeProfile) {
    profileStatus = appendProfileSnippet(profilePath, snippet);
  }

  return {
    binDir,
    shimPath,
    gcpMjsPath,
    nodePath,
    shell,
    snippet,
    profilePath,
    profileStatus,
    onPath: isGhostcrabBinOnPath(binDir)
  };
}

/**
 * @param {string} pkgRoot
 * @returns {{
 *   gcpOnPath: boolean,
 *   shimExists: boolean,
 *   shimPath: string,
 *   binDirOnPath: boolean,
 *   binDir: string,
 *   documentOk: boolean,
 *   documentPath: string | null
 * }}
 */
export async function runPathDoctor(pkgRoot) {
  const { resolveDocumentEnginePath } = await import("./prebuild-permissions.mjs");
  const binDir = getGhostcrabBinDir();
  const shimPath =
    process.platform === "win32" ? join(binDir, "gcp.cmd") : join(binDir, "gcp");
  const docResolved = resolveDocumentEnginePath(pkgRoot);

  return {
    gcpOnPath: Boolean(findOnPath("gcp")),
    shimExists: existsSync(shimPath),
    shimPath,
    binDirOnPath: isGhostcrabBinOnPath(binDir),
    binDir,
    documentOk: docResolved.ok,
    documentPath: docResolved.ok ? docResolved.path : docResolved.path ?? null
  };
}
