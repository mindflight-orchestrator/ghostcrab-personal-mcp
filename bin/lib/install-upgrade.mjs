import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import {
  ensureUnixExecuteBit,
  resolveNativeBackendPath
} from "./prebuild-permissions.mjs";
import { resolveGhostcrabSqlite } from "./resolve-ghostcrab-sqlite.mjs";
import { parsePidFile } from "./backend-pid.mjs";
import { resolveRuntimeNodePath } from "./runtime-node.mjs";
import { readSchemaMigrations } from "./sqlite-file-count.mjs";

const SERVER_KEY = "ghostcrab-personal-mcp";
const PACKAGE_NAME = "@mindflight/ghostcrab-personal-mcp";
export const REQUIRED_SCHEMA_MIGRATIONS = [
  "2026-06-16-answer-artifacts-workspace-strict-applied",
  "2026-06-16-graph-gap-rules-workspace-strict-applied"
];

export function parseUpgradeArgs(args) {
  const out = {
    dryRun: false,
    json: false,
    noKillMcp: false,
    skipConfigCleanup: false,
    sqlitePathFromCli: null,
    defaultFromCli: false
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--help" || a === "-h") return "help";
    if (a === "--dry-run") {
      out.dryRun = true;
      continue;
    }
    if (a === "--json") {
      out.json = true;
      continue;
    }
    if (a === "--no-kill-mcp") {
      out.noKillMcp = true;
      continue;
    }
    if (a === "--skip-config-cleanup") {
      out.skipConfigCleanup = true;
      continue;
    }
    if (a === "--default") {
      out.defaultFromCli = true;
      continue;
    }
    if (a === "--db" && args[i + 1]) {
      out.sqlitePathFromCli = args[++i];
      continue;
    }
    return { error: `unknown option: ${a}` };
  }
  if (out.sqlitePathFromCli && out.defaultFromCli) {
    return { error: "use either --db <path> or --default, not both" };
  }
  return out;
}

export async function runInstallUpgrade(options) {
  const pkgRoot = options.pkgRoot;
  const now = options.now ?? new Date();
  const currentVersion = readPackageVersion(pkgRoot);
  const consumerRoot = options.consumerRoot ?? findConsumerRoot(pkgRoot);
  const home = options.home ?? homedir();
  const report = {
    ok: true,
    version: currentVersion,
    pkgRoot,
    consumerRoot,
    installKind: detectInstallKind(pkgRoot, consumerRoot),
    processes: [],
    killed: [],
    databases: [],
    configs: [],
    migrations: [],
    errors: []
  };

  if (!options.noKillMcp) {
    const processes = listGhostcrabProcesses(options.io);
    report.processes = processes;
    if (!options.dryRun) {
      report.killed = terminateGhostcrabProcesses(processes, options.io);
    }
  }

  const dbs = discoverSqliteCandidates({
    consumerRoot,
    sqlitePathFromCli: options.sqlitePathFromCli ?? null,
    defaultFromCli: options.defaultFromCli ?? false
  });

  const backupDir = join(home, ".ghostcrab", "backups");
  for (const dbPath of dbs) {
    const status = inspectSqliteCandidate(dbPath);
    const dbReport = {
      path: dbPath,
      exists: status.exists,
      schemaMigrationTableLikely: status.schemaMigrationTableLikely,
      backup: null,
      migration: "skipped"
    };
    if (status.exists) {
      dbReport.backup = buildBackupPath(dbPath, backupDir, currentVersion, now);
      const migrationsBefore = readSchemaMigrations(dbPath);
      if (!options.dryRun) {
        copySqliteWithSidecars(dbPath, dbReport.backup);
      }
      const migration = await migrateViaBackend(pkgRoot, dbPath, {
        dryRun: options.dryRun,
        io: options.io,
        schemaStatusTimeoutMs: options.schemaStatusTimeoutMs,
        healthTimeoutMs: options.healthTimeoutMs
      });
      const migrationsAfter =
        !options.dryRun && migration.ok
          ? readSchemaMigrations(dbPath)
          : migrationsBefore;
      const appliedThisRun = diffSchemaMigrations(
        migrationsBefore,
        migrationsAfter
      );
      dbReport.migration = classifyMigrationResult({
        dryRun: options.dryRun,
        migrationOk: migration.ok,
        appliedThisRun,
        migrationsAfter
      });
      dbReport.migrationsBefore = migrationsBefore;
      dbReport.migrationsAfter = migrationsAfter;
      dbReport.appliedThisRun = appliedThisRun;
      dbReport.schemaStatus = migration.schemaStatus ?? null;
      dbReport.schemaStatusError = migration.schemaStatusError ?? null;
      dbReport.backend = migration.backend ?? null;
      dbReport.migrationLogs = migration.stderrLines ?? [];
      report.migrations.push({
        db: dbPath,
        ...migration,
        before: migrationsBefore,
        after: migrationsAfter,
        appliedThisRun
      });
      if (!migration.ok) {
        report.ok = false;
        report.errors.push(
          `migration failed for ${dbPath}: ${migration.reason}`
        );
      }
    }
    report.databases.push(dbReport);
  }

  if (!options.skipConfigCleanup) {
    report.configs.push(
      cleanCursorMcpConfig({
        home,
        pkgRoot,
        dbPath: dbs[0] ?? null,
        dryRun: options.dryRun
      })
    );
    report.configs.push(
      cleanCodexConfig({
        home,
        pkgRoot,
        dbPath: dbs[0] ?? null,
        dryRun: options.dryRun
      })
    );
    report.configs.push({
      kind: "claude",
      status: "manual-cli",
      message:
        "run `gcp brain setup claude --force` to replace Claude MCP entries"
    });
  }

  return report;
}

export function classifyMigrationResult({
  dryRun,
  migrationOk,
  appliedThisRun,
  migrationsAfter
}) {
  if (dryRun) return "would-apply";
  if (!migrationOk) return "failed";
  if (appliedThisRun.length > 0) return "applied";
  if (migrationsAfter === null) return "verified";
  return "up-to-date";
}

export function printUpgradeReport(report, out = console.log) {
  out(`[ghostcrab] upgrade v${report.version}: ${report.ok ? "ok" : "issues"}`);
  out(`  install: ${report.installKind}`);
  if (report.consumerRoot) out(`  consumer: ${report.consumerRoot}`);
  if (report.processes.length > 0) {
    out(
      `  ghostcrab processes: ${report.processes.map((p) => p.pid).join(", ")}`
    );
  } else {
    out("  ghostcrab processes: none");
  }
  if (report.killed.length > 0) {
    out(
      `  killed: ${report.killed.map((p) => `${p.pid}:${p.status}`).join(", ")}`
    );
  }
  for (const db of report.databases) {
    out(`  db: ${db.path}`);
    out(`    exists: ${db.exists}`);
    if (db.backup) out(`    backup: ${db.backup}`);
    out(`    migration: ${db.migration}`);
    printSchemaMigrationDetails(db, out);
  }
  for (const cfg of report.configs) {
    out(
      `  config ${cfg.kind}: ${cfg.status}${cfg.path ? ` (${cfg.path})` : ""}`
    );
    if (cfg.removed?.length) {
      out(`    removed entries: ${cfg.removed.join(", ")}`);
    }
    if (cfg.message) out(`    note: ${cfg.message}`);
  }
  for (const err of report.errors) out(`  error: ${err}`);
}

/**
 * @param {object} db
 * @param {(line: string) => void} out
 */
function printSchemaMigrationDetails(db, out) {
  if (!db.exists) return;

  const before = db.migrationsBefore;
  const after = db.migrationsAfter;
  const applied = db.appliedThisRun ?? [];

  if (before === null && after === null) {
    out(
      "    schema migrations: unavailable (node:sqlite required or database unreadable)"
    );
    return;
  }

  if (db.migration === "would-apply") {
    const count = before?.length ?? 0;
    out(
      `    schema migrations on disk: ${count}${count === 1 ? " migration" : " migrations"}`
    );
    out(
      "    would start native backend once to apply any pending MindBrain schema migrations"
    );
    if (before?.length) {
      for (const row of before) {
        out(`      - ${row.id}`);
      }
    }
    return;
  }

  if (applied.length > 0) {
    out(`    migrations applied this run (${applied.length}):`);
    for (const row of applied) {
      const when = row.appliedAt ? ` @ ${row.appliedAt}` : "";
      out(`      + ${row.id}${when}`);
    }
  } else if (db.migration === "verified") {
    out(
      "    migrations applied this run: unknown (verified by backend schema status)"
    );
  } else if (db.migration === "up-to-date") {
    out("    migrations applied this run: none (schema already up to date)");
  } else if (db.migration === "failed") {
    out(
      "    migrations applied this run: none (backend migration step failed)"
    );
  }

  const total = after?.length ?? before?.length ?? 0;
  out(
    `    schema migrations on disk: ${total}${total === 1 ? " migration" : " migrations"}`
  );
  for (const row of after ?? before ?? []) {
    out(`      - ${row.id}`);
  }

  if (db.backend) {
    out(
      `    backend: ${db.backend.source ?? "unknown"} ${db.backend.path ?? ""}`.trimEnd()
    );
    if (db.backend.sha256) out(`    backend sha256: ${db.backend.sha256}`);
  }

  if (db.schemaStatusError) {
    out(`    schema status error: ${db.schemaStatusError.reason}`);
    if (db.schemaStatusError.status) {
      out(`    schema status HTTP: ${db.schemaStatusError.status}`);
    }
    if (db.schemaStatusError.body) {
      out(`    schema status body: ${db.schemaStatusError.body}`);
    }
  }

  if (db.schemaStatus) {
    const status = db.schemaStatus;
    out(`    mindbrain version: ${status.mindbrain_version ?? "unknown"}`);
    out(`    schema tables: ${status.schema_tables_count ?? "unknown"}`);
    const missing = status.missing_columns ?? [];
    if (missing.length === 0) {
      out("    missing columns: none");
    } else {
      out(`    missing columns (${missing.length}):`);
      for (const col of missing) {
        out(`      - ${col.table}.${col.column}`);
      }
    }
  }

  for (const line of db.migrationLogs ?? []) {
    if (line.includes("[mindbrain]")) out(`    ${line}`);
  }
}

/**
 * @param {import("./sqlite-file-count.mjs").SchemaMigrationRow[] | null} before
 * @param {import("./sqlite-file-count.mjs").SchemaMigrationRow[] | null} after
 * @returns {import("./sqlite-file-count.mjs").SchemaMigrationRow[]}
 */
export function diffSchemaMigrations(before, after) {
  if (!after) return [];
  const beforeIds = new Set((before ?? []).map((row) => row.id));
  return after.filter((row) => !beforeIds.has(row.id));
}

function readPackageVersion(pkgRoot) {
  try {
    const pkg = JSON.parse(readFileSync(join(pkgRoot, "package.json"), "utf8"));
    return typeof pkg.version === "string" ? pkg.version : "unknown";
  } catch {
    return "unknown";
  }
}

function findConsumerRoot(pkgRoot) {
  let dir = dirname(pkgRoot);
  while (dir !== dirname(dir)) {
    const p = join(dir, "package.json");
    if (existsSync(p)) {
      try {
        const pkg = JSON.parse(readFileSync(p, "utf8"));
        if (pkg?.name !== PACKAGE_NAME) return dir;
      } catch {
        return null;
      }
    }
    dir = dirname(dir);
  }
  return null;
}

function detectInstallKind(pkgRoot, consumerRoot) {
  if (
    consumerRoot &&
    pkgRoot.includes(
      `${join("node_modules", "@mindflight", "ghostcrab-personal-mcp")}`
    )
  ) {
    return "local";
  }
  if (pkgRoot.includes("node_modules")) return "global-or-linked";
  return "source";
}

function discoverSqliteCandidates(opts) {
  const paths = new Set();
  const resolved = resolveGhostcrabSqlite({
    sqlitePathFromCli: opts.sqlitePathFromCli,
    defaultFromCli: opts.defaultFromCli
  });
  paths.add(resolved.sqlitePathResolved);

  if (opts.consumerRoot) {
    const dataDir = join(opts.consumerRoot, "data");
    try {
      for (const name of readdirSync(dataDir)) {
        if (/\.(sqlite|sqlite3|db)$/i.test(name)) {
          paths.add(resolve(dataDir, name));
        }
      }
    } catch {
      /* consumer data dir may not exist */
    }
  }
  return [...paths];
}

function inspectSqliteCandidate(dbPath) {
  if (!existsSync(dbPath)) {
    return { exists: false, schemaMigrationTableLikely: false };
  }
  try {
    const raw = readFileSync(dbPath);
    return {
      exists: true,
      schemaMigrationTableLikely: raw.includes("mindbrain_schema_migrations")
    };
  } catch {
    return { exists: true, schemaMigrationTableLikely: false };
  }
}

function buildBackupPath(dbPath, backupDir, currentVersion, now) {
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const ext = extname(dbPath) || ".sqlite";
  const stem = basename(dbPath, ext);
  return join(
    backupDir,
    `${stem}.from-vunknown-to-v${currentVersion}-${stamp}${ext}`
  );
}

function copySqliteWithSidecars(dbPath, backupPath) {
  mkdirSync(dirname(backupPath), { recursive: true });
  copyFileSync(dbPath, backupPath);
  for (const suffix of ["-wal", "-shm"]) {
    const src = `${dbPath}${suffix}`;
    if (existsSync(src)) copyFileSync(src, `${backupPath}${suffix}`);
  }
}

export function listGhostcrabProcesses(io = {}) {
  const spawnSyncFn = io.spawnSync ?? spawnSync;
  if (process.platform === "win32") {
    return listWindowsGhostcrabProcesses(spawnSyncFn);
  }
  const r = spawnSyncFn("ps", ["-eo", "pid=,ppid=,command="], {
    encoding: "utf8"
  });
  if (r.status !== 0 || r.error) return [];
  return String(r.stdout ?? "")
    .split(/\r?\n/)
    .map(parsePsLine)
    .filter(Boolean)
    .filter(isGhostcrabProcess);
}

function parsePsLine(line) {
  const m = line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/);
  if (!m) return null;
  return { pid: Number(m[1]), ppid: Number(m[2]), command: m[3] };
}

function listWindowsGhostcrabProcesses(spawnSyncFn) {
  const ps = spawnSyncFn(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Compress"
    ],
    { encoding: "utf8" }
  );
  if (ps.status !== 0 || ps.error) return [];
  try {
    const parsed = JSON.parse(String(ps.stdout ?? "[]"));
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    return rows
      .map((row) => ({
        pid: Number(row.ProcessId),
        ppid: Number(row.ParentProcessId),
        command: String(row.CommandLine ?? "")
      }))
      .filter((row) => Number.isFinite(row.pid))
      .filter(isGhostcrabProcess);
  } catch {
    return [];
  }
}

function isGhostcrabProcess(proc) {
  if (
    proc.pid === process.pid ||
    proc.ppid === process.pid ||
    proc.pid === process.ppid
  ) {
    return false;
  }
  const cmd = proc.command.toLowerCase();
  return (
    cmd.includes("ghostcrab-backend") ||
    cmd.includes("ghostcrab.mjs") ||
    cmd.includes("gcp.mjs") ||
    cmd.includes("@mindflight/ghostcrab-personal-mcp") ||
    (cmd.includes("gcp") && cmd.includes("brain") && cmd.includes("up"))
  );
}

export function terminateGhostcrabProcesses(processes, io = {}) {
  const spawnSyncFn = io.spawnSync ?? spawnSync;
  const out = [];
  for (const p of processes) {
    if (process.platform === "win32") {
      const soft = spawnSyncFn("taskkill.exe", ["/PID", String(p.pid), "/T"], {
        encoding: "utf8"
      });
      if (soft.status === 0) {
        out.push({ pid: p.pid, status: "terminated" });
        continue;
      }
      const hard = spawnSyncFn(
        "taskkill.exe",
        ["/PID", String(p.pid), "/T", "/F"],
        { encoding: "utf8" }
      );
      out.push({ pid: p.pid, status: hard.status === 0 ? "killed" : "failed" });
      continue;
    }
    try {
      process.kill(p.pid, "SIGTERM");
      out.push({ pid: p.pid, status: "terminated" });
    } catch {
      out.push({ pid: p.pid, status: "failed" });
    }
  }
  return out;
}

async function migrateViaBackend(pkgRoot, dbPath, opts) {
  if (opts.dryRun) return { ok: true, reason: "dry-run" };
  const backend = resolveNativeBackendPath(pkgRoot);
  const backendInfo = backend.ok
    ? {
        path: backend.path,
        source: backend.source,
        platformKey: backend.platformKey,
        sha256: sha256Prefix(backend.path)
      }
    : {
        path: backend.path,
        source: backend.source,
        platformKey: backend.platformKey,
        sha256: null
      };
  if (!backend.ok) {
    return {
      ok: false,
      reason: `native backend missing for ${backend.platformKey}`,
      backend: backendInfo
    };
  }
  const ex = ensureUnixExecuteBit(backend.path);
  if (!ex.ok) {
    return {
      ok: false,
      reason: `backend is not executable: ${ex.error?.message ?? ex}`,
      backend: backendInfo
    };
  }
  const port = opts.io?.findFreePort
    ? await opts.io.findFreePort()
    : await findFreePort(18191, 20);
  const pidFile = join(dirname(dbPath), "ghostcrab-backend.pid");
  try {
    if (existsSync(pidFile)) {
      const parsed = parsePidFile(readFileSync(pidFile, "utf8"));
      if (parsed) {
        try {
          process.kill(parsed.pid, 0);
          return {
            ok: false,
            reason: `backend still running at pid ${parsed.pid}`,
            backend: backendInfo
          };
        } catch {
          unlinkSync(pidFile);
        }
      }
    }
  } catch {
    /* stale or unreadable sidecar */
  }

  const stderrLines = [];
  const child = (opts.io?.spawn ?? spawn)(backend.path, [], {
    env: {
      ...process.env,
      GHOSTCRAB_BACKEND_ADDR: `:${port}`,
      GHOSTCRAB_SQLITE_PATH: dbPath,
      GHOSTCRAB_WORKSPACE_NAME: "default"
    },
    stdio: ["ignore", "ignore", "pipe"],
    detached: true
  });
  child.stderr?.on("data", (chunk) => {
    for (const line of chunk.toString("utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed) stderrLines.push(trimmed);
    }
  });
  child.unref?.();
  const baseUrl = `http://127.0.0.1:${port}`;
  const healthy = await waitForHealth(
    `${baseUrl}/health`,
    opts.healthTimeoutMs ?? 15000
  );
  const schemaStatusResult = healthy
    ? await waitForSchemaStatus(
        `${baseUrl}/api/mindbrain/schema/status`,
        opts.schemaStatusTimeoutMs ?? 10000
      )
    : null;
  try {
    if (child.pid) process.kill(child.pid, "SIGTERM");
  } catch {
    /* process may already be gone */
  }
  if (!healthy) {
    return {
      ok: false,
      reason: "backend did not become healthy during migration",
      backend: backendInfo,
      schemaStatus: null,
      stderrLines
    };
  }
  if (!schemaStatusResult?.ok) {
    return {
      ok: false,
      reason: `backend schema status unavailable: ${schemaStatusResult?.reason ?? "unknown"}`,
      backend: backendInfo,
      schemaStatus: null,
      schemaStatusError: schemaStatusResult,
      stderrLines
    };
  }
  const schemaValidation = validateSchemaStatus(schemaStatusResult.payload);
  if (!schemaValidation.ok) {
    return {
      ok: false,
      reason: `backend schema status incomplete: ${schemaValidation.errors.join("; ")}`,
      backend: backendInfo,
      schemaStatus: schemaStatusResult.payload,
      schemaStatusError: {
        reason: schemaValidation.errors.join("; ")
      },
      stderrLines
    };
  }
  return {
    ok: true,
    reason: "backend schema startup completed",
    backend: backendInfo,
    schemaStatus: schemaStatusResult.payload,
    stderrLines
  };
}

async function findFreePort(base, range) {
  const { createServer } = await import("node:net");
  for (let p = base; p < base + range; p++) {
    const free = await new Promise((resolveFree) => {
      const srv = createServer();
      srv.once("error", () => resolveFree(false));
      srv.once("listening", () => srv.close(() => resolveFree(true)));
      srv.listen(p, "127.0.0.1");
    });
    if (free) return p;
  }
  throw new Error(`no free migration port in ${base}-${base + range - 1}`);
}

async function waitForSchemaStatus(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let last = { ok: false, reason: "not attempted" };
  while (Date.now() < deadline) {
    last = await fetchSchemaStatus(url);
    if (last.ok) return last;
    await new Promise((r) => setTimeout(r, 150));
  }
  return last;
}

async function fetchSchemaStatus(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        ok: false,
        reason: `HTTP ${res.status}`,
        status: res.status,
        body
      };
    }
    return { ok: true, payload: await res.json() };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error)
    };
  }
}

export function validateSchemaStatus(schemaStatus) {
  const errors = [];
  if (!schemaStatus || typeof schemaStatus !== "object") {
    return { ok: false, errors: ["schema status payload is missing"] };
  }
  const applied = Array.isArray(schemaStatus.applied_migrations)
    ? schemaStatus.applied_migrations
    : [];
  for (const id of REQUIRED_SCHEMA_MIGRATIONS) {
    if (!applied.includes(id)) {
      errors.push(`missing required migration ${id}`);
    }
  }
  const missingColumns = Array.isArray(schemaStatus.missing_columns)
    ? schemaStatus.missing_columns
    : [];
  if (missingColumns.length > 0) {
    errors.push(`missing schema columns: ${missingColumns.length}`);
  }
  return { ok: errors.length === 0, errors };
}

function sha256Prefix(path) {
  try {
    return createHash("sha256")
      .update(readFileSync(path))
      .digest("hex")
      .slice(0, 16);
  } catch {
    return null;
  }
}

async function waitForHealth(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (res.ok) return true;
    } catch {
      /* not ready */
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

function cleanCursorMcpConfig(opts) {
  const path = join(opts.home, ".cursor", "mcp.json");
  if (!existsSync(path)) return { kind: "cursor", path, status: "missing" };
  try {
    const doc = JSON.parse(readFileSync(path, "utf8"));
    const servers =
      doc &&
      typeof doc === "object" &&
      doc.mcpServers &&
      typeof doc.mcpServers === "object"
        ? doc.mcpServers
        : null;
    if (!servers) return { kind: "cursor", path, status: "no-mcpServers" };
    const removed = [];
    for (const [key, entry] of Object.entries(servers)) {
      const text = JSON.stringify(entry).toLowerCase();
      if (
        key === "ghostcrab" ||
        key === SERVER_KEY ||
        text.includes("@mindflight/ghostcrab-personal-mcp") ||
        text.includes("gcp.mjs") ||
        text.includes("ghostcrab.mjs")
      ) {
        delete servers[key];
        removed.push(key);
      }
    }
    const gcpMjs = join(opts.pkgRoot, "bin", "gcp.mjs");
    servers[SERVER_KEY] = {
      type: "stdio",
      command: resolveRuntimeNodePath(),
      args: [
        gcpMjs,
        "brain",
        "up",
        ...(opts.dbPath ? ["--db", opts.dbPath] : [])
      ],
      env: { GHOSTCRAB_EMBEDDINGS_MODE: "disabled" }
    };
    if (!opts.dryRun) {
      writeFileSync(`${path}.bak`, readFileSync(path, "utf8"));
      writeFileSync(path, JSON.stringify(doc, null, 2) + "\n", "utf8");
    }
    return {
      kind: "cursor",
      path,
      status: opts.dryRun ? "would-update" : "updated",
      removed
    };
  } catch (e) {
    return {
      kind: "cursor",
      path,
      status: "error",
      error: e instanceof Error ? e.message : String(e)
    };
  }
}

function cleanCodexConfig(opts) {
  const path = join(opts.home, ".codex", "config.toml");
  if (!existsSync(path)) return { kind: "codex", path, status: "missing" };
  try {
    const original = readFileSync(path, "utf8");
    const lines = original.split(/\r?\n/);
    const kept = [];
    let skipping = false;
    let removed = 0;
    for (const line of lines) {
      const section = line.match(/^\s*\[([^\]]+)\]\s*$/);
      if (section) {
        const name = section[1];
        const ghostcrabSection =
          name === "mcp_servers.ghostcrab" ||
          name === `mcp_servers.${SERVER_KEY}` ||
          name === `mcp_servers."${SERVER_KEY}"` ||
          name === "mcp_servers.ghostcrab.env" ||
          name === `mcp_servers.${SERVER_KEY}.env` ||
          name === `mcp_servers."${SERVER_KEY}".env`;
        if (ghostcrabSection) {
          skipping = true;
          removed++;
          continue;
        }
        skipping = false;
      }
      if (!skipping) kept.push(line);
    }
    const block = formatCodexBlock(opts.pkgRoot, opts.dbPath);
    const next = `${kept.join("\n").trimEnd()}\n\n${block}\n`;
    if (!opts.dryRun) {
      writeFileSync(`${path}.bak`, original, "utf8");
      writeFileSync(path, next, "utf8");
    }
    return {
      kind: "codex",
      path,
      status: opts.dryRun ? "would-update" : "updated",
      removed
    };
  } catch (e) {
    return {
      kind: "codex",
      path,
      status: "error",
      error: e instanceof Error ? e.message : String(e)
    };
  }
}

function formatCodexBlock(pkgRoot, dbPath) {
  const args = [
    join(pkgRoot, "bin", "gcp.mjs"),
    "brain",
    "up",
    ...(dbPath ? ["--db", dbPath] : [])
  ];
  return [
    `[mcp_servers.${SERVER_KEY}]`,
    `command = ${JSON.stringify(resolveRuntimeNodePath())}`,
    `args = [${args.map((arg) => JSON.stringify(arg)).join(", ")}]`,
    "",
    `[mcp_servers.${SERVER_KEY}.env]`,
    `GHOSTCRAB_EMBEDDINGS_MODE = "disabled"`
  ].join("\n");
}

export function printUpgradeHelp() {
  console.log(
    `
Usage: gcp brain upgrade [options]

  Prepare an existing GhostCrab install for the current package version:
  stop GhostCrab MCP/backend processes, back up SQLite files, start the native
  backend once so its SQLite migrations run, and refresh known MCP config entries.

  The report lists MindBrain schema migrations from mindbrain_schema_migrations:
  which migrations were applied during this run, and the full set on disk.

Options:
  --db <path>              Upgrade this SQLite file
  --default                Use ~/.ghostcrab/databases/ghostcrab.sqlite
  --dry-run                Inventory only; no process kill, backup, config write, or migration
  --json                   Print JSON report
  --no-kill-mcp            Do not stop GhostCrab processes
  --skip-config-cleanup    Do not update known MCP config files
`.trim()
  );
}
