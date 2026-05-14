#!/usr/bin/env node
/**
 * Offline beta install smoke for MCP client setup.
 *
 * Installs the freshly built root + platform tarballs into a temp consumer
 * project, then verifies installed `gcp brain setup` dry-run paths for Cursor,
 * Codex, and Claude Code without writing real user config files.
 */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const distPackDir = existsSync(join(__dirname, "pack-manifest.json"))
  ? __dirname
  : join(repoRoot, "dist-pack");
const manifest = JSON.parse(
  readFileSync(join(distPackDir, "pack-manifest.json"), "utf8")
);

const platformKey = `${process.platform}-${process.arch}`;
const platformEntry = manifest.platforms?.[platformKey];
assert.ok(platformEntry, `No platform tarball found for ${platformKey}`);

const consumerDir = mkdtempSync(join(tmpdir(), "ghostcrab-beta-ide-smoke-"));
const npmCacheDir = join(tmpdir(), "ghostcrab-npm-cache");

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, {
    cwd: opts.cwd ?? consumerDir,
    encoding: "utf8",
    stdio: "pipe",
    env: {
      ...process.env,
      npm_config_cache: process.env.npm_config_cache ?? npmCacheDir,
      ...(opts.env ?? {})
    }
  });
}

function assertRunOk(label, result) {
  assert.equal(
    result.status,
    0,
    `${label} failed (exit ${result.status ?? "null"}).\nSTDERR:\n${result.stderr}\nSTDOUT:\n${result.stdout}`
  );
}

function assertIncludes(haystack, needle, label) {
  assert.ok(
    haystack.includes(needle),
    `${label} did not include ${JSON.stringify(needle)}.\nOutput:\n${haystack}`
  );
}

try {
  writeFileSync(
    join(consumerDir, "package.json"),
    JSON.stringify(
      {
        name: "ghostcrab-beta-ide-smoke",
        private: true,
        version: "0.0.0"
      },
      null,
      2
    ) + "\n"
  );

  const rootTarball = join(distPackDir, manifest.root.filename);
  const platformTarball = join(distPackDir, platformEntry.filename);

  assertRunOk(
    "npm install root tarball",
    run("npm", ["install", "--omit=optional", rootTarball])
  );
  assertRunOk(
    "npm install platform tarball",
    run("npm", ["install", platformTarball, "--no-package-lock"])
  );

  const gcpMjs = join(
    consumerDir,
    "node_modules",
    "@mindflight",
    "ghostcrab-personal-mcp",
    "bin",
    "gcp.mjs"
  );

  assertRunOk("gcp --help", run(process.execPath, [gcpMjs, "--help"]));
  assertRunOk("gcp authorize", run(process.execPath, [gcpMjs, "authorize"]));

  const cursor = run(process.execPath, [
    gcpMjs,
    "brain",
    "setup",
    "cursor",
    "--dry-run",
    "--force",
    "--workspace",
    "beta-smoke"
  ]);
  assertRunOk("gcp brain setup cursor --dry-run", cursor);
  assertIncludes(cursor.stdout, '"ghostcrab-personal-mcp"', "cursor dry-run");
  assertIncludes(cursor.stdout, '"command":', "cursor dry-run");
  assertIncludes(cursor.stdout, '"brain"', "cursor dry-run");
  assertIncludes(cursor.stdout, '"up"', "cursor dry-run");
  assertIncludes(cursor.stdout, '"--workspace"', "cursor dry-run");
  assertIncludes(cursor.stdout, '"beta-smoke"', "cursor dry-run");

  const codex = run(process.execPath, [
    gcpMjs,
    "brain",
    "setup",
    "codex",
    "--dry-run",
    "--workspace",
    "beta-smoke"
  ]);
  assertRunOk("gcp brain setup codex --dry-run", codex);
  assertIncludes(codex.stdout, "[mcp_servers.ghostcrab-personal-mcp]", "codex dry-run");
  assertIncludes(codex.stdout, "brain", "codex dry-run");
  assertIncludes(codex.stdout, "up", "codex dry-run");
  assertIncludes(codex.stdout, "beta-smoke", "codex dry-run");

  const claude = run(process.execPath, [
    gcpMjs,
    "brain",
    "setup",
    "claude",
    "--dry-run",
    "--workspace",
    "beta-smoke"
  ]);
  assertRunOk("gcp brain setup claude --dry-run", claude);
  assertIncludes(claude.stdout, "claude mcp add --transport stdio", "claude dry-run");
  assertIncludes(claude.stdout, "ghostcrab-personal-mcp --", "claude dry-run");
  assertIncludes(claude.stdout, "brain up", "claude dry-run");
  assertIncludes(claude.stdout, "beta-smoke", "claude dry-run");

  console.error(`[beta-ide-smoke] OK for ${platformKey}`);
} finally {
  rmSync(consumerDir, { recursive: true, force: true });
}
