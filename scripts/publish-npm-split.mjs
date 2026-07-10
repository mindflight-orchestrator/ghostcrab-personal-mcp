#!/usr/bin/env node
/**
 * Stage the split npm packages for review in registry order: six platform packages, then root.
 * Expects prebuilds/ at repo root (CI: after cross-build). Runs full platform staging first.
 *
 * Security rule: direct `npm publish` is no longer allowed. This script submits every
 * package with `npm stage publish`; nothing goes live until a maintainer reviews and
 * approves each staged package with 2FA (`npm stage approve <stage-id>` or the
 * Staged Packages tab on npmjs.com). Approve the six platform packages BEFORE the root
 * package so the root's optionalDependencies resolve.
 *
 * Requires npm >= 11.15.0 and Node >= 22.14.0 (checked at startup).
 *
 * Usage (from repo root, with NODE_AUTH_TOKEN set):
 *   node scripts/publish-npm-split.mjs
 *
 * Some npm versions do not honour NODE_AUTH_TOKEN (ENEEDAUTH) even when
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
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const thisScript = fileURLToPath(import.meta.url);

function versionAtLeast(actual, wanted) {
  const a = actual.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const w = wanted.split(".").map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if (a[i] !== w[i]) return a[i] > w[i];
  }
  return true;
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function maybeReexecWithNvmNode22() {
  if (versionAtLeast(process.versions.node, "22.14.0")) return;
  if (process.env.GHOSTCRAB_NPM_PUBLISH_NVM_REEXEC === "1") return;

  const nvmScript = join(
    process.env.NVM_DIR || join(homedir(), ".nvm"),
    "nvm.sh"
  );
  if (!existsSync(nvmScript)) return;

  const nodeArgs = [thisScript, ...process.argv.slice(2)]
    .map(shellQuote)
    .join(" ");
  const command = [
    `source ${shellQuote(nvmScript)}`,
    "unset npm_config_prefix NPM_CONFIG_PREFIX",
    "nvm use --delete-prefix 22 --silent >/dev/null",
    `exec node ${nodeArgs}`
  ].join(" && ");

  console.error(
    `[publish-npm-split] Node ${process.versions.node} detected; retrying with nvm Node 22.`
  );
  const result = spawnSync("zsh", ["-lc", command], {
    cwd: repoRoot,
    env: {
      ...process.env,
      GHOSTCRAB_NPM_PUBLISH_NVM_REEXEC: "1"
    },
    stdio: "inherit"
  });
  process.exit(result.status ?? 1);
}

/** Load NODE_AUTH_TOKEN / NPM_TOKEN from repo .env when not already in the environment. */
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
      "[publish-npm-split] Missing NODE_AUTH_TOKEN (or NPM_TOKEN).\n" +
        "  Add NODE_AUTH_TOKEN=npm_... to .env at repo root (read automatically), or export it in the shell.\n" +
        "  npm publishes use NODE_AUTH_TOKEN for https://registry.npmjs.org/"
    );
    process.exit(1);
  }
}

/** Staged publishing needs npm >= 11.15.0 running on Node >= 22.14.0. */
function ensureStagedPublishSupport() {
  const problems = [];
  const nodeVersion = process.versions.node;
  if (!versionAtLeast(nodeVersion, "22.14.0")) {
    problems.push(`Node ${nodeVersion} < 22.14.0 (e.g. \`nvm use 22\`)`);
  }
  const npmProbe = spawnSync("npm", ["--version"], { encoding: "utf8" });
  const npmVersion = npmProbe.status === 0 ? npmProbe.stdout.trim() : null;
  if (!npmVersion || !versionAtLeast(npmVersion, "11.15.0")) {
    problems.push(
      `npm ${npmVersion ?? "not found"} < 11.15.0 (\`npm install -g npm@^11.15.0\`)`
    );
  }
  if (problems.length > 0) {
    console.error(
      "[publish-npm-split] staged publishing requirements not met:\n" +
        problems.map((p) => `  - ${p}`).join("\n") +
        "\n  Direct `npm publish` is not allowed anymore; fix the toolchain and re-run."
    );
    process.exit(1);
  }
}

maybeReexecWithNvmNode22();
loadDotEnvAuth();
ensureNpmAuthToken();
ensureStagedPublishSupport();

const PLATFORM_DIRS = [
  "packages/prebuild-linux-x64",
  "packages/prebuild-linux-arm64",
  "packages/prebuild-darwin-x64",
  "packages/prebuild-darwin-arm64",
  "packages/prebuild-win32-x64",
  "packages/prebuild-win32-arm64"
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

/**
 * Provenance needs a supported CI (e.g. GitHub Actions + OIDC/trusted publishing). Local/token-only runs fail with "provider: null".
 * No --otp here: `npm stage publish` does not take 2FA — 2FA happens at `npm stage approve`.
 */
function npmStagePublishArgs() {
  const args = ["stage", "publish", "--access", "public"];
  const ci = process.env.GITHUB_ACTIONS === "true";
  const noProv = process.env.NPM_PUBLISH_NO_PROVENANCE === "1";
  if (ci && !noProv) {
    args.splice(2, 0, "--provenance");
    console.error("[publish-npm-split] using --provenance (GitHub Actions).");
  } else if (ci && noProv) {
    console.error(
      "[publish-npm-split] NPM_PUBLISH_NO_PROVENANCE=1 — staging without provenance."
    );
  } else {
    console.error(
      "[publish-npm-split] staging without --provenance (local or non-GitHub Actions; token login is OK)."
    );
  }
  return args;
}

const rootVersion = readRootVersion();
syncPlatformPackageVersions(rootVersion);
assertAlignedVersions(rootVersion);

run(
  process.execPath,
  [join(repoRoot, "scripts/stage-platform-packages.mjs")],
  repoRoot
);

const stageCmd = npmStagePublishArgs();
const { npmrcPath, cleanup } = createPublishUserconfig();
const npmWithAuth = ["--userconfig", npmrcPath, ...stageCmd];
try {
  for (const rel of PLATFORM_DIRS) {
    run("npm", npmWithAuth, join(repoRoot, rel));
  }
  run("npm", npmWithAuth, repoRoot);
} finally {
  cleanup();
}

console.error(
  `[publish-npm-split] Staged ${PLATFORM_DIRS.length} platform packages + root (v${rootVersion}). Nothing is live yet.\n` +
    "Next steps (maintainer, with 2FA):\n" +
    "  1. pnpm stage:npm:list                      # find the stage ids\n" +
    "  2. pnpm stage:npm:view -- <stage-id>        # review each package (or the Staged Packages tab on npmjs.com)\n" +
    "  3. pnpm stage:npm:approve -- <stage-id>     # approve the SIX platform packages first\n" +
    "  4. pnpm stage:npm:approve -- <root-stage-id> # approve @mindflight/ghostcrab-personal-mcp LAST\n" +
    "Approving root before the platform packages breaks installs (optionalDependencies would not resolve)."
);
