#!/usr/bin/env node
/**
 * GhostCrab launcher — starts the Zig backend then the MCP server on stdio.
 *
 * No postinstall, no runtime downloads. Pre-compiled binaries ship inside
 * prebuilds/{platform}-{arch}/ghostcrab-backend[.exe].
 *
 * Usage (MCP client config):
 *   { "command": "npx", "args": ["@mindflight/ghostcrab"] }
 *
 * Environment variables (all optional):
 *   GHOSTCRAB_BACKEND_ADDR   backend listen address (default :8091)
 *   GHOSTCRAB_SQLITE_PATH    SQLite file path       (default ./data/ghostcrab.sqlite)
 *   GHOSTCRAB_MINDBRAIN_URL  URL for MCP→backend    (default http://127.0.0.1:8091)
 */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(__dirname, "..");

// ── Platform detection ────────────────────────────────────────────────────────
const platform = process.platform; // 'linux' | 'darwin' | 'win32'
const arch = process.arch; // 'x64' | 'arm64'
const platformKey = `${platform}-${arch}`;
const binaryName =
  platform === "win32" ? "ghostcrab-backend.exe" : "ghostcrab-backend";
const backendBin = join(pkgRoot, "prebuilds", platformKey, binaryName);

if (!existsSync(backendBin)) {
  process.stderr.write(
    `[ghostcrab] Pre-built backend not found for platform "${platformKey}".\n` +
      `  Expected: ${backendBin}\n` +
      `  Supported: linux-x64, linux-arm64, darwin-x64, darwin-arm64, win32-x64\n` +
      `  To build from source: make backend-vendor sqlite3-download backend-build\n`
  );
  process.exit(1);
}

// ── Configuration ─────────────────────────────────────────────────────────────
const backendAddr = process.env.GHOSTCRAB_BACKEND_ADDR ?? ":8091";
const port = backendAddr.split(":").at(-1) || "8091";
const sqlitePath =
  process.env.GHOSTCRAB_SQLITE_PATH ??
  join(process.cwd(), "data", "ghostcrab.sqlite");
const mindbrainUrl =
  process.env.GHOSTCRAB_MINDBRAIN_URL ?? `http://127.0.0.1:${port}`;

// Ensure data directory exists before the backend tries to open the file.
const dataDir = dirname(resolve(sqlitePath));
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

// ── Start backend ─────────────────────────────────────────────────────────────
const backend = spawn(backendBin, [], {
  env: {
    ...process.env,
    GHOSTCRAB_BACKEND_ADDR: backendAddr,
    GHOSTCRAB_SQLITE_PATH: sqlitePath,
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let backendExited = false;
backend.stdout.on("data", (d) => process.stderr.write(`[backend] ${d}`));
backend.stderr.on("data", (d) => process.stderr.write(`[backend] ${d}`));
backend.on("exit", (code) => {
  backendExited = true;
  if (code !== 0 && code !== null) {
    process.stderr.write(`[ghostcrab] backend exited with code ${code}\n`);
    process.exit(code ?? 1);
  }
});

// ── Wait for backend health ───────────────────────────────────────────────────
const healthUrl = `${mindbrainUrl}/health`;
const TIMEOUT_MS = 15_000;
const POLL_INTERVAL_MS = 100;
const deadline = Date.now() + TIMEOUT_MS;

await (async function waitForBackend() {
  while (Date.now() < deadline) {
    if (backendExited) {
      process.stderr.write(
        "[ghostcrab] backend exited before becoming healthy\n"
      );
      process.exit(1);
    }
    try {
      const res = await fetch(healthUrl, {
        signal: AbortSignal.timeout(1000),
      });
      if (res.ok) return;
    } catch {
      // not ready yet — keep polling
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  process.stderr.write(
    `[ghostcrab] backend did not become healthy within ${TIMEOUT_MS}ms\n` +
      `  health URL: ${healthUrl}\n`
  );
  backend.kill();
  process.exit(1);
})();

// ── Cleanup handlers ──────────────────────────────────────────────────────────
function stopBackend() {
  if (!backendExited) {
    backend.kill("SIGTERM");
  }
}

process.on("exit", stopBackend);
process.on("SIGINT", () => {
  stopBackend();
  process.exit(0);
});
process.on("SIGTERM", () => {
  stopBackend();
  process.exit(0);
});

// ── Start MCP server (runs on this process's stdio = the MCP transport) ───────
process.env.GHOSTCRAB_MINDBRAIN_URL = mindbrainUrl;
const { startMcpServer } = await import("../dist/server.js");
await startMcpServer();

stopBackend();
