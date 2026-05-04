/**
 * gcp brain db-who — list processes with this GhostCrab SQLite file open (lsof).
 * Path resolution matches `gcp brain up` (env, config workspace, cwd fallback).
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { resolveGhostcrabSqlite } from "../lib/resolve-ghostcrab-sqlite.mjs";
import { slugifyWorkspace } from "../lib/workspace-slug.mjs";

/**
 * @param {string[]} args
 */
export async function runBrainDbWho(args) {
  if (args[0] === "-h" || args[0] === "--help") {
    printHelp();
    return;
  }

  if (process.platform === "win32") {
    console.error(
      "[ghostcrab] db-who: uses lsof (not bundled on Windows). " +
        "Use Resource Monitor, Sysinternals Handle, or WSL: `lsof /path/to/ghostcrab.sqlite`"
    );
    process.exit(1);
  }

  const parsed = parseArgs(args);
  if (parsed.error) {
    console.error(`[ghostcrab] ${parsed.error}\n`);
    printHelp();
    process.exit(1);
  }

  const { pathResolved, source } = resolveSqlitePath(parsed);
  const candidates = [pathResolved, `${pathResolved}-wal`, `${pathResolved}-shm`];
  const existing = candidates.filter((p) => existsSync(p));

  console.error(`[ghostcrab] db-who: ${pathResolved}\n  (${source})\n`);

  if (existing.length === 0) {
    console.log(
      "  (no file on disk yet at that path — run `gcp brain up` once to create it)\n"
    );
    return;
  }

  for (const p of existing) {
    const r = spawnSync("lsof", ["-w", p], { encoding: "utf8" });
    if (r.error && (r.error.code === "ENOENT" || r.error.errno === "ENOENT")) {
      console.error(
        "[ghostcrab] db-who: `lsof` not found. On Linux install the `lsof` package."
      );
      process.exit(1);
    }
    const out = (r.stdout ?? "").trim();
    const err = (r.stderr ?? "").trim();
    console.log(`--- lsof ${p}`);
    if (out) {
      console.log(out);
    } else {
      // lsof often returns 1 when no process holds the file; that is not a failure.
      if (r.status === 0 || r.status === 1) {
        console.log("  (no processes have this file open)");
      } else {
        console.log(err || `  (lsof exit ${r.status})`);
      }
    }
  }

  console.log(
    "\n[ghostcrab] If you see `ghostcrab-backend` and/or `node`/`Cursor` twice, " +
      "only one process needs the DB; close DB browsers or a second `gcp brain up` for the same file."
  );
}

/**
 * @param {string[]} args
 * @returns {{ pathOverride?: string, workspaceName?: string | null } | { error: string }}
 */
function parseArgs(args) {
  let pathOverride;
  let workspaceName = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--path" && args[i + 1]) {
      pathOverride = args[++i];
      continue;
    }
    if (a === "-w" || a === "--workspace") {
      if (args[i + 1]) {
        workspaceName = slugifyWorkspace(args[++i]);
      } else {
        return { error: "db-who: --workspace requires a name" };
      }
      continue;
    }
  }
  return { pathOverride, workspaceName };
}

/**
 * Same default as gcp brain up: ./data/ghostcrab.sqlite in cwd, unless
 * GHOSTCRAB_SQLITE_PATH or a workspace path in config wins (see resolveGhostcrabSqlite).
 *
 * @param {{ pathOverride?: string, workspaceName?: string | null }} p
 * @returns {{ pathResolved: string, source: string }}
 */
function resolveSqlitePath(p) {
  if (p.pathOverride) {
    return {
      pathResolved: resolve(p.pathOverride),
      source: "--path (explicit)"
    };
  }
  const r = resolveGhostcrabSqlite({
    workspaceNameFromCli: p.workspaceName ?? null
  });
  return { pathResolved: r.sqlitePathResolved, source: r.sqlitePathSource };
}

function printHelp() {
  console.log(`
Usage: gcp brain db-who [options]

  Show which processes have the GhostCrab SQLite file open, using lsof (macOS / Linux).
  Resolves the DB path the same way as  gcp brain up  (default: data/ghostcrab.sqlite
  in the current working directory, unless GHOSTCRAB_SQLITE_PATH or a workspace
  path applies). Use --path to override.

Options:
  --path <file>     Inspect this path instead of resolving from config/env/cwd
  -w, --workspace   Workspace name (same as gcp brain up)

Examples:
  gcp brain db-who
  gcp brain db-who --workspace my-app
  gcp brain db-who --path /tmp/test.sqlite
`.trim());
}
