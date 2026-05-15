/**
 * gcp brain up | gcp serve  [--workspace <name>] [--db <path>] [--install-skills]
 *
 * Starts the Zig backend (detached, independent process) then the MCP server
 * on this process's stdio. The backend keeps running across MCP reconnections;
 * a second `gcp brain up` / `gcp serve` pointing at the same SQLite file will reuse it.
 *
 * SQLite path resolution (highest priority first):
 *   1. GHOSTCRAB_SQLITE_PATH env var (bypasses workspace system entirely)
 *   2. --db <path> CLI flag (useful for hard-coding the path in mcp.json args)
 *   3. Else: workspace from --workspace / config.defaultWorkspace → workspaces[name].sqlitePath
 *   4. Else: ./data/ghostcrab.sqlite under the current working directory
 */

import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { constants, existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ensureBackendExecutableForServe,
  resolveNativeBackendPath,
  SUPPORTED_PREBUILD_TARGETS
} from "../lib/prebuild-permissions.mjs";
import { resolveGhostcrabSqlite } from "../lib/resolve-ghostcrab-sqlite.mjs";
import { slugifyWorkspace } from "../lib/workspace-slug.mjs";
import { maybeInstallIdeSkills } from "../lib/install-ide-skills.mjs";

const DEFAULT_PORT = 8091;
const PORT_RANGE = 10; // probe 8091–8100 before giving up

/** Returns true if nothing is bound to host:port. */
function isPortFree(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.once("error", () => resolve(false));
    srv.once("listening", () => srv.close(() => resolve(true)));
    srv.listen(port, host);
  });
}

/** Starting from `base`, return the first free port within `range` slots. */
async function findFreePort(base, range = PORT_RANGE) {
  for (let p = base; p < base + range; p++) {
    if (await isPortFree(p)) return p;
  }
  throw new Error(
    `[ghostcrab] No free port found in range ${base}–${base + range - 1}. ` +
      `Set GHOSTCRAB_BACKEND_ADDR to override.`
  );
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(__dirname, "..", "..");

const PKG_VERSION = JSON.parse(
  readFileSync(join(pkgRoot, "package.json"), "utf8")
).version;

export async function runServe(args) {
  const installIdeSkills = args.includes("--install-skills") && !args.includes("--no-skills");
  const filtered = args.filter((a) => a !== "--install-skills" && a !== "--no-skills");

  // Parse flags
  let workspaceName = null;
  let dbPathFromCli = null;
  for (let i = 0; i < filtered.length; i++) {
    if ((filtered[i] === "--workspace" || filtered[i] === "-w") && filtered[i + 1]) {
      workspaceName = slugifyWorkspace(filtered[++i]);
      continue;
    }
    if (filtered[i] === "--db") {
      if (!filtered[i + 1]) {
        process.stderr.write("[ghostcrab] --db requires a path argument\n");
        process.exit(1);
      }
      dbPathFromCli = filtered[++i];
      continue;
    }
    if (filtered[i] === "--help" || filtered[i] === "-h") {
      console.log(
        `Usage: gcp brain up | gcp serve  [--workspace <name>] [--db <path>] [--install-skills]\n\n` +
          `Starts the MindBrain (Zig) backend if needed, then the MCP server on stdio.\n` +
          `  --workspace <name>  Use this workspace's SQLite path from config\n` +
          `  --db <path>         Explicit SQLite file path (overrides workspace/default;\n` +
          `                      env GHOSTCRAB_SQLITE_PATH still takes precedence)\n` +
          `  --install-skills    Copy default IDE integration files from ghostcrab-skills into cwd.\n` +
          `  --no-skills         Skip IDE skill installation (negates --install-skills).`
      );
      return;
    }
  }

  if (installIdeSkills) {
    maybeInstallIdeSkills({
      cwd: process.cwd(),
      pkgRoot,
      skip: false,
      force: false,
      context: "serve",
    });
  }

  // ── Resolve backend binary ────────────────────────────────────────────────
  const backend = resolveNativeBackendPath(pkgRoot);
  if (!backend.ok) {
    const supported = SUPPORTED_PREBUILD_TARGETS.map((entry) => entry.platformKey).join(", ");
    const packageHint = backend.packageName
      ? `  Expected package: ${backend.packageName}\n`
      : "";
    process.stderr.write(
      `[ghostcrab] Native backend not found for platform "${backend.platformKey}".\n` +
        packageHint +
        `  Fallback path: ${backend.path}\n` +
        `  Supported: ${supported}\n` +
        `  To build from source: make backend-vendor sqlite3-download backend-build\n`
    );
    process.exit(1);
  }
  const backendBin = backend.path;

  // ── Resolve configuration (shared with gcp brain db-who) ──────────────────
  const {
    sqlitePathResolved,
    sqlitePathSource,
    backendAddr: initialBackendAddr,
    portExplicit
  } = resolveGhostcrabSqlite({ workspaceNameFromCli: workspaceName, sqlitePathFromCli: dbPathFromCli });
  let backendAddr = initialBackendAddr;
  process.stderr.write(
    `[ghostcrab] SQLite database: ${sqlitePathResolved}\n` +
      `  (${sqlitePathSource})\n`
  );

  // ── Derive sidecar file paths ─────────────────────────────────────────────
  const dataDir = dirname(sqlitePathResolved);
  const pidFile = join(dataDir, "ghostcrab-backend.pid");
  const logFile = join(dataDir, "ghostcrab-backend.log");

  // Ensure data directory exists before anything else touches it.
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  // ── Check if a backend is already running (before port resolution) ─────────
  // PID file format: "<pid>:<port>:<version>\n"
  // The version field was added in 0.2.23; files written by older versions have
  // only two fields and are treated as "unknown" version → upgrade path triggers.
  let backendAlreadyRunning = false;
  let resolvedPort;
  let mindbrainUrl = process.env.GHOSTCRAB_MINDBRAIN_URL ?? null;

  if (!mindbrainUrl && existsSync(pidFile)) {
    try {
      const parts = readFileSync(pidFile, "utf8").trim().split(":");
      const existingPid = parseInt(parts[0], 10);
      const existingPort = parseInt(parts[1], 10);
      const storedVersion = parts[2] ?? "unknown";
      if (!isNaN(existingPid) && !isNaN(existingPort)) {
        try {
          process.kill(existingPid, 0); // signal 0 = liveness probe
          const url = `http://127.0.0.1:${existingPort}`;
          const healthCheck = await fetch(`${url}/health`, {
            signal: AbortSignal.timeout(1000),
          }).catch(() => null);
          if (healthCheck?.ok) {
            if (storedVersion !== PKG_VERSION) {
              // Version mismatch — kill the old backend and start fresh.
              process.stderr.write(
                `[ghostcrab] upgrade: old backend v${storedVersion} (pid ${existingPid}, port ${existingPort}) is still running\n` +
                `[ghostcrab] upgrade: sqlite dir → ${dataDir}\n` +
                `[ghostcrab] upgrade: stopping old backend and starting v${PKG_VERSION}…\n`
              );
              try {
                process.kill(existingPid, "SIGTERM");
              } catch { /* SIGTERM may fail if the process is already gone */ }
              try { unlinkSync(pidFile); } catch { /* stale file may already be gone */ }
              // backendAlreadyRunning stays false → fall through to spawn path
            } else {
              process.stderr.write(
                `[ghostcrab] reusing backend pid ${existingPid} on port ${existingPort}\n` +
                  `[ghostcrab] native backend log: ${logFile} (check here for sqlite log.err if seed fails; ` +
                  `stop this pid and run again to use a newly installed binary)\n`
              );
              resolvedPort = String(existingPort);
              mindbrainUrl = url;
              backendAlreadyRunning = true;
            }
          }
        } catch { /* PID gone — stale file, will be replaced below */
          try { unlinkSync(pidFile); } catch { /* ignore — best effort */ }
        }
      }
    } catch { /* unreadable PID file, ignore */
    }
  }

  // ── Port selection (only when not reusing an existing backend) ────────────
  if (!backendAlreadyRunning) {
    if (portExplicit) {
      resolvedPort = backendAddr.split(":").at(-1) || String(DEFAULT_PORT);
    } else {
      const free = await findFreePort(DEFAULT_PORT);
      if (free !== DEFAULT_PORT) {
        process.stderr.write(
          `[ghostcrab] Port ${DEFAULT_PORT} in use — using port ${free} instead.\n`
        );
      }
      resolvedPort = String(free);
      backendAddr = `:${resolvedPort}`;
    }
    mindbrainUrl ??= `http://127.0.0.1:${resolvedPort}`;
  }

  // ── Launch backend as independent detached process ────────────────────────
  if (!backendAlreadyRunning) {
    ensureBackendExecutableForServe(backendBin);
    const logFd = openSync(logFile, constants.O_WRONLY | constants.O_CREAT | constants.O_APPEND);
    const backendProcess = spawn(
      backendBin,
      [],
      {
        env: {
          ...process.env,
          GHOSTCRAB_BACKEND_ADDR: backendAddr,
          GHOSTCRAB_SQLITE_PATH: sqlitePathResolved,
          GHOSTCRAB_WORKSPACE_NAME: workspaceName ?? "default",
        },
        stdio: ["ignore", logFd, logFd],
        detached: true,
      }
    );
    backendProcess.on("error", (err) => {
      const hint =
        err.code === "EACCES"
          ? `  Often: chmod +x on the binary, or on macOS Gatekeeper quarantine:\n` +
            `  chmod +x "${backendBin}"\n` +
            `  xattr -d com.apple.quarantine "${backendBin}"  # if applicable\n`
          : "";
      process.stderr.write(
        `[ghostcrab] Failed to spawn backend: ${err.message} (${err.code ?? "no code"})\n` +
          `  Binary: ${backendBin}\n` +
          hint
      );
      process.exit(1);
    });
    backendProcess.unref(); // let it outlive this process

    process.stderr.write(
      `[ghostcrab] backend started (pid ${backendProcess.pid})\n` +
      `[ghostcrab] log: ${logFile}\n`
    );

    // Surface early crashes — if the backend exits before it becomes healthy
    // we can tail the log and surface the reason.
    let earlyExit = false;
    let earlyCode = null;
    backendProcess.on("exit", (code) => {
      earlyExit = true;
      earlyCode = code;
    });

    // ── Wait for backend health ─────────────────────────────────────────────
    const healthUrl = `${mindbrainUrl}/health`;
    const TIMEOUT_MS = 15_000;
    const POLL_INTERVAL_MS = 150;
    const deadline = Date.now() + TIMEOUT_MS;

    await (async function waitForBackend() {
      while (Date.now() < deadline) {
        if (earlyExit) {
          // Tail last 4 KB of log for the crash reason
          let tail = "";
          try {
            const raw = readFileSync(logFile);
            tail = raw.slice(Math.max(0, raw.length - 4096)).toString("utf8");
          } catch { /* log file unreadable — report what we have */ }
          process.stderr.write(
            `[ghostcrab] backend exited early (code ${earlyCode ?? "?"})\n` +
            `[ghostcrab] last lines from ${logFile}:\n${tail}\n`
          );
          process.exit(earlyCode ?? 1);
        }
        try {
          const res = await fetch(healthUrl, { signal: AbortSignal.timeout(1000) });
          if (res.ok) {
            // Write pid:port:version so the next gcp serve can detect upgrades
            try {
              writeFileSync(pidFile, `${backendProcess.pid}:${resolvedPort}:${PKG_VERSION}\n`, "utf8");
            } catch { /* non-fatal: pid file is best-effort */ }
            return;
          }
        } catch { /* not ready yet */
        }
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      }
      process.stderr.write(
        `[ghostcrab] backend did not become healthy within ${TIMEOUT_MS}ms\n` +
        `  health URL: ${healthUrl}\n` +
        `  log: ${logFile}\n`
      );
      backendProcess.kill();
      process.exit(1);
    })();
  }

  // ── Start MCP server on this process's stdio ──────────────────────────────
  process.env.GHOSTCRAB_MINDBRAIN_URL = mindbrainUrl;
  // So server.ts can point users at native `log.err` / sqlite when seed fails.
  process.env.GHOSTCRAB_NATIVE_LOG = logFile;
  const { startMcpServer } = await import("../../dist/server.js");
  await startMcpServer();
}
