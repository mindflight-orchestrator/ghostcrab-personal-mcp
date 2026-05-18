/**
 * gcp brain document — corpus import / normalize / profile (ghostcrab-document).
 * Stop MCP / ghostcrab-backend before running so SQLite is not locked.
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolveGhostcrabSqlite } from "../lib/resolve-ghostcrab-sqlite.mjs";
import { slugifyWorkspace } from "../lib/workspace-slug.mjs";
import {
  resolveDocumentEnginePath,
  ensureUnixExecuteBit
} from "../lib/prebuild-permissions.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(__dirname, "..", "..");

/** Subcommands that do not use --db (ghostcrab-document / mindbrain standalone tool). */
const SUBCOMMANDS_WITHOUT_DB = new Set([
  "document-normalize",
  "document-profile",
  "corpus-eval",
  "simulate"
]);

/**
 * @param {string[]} args
 */
export async function cmdBrainDocument(args) {
  if (!args.length || args[0] === "--help" || args[0] === "-h") {
    printDocumentHelp();
    return;
  }

  const parsed = parseDocumentArgs(args);
  if (parsed.error) {
    console.error(parsed.error);
    process.exit(1);
  }
  const { workspaceName, sqlitePathFromCli, force, forward } = parsed;

  if (!forward.length || forward[0] === "--help" || forward[0] === "-h") {
    printDocumentHelp();
    return;
  }

  const sub = forward[0];
  if (sub.startsWith("-")) {
    console.error(
      `gcp brain document: expected a subcommand first (e.g. document-profile-worker), got "${sub}".`
    );
    process.exit(1);
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

  const { sqlitePathResolved } = resolveGhostcrabSqlite({
    workspaceNameFromCli: workspaceName,
    sqlitePathFromCli
  });

  const usesDatabase = subcommandUsesDatabase(sub);
  if (!force && usesDatabase) {
    const backend = await probeBackend(sqlitePathResolved);
    if (backend.alive) {
      console.error(formatBackendRunningMessage(sqlitePathResolved, backend));
      process.exit(1);
    }
  }

  /** @type {string[]} */
  const childArgs = buildDocumentEngineArgs(forward, sqlitePathResolved);

  const r = spawnSync(resolved.path, childArgs, {
    stdio: "inherit",
    env: { ...process.env }
  });
  process.exit(r.status ?? 1);
}

/**
 * @param {string[]} args
 * @returns {{ workspaceName: string | null, sqlitePathFromCli: string | null, force: boolean, forward: string[], error?: undefined } | { error: string }}
 */
function parseDocumentArgs(args) {
  let workspaceName = null;
  let sqlitePathFromCli = null;
  let force = false;
  /** @type {string[]} */
  const forward = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--workspace" || a === "-w") {
      if (!args[i + 1]) {
        return { error: "gcp brain document: --workspace requires a name." };
      }
      workspaceName = slugifyWorkspace(args[++i]);
      continue;
    }
    if (a === "--force") {
      force = true;
      continue;
    }
    if (a === "--db") {
      if (!args[i + 1]) {
        return { error: "gcp brain document: --db requires a path argument." };
      }
      sqlitePathFromCli = args[++i];
      continue;
    }
    forward.push(a);
  }
  return { workspaceName, sqlitePathFromCli, force, forward };
}

/**
 * @param {string} subcommand
 */
function subcommandUsesDatabase(subcommand) {
  return !SUBCOMMANDS_WITHOUT_DB.has(subcommand);
}

/**
 * @param {string[]} forward
 * @param {string} sqlitePathResolved
 */
function buildDocumentEngineArgs(forward, sqlitePathResolved) {
  const sub = forward[0];
  if (!subcommandUsesDatabase(sub)) {
    return [...forward];
  }
  return [sub, "--db", sqlitePathResolved, ...forward.slice(1)];
}

/**
 * @param {string} sqlitePathResolved
 * @returns {Promise<{ alive: boolean, url: string | null, pidFile: string, writeStatus: unknown | null }>}
 */
async function probeBackend(sqlitePathResolved) {
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

/**
 * @param {string} baseUrl
 * @returns {Promise<unknown | null>}
 */
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

/**
 * @param {string} sqlitePathResolved
 * @param {{ url: string | null, pidFile: string, writeStatus: unknown | null }} backend
 */
function formatBackendRunningMessage(sqlitePathResolved, backend) {
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

/**
 * @param {unknown} writeStatus
 */
function formatWriteStatus(writeStatus) {
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

function printDocumentHelp() {
  console.log(
    `
Usage: gcp brain document [--workspace <name>] [--db <path>] [--force] <subcommand> [...args]

  Run the bundled GhostCrab document engine against your workspace SQLite file.
  The engine is the same stack as MindBrain (normalize, profile, ingest, collections, …).

  IMPORTANT: Quit MCP / stop ghostcrab-backend first so the database is not locked.
  This command probes /health on GHOSTCRAB_MINDBRAIN_URL (and the pid-file port) and
  refuses to run if the backend responds unless you pass --force.

  --workspace <name>   Resolve the same SQLite path as "gcp brain up" (with -w)
  --db <path>          Explicit SQLite file path for database-backed subcommands
  --force              Skip the running-backend check (may hit "database is locked")

  For subcommands and flags, see the product docs (document import / profiling).
  Examples:

  gcp brain document document-normalize --input ./paper.pdf --output-dir ./out
  gcp brain document document-profile --content-file ./out/doc.md \\
    --base-url https://api.openai.com/v1 --model gpt-4.1-mini --api-key "$OPENAI_API_KEY"
  gcp brain document document-profile-enqueue --content-dir ./out --include-ext md,txt \\
    --workspace-id my_ws --collection-id my_ws::docs --doc-id-start 1
  gcp brain document document-profile-worker \\
    --base-url https://api.openai.com/v1 --model gpt-4.1-mini --limit 4
  gcp brain document qualification-vocab-list \\
    --workspace-id my_ws --collection-id my_ws::docs
  gcp brain document document-qualify \\
    --workspace-id my_ws --collection-id my_ws::docs \\
    --taxonomies my_ws::core --facets topic.category \\
    --base-url https://api.openai.com/v1 --model gpt-4.1-mini

  For commands that need a database, --db is set automatically to your GHOSTCRAB_SQLITE_PATH
  (you do not pass --db unless you intentionally override).

  Override binary: GHOSTCRAB_DOCUMENT_ENGINE=/path/to/ghostcrab-document
`.trim()
  );
}

export const __private__ = {
  buildDocumentEngineArgs,
  formatBackendRunningMessage,
  formatWriteStatus,
  parseDocumentArgs,
  subcommandUsesDatabase
};
