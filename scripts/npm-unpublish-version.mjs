#!/usr/bin/env node
/**
 * Unpublish all @mindflight/ghostcrab-personal-mcp* versions from the npm registry for one semver.
 *
 * Loads repo-root `.env` (does not override existing environment variables).
 * Auth: NODE_AUTH_TOKEN or NPM_TOKEN (same convention as publish-npm-split.mjs).
 * Uses `--userconfig` + _authToken so `npm unpublish` authenticates reliably.
 *
 * Usage (from repo root):
 *   node scripts/npm-unpublish-version.mjs              # version from NPM_UNPUBLISH_VERSION or 0.2.6
 *   node scripts/npm-unpublish-version.mjs 0.2.6
 *
 * OTP (if required): NPM_OTP=123456 node scripts/npm-unpublish-version.mjs
 *
 * If npm says "Refusing to delete the last version", either publish a newer semver first,
 * then re-run unpublish for 0.2.6, or deliberately use NPM_UNPUBLISH_FORCE=1 (adds `npm unpublish --force`).
 * Forcing removal of the *only* tarball can impose a registry cooldown before you can publish again.
 */
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

const PACKAGES = [
  "@mindflight/ghostcrab-personal-mcp",
  "@mindflight/ghostcrab-personal-mcp-darwin-arm64",
  "@mindflight/ghostcrab-personal-mcp-darwin-x64",
  "@mindflight/ghostcrab-personal-mcp-linux-arm64",
  "@mindflight/ghostcrab-personal-mcp-linux-x64",
  "@mindflight/ghostcrab-personal-mcp-win32-x64"
];

function loadDotEnv() {
  const envPath = join(repoRoot, ".env");
  if (!existsSync(envPath)) return;
  const text = readFileSync(envPath, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined || process.env[key] === "") {
      process.env[key] = val;
    }
  }
}

function ensureNpmAuthToken() {
  const fromNode = process.env.NODE_AUTH_TOKEN?.trim();
  const fromNpm = process.env.NPM_TOKEN?.trim();
  if (!fromNode && fromNpm) {
    process.env.NODE_AUTH_TOKEN = fromNpm;
  }
  if (!process.env.NODE_AUTH_TOKEN?.trim()) {
    console.error(
      "[npm-unpublish-version] Missing NODE_AUTH_TOKEN (or NPM_TOKEN).\n" +
        "  Add it to .env or export it; see scripts/publish-npm-split.mjs."
    );
    process.exit(1);
  }
}

function createUnpublishUserconfig() {
  const token = process.env.NODE_AUTH_TOKEN?.trim();
  if (!token) {
    throw new Error("NODE_AUTH_TOKEN missing after ensureNpmAuthToken()");
  }
  const dir = mkdtempSync(join(tmpdir(), "ghostcrab-npm-unpublish-"));
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
    // ignore
  }
  return {
    npmrcPath,
    cleanup: () => rmSync(dir, { recursive: true, force: true })
  };
}

loadDotEnv();
ensureNpmAuthToken();

const version =
  process.argv[2]?.trim() ||
  process.env.NPM_UNPUBLISH_VERSION?.trim() ||
  "0.2.6";

if (!/^\d+\.\d+\.\d+/.test(version)) {
  console.error(`[npm-unpublish-version] Bad version: ${JSON.stringify(version)}`);
  process.exit(1);
}

const { npmrcPath, cleanup } = createUnpublishUserconfig();
const otp = process.env.NPM_OTP?.trim();
const npmUnpublishForce = process.env.NPM_UNPUBLISH_FORCE === "1";

if (npmUnpublishForce) {
  console.error(
    "[npm-unpublish-version] NPM_UNPUBLISH_FORCE=1 — using `npm unpublish --force`. " +
      "If each package only had this version on the registry, expect possible republish cooldowns."
  );
}

let failures = 0;
try {
  for (const name of PACKAGES) {
    const spec = `${name}@${version}`;
    const args = ["--userconfig", npmrcPath, "unpublish", spec];
    if (npmUnpublishForce) {
      args.push("--force");
    }
    if (otp) {
      args.push(`--otp=${otp}`);
    }
    console.error(`[npm-unpublish-version] npm ${args.slice(2).join(" ")}`);
    const r = spawnSync("npm", args, {
      cwd: repoRoot,
      stdio: "inherit",
      env: process.env
    });
    if (r.status !== 0) {
      failures += 1;
      console.error(`[npm-unpublish-version] failed (exit ${r.status ?? "?"}) for ${spec}`);
    }
  }
} finally {
  cleanup();
}

if (failures > 0) {
  console.error(
    `[npm-unpublish-version] Done with ${failures} failure(s). ` +
      "Common causes: E403 OTP (set NPM_OTP), last version (use NPM_UNPUBLISH_FORCE=1), npm policy (dependents/downloads), or tarball already absent."
  );
  process.exit(1);
}

console.error(`[npm-unpublish-version] All unpublish attempts succeeded for *@${version}.`);
