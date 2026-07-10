/**
 * gcp brain document — corpus import / normalize / profile (ghostcrab-document).
 * Stop MCP / ghostcrab-backend before running so SQLite is not locked.
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveGhostcrabSqlite } from "../lib/resolve-ghostcrab-sqlite.mjs";
import { slugifyWorkspace } from "../lib/workspace-slug.mjs";
import {
  preflightBrainDatabaseOrExit,
  runNativeEngineOrExit
} from "../lib/brain-engine-runner.mjs";

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
  loadLocalEnvDefaults(pkgRoot);
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

  const { sqlitePathResolved } = resolveGhostcrabSqlite({
    workspaceNameFromCli: workspaceName,
    sqlitePathFromCli
  });

  const usesDatabase = subcommandUsesDatabase(sub);
  if (usesDatabase) {
    await preflightBrainDatabaseOrExit(sqlitePathResolved, force);
  }

  /** @type {string[]} */
  const childArgs = buildDocumentEngineArgs(forward, sqlitePathResolved);
  runNativeEngineOrExit(pkgRoot, childArgs, { preferDev: true });
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
function buildDocumentEngineArgs(
  forward,
  sqlitePathResolved,
  env = process.env
) {
  const sub = forward[0];
  const withLlmDefaults = applyDocumentLlmDefaults(forward, env);
  if (!subcommandUsesDatabase(sub)) {
    return withLlmDefaults;
  }
  return [sub, "--db", sqlitePathResolved, ...withLlmDefaults.slice(1)];
}

/**
 * @param {string[]} forward
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 */
function applyDocumentLlmDefaults(forward, env) {
  const sub = forward[0];
  if (!subcommandAcceptsLlmDefaults(sub)) return [...forward];
  const mode = env.MB_DOCUMENTS_LLM_MODE?.trim().toLowerCase();
  if (mode === "mock") return [...forward];

  const next = [...forward];
  const hasLiveProvider =
    hasArg(next, "--base-url") ||
    hasArg(next, "--model") ||
    hasArg(next, "--api-key");
  const hasMock =
    hasArg(next, "--mock-profile-json") ||
    hasArg(next, "--mock-qualification-json");
  const dryRun = hasArg(next, "--dry-run");
  if (hasLiveProvider || hasMock || dryRun) return next;

  const baseUrl = env.MB_DOCUMENTS_LLM_BASE_URL?.trim();
  const model = env.MB_DOCUMENTS_LLM_MODEL?.trim();
  const apiKey = env.MB_DOCUMENTS_LLM_API_KEY?.trim();
  if (baseUrl) next.push("--base-url", baseUrl);
  if (model) next.push("--model", model);
  if (apiKey) next.push("--api-key", apiKey);
  return next;
}

/**
 * @param {string} subcommand
 */
function subcommandAcceptsLlmDefaults(subcommand) {
  return new Set([
    "document-profile",
    "document-profile-worker",
    "document-qualify",
    "document-business-extract"
  ]).has(subcommand);
}

/**
 * @param {string[]} args
 * @param {string} name
 */
function hasArg(args, name) {
  return args.includes(name) || args.some((arg) => arg.startsWith(`${name}=`));
}

/**
 * @param {string} root
 */
function loadLocalEnvDefaults(root) {
  const envPath = process.env.GHOSTCRAB_ENV_PATH || join(root, ".env");
  if (!existsSync(envPath)) return;
  const parsed = parseEnvFile(readFileSync(envPath, "utf8"));
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

/**
 * @param {string} text
 */
function parseEnvFile(text) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/**
 * @param {string} sqlitePathResolved
 * @returns {Promise<{ alive: boolean, url: string | null, pidFile: string, writeStatus: unknown | null }>}
 */
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

  Run the bundled GhostCrab document engine against the selected SQLite file.
  The engine is the same stack as MindBrain (normalize, profile, ingest, collections, …).

  IMPORTANT: Quit MCP / stop ghostcrab-backend first so the database is not locked.
  This command probes /health on GHOSTCRAB_MINDBRAIN_URL (and the pid-file port) and
  refuses to run if the backend responds unless you pass --force.

  --workspace <name>   Workspace_id hint; does not select the SQLite file
  --db <path>          Explicit SQLite file path for database-backed subcommands
  --force              Skip the running-backend check (may hit "database is locked")

  Full runbook:  gcp brain docs document
  Subcommand help: gcp brain document <subcommand> --help (native engine flags)

  Examples:

  gcp brain document document-normalize --input ./paper.pdf --output-dir ./out
  gcp brain document document-profile --content-file ./out/doc.md \\
    --base-url "$MB_DOCUMENTS_LLM_BASE_URL" --model "$MB_DOCUMENTS_LLM_MODEL"
  gcp brain document document-profile-enqueue --content-dir ./out --include-ext md,txt \\
    --workspace-id my_ws --collection-id my_ws::docs --doc-id-start 1
  gcp brain document document-profile-worker \\
    --limit 4
  gcp brain document qualification-vocab-list \\
    --workspace-id my_ws --collection-id my_ws::docs
  gcp brain document qualification-vocab-list \\
    --workspace-id my_ws --collection-id my_ws::docs \\
    --taxonomies my_ws::core --facets topic.category,source.filename
  gcp brain document document-qualify \\
    --workspace-id my_ws --collection-id my_ws::docs \\
    --taxonomies my_ws::core --facets topic.category

  For commands that need a database, --db is set automatically to your GHOSTCRAB_SQLITE_PATH
  (you do not pass --db unless you intentionally override).

  LLM defaults are read from .env when MB_DOCUMENTS_LLM_MODE=live:
  MB_DOCUMENTS_LLM_BASE_URL, MB_DOCUMENTS_LLM_MODEL, MB_DOCUMENTS_LLM_API_KEY.
  Explicit --base-url / --model / --api-key flags take priority.

  qualification-vocab-list returns the taxonomy IDs for --taxonomies and facet IDs
  (namespace.dimension) for --facets. document-qualify persists accepted assignments
  to facet_assignments_raw.

  Override binary: GHOSTCRAB_DOCUMENT_ENGINE=/path/to/ghostcrab-document
`.trim()
  );
}

export const __private__ = {
  buildDocumentEngineArgs,
  applyDocumentLlmDefaults,
  formatBackendRunningMessage,
  formatWriteStatus,
  parseEnvFile,
  parseDocumentArgs,
  subcommandUsesDatabase
};
