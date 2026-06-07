#!/usr/bin/env node
/**
 * Run from the unzipped beta bundle directory:
 *   node install-beta.mjs
 *
 * Installs the root tarball and the platform prebuild matching this machine
 * (see pack-manifest.json).
 */
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { formatSpawnFailure, spawnNpm } from "./lib/spawn-npm.mjs";
import { spawnSync } from "node:child_process";

const bundleRoot = dirname(fileURLToPath(import.meta.url));
const manifestPath = join(bundleRoot, "pack-manifest.json");

function detectPlatformKey() {
  const { platform, arch } = process;
  if (platform === "linux" && arch === "x64") return "linux-x64";
  if (platform === "linux" && arch === "arm64") return "linux-arm64";
  if (platform === "darwin" && arch === "x64") return "darwin-x64";
  if (platform === "darwin" && arch === "arm64") return "darwin-arm64";
  if (platform === "win32" && arch === "x64") return "win32-x64";
  if (platform === "win32" && arch === "arm64") return "win32-arm64";
  return null;
}

function runNpmInstall(tgzBasename, { noPackageLock = false } = {}) {
  const tgz = join(bundleRoot, tgzBasename);
  if (!existsSync(tgz)) {
    console.error(`Missing file: ${tgz}`);
    process.exit(1);
  }
  const rel = `./${tgzBasename}`;
  // --no-package-lock: prevents a stale lock file (from a previous partial install
  // where optional registry deps were unresolvable) from rejecting a valid local tarball.
  const extraFlags = noPackageLock ? ["--no-package-lock"] : [];
  const args = ["install", rel, ...extraFlags];
  console.error(`[install-beta] npm ${args.join(" ")}`);
  const r = spawnNpm(args, {
    cwd: bundleRoot,
    encoding: "utf8",
    stdio: "inherit",
    env: process.env
  });
  if (r.status !== 0 || r.error) {
    console.error(`[install-beta] npm failed (${formatSpawnFailure(r)})`);
    if (r.error) {
      console.error(`[install-beta] spawn error: ${r.error.message}`);
    }
    process.exit(r.status ?? 1);
  }
}

if (!existsSync(manifestPath)) {
  console.error(
    `pack-manifest.json not found next to this script (${bundleRoot}).`
  );
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const root = manifest.root;
if (!root?.filename) {
  console.error("Invalid pack-manifest.json: missing root.filename");
  process.exit(1);
}

const platformKey = detectPlatformKey();
if (!platformKey) {
  console.error(
    `Unsupported host: platform=${process.platform} arch=${process.arch}. ` +
      `This bundle supports: ${Object.keys(manifest.platforms ?? {}).join(", ")}`
  );
  process.exit(1);
}

const plat = manifest.platforms?.[platformKey];
if (!plat?.filename) {
  console.error(
    `No prebuild in manifest for "${platformKey}" (host: ${process.platform} ${process.arch}).`
  );
  console.error(
    `Available keys: ${Object.keys(manifest.platforms ?? {}).join(", ")}`
  );
  process.exit(1);
}

console.error(
  `[install-beta] Host → ${platformKey} (${basename(plat.filename)})`
);

runNpmInstall(root.filename);
// Platform prebuild: always bypass the lock file.
// npm may have recorded an invalid/empty version for this optional dep
// (failed registry fetch during the root install), which would cause
// "Invalid Version:" when installing the local tarball.
runNpmInstall(plat.filename, { noPackageLock: true });

const installedGcp = join(
  bundleRoot,
  "node_modules",
  "@mindflight",
  "ghostcrab-personal-mcp",
  "bin",
  "gcp.mjs"
);
if (
  existsSync(installedGcp) &&
  process.env.GHOSTCRAB_SKIP_INSTALL_UPGRADE !== "1"
) {
  console.error("[install-beta] running gcp brain upgrade");
  const upgrade = spawnSync(
    process.execPath,
    [installedGcp, "brain", "upgrade"],
    {
      cwd: bundleRoot,
      stdio: "inherit",
      env: process.env
    }
  );
  if (upgrade.status !== 0 || upgrade.error) {
    console.error(
      `[install-beta] upgrade failed/non-fatal (${formatSpawnFailure(upgrade)}). Retry: node "${installedGcp}" brain upgrade`
    );
  }
}

console.error("[install-beta] Done. Try: npx gcp --help");
