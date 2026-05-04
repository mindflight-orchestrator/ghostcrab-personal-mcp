import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const distPackDir = join(repoRoot, "dist-pack");
const manifest = JSON.parse(readFileSync(join(distPackDir, "pack-manifest.json"), "utf8"));

const platformKey = `${process.platform}-${process.arch}`;
const platformEntry = manifest.platforms?.[platformKey];
assert.ok(platformEntry, `No platform tarball found for ${platformKey}`);

const consumerDir = mkdtempSync(join(tmpdir(), "ghostcrab-beta-smoke-"));

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, {
    cwd: opts.cwd ?? consumerDir,
    encoding: "utf8",
    stdio: "pipe",
    env: {
      ...process.env,
      npm_config_cache: process.env.npm_config_cache ?? join(tmpdir(), "ghostcrab-npm-cache"),
      ...(opts.env ?? {})
    }
  });
}

try {
  writeFileSync(
    join(consumerDir, "package.json"),
    JSON.stringify(
      {
        name: "ghostcrab-beta-smoke",
        private: true,
        version: "0.0.0"
      },
      null,
      2
    ) + "\n"
  );

  const rootTarball = join(distPackDir, manifest.root.filename);
  const platformTarball = join(distPackDir, platformEntry.filename);

  const installRoot = run("npm", ["install", "--omit=optional", rootTarball]);
  assert.equal(
    installRoot.status,
    0,
    `npm install root tarball failed (exit ${installRoot.status ?? "null"}).\n${installRoot.stderr}\n${installRoot.stdout}`
  );

  const installPlatform = run("npm", ["install", platformTarball]);
  assert.equal(
    installPlatform.status,
    0,
    `npm install platform tarball failed (exit ${installPlatform.status ?? "null"}).\n${installPlatform.stderr}\n${installPlatform.stdout}`
  );

  const gcp = run(process.execPath, [
    join(
      consumerDir,
      "node_modules",
      "@mindflight",
      "ghostcrab-personal-mcp",
      "bin",
      "gcp.mjs"
    ),
    "--help"
  ]);
  assert.equal(
    gcp.status,
    0,
    `gcp --help failed (exit ${gcp.status ?? "null"}).\n${gcp.stderr}\n${gcp.stdout}`
  );

  const authorize = run(process.execPath, [
    join(
      consumerDir,
      "node_modules",
      "@mindflight",
      "ghostcrab-personal-mcp",
      "bin",
      "gcp.mjs"
    ),
    "authorize"
  ]);
  assert.equal(
    authorize.status,
    0,
    `gcp authorize failed (exit ${authorize.status ?? "null"}).\n${authorize.stderr}\n${authorize.stdout}`
  );

  console.error(`[beta-smoke] OK for ${platformKey}`);
} finally {
  rmSync(consumerDir, { recursive: true, force: true });
}
