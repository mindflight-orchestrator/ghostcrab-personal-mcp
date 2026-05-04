#!/usr/bin/env node
/**
 * Publish the split npm packages in registry order: five platform packages, then root.
 * Expects prebuilds/ at repo root (CI: after cross-build). Runs full platform staging first.
 *
 * Usage (from repo root, with NODE_AUTH_TOKEN set):
 *   node scripts/publish-npm-split.mjs
 *
 * Some npm versions do not honour NODE_AUTH_TOKEN for `npm publish` (ENEEDAUTH) even when
 * the token works via the registry HTTP API — we pass `--userconfig` with _authToken.
 */
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

function ensureNpmAuthToken() {
  const fromNode = process.env.NODE_AUTH_TOKEN?.trim();
  const fromNpm = process.env.NPM_TOKEN?.trim();
  if (!fromNode && fromNpm) {
    process.env.NODE_AUTH_TOKEN = fromNpm;
  }
  if (!process.env.NODE_AUTH_TOKEN?.trim()) {
    console.error(
      "[publish-npm-split] Missing NODE_AUTH_TOKEN (or NPM_TOKEN).\n" +
        "  Load .env into the shell: export $(grep NODE_AUTH_TOKEN .env)\n" +
        "  Or: npx dotenv-cli -e .env -- node scripts/publish-npm-split.mjs\n" +
        "  npm publishes use NODE_AUTH_TOKEN for https://registry.npmjs.org/"
    );
    process.exit(1);
  }
}

ensureNpmAuthToken();

const PLATFORM_DIRS = [
  "packages/prebuild-linux-x64",
  "packages/prebuild-linux-arm64",
  "packages/prebuild-darwin-x64",
  "packages/prebuild-darwin-arm64",
  "packages/prebuild-win32-x64"
];

function readRootVersion() {
  const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
  const v = pkg.version;
  if (!v || typeof v !== "string") {
    throw new Error("Root package.json missing version");
  }
  return v;
}

/** Copy root version into each platform package manifest (packages/ may be stale locally). */
function syncPlatformPackageVersions(rootVersion) {
  for (const rel of PLATFORM_DIRS) {
    const p = join(repoRoot, rel, "package.json");
    if (!existsSync(p)) {
      throw new Error(`Missing ${p}`);
    }
    const pkg = JSON.parse(readFileSync(p, "utf8"));
    pkg.version = rootVersion;
    writeFileSync(p, JSON.stringify(pkg, null, 2) + "\n");
  }
}

function assertAlignedVersions(rootVersion) {
  for (const rel of PLATFORM_DIRS) {
    const p = join(repoRoot, rel, "package.json");
    if (!existsSync(p)) {
      throw new Error(`Missing ${p}`);
    }
    const { version, name } = JSON.parse(readFileSync(p, "utf8"));
    if (version !== rootVersion) {
      throw new Error(
        `Version mismatch: root ${rootVersion} vs ${name}@${version}. Align versions before publish.`
      );
    }
  }
}

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, {
    cwd,
    stdio: "inherit",
    env: process.env
  });
  if (r.status !== 0) {
    process.exit(r.status ?? 1);
  }
}

/** Minimal npm userconfig so `npm publish` authenticates reliably (fixes ENEEDAUTH vs Bearer/curl). */
function createPublishUserconfig() {
  const token = process.env.NODE_AUTH_TOKEN?.trim();
  if (!token) {
    throw new Error("NODE_AUTH_TOKEN missing after ensureNpmAuthToken()");
  }
  const dir = mkdtempSync(join(tmpdir(), "ghostcrab-npm-publish-"));
  const npmrcPath = join(dir, "npmrc");
  writeFileSync(
    npmrcPath,
    [
      "registry=https://registry.npmjs.org/",
      `//registry.npmjs.org/:_authToken=${token}`,
      ""
    ].join("\n"),
    "utf8"
  );
  try {
    chmodSync(npmrcPath, 0o600);
  } catch {
    // ignore chmod failure on exotic filesystems
  }
  return {
    npmrcPath,
    cleanup: () => rmSync(dir, { recursive: true, force: true })
  };
}

/** Provenance needs a supported CI (e.g. GitHub Actions + OIDC/trusted publishing). Local/token-only runs fail with "provider: null". */
function npmPublishArgs() {
  const args = ["publish", "--access", "public"];
  const ci = process.env.GITHUB_ACTIONS === "true";
  const noProv = process.env.NPM_PUBLISH_NO_PROVENANCE === "1";
  if (ci && !noProv) {
    args.splice(1, 0, "--provenance");
    console.error("[publish-npm-split] using --provenance (GitHub Actions).");
  } else if (ci && noProv) {
    console.error("[publish-npm-split] NPM_PUBLISH_NO_PROVENANCE=1 — publishing without provenance.");
  } else {
    console.error(
      "[publish-npm-split] publishing without --provenance (local or non-GitHub Actions; token login is OK)."
    );
  }
  return args;
}

const rootVersion = readRootVersion();
syncPlatformPackageVersions(rootVersion);
assertAlignedVersions(rootVersion);

run(process.execPath, [join(repoRoot, "scripts/stage-platform-packages.mjs")], repoRoot);

const publishCmd = npmPublishArgs();
const { npmrcPath, cleanup } = createPublishUserconfig();
const npmWithAuth = ["--userconfig", npmrcPath, ...publishCmd];
try {
  for (const rel of PLATFORM_DIRS) {
    run("npm", npmWithAuth, join(repoRoot, rel));
  }
  run("npm", npmWithAuth, repoRoot);
} finally {
  cleanup();
}

console.error("[publish-npm-split] Done (5 platform packages + root).");
