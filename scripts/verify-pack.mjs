import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const packDir = "/tmp/ghostcrab-verify-pack";
const pkg = JSON.parse(
  readFileSync(join(process.cwd(), "package.json"), "utf8")
);
const platformPackageDirs = [
  "packages/prebuild-linux-x64",
  "packages/prebuild-linux-arm64",
  "packages/prebuild-darwin-x64",
  "packages/prebuild-darwin-arm64",
  "packages/prebuild-win32-x64",
  "packages/prebuild-win32-arm64"
];

for (const packageDir of platformPackageDirs) {
  const platformPkg = JSON.parse(
    readFileSync(join(process.cwd(), packageDir, "package.json"), "utf8")
  );
  assert.equal(
    pkg.optionalDependencies?.[platformPkg.name],
    pkg.version,
    `Expected optionalDependency ${platformPkg.name} to match root version ${pkg.version}.`
  );
  assert.equal(
    platformPkg.version,
    pkg.version,
    `Expected ${packageDir}/package.json version to match root version ${pkg.version}.`
  );
}

function packFilename(name, version) {
  return `${name.replace(/^@/, "").replace(/\//g, "-")}-${version}.tgz`;
}

rmSync(packDir, { recursive: true, force: true });
mkdirSync(packDir, { recursive: true });

const result = spawnSync(pnpm, ["pack", "--pack-destination", packDir], {
  cwd: process.cwd(),
  encoding: "utf8",
  env: {
    ...process.env,
    npm_config_cache: process.env.npm_config_cache ?? "/tmp/ghostcrab-npm-cache"
  }
});

if (result.status !== 0) {
  throw new Error(
    `pnpm pack failed with exit=${result.status ?? "null"}.\nSTDERR:\n${result.stderr}\nSTDOUT:\n${result.stdout}`
  );
}

const tarball = join(packDir, packFilename(pkg.name, pkg.version));
if (!existsSync(tarball)) {
  throw new Error(`pnpm pack did not produce expected tarball: ${tarball}`);
}

const listing = spawnSync("tar", ["-tzf", tarball], {
  cwd: process.cwd(),
  encoding: "utf8",
  env: process.env
});

if (listing.status !== 0) {
  throw new Error(
    `tar -tzf failed for ${tarball} with exit=${listing.status ?? "null"}.\n${listing.stderr}`
  );
}

const filePaths = new Set(
  listing.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^package\//, ""))
);

for (const requiredPath of [
  "package.json",
  "README.md",
  "INSTALL.md",
  "Licence.md",
  "README_CLAUDE_CODE_MCP.md",
  "README_CURSOR_MCP.md",
  "README_CODEX_MCP.md",
  ".env.example",
  "bin/gcp.mjs",
  "bin/lib/postinstall-prebuilds.mjs",
  "bin/lib/postinstall-host-bootstrap.mjs",
  "bin/lib/postinstall-smoke.mjs",
  "dist/index.js",
  "dist/index.d.ts",
  "dist/db/migrations/sqlite_mindbrain--1.0.0.sql",
  "docs/dev/getting_started_mcp_client.md",
  "docs/dev/mcp_tools_contract.md",
  "docs/dev/architecture.md",
  "docs/dev/known_limits.md",
  "examples/node-stdio-client/index.mjs",
  "bin/ide-skills/shared/ONBOARDING_CONTRACT.md",
  "bin/ide-skills/cursor/skills/ghostcrab-memory/SKILL.md",
  "bin/ide-skills/codex/skills/ghostcrab-memory/SKILL.md",
  "bin/ide-skills/codex/skills/ghostcrab-memory/agents/openai.yaml",
  "bin/ide-skills/codex/skills/ghostcrab-prompt-guide/SKILL.md",
  "bin/ide-skills/codex/skills/mindbrain-comparison-writer/references/article-blueprint.md",
  "bin/ide-skills/claude-code/skills/ghostcrab-memory/SKILL.md",
  "bin/ide-skills/claude-code/skills/ghostcrab-prompt-guide/SKILL.md",
  "ghostcrab-skills/shared/ONBOARDING_CONTRACT.md",
  "ghostcrab-skills/skills/ghostcrab-memory/SKILL.md",
  "ghostcrab-skills/skills/mindbrain-comparison-writer/references/article-blueprint.md",
  "ghostcrab-skills/claude-code/self-memory/CLAUDE.md"
]) {
  assert.equal(
    filePaths.has(requiredPath),
    true,
    `Expected ${requiredPath} to be present in the npm tarball.`
  );
}

assert.equal(
  [...filePaths].some((filePath) => filePath.startsWith("prebuilds/")),
  false,
  "Did not expect prebuilds/ files in the installer tarball."
);

const allowedScriptPaths = new Set([
  "scripts/verify-mcp-tools.mjs",
  "scripts/mcp-smoke-shared.mjs",
  "scripts/load-tool-manifest.mjs",
  "scripts/sync-ide-skill-bundles.mjs"
]);

for (const forbiddenPrefix of ["src/", "tests/"]) {
  assert.equal(
    [...filePaths].some((filePath) => filePath.startsWith(forbiddenPrefix)),
    false,
    `Did not expect ${forbiddenPrefix} files in the npm tarball.`
  );
}

for (const filePath of filePaths) {
  if (!filePath.startsWith("scripts/")) continue;
  assert.equal(
    allowedScriptPaths.has(filePath),
    true,
    `Unexpected scripts/ file in the npm tarball: ${filePath}`
  );
}

console.error(
  `[ghostcrab-pack] Installer tarball verified with ${filePaths.size} packaged files.`
);
