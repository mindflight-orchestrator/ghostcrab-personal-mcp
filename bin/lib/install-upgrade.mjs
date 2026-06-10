import { spawn, spawnSync } from "node:child_process";
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

const SERVER_KEY = "ghostcrab-personal-mcp";
const PACKAGE_NAME = "@mindflight/ghostcrab-personal-mcp";

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
      if (!options.dryRun) {
        copySqliteWithSidecars(dbPath, dbReport.backup);
      }
      const migration = await migrateViaBackend(pkgRoot, dbPath, {
        dryRun: options.dryRun,
        io: options.io
      });
      dbReport.migration = options.dryRun
        ? "would-apply"
        : migration.ok
          ? "applied"
          : "failed";
      report.migrations.push({ db: dbPath, ...migration });
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
  }
  for (const cfg of report.configs) {
    out(
      `  config ${cfg.kind}: ${cfg.status}${cfg.path ? ` (${cfg.path})` : ""}`
    );
  }
  for (const err of report.errors) out(`  error: ${err}`);
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
  if (!backend.ok) {
    return {
      ok: false,
      reason: `native backend missing for ${backend.platformKey}`
    };
  }
  const ex = ensureUnixExecuteBit(backend.path);
  if (!ex.ok) {
    return {
      ok: false,
      reason: `backend is not executable: ${ex.error?.message ?? ex}`
    };
  }
  const port = await findFreePort(18191, 20);
  const pidFile = join(dirname(dbPath), "ghostcrab-backend.pid");
  try {
    if (existsSync(pidFile)) {
      const parsed = parsePidFile(readFileSync(pidFile, "utf8"));
      if (parsed) {
        try {
          process.kill(parsed.pid, 0);
          return {
            ok: false,
            reason: `backend still running at pid ${parsed.pid}`
          };
        } catch {
          unlinkSync(pidFile);
        }
      }
    }
  } catch {
    /* stale or unreadable sidecar */
  }

  const child = (opts.io?.spawn ?? spawn)(backend.path, [], {
    env: {
      ...process.env,
      GHOSTCRAB_BACKEND_ADDR: `:${port}`,
      GHOSTCRAB_SQLITE_PATH: dbPath,
      GHOSTCRAB_WORKSPACE_NAME: "default"
    },
    stdio: ["ignore", "ignore", "ignore"],
    detached: true
  });
  child.unref?.();
  const healthy = await waitForHealth(`http://127.0.0.1:${port}/health`, 15000);
  try {
    if (child.pid) process.kill(child.pid, "SIGTERM");
  } catch {
    /* process may already be gone */
  }
  return healthy
    ? { ok: true, reason: "backend schema startup completed" }
    : { ok: false, reason: "backend did not become healthy during migration" };
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
      command: process.execPath,
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
    `command = ${JSON.stringify(process.execPath)}`,
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
