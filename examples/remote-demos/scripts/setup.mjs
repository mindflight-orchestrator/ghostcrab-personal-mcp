#!/usr/bin/env node
/**
 * Post-clone orchestration: schema pull → skill pull → local skill install → gcp load.
 * Reads demo-manifest.json at the repo root (this example: examples/remote-demos).
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const MANIFEST_PATH = join(ROOT, "demo-manifest.json");

const profilesOnly = process.argv.includes("--profiles-only");

function gcpBinPath() {
  const p = join(
    ROOT,
    "node_modules",
    "@mindflight",
    "ghostcrab-personal-mcp",
    "bin",
    "gcp.mjs"
  );
  if (!existsSync(p)) {
    console.error(
      `Missing gcp at ${p}\n` +
        "  Run: npm install   (from this directory)\n" +
        "  Published copies should depend on @mindflight/ghostcrab-personal-mcp from npm instead of file:../.."
    );
    process.exit(1);
  }
  return p;
}

function runGcp(args, label) {
  const bin = gcpBinPath();
  const subprocess = spawnSync(process.execPath, [bin, ...args], {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env }
  });
  if (subprocess.status !== 0) {
    console.error(
      `\n[remote-demos] Failed: ${label} (exit ${subprocess.status ?? "?"})`
    );
    process.exit(subprocess.status ?? 1);
  }
}

function loadManifest() {
  if (!existsSync(MANIFEST_PATH)) {
    console.error(`Missing ${MANIFEST_PATH}`);
    process.exit(1);
  }
  const raw = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  return {
    schemas: Array.isArray(raw.schemas) ? raw.schemas : [],
    skills: Array.isArray(raw.skills) ? raw.skills : [],
    local_skills: Array.isArray(raw.local_skills) ? raw.local_skills : [],
    profiles: Array.isArray(raw.profiles) ? raw.profiles : []
  };
}

const manifest = loadManifest();

if (profilesOnly) {
  for (const rel of manifest.profiles) {
    const file = resolve(ROOT, rel);
    if (!existsSync(file)) {
      console.error(`Profile not found: ${file}`);
      process.exit(1);
    }
    runGcp(["load", file], `gcp load ${rel}`);
  }
  console.log("\n[remote-demos] Profiles loaded.");
  process.exit(0);
}

for (const id of manifest.schemas) {
  runGcp(["brain", "schema", "pull", id], `gcp brain schema pull ${id}`);
}

for (const id of manifest.skills) {
  runGcp(["agent", "skills", "pull", id], `gcp agent skills pull ${id}`);
}

for (const rel of manifest.local_skills) {
  const dir = resolve(ROOT, rel);
  if (!existsSync(dir)) {
    console.error(`Local skill dir missing: ${dir}`);
    process.exit(1);
  }
  runGcp(
    ["agent", "skills", "install", "--dir", dir],
    `gcp agent skills install --dir ${rel}`
  );
}

for (const rel of manifest.profiles) {
  const file = resolve(ROOT, rel);
  if (!existsSync(file)) {
    console.error(`Profile not found: ${file}`);
    process.exit(1);
  }
  runGcp(["load", file], `gcp load ${rel}`);
}

console.log(
  "\n[remote-demos] Setup finished (schemas, skills, local skills, profiles)."
);
