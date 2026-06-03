import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  ensureUnixExecuteBit,
  resolveDocumentEnginePath
} from "./prebuild-permissions.mjs";

export function resolveNativeEngineOrExit(pkgRoot, options = {}) {
  const overridePath = resolveEnvNativeEnginePath(pkgRoot);
  if (overridePath) return overridePath;

  if (options.preferDev) {
    const devPath = resolveDevNativeEnginePath(pkgRoot);
    if (devPath) return devPath;
  }

  const resolved = resolveDocumentEnginePath(pkgRoot);
  if (!resolved.ok) {
    const hint = resolved.packageName
      ? `  Platform package: npm install ${resolved.packageName}\n`
      : "";
    console.error(
      `[ghostcrab] ghostcrab-document engine not found for ${resolved.platformKey}.\n` +
        hint +
        `  Expected: ${resolved.path}\n` +
        `  Run: gcp authorize  (after installing the platform optional package)\n` +
        `  Or set GHOSTCRAB_DOCUMENT_ENGINE=/path/to/ghostcrab-document`
    );
    process.exit(1);
  }

  const ex = ensureUnixExecuteBit(resolved.path);
  if (!ex.ok) {
    console.error(
      `[ghostcrab] Cannot use document engine ${resolved.path}: ${ex.error?.message ?? ex}\n` +
        `  Try:  chmod +x "${resolved.path}"  or  gcp authorize`
    );
    process.exit(1);
  }
  return resolved.path;
}

export function resolveNativeEnginePath(pkgRoot, options = {}) {
  const overridePath = resolveEnvNativeEnginePath(pkgRoot);
  if (overridePath) return overridePath;

  if (options.preferDev) {
    const devPath = resolveDevNativeEnginePath(pkgRoot);
    if (devPath) return devPath;
  }

  const resolved = resolveDocumentEnginePath(pkgRoot);
  if (!resolved.ok) {
    return null;
  }

  const ex = ensureUnixExecuteBit(resolved.path);
  if (!ex.ok) {
    return null;
  }
  return resolved.path;
}

export function runNativeEngineSync(pkgRoot, childArgs, options = {}) {
  const enginePath = resolveNativeEnginePath(pkgRoot, options);
  if (!enginePath) {
    return {
      ok: false,
      status: null,
      stdout: "",
      stderr: "ghostcrab-document engine binary not found"
    };
  }

  const stdio = options.inheritStdio
    ? "inherit"
    : /** @type {const} */ (["pipe", "pipe", "inherit"]);

  const result = spawnSync(enginePath, childArgs, {
    encoding: "utf8",
    stdio,
    env: { ...process.env }
  });

  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? ""
  };
}

export function runNativeEngineOrExit(pkgRoot, childArgs, options = {}) {
  const result = runNativeEngineSync(pkgRoot, childArgs, options);
  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  if (!result.ok) {
    process.exit(result.status ?? 1);
  }
}

function resolveEnvNativeEnginePath(pkgRoot) {
  if (!process.env.GHOSTCRAB_DOCUMENT_ENGINE?.trim()) return null;
  const resolved = resolveDocumentEnginePath(pkgRoot);
  if (!resolved.ok) return null;
  const ex = ensureUnixExecuteBit(resolved.path);
  if (!ex.ok) return null;
  return resolved.path;
}

function resolveDevNativeEnginePath(pkgRoot) {
  const candidates =
    process.platform === "win32"
      ? [
          join(
            pkgRoot,
            "cmd",
            "backend",
            "zig-out",
            "bin",
            "ghostcrab-document.exe"
          ),
          join(
            pkgRoot,
            "vendor",
            "mindbrain",
            "zig-out",
            "bin",
            "mindbrain-standalone-tool.exe"
          )
        ]
      : [
          join(
            pkgRoot,
            "cmd",
            "backend",
            "zig-out",
            "bin",
            "ghostcrab-document"
          ),
          join(
            pkgRoot,
            "vendor",
            "mindbrain",
            "zig-out",
            "bin",
            "mindbrain-standalone-tool"
          )
        ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export async function preflightBrainDatabaseOrExit(sqlitePathResolved, force) {
  if (force) return;
  const backend = await probeBackend(sqlitePathResolved);
  if (backend.alive) {
    console.error(formatBackendRunningMessage(sqlitePathResolved, backend));
    process.exit(1);
  }
}

export async function probeBackend(sqlitePathResolved) {
  const bases = [];
  const envUrl = process.env.GHOSTCRAB_MINDBRAIN_URL?.trim();
  if (envUrl) {
    bases.push(envUrl.replace(/\/$/, ""));
  }
  const pidFile = join(dirname(sqlitePathResolved), "ghostcrab-backend.pid");
  if (existsSync(pidFile)) {
    try {
      const [, rawPort] = readFileSync(pidFile, "utf8").trim().split(":");
      const p = parseInt(rawPort, 10);
      if (!Number.isNaN(p)) {
        bases.push(`http://127.0.0.1:${p}`);
      }
    } catch {
      /* ignore */
    }
  }
  bases.push("http://127.0.0.1:8091");
  const tried = new Set();
  for (const b of bases) {
    if (tried.has(b)) {
      continue;
    }
    tried.add(b);
    try {
      const res = await fetch(`${b}/health`, {
        signal: AbortSignal.timeout(800)
      });
      if (res.ok) {
        return {
          alive: true,
          url: b,
          pidFile,
          writeStatus: await fetchWriteStatus(b)
        };
      }
    } catch {
      /* next */
    }
  }
  return { alive: false, url: null, pidFile, writeStatus: null };
}

async function fetchWriteStatus(baseUrl) {
  try {
    const res = await fetch(`${baseUrl}/api/mindbrain/sql/write-status`, {
      signal: AbortSignal.timeout(800)
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export function formatBackendRunningMessage(sqlitePathResolved, backend) {
  const lines = [
    "[ghostcrab] MindBrain backend appears to be running (health check OK).",
    "  Stop MCP / ghostcrab-backend before importing documents, or pass --force (risky: SQLite may be locked).",
    `  SQLite file: ${sqlitePathResolved}`,
    `  Backend URL: ${backend.url ?? "unknown"}`,
    `  PID file checked: ${backend.pidFile}`,
    `  Inspect DB holders: gcp brain db-who --path "${sqlitePathResolved}"`
  ];
  const status = formatWriteStatus(backend.writeStatus);
  if (status) {
    lines.push(`  Writer status: ${status}`);
  }
  return lines.join("\n");
}

export function formatWriteStatus(writeStatus) {
  if (!writeStatus || typeof writeStatus !== "object") {
    return null;
  }
  const status =
    /** @type {{ active_session_id?: unknown, busy_timeout_ms?: unknown, completed?: unknown, failed?: unknown, sqlite_path?: unknown }} */ (
      writeStatus
    );
  const parts = [];
  if ("sqlite_path" in status && status.sqlite_path) {
    parts.push(`sqlite_path=${String(status.sqlite_path)}`);
  }
  if ("active_session_id" in status) {
    parts.push(`active_session_id=${String(status.active_session_id)}`);
  }
  if ("busy_timeout_ms" in status) {
    parts.push(`busy_timeout_ms=${String(status.busy_timeout_ms)}`);
  }
  if ("completed" in status) {
    parts.push(`completed=${String(status.completed)}`);
  }
  if ("failed" in status) {
    parts.push(`failed=${String(status.failed)}`);
  }
  return parts.length > 0 ? parts.join(", ") : null;
}
