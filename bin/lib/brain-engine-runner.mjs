import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  ensureUnixExecuteBit,
  resolveDocumentEnginePath
} from "./prebuild-permissions.mjs";

export function resolveNativeEngineOrExit(pkgRoot, options = {}) {
  if (options.preferDev) {
    const devPath = resolveDevNativeEnginePath(pkgRoot);
    if (devPath) return devPath;
  }

  const resolved = resolveDocumentEnginePath(pkgRoot);
  if (!resolved.ok) {
    const hint = resolved.packageName
      ? `  Optional package: ${resolved.packageName}\n`
      : "";
    console.error(
      `[ghostcrab] Document engine not found for ${resolved.platformKey}.\n` +
        hint +
        `  Fallback path: ${resolved.path}\n` +
        `  Build from source:  cd cmd/backend && zig build document-tool\n` +
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

export function runNativeEngineOrExit(pkgRoot, childArgs, options = {}) {
  const enginePath = resolveNativeEngineOrExit(pkgRoot, options);
  const r = spawnSync(enginePath, childArgs, {
    stdio: "inherit",
    env: { ...process.env }
  });
  process.exit(r.status ?? 1);
}

function resolveDevNativeEnginePath(pkgRoot) {
  const candidates =
    process.platform === "win32"
      ? [
          join(pkgRoot, "cmd", "backend", "zig-out", "bin", "ghostcrab-document.exe"),
          join(pkgRoot, "vendor", "mindbrain", "zig-out", "bin", "mindbrain-standalone-tool.exe")
        ]
      : [
          join(pkgRoot, "cmd", "backend", "zig-out", "bin", "ghostcrab-document"),
          join(pkgRoot, "vendor", "mindbrain", "zig-out", "bin", "mindbrain-standalone-tool")
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
    /** @type {{ active_session_id?: unknown, busy_timeout_ms?: unknown, completed?: unknown, failed?: unknown }} */ (
      writeStatus
    );
  const parts = [];
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
