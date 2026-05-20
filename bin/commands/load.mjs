/**
 * gcp load <path/to/profile.jsonl>
 * gcp load --file <path/to/profile.jsonl>
 *
 * Loads a portable demo profile (JSONL: profile / remember / learn_node /
 * learn_edge / projection lines) into the database reached via env
 * (MindBrain backend). Uses the same pipeline as `pnpm run demo:load`.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolveGhostcrabSqlite } from "../lib/resolve-ghostcrab-sqlite.mjs";
import { slugifyWorkspace } from "../lib/workspace-slug.mjs";
import {
  preflightBrainDatabaseOrExit,
  runNativeEngineOrExit
} from "../lib/brain-engine-runner.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(__dirname, "..", "..");

export async function cmdLoad(args) {
  if (args[0] === "--help" || args[0] === "-h") {
    console.log(
      `Usage: gcp load <path/to/profile.jsonl|backup.json>\n` +
        `       gcp load --file <path/to/profile.jsonl|backup.json>\n\n` +
        `Loads a portable JSONL demo profile, or restores a ghostcrab_backup_bundle JSON object.\n` +
        `Backup bundles accept --workspace/--db/--force/--dry-run and use the native MindBrain loader.\n` +
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
    const { sqlitePathResolved } = resolveGhostcrabSqlite({
      workspaceNameFromCli: parsed.workspaceName,
      sqlitePathFromCli: parsed.sqlitePathFromCli
    });
    if (!parsed.dryRun) {
      await preflightBrainDatabaseOrExit(sqlitePathResolved, parsed.force);
    }
    runNativeEngineOrExit(
      pkgRoot,
      buildBackupLoadEngineArgs(parsed, sqlitePathResolved, resolved),
      { preferDev: true }
    );
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
  await runDemoLoad(["--profile-file", resolved]);
}

export function parseLoadArgs(args) {
  let file = null;
  let workspaceName = null;
  let sqlitePathFromCli = null;
  let force = false;
  let dryRun = false;

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
    if (!a.startsWith("-") && !file) {
      file = a;
      continue;
    }
    return { error: `gcp load: unknown argument "${a}".` };
  }

  return { file, workspaceName, sqlitePathFromCli, force, dryRun };
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
  return args;
}

export const __private__ = {
  buildBackupLoadEngineArgs,
  detectLoadKind,
  parseLoadArgs
};
