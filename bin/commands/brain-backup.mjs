/**
 * gcp brain backup — export canonical MindBrain backup bundles.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readConfig } from "../lib/cli-config.mjs";
import { resolveGhostcrabSqlite } from "../lib/resolve-ghostcrab-sqlite.mjs";
import { slugifyWorkspace } from "../lib/workspace-slug.mjs";
import {
  preflightBrainDatabaseOrExit,
  runNativeEngineOrExit
} from "../lib/brain-engine-runner.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(__dirname, "..", "..");

export async function cmdBrainBackup(args) {
  if (args[0] === "--help" || args[0] === "-h") {
    printBackupHelp();
    return;
  }
  const parsed = parseBackupArgs(args);
  if (parsed.error) {
    console.error(parsed.error);
    process.exit(1);
  }

  const { sqlitePathResolved } = resolveGhostcrabSqlite({
    workspaceNameFromCli: parsed.workspaceName,
    sqlitePathFromCli: parsed.sqlitePathFromCli
  });
  await preflightBrainDatabaseOrExit(sqlitePathResolved, parsed.force);

  const childArgs = buildBackupEngineArgs(parsed, sqlitePathResolved);
  runNativeEngineOrExit(pkgRoot, childArgs, { preferDev: true });
}

export function parseBackupArgs(args) {
  let workspaceName = null;
  let workspaceId = null;
  let sqlitePathFromCli = null;
  let outputPath = null;
  let collectionId = null;
  let scope = "workspace";
  let includeVectors = true;
  let force = false;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--workspace" || a === "-w") {
      if (!args[i + 1])
        return { error: "gcp brain backup: --workspace requires a name." };
      workspaceName = slugifyWorkspace(args[++i]);
      continue;
    }
    if (a === "--workspace-id") {
      if (!args[i + 1])
        return { error: "gcp brain backup: --workspace-id requires an id." };
      workspaceId = args[++i];
      continue;
    }
    if (a === "--db") {
      if (!args[i + 1])
        return { error: "gcp brain backup: --db requires a path argument." };
      sqlitePathFromCli = args[++i];
      continue;
    }
    if (a === "--output" || a === "-o") {
      if (!args[i + 1])
        return { error: "gcp brain backup: --output requires a path." };
      outputPath = args[++i];
      continue;
    }
    if (a === "--scope") {
      if (!args[i + 1])
        return {
          error:
            "gcp brain backup: --scope requires workspace, taxonomies, or collection."
        };
      scope = args[++i];
      if (!["workspace", "taxonomies", "collection"].includes(scope)) {
        return { error: `gcp brain backup: unsupported --scope "${scope}".` };
      }
      continue;
    }
    if (a === "--collection-id") {
      if (!args[i + 1])
        return { error: "gcp brain backup: --collection-id requires an id." };
      collectionId = args[++i];
      continue;
    }
    if (a === "--no-vectors") {
      includeVectors = false;
      continue;
    }
    if (a === "--force") {
      force = true;
      continue;
    }
    return { error: `gcp brain backup: unknown argument "${a}".` };
  }

  if (scope === "collection" && !collectionId) {
    return {
      error: "gcp brain backup: --scope collection requires --collection-id."
    };
  }

  return {
    workspaceName,
    workspaceId,
    sqlitePathFromCli,
    outputPath,
    collectionId,
    scope,
    includeVectors,
    force
  };
}

export function resolveBackupWorkspaceId(parsed, config = readConfig()) {
  return (
    parsed.workspaceId ??
    parsed.workspaceName ??
    config.defaultWorkspace ??
    "default"
  );
}

export function buildBackupEngineArgs(parsed, sqlitePathResolved) {
  const args = [
    "backup-export",
    "--db",
    sqlitePathResolved,
    "--workspace-id",
    resolveBackupWorkspaceId(parsed),
    "--scope",
    parsed.scope
  ];
  if (parsed.collectionId) {
    args.push("--collection-id", parsed.collectionId);
  }
  if (parsed.outputPath) {
    args.push("--output", parsed.outputPath);
  }
  if (!parsed.includeVectors) {
    args.push("--no-vectors");
  }
  return args;
}

function printBackupHelp() {
  console.log(
    `
Usage: gcp brain backup [--workspace <name>] [--workspace-id <id>] [--db <path>] [--force]
                        [--scope workspace|taxonomies|collection] [--collection-id <id>]
                        [--output <bundle.json>] [--no-vectors]

  Export a canonical MindBrain backup bundle. The bundle can be loaded with:
    gcp brain load <bundle.json>

  --workspace <name>     Resolve the SQLite path from GhostCrab config
  --workspace-id <id>    MindBrain workspace_id to export (defaults to --workspace/config/default)
  --db <path>            Explicit SQLite file path
  --scope taxonomies     Export workspace taxonomies only
  --scope collection     Export one collection; requires --collection-id
  --no-vectors           Omit raw embedding blobs from the bundle
  --force                Skip the running-backend check

Examples:
  gcp brain backup --workspace-id my_ws --output ./backup.json
  gcp brain backup --workspace-id my_ws --scope taxonomies --output ./taxonomies.json
  gcp brain export --workspace-id my_ws --scope collection --collection-id my_ws::docs -o ./docs.json
`.trim()
  );
}

export const __private__ = {
  buildBackupEngineArgs,
  parseBackupArgs,
  resolveBackupWorkspaceId
};
