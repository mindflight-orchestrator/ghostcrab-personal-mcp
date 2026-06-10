/**
 * gcp brain down [--db <path>|--default] [--all] [--dry-run] [--json]
 *
 * Stops the MindBrain backend that holds the resolved SQLite file (default mode)
 * or every GhostCrab process on the machine (--all). The MCP server itself runs
 * on the client's stdio as a child of the IDE; `down` cannot reach it directly,
 * so the user must reconnect/restart the MCP client afterwards.
 */

import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";

import { parsePidFile } from "../lib/backend-pid.mjs";
import { resolveGhostcrabSqlite } from "../lib/resolve-ghostcrab-sqlite.mjs";
import {
  listGhostcrabProcesses,
  terminateGhostcrabProcesses
} from "../lib/install-upgrade.mjs";

const RECONNECT_HINT =
  "  The MCP server runs on your IDE's stdio (child of the client). " +
  "Reconnect or restart the MCP client to pick up a fresh backend.";

/**
 * @param {string[]} args
 * @param {{ kill?: (pid: number, signal?: string | number) => void, listProcesses?: Function, terminate?: Function }} [io]
 */
export async function cmdBrainDown(args, io = {}) {
  const opts = parseDownArgs(args);
  if (opts === "help") {
    printDownHelp();
    return;
  }
  if (opts.error) {
    console.error(`gcp brain down: ${opts.error}`);
    process.exit(1);
  }

  const report = opts.all
    ? runDownAll(opts, io)
    : runDownCurrentDb(opts, io);

  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printDownReport(report, opts);
  }
  if (!report.ok) process.exit(1);
}

/**
 * @param {{ dryRun: boolean }} opts
 * @param {{ listProcesses?: Function, terminate?: Function }} [io]
 */
export function runDownAll(opts, io = {}) {
  const listProcesses = io.listProcesses ?? listGhostcrabProcesses;
  const terminate = io.terminate ?? terminateGhostcrabProcesses;
  const processes = listProcesses();
  const killed = opts.dryRun
    ? processes.map((p) => ({ pid: p.pid, status: "dry-run" }))
    : terminate(processes);
  return {
    ok: true,
    mode: "all",
    dry_run: opts.dryRun,
    processes,
    killed
  };
}

/**
 * @param {{ dryRun: boolean, sqlitePathFromCli: string | null, defaultFromCli: boolean }} opts
 * @param {{ kill?: (pid: number, signal?: string | number) => void }} [io]
 */
export function runDownCurrentDb(opts, io = {}) {
  const kill = io.kill ?? process.kill.bind(process);
  const { sqlitePathResolved, sqlitePathSource } = resolveGhostcrabSqlite({
    workspaceNameFromCli: null,
    sqlitePathFromCli: opts.sqlitePathFromCli,
    defaultFromCli: opts.defaultFromCli
  });
  const pidFile = join(dirname(sqlitePathResolved), "ghostcrab-backend.pid");
  const report = {
    ok: true,
    mode: "current-db",
    dry_run: opts.dryRun,
    sqlite_path: sqlitePathResolved,
    sqlite_path_source: sqlitePathSource,
    pid_file: pidFile,
    backend: { running: false, pid: null, status: "not-found" }
  };

  if (!existsSync(pidFile)) {
    return report;
  }

  let parsed;
  try {
    parsed = parsePidFile(readFileSync(pidFile, "utf8"));
  } catch {
    parsed = null;
  }
  if (!parsed) {
    report.backend.status = "unreadable-pid-file";
    return report;
  }

  report.backend.pid = parsed.pid;
  try {
    kill(parsed.pid, 0); // liveness probe
    report.backend.running = true;
  } catch {
    report.backend.status = "stale";
    if (!opts.dryRun) {
      try {
        unlinkSync(pidFile);
      } catch {
        /* best-effort */
      }
    }
    return report;
  }

  if (opts.dryRun) {
    report.backend.status = "dry-run";
    return report;
  }

  try {
    kill(parsed.pid, "SIGTERM");
    report.backend.status = "terminated";
  } catch (err) {
    report.ok = false;
    report.backend.status = "failed";
    report.backend.error = err?.message ?? String(err);
    return report;
  }
  try {
    unlinkSync(pidFile);
  } catch {
    /* best-effort: pid file may already be gone */
  }
  return report;
}

/**
 * @param {object} report
 * @param {{ all: boolean }} opts
 */
function printDownReport(report, opts) {
  if (opts.all) {
    if (report.processes.length === 0) {
      console.log("gcp brain down --all: no GhostCrab processes found.");
      return;
    }
    const verb = report.dry_run ? "would stop" : "stopped";
    console.log(`gcp brain down --all: ${verb} ${report.killed.length} process(es):`);
    for (const k of report.killed) {
      console.log(`  pid ${k.pid}: ${k.status}`);
    }
    console.log(RECONNECT_HINT);
    return;
  }

  console.log(`gcp brain down`);
  console.log(`  SQLite : ${report.sqlite_path}`);
  console.log(`  (${report.sqlite_path_source})`);
  const b = report.backend;
  if (b.status === "not-found" || b.status === "stale") {
    console.log(`  Backend: no running backend for this database (${b.status}).`);
    return;
  }
  if (b.status === "dry-run") {
    console.log(`  Backend: would stop pid ${b.pid}.`);
    return;
  }
  if (b.status === "terminated") {
    console.log(`  Backend: stopped pid ${b.pid}.`);
    console.log(RECONNECT_HINT);
    return;
  }
  console.log(`  Backend: ${b.status}${b.error ? ` (${b.error})` : ""}.`);
}

/**
 * @param {string[]} args
 * @returns {"help" | { error: string } | { all: boolean, dryRun: boolean, json: boolean, sqlitePathFromCli: string | null, defaultFromCli: boolean }}
 */
export function parseDownArgs(args) {
  const out = {
    all: false,
    dryRun: false,
    json: false,
    sqlitePathFromCli: /** @type {string | null} */ (null),
    defaultFromCli: false
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--help" || a === "-h") return "help";
    if (a === "--all") {
      out.all = true;
      continue;
    }
    if (a === "--dry-run") {
      out.dryRun = true;
      continue;
    }
    if (a === "--json") {
      out.json = true;
      continue;
    }
    if (a === "--default") {
      out.defaultFromCli = true;
      continue;
    }
    if (a === "--db") {
      if (!args[i + 1]) return { error: "--db requires a path argument" };
      out.sqlitePathFromCli = args[++i];
      continue;
    }
    return { error: `unknown option: ${a}` };
  }
  if (out.sqlitePathFromCli && out.defaultFromCli) {
    return { error: "use either --db <path> or --default, not both" };
  }
  if (out.all && (out.sqlitePathFromCli || out.defaultFromCli)) {
    return { error: "--all cannot be combined with --db or --default" };
  }
  return out;
}

function printDownHelp() {
  console.log(
    `
Usage: gcp brain down [--db <path>|--default] [--all] [--dry-run] [--json]

  Stop the MindBrain backend so a clean restart can pick up a fresh binary
  or a re-pinned workspace.

  (default)        Stop only the backend bound to the resolved SQLite file
                   (reads ghostcrab-backend.pid next to the database).
  --db <path>      Target the backend for an explicit SQLite file.
  --default        Target the user-global ~/.ghostcrab/databases/ghostcrab.sqlite.
  --all            Stop every GhostCrab process on this machine
                   (backend + 'gcp brain up').
  --dry-run        Report what would be stopped without sending signals.
  --json           Print a machine-readable report.

Note: the MCP server runs on your IDE's stdio. After 'down', reconnect or
restart the MCP client (e.g. /mcp reconnect) to attach to a fresh backend.
`.trim()
  );
}
