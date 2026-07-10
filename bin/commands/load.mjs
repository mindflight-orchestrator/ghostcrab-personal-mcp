/**
 * gcp load <path/to/profile.jsonl>
 * gcp load --file <path/to/profile.jsonl>
 *
 * Loads a portable demo profile (JSONL: profile / remember / learn_node /
 * learn_edge / answer_artifact / legacy projection lines) into the database reached via env
 * (MindBrain backend). Uses the same pipeline as `pnpm run demo:load`.
 */

import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolveGhostcrabSqlite } from "../lib/resolve-ghostcrab-sqlite.mjs";
import { slugifyWorkspace } from "../lib/workspace-slug.mjs";
import { assertBackendSqliteAlignedOrExit } from "../lib/backend-sqlite-alignment.mjs";
import {
  preflightBrainDatabaseOrExit,
  runNativeEngineSync
} from "../lib/brain-engine-runner.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(__dirname, "..", "..");

export async function cmdLoad(args) {
  if (args[0] === "--help" || args[0] === "-h") {
    console.log(
      `Usage: gcp load <path/to/profile.jsonl|backup.json>\n` +
        `       gcp load --file <path/to/profile.jsonl|backup.json>\n\n` +
        `Loads a portable JSONL demo profile, or restores a ghostcrab_backup_bundle JSON object.\n` +
        `JSONL supports profile / remember / learn_node / learn_edge / answer_artifact / legacy projection lines.\n` +
        `Use --workspace <id> to force demo profile imports into a specific workspace.\n` +
        `Backup bundles: run gcp brain upgrade --db <path> on the target database before load when upgrading from an older export.\n` +
        `Use gcp brain load --dry-run to preview bundle counts and schema preflight (missing columns).\n` +
        `Backup bundle restore refuses to replace an existing workspace unless both --overwrite --confirm are passed.\n` +
        `Backup bundles default to --reindex graph. Use --reindex none for raw-only import.\n` +
        `JSONL profiles require a built package (dist/cli/demo-load.js). Run: pnpm run build`
    );
    return;
  }

  const parsed = parseLoadArgs(args);
  if (parsed.error) {
    console.error(parsed.error);
    process.exit(1);
  }

  if (!parsed.file) {
    console.error(
      "gcp load: missing path — use: gcp load <profile.jsonl|backup.json> or gcp load --file <path>"
    );
    process.exit(1);
  }

  const resolved = resolve(process.cwd(), parsed.file);
  if (!existsSync(resolved)) {
    console.error(`gcp load: file not found: ${resolved}`);
    process.exit(1);
  }

  if (detectLoadKind(resolved) === "backup-bundle") {
    console.error(
      "[ghostcrab] backup load: ensure the target database is upgraded first " +
        "(gcp brain upgrade --db <path> --skip-config-cleanup) if it predates this package."
    );
    const preflight = preflightWorkspaceStrictBundle(
      resolved,
      parsed.workspaceName
    );
    if (!preflight.ok) {
      console.error(preflight.message);
      process.exit(1);
    }
    if (preflight.backfilled.length > 0) {
      console.error(
        `[ghostcrab] backup load: backfilled null workspace_id -> '${parsed.workspaceName}' ` +
          `for ${preflight.backfilled.length} answer artifact(s): ${preflight.backfilled.join(", ")}`
      );
    }
    const bundleForEngine = preflight.bundlePath;
    const { sqlitePathResolved } = resolveGhostcrabSqlite({
      workspaceNameFromCli: parsed.workspaceName,
      sqlitePathFromCli: parsed.sqlitePathFromCli
    });
    if (!parsed.dryRun) {
      await preflightBrainDatabaseOrExit(sqlitePathResolved, parsed.force);
    }
    const loadResult = runNativeEngineSync(
      pkgRoot,
      buildBackupLoadEngineArgs(parsed, sqlitePathResolved, bundleForEngine),
      { preferDev: true }
    );
    if (!loadResult.ok) {
      if (loadResult.stderr) {
        console.error(loadResult.stderr);
      }
      if (loadResult.stdout) {
        process.stdout.write(loadResult.stdout);
      }
      process.exit(loadResult.status ?? 1);
    }
    if (loadResult.stdout) {
      process.stdout.write(loadResult.stdout);
    }
    if (!parsed.dryRun) {
      await assertBackendSqliteAlignedOrExit({
        sqlitePathResolved,
        bundlePath: bundleForEngine
      });
    }
    return;
  }

  const demoLoadJs = join(pkgRoot, "dist", "cli", "demo-load.js");
  if (!existsSync(demoLoadJs)) {
    console.error(
      `gcp load: ${demoLoadJs} not found. Run \`pnpm run build\` in the package directory (global install should ship dist/).`
    );
    process.exit(1);
  }

  const { runDemoLoad } = await import(pathToFileURL(demoLoadJs).href);
  const demoLoadArgs = ["--profile-file", resolved];
  if (parsed.workspaceName) {
    demoLoadArgs.push("--workspace", parsed.workspaceName);
  }
  await runDemoLoad(demoLoadArgs);
}

export function parseLoadArgs(args) {
  let file = null;
  let workspaceName = null;
  let sqlitePathFromCli = null;
  let force = false;
  let dryRun = false;
  let reindex = "graph";
  let documentTableId = null;
  let collectionId = null;
  let tableId = null;
  let overwrite = false;
  let confirm = false;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--file" || a === "-f") {
      if (!args[i + 1]) return { error: "gcp load: --file requires a path" };
      file = args[++i];
      continue;
    }
    if (a === "--workspace" || a === "-w") {
      if (!args[i + 1])
        return { error: "gcp load: --workspace requires a name." };
      workspaceName = slugifyWorkspace(args[++i]);
      continue;
    }
    if (a === "--db") {
      if (!args[i + 1])
        return { error: "gcp load: --db requires a path argument." };
      sqlitePathFromCli = args[++i];
      continue;
    }
    if (a === "--force") {
      force = true;
      continue;
    }
    if (a === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (a === "--overwrite") {
      overwrite = true;
      continue;
    }
    if (a === "--confirm") {
      confirm = true;
      continue;
    }
    if (a === "--reindex") {
      if (!args[i + 1])
        return { error: "gcp load: --reindex requires none|graph|all." };
      const mode = args[++i];
      if (!["none", "graph", "all"].includes(mode)) {
        return { error: "gcp load: --reindex must be none, graph, or all." };
      }
      reindex = mode;
      continue;
    }
    if (a === "--document-table-id") {
      if (!args[i + 1])
        return { error: "gcp load: --document-table-id requires an integer." };
      documentTableId = args[++i];
      continue;
    }
    if (a === "--collection-id") {
      if (!args[i + 1])
        return { error: "gcp load: --collection-id requires a value." };
      collectionId = args[++i];
      continue;
    }
    if (a === "--table-id") {
      if (!args[i + 1])
        return { error: "gcp load: --table-id requires an integer." };
      tableId = args[++i];
      continue;
    }
    if (!a.startsWith("-") && !file) {
      file = a;
      continue;
    }
    return { error: `gcp load: unknown argument "${a}".` };
  }

  return {
    file,
    workspaceName,
    sqlitePathFromCli,
    force,
    dryRun,
    reindex,
    documentTableId,
    collectionId,
    tableId,
    overwrite,
    confirm
  };
}

export function detectLoadKind(filePath) {
  const raw = readFileSync(filePath, "utf8").trimStart();
  if (!raw.startsWith("{")) return "jsonl-profile";
  try {
    const doc = JSON.parse(raw);
    if (
      doc &&
      typeof doc === "object" &&
      doc.kind === "ghostcrab_backup_bundle"
    ) {
      return "backup-bundle";
    }
  } catch {
    return "jsonl-profile";
  }
  return "jsonl-profile";
}

/**
 * The 2026-06-16 workspace-strict migration made
 * mindbrain_answer_artifacts.workspace_id NOT NULL. Bundles exported before
 * it can carry rows with workspace_id null, which the engine rejects on a
 * fresh load. Catch those rows up front: with --workspace, backfill them
 * into a patched temp copy of the bundle; without it, fail with the exact
 * offending rows instead of a bare engine error.
 */
export function preflightWorkspaceStrictBundle(bundlePath, workspaceName) {
  let doc;
  try {
    doc = JSON.parse(readFileSync(bundlePath, "utf8"));
  } catch {
    // Unreadable JSON is the engine's problem to report.
    return { ok: true, bundlePath, backfilled: [] };
  }
  const rows = Array.isArray(doc?.mindbrain_answer_artifacts)
    ? doc.mindbrain_answer_artifacts
    : [];
  const offenders = rows.filter(
    (row) => row && typeof row === "object" && row.workspace_id == null
  );
  if (offenders.length === 0) {
    return { ok: true, bundlePath, backfilled: [] };
  }
  if (!workspaceName) {
    const lines = offenders.map(
      (row) =>
        `  - ${row.artifact_id ?? "<missing artifact_id>"} (scope: ${row.scope ?? "null"})`
    );
    return {
      ok: false,
      bundlePath,
      backfilled: [],
      offenders: offenders.map((row) => row.artifact_id ?? null),
      message:
        `gcp load: bundle preflight failed — ${offenders.length} mindbrain_answer_artifacts ` +
        `row(s) have null workspace_id, which violates the workspace-strict schema ` +
        `(workspace_id NOT NULL since the 2026-06-16 migration):\n` +
        `${lines.join("\n")}\n` +
        `Pass --workspace <id> to backfill these rows at load time, or fix the bundle JSON.`
    };
  }
  for (const row of offenders) {
    row.workspace_id = workspaceName;
  }
  const patchedPath = join(
    mkdtempSync(join(tmpdir(), "gcp-load-")),
    basename(bundlePath)
  );
  writeFileSync(patchedPath, JSON.stringify(doc, null, 2));
  return {
    ok: true,
    bundlePath: patchedPath,
    backfilled: offenders.map((row) => row.artifact_id ?? "<missing artifact_id>")
  };
}

export function buildBackupLoadEngineArgs(
  parsed,
  sqlitePathResolved,
  bundlePath
) {
  const args = [
    "backup-load",
    "--db",
    sqlitePathResolved,
    "--bundle",
    bundlePath
  ];
  if (parsed.dryRun) args.push("--dry-run");
  if (parsed.overwrite) args.push("--overwrite");
  if (parsed.confirm) args.push("--confirm");
  if (parsed.reindex && parsed.reindex !== "none") {
    args.push("--reindex", parsed.reindex);
  }
  if (parsed.documentTableId) {
    args.push("--document-table-id", parsed.documentTableId);
  }
  if (parsed.collectionId) {
    args.push("--collection-id", parsed.collectionId);
  }
  if (parsed.tableId) {
    args.push("--table-id", parsed.tableId);
  }
  return args;
}

export const __private__ = {
  buildBackupLoadEngineArgs,
  detectLoadKind,
  parseLoadArgs,
  preflightWorkspaceStrictBundle
};
