/**
 * gcp brain ontology — import/export ontology source files into MindBrain.
 */

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

export async function cmdBrainOntology(args) {
  const sub = args[0];
  if (!sub || sub === "--help" || sub === "-h") {
    printOntologyHelp();
    return;
  }

  const rest = args.slice(1);
  const parsed =
    sub === "import"
      ? parseOntologyImportArgs(rest)
      : sub === "export"
        ? parseOntologyExportArgs(rest)
        : { error: `gcp brain ontology: unknown subcommand "${sub}".` };
  if (parsed.error) {
    console.error(parsed.error);
    process.exit(1);
  }

  const { sqlitePathResolved } = resolveGhostcrabSqlite({
    workspaceNameFromCli: parsed.workspaceName,
    sqlitePathFromCli: parsed.sqlitePathFromCli
  });
  await preflightBrainDatabaseOrExit(sqlitePathResolved, parsed.force);

  const childArgs =
    sub === "import"
      ? buildOntologyImportEngineArgs(parsed, sqlitePathResolved)
      : buildOntologyExportEngineArgs(parsed, sqlitePathResolved);
  runNativeEngineOrExit(pkgRoot, childArgs, { preferDev: true });
}

export function parseOntologyImportArgs(args) {
  let workspaceName = null;
  let sqlitePathFromCli = null;
  let workspaceId = null;
  let ontologyId = null;
  let inputPath = null;
  let name = null;
  let materializeGraph = false;
  let force = false;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--workspace" || a === "-w") {
      if (!args[i + 1])
        return {
          error: "gcp brain ontology import: --workspace requires a name."
        };
      workspaceName = slugifyWorkspace(args[++i]);
      continue;
    }
    if (a === "--db") {
      if (!args[i + 1])
        return {
          error: "gcp brain ontology import: --db requires a path argument."
        };
      sqlitePathFromCli = args[++i];
      continue;
    }
    if (a === "--workspace-id") {
      if (!args[i + 1])
        return {
          error: "gcp brain ontology import: --workspace-id requires an id."
        };
      workspaceId = args[++i];
      continue;
    }
    if (a === "--ontology-id") {
      if (!args[i + 1])
        return {
          error: "gcp brain ontology import: --ontology-id requires an id."
        };
      ontologyId = args[++i];
      continue;
    }
    if (a === "--input" || a === "-i") {
      if (!args[i + 1])
        return { error: "gcp brain ontology import: --input requires a path." };
      inputPath = args[++i];
      continue;
    }
    if (a === "--name") {
      if (!args[i + 1])
        return { error: "gcp brain ontology import: --name requires a value." };
      name = args[++i];
      continue;
    }
    if (a === "--materialize-graph") {
      materializeGraph = true;
      continue;
    }
    if (a === "--force") {
      force = true;
      continue;
    }
    return { error: `gcp brain ontology import: unknown argument "${a}".` };
  }

  if (!workspaceId)
    return { error: "gcp brain ontology import: --workspace-id is required." };
  if (!ontologyId)
    return { error: "gcp brain ontology import: --ontology-id is required." };
  if (!inputPath)
    return { error: "gcp brain ontology import: --input is required." };

  return {
    workspaceName,
    sqlitePathFromCli,
    workspaceId,
    ontologyId,
    inputPath,
    name,
    materializeGraph,
    force
  };
}

export function parseOntologyExportArgs(args) {
  let workspaceName = null;
  let sqlitePathFromCli = null;
  let workspaceId = null;
  let ontologyId = null;
  let outputPath = null;
  let format = "ntriples";
  let force = false;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--workspace" || a === "-w") {
      if (!args[i + 1])
        return {
          error: "gcp brain ontology export: --workspace requires a name."
        };
      workspaceName = slugifyWorkspace(args[++i]);
      continue;
    }
    if (a === "--db") {
      if (!args[i + 1])
        return {
          error: "gcp brain ontology export: --db requires a path argument."
        };
      sqlitePathFromCli = args[++i];
      continue;
    }
    if (a === "--workspace-id") {
      if (!args[i + 1])
        return {
          error: "gcp brain ontology export: --workspace-id requires an id."
        };
      workspaceId = args[++i];
      continue;
    }
    if (a === "--ontology-id") {
      if (!args[i + 1])
        return {
          error: "gcp brain ontology export: --ontology-id requires an id."
        };
      ontologyId = args[++i];
      continue;
    }
    if (a === "--output" || a === "-o") {
      if (!args[i + 1])
        return {
          error: "gcp brain ontology export: --output requires a path."
        };
      outputPath = args[++i];
      continue;
    }
    if (a === "--format") {
      if (!args[i + 1])
        return {
          error:
            "gcp brain ontology export: --format requires ntriples or bundle."
        };
      format = args[++i];
      if (!["ntriples", "bundle"].includes(format)) {
        return {
          error: `gcp brain ontology export: unsupported --format "${format}".`
        };
      }
      continue;
    }
    if (a === "--force") {
      force = true;
      continue;
    }
    return { error: `gcp brain ontology export: unknown argument "${a}".` };
  }

  if (!ontologyId)
    return { error: "gcp brain ontology export: --ontology-id is required." };
  if (format === "bundle" && !workspaceId) {
    return {
      error:
        "gcp brain ontology export: --format bundle requires --workspace-id."
    };
  }

  return {
    workspaceName,
    sqlitePathFromCli,
    workspaceId,
    ontologyId,
    outputPath,
    format,
    force
  };
}

export function buildOntologyImportEngineArgs(parsed, sqlitePathResolved) {
  const args = [
    "ontology-import",
    "--db",
    sqlitePathResolved,
    "--workspace-id",
    parsed.workspaceId,
    "--ontology-id",
    parsed.ontologyId,
    "--input",
    parsed.inputPath
  ];
  if (parsed.name) args.push("--name", parsed.name);
  if (parsed.materializeGraph) args.push("--materialize-graph");
  return args;
}

export function buildOntologyExportEngineArgs(parsed, sqlitePathResolved) {
  const args = [
    "ontology-export",
    "--db",
    sqlitePathResolved,
    "--ontology-id",
    parsed.ontologyId,
    "--format",
    parsed.format
  ];
  if (parsed.workspaceId) args.push("--workspace-id", parsed.workspaceId);
  if (parsed.outputPath) args.push("--output", parsed.outputPath);
  return args;
}

function printOntologyHelp() {
  console.log(
    `
Usage: gcp brain ontology import [--workspace <name>] [--db <path>] [--force]
                                 --workspace-id <id> --ontology-id <id>
                                 --input <file.nt> [--name <name>] [--materialize-graph]
       gcp brain ontology export [--workspace <name>] [--db <path>] [--force]
                                 --ontology-id <id> [--workspace-id <id>]
                                 [--format ntriples|bundle] [--output <file>]

  Import/export normalized OWL2/RDF N-Triples through the native MindBrain ontology importer.

  --workspace <name>     Resolve the SQLite path from GhostCrab config
  --db <path>            Explicit SQLite file path
  --workspace-id <id>    MindBrain workspace_id; required for import and bundle export
  --ontology-id <id>     Ontology id to import/export
  --input <file.nt>      Normalized RDF/N-Triples input file
  --materialize-graph    Also mirror object triples into graph raw rows
  --format bundle        Export workspace taxonomies bundle instead of preserved N-Triples
  --force                Skip the running-backend check

Examples:
  gcp brain ontology import --workspace-id my_ws --ontology-id my_ws::owl --input ./ontology.nt --materialize-graph
  gcp brain ontology export --ontology-id my_ws::owl --format ntriples -o ./ontology.nt
  gcp brain ontology export --workspace-id my_ws --ontology-id my_ws::owl --format bundle -o ./taxonomies.json
`.trim()
  );
}

export const __private__ = {
  buildOntologyExportEngineArgs,
  buildOntologyImportEngineArgs,
  parseOntologyExportArgs,
  parseOntologyImportArgs
};
