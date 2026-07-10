#!/usr/bin/env node
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
const args = process.argv.slice(2);

function loadDotEnvAuth() {
  const envPath = join(repoRoot, ".env");
  if (!existsSync(envPath)) return;

  const text = readFileSync(envPath, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;

    const key = trimmed.slice(0, eq).trim();
    if (key !== "NODE_AUTH_TOKEN" && key !== "NPM_TOKEN") continue;
    if (process.env[key]?.trim()) continue;

    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
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
      "[npm-stage] Missing NODE_AUTH_TOKEN (or NPM_TOKEN).\n" +
        "  Add NODE_AUTH_TOKEN=npm_... to .env at repo root, or export it in the shell."
    );
    process.exit(1);
  }
}

function createUserconfig() {
  const token = process.env.NODE_AUTH_TOKEN?.trim();
  if (!token) {
    throw new Error("NODE_AUTH_TOKEN missing after ensureNpmAuthToken()");
  }

  const dir = mkdtempSync(join(tmpdir(), "ghostcrab-npm-stage-"));
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
    // Best effort on filesystems that do not support chmod.
  }

  return {
    npmrcPath,
    cleanup: () => rmSync(dir, { recursive: true, force: true })
  };
}

if (args.length === 0) {
  console.error(
    "[npm-stage] Usage:\n" +
      "  pnpm stage:npm:list\n" +
      "  pnpm stage:npm:view -- <stage-id>\n" +
      "  pnpm stage:npm:approve -- <stage-id>\n" +
      "  pnpm stage:npm -- <npm-stage-subcommand> [...args]"
  );
  process.exit(1);
}

loadDotEnvAuth();
ensureNpmAuthToken();

const { npmrcPath, cleanup } = createUserconfig();
try {
  const result = spawnSync(
    "npm",
    ["--userconfig", npmrcPath, "stage", ...args],
    {
      cwd: repoRoot,
      env: process.env,
      stdio: "inherit"
    }
  );
  process.exit(result.status ?? 1);
} finally {
  cleanup();
}
