import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const result = spawnSync(npm, ["pack", "--dry-run", "--json"], {
  cwd: process.cwd(),
  encoding: "utf8",
  env: process.env
});

if (result.status !== 0) {
  throw new Error(
    `npm pack --dry-run failed with exit=${result.status ?? "null"}.\nSTDERR:\n${result.stderr}`
  );
}

const packResult = JSON.parse(result.stdout)[0];
const filePaths = new Set(packResult.files.map((file) => file.path));

for (const requiredPath of [
  "package.json",
  "README.md",
  ".env.example",
  "dist/index.js",
  "dist/index.d.ts",
  "dist/db/migrations/001_facets_schema.sql",
  "docs/getting_started_mcp_client.md",
  "docs/mcp_tools_contract.md",
  "docs/architecture.md",
  "docs/known_limits.md",
  "examples/node-stdio-client/index.mjs"
]) {
  assert.equal(
    filePaths.has(requiredPath),
    true,
    `Expected ${requiredPath} to be present in the npm tarball.`
  );
}

for (const forbiddenPrefix of ["src/", "tests/", "scripts/"]) {
  assert.equal(
    [...filePaths].some((filePath) => filePath.startsWith(forbiddenPrefix)),
    false,
    `Did not expect ${forbiddenPrefix} files in the npm tarball.`
  );
}

console.error(
  `[ghostcrab-pack] Dry-run tarball verified with ${filePaths.size} packaged files.`
);
