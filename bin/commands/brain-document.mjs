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
import { resolveDocumentEnginePath, ensureUnixExecuteBit } from "../lib/prebuild-permissions.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(__dirname, "..", "..");

/** Subcommands that do not use --db (ghostcrab-document / mindbrain standalone tool). */
const SUBCOMMANDS_WITHOUT_DB = new Set([
  "document-normalize",
  "document-profile",
  "corpus-eval",
  "simulate",
]);

/**
 * @param {string[]} args
 */
export async function cmdBrainDocument(args) {
  if (!args.length || args[0] === "--help" || args[0] === "-h") {
    printDocumentHelp();
    return;
  }

  let workspaceName = null;
  let force = false;
  /** @type {string[]} */
  const forward = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if ((a === "--workspace" || a === "-w") && args[i + 1]) {
      workspaceName = slugifyWorkspace(args[++i]);
      continue;
    }
    if (a === "--force") {
      force = true;
      continue;
    }
    forward.push(a);
  }

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
    const hint =
      resolved.packageName
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
  });

  if (!force && (await backendLooksAlive(sqlitePathResolved))) {
    console.error(
      `[ghostcrab] MindBrain backend appears to be running (health check OK).\n` +
        `  Stop MCP / ghostcrab-backend before importing documents, or pass --force (risky: SQLite may be locked).\n` +
        `  SQLite file: ${sqlitePathResolved}`
    );
    process.exit(1);
  }

  /** @type {string[]} */
  let childArgs = [...forward];
  const hasDbFlag = forward.some((a) => a === "--db");
  if (!hasDbFlag && !SUBCOMMANDS_WITHOUT_DB.has(sub)) {
    childArgs = [sub, "--db", sqlitePathResolved, ...forward.slice(1)];
  }

  const r = spawnSync(resolved.path, childArgs, {
    stdio: "inherit",
    env: { ...process.env },
  });
  process.exit(r.status ?? 1);
}

/**
 * @param {string} sqlitePathResolved
 */
async function backendLooksAlive(sqlitePathResolved) {
  const bases = [];
  const envUrl = process.env.GHOSTCRAB_MINDBRAIN_URL?.trim();
  if (envUrl) {
    bases.push(envUrl.replace(/\/$/, ""));
  }
  const pidFile = join(dirname(sqlitePathResolved), "ghostcrab-backend.pid");
  if (existsSync(pidFile)) {
    try {
      const [_, rawPort] = readFileSync(pidFile, "utf8").trim().split(":");
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
      const res = await fetch(`${b}/health`, { signal: AbortSignal.timeout(800) });
      if (res.ok) {
        return true;
      }
    } catch {
      /* next */
    }
  }
  return false;
}

function printDocumentHelp() {
  console.log(`
Usage: gcp brain document [--workspace <name>] [--force] <subcommand> [...args]

  Run the bundled GhostCrab document engine against your workspace SQLite file.
  The engine is the same stack as MindBrain (normalize, profile, ingest, collections, …).

  IMPORTANT: Quit MCP / stop ghostcrab-backend first so the database is not locked.
  This command probes /health on GHOSTCRAB_MINDBRAIN_URL (and the pid-file port) and
  refuses to run if the backend responds unless you pass --force.

  --workspace <name>   Resolve the same SQLite path as "gcp brain up" (with -w)
  --force              Skip the running-backend check (may hit "database is locked")

  For subcommands and flags, see the product docs (document import / profiling).
  Examples:

  gcp brain document document-normalize --input ./paper.pdf --output-dir ./out
  gcp brain document document-profile --content-file ./out/doc.md \\
    --base-url https://api.openai.com/v1 --model gpt-4.1-mini --api-key "\$OPENAI_API_KEY"
  gcp brain document document-profile-enqueue --content-dir ./out --include-ext md,txt \\
    --workspace-id my_ws --collection-id my_ws::docs --doc-id-start 1
  gcp brain document document-profile-worker \\
    --base-url https://api.openai.com/v1 --model gpt-4.1-mini --limit 4

  For commands that need a database, --db is set automatically to your GHOSTCRAB_SQLITE_PATH
  (you do not pass --db unless you intentionally override).

  Override binary: GHOSTCRAB_DOCUMENT_ENGINE=/path/to/ghostcrab-document
`.trim());
}
