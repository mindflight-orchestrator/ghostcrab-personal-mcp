import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { formatSpawnFailure, spawnNpm } from "./lib/spawn-npm.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const distPackDir = join(repoRoot, "dist-pack");
const manifest = JSON.parse(
  readFileSync(join(distPackDir, "pack-manifest.json"), "utf8")
);

const platformKey = `${process.platform}-${process.arch}`;
const platformEntry = manifest.platforms?.[platformKey];
assert.ok(platformEntry, `No platform tarball found for ${platformKey}`);

const consumerDir = mkdtempSync(join(tmpdir(), "ghostcrab-beta-smoke-"));
let backend = null;

function runNpm(args, opts = {}) {
  return spawnNpm(args, {
    cwd: opts.cwd ?? consumerDir,
    encoding: "utf8",
    stdio: "pipe",
    env: {
      ...process.env,
      npm_config_cache:
        process.env.npm_config_cache ?? join(tmpdir(), "ghostcrab-npm-cache"),
      ...(opts.env ?? {})
    }
  });
}

function runNode(args, opts = {}) {
  return spawnSync(process.execPath, args, {
    cwd: opts.cwd ?? consumerDir,
    encoding: "utf8",
    stdio: "pipe",
    env: {
      ...process.env,
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

  const install = runNpm([
    "install",
    "--no-audit",
    "--no-fund",
    rootTarball,
    platformTarball
  ]);
  assert.equal(
    install.status,
    0,
    `npm install root + platform tarballs failed (${formatSpawnFailure(install)}).\n${install.stderr}\n${install.stdout}`
  );

  const gcp = runNode([
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

  const authorize = runNode([
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

  const backendUrl = await startInstalledBackend();
  const toolsVerify = runNode(
    [
      join(
        consumerDir,
        "node_modules",
        "@mindflight",
        "ghostcrab-personal-mcp",
        "bin",
        "gcp.mjs"
      ),
      "tools",
      "verify"
    ],
    {
      env: {
        GHOSTCRAB_MINDBRAIN_URL: backendUrl,
        GHOSTCRAB_EMBEDDINGS_MODE: "disabled"
      }
    }
  );
  assert.equal(
    toolsVerify.status,
    0,
    `gcp tools verify failed (exit ${toolsVerify.status ?? "null"}).\n${toolsVerify.stderr}\n${toolsVerify.stdout}`
  );

  console.error(`[beta-smoke] OK for ${platformKey}`);
} finally {
  stopBackend();
  rmSync(consumerDir, { recursive: true, force: true });
}

async function startInstalledBackend() {
  const port = await findFreePort();
  const binaryName =
    process.platform === "win32"
      ? "ghostcrab-backend.exe"
      : "ghostcrab-backend";
  const backendPath = join(
    consumerDir,
    "node_modules",
    ...platformEntry.packageName.split("/"),
    "bin",
    binaryName
  );
  assert.equal(
    existsSync(backendPath),
    true,
    `Installed backend binary missing: ${backendPath}`
  );

  const url = `http://127.0.0.1:${port}`;
  backend = spawn(
    backendPath,
    [
      "--addr",
      `127.0.0.1:${port}`,
      "--db",
      join(consumerDir, "ghostcrab-smoke.sqlite")
    ],
    {
      cwd: consumerDir,
      env: {
        ...process.env,
        GHOSTCRAB_EMBEDDINGS_MODE: "disabled"
      },
      stdio: ["ignore", "pipe", "pipe"]
    }
  );

  let output = "";
  backend.stdout.setEncoding("utf8");
  backend.stderr.setEncoding("utf8");
  backend.stdout.on("data", (chunk) => {
    output += String(chunk);
  });
  backend.stderr.on("data", (chunk) => {
    output += String(chunk);
  });

  await waitForBackend(url, () => output);
  return url;
}

function stopBackend() {
  if (!backend || backend.exitCode !== null) return;
  backend.kill("SIGTERM");
}

async function findFreePort() {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === "object") {
          resolve(address.port);
        } else {
          reject(new Error("Could not allocate local smoke port"));
        }
      });
    });
  });
}

async function waitForBackend(url, getOutput) {
  const deadline = Date.now() + 10_000;
  let lastError = null;
  while (Date.now() < deadline) {
    if (backend?.exitCode !== null) {
      throw new Error(
        `Installed backend exited before healthcheck (exit ${backend?.exitCode}).\n${getOutput()}`
      );
    }
    try {
      const response = await fetch(`${url}/health`);
      if (response.ok) return;
      lastError = new Error(`health returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(
    `Timed out waiting for installed backend health at ${url}.\n` +
      `${lastError instanceof Error ? lastError.message : String(lastError)}\n` +
      `${getOutput()}`
  );
}
