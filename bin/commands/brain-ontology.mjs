/**
 * gcp brain ontology — import/export/compile LinkML interchange for MindBrain.
 */

import { mkdirSync } from "node:fs";
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
  if (sub === "compile") {
    await runCompile(rest);
    return;
  }
  if (sub === "export-linkml") {
    await runExportLinkml(rest);
    return;
  }
  if (sub === "inspect") {
    await runInspect(rest);
    return;
  }

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

export function buildOntologyCompileLinkmlEngineArgs(
  parsed,
  sqlitePathResolved = null
) {
  const args = [
    "ontology-compile-linkml",
    "--workspace-id",
    parsed.workspaceId,
    "--ontology-id",
    parsed.ontologyId,
    "--input",
    parsed.inputPath
  ];
  if (parsed.profile) args.push("--profile", parsed.profile);
  if (parsed.outputPath) args.push("--output", parsed.outputPath);
  if (parsed.ntriplesPath) args.push("--ntriples", parsed.ntriplesPath);
  if (sqlitePathResolved) args.push("--db", sqlitePathResolved);
  return args;
}

export function buildOntologyExportLinkmlEngineArgs(
  parsed,
  sqlitePathResolved = null
) {
  const args = ["ontology-export-linkml", "--ontology-id", parsed.ontologyId];
  if (parsed.bundlePath) {
    args.push("--input-bundle", parsed.bundlePath);
  } else if (sqlitePathResolved) {
    args.push("--db", sqlitePathResolved);
  }
  if (parsed.outputPath) args.push("--output", parsed.outputPath);
  return args;
}

async function runCompile(args) {
  const parsed = parseOntologyCompileArgs(args);
  if (parsed.error) {
    console.error(parsed.error);
    process.exit(1);
  }

  let sqlitePathResolved = null;
  if (parsed.importToDb || parsed.sqlitePathFromCli || parsed.workspaceName) {
    ({ sqlitePathResolved } = resolveGhostcrabSqlite({
      workspaceNameFromCli: parsed.workspaceName,
      sqlitePathFromCli: parsed.sqlitePathFromCli
    }));
    await preflightBrainDatabaseOrExit(sqlitePathResolved, parsed.force);
  }

  if (parsed.outputPath) {
    mkdirSync(dirname(parsed.outputPath), { recursive: true });
  }
  if (parsed.ntriplesPath) {
    mkdirSync(dirname(parsed.ntriplesPath), { recursive: true });
  }

  runNativeEngineOrExit(
    pkgRoot,
    buildOntologyCompileLinkmlEngineArgs(parsed, sqlitePathResolved),
    { preferDev: true }
  );
}

async function runExportLinkml(args) {
  const parsed = parseOntologyExportLinkmlArgs(args);
  if (parsed.error) {
    console.error(parsed.error);
    process.exit(1);
  }

  let sqlitePathResolved = null;
  if (!parsed.bundlePath) {
    ({ sqlitePathResolved } = resolveGhostcrabSqlite({
      workspaceNameFromCli: parsed.workspaceName,
      sqlitePathFromCli: parsed.sqlitePathFromCli
    }));
    await preflightBrainDatabaseOrExit(sqlitePathResolved, false);
  }

  if (parsed.outputPath) {
    mkdirSync(dirname(parsed.outputPath), { recursive: true });
  }

  runNativeEngineOrExit(
    pkgRoot,
    buildOntologyExportLinkmlEngineArgs(parsed, sqlitePathResolved),
    { preferDev: true }
  );
}

async function runInspect(args) {
  const parsed = parseOntologyInspectArgs(args);
  if (parsed.error) {
    console.error(parsed.error);
    process.exit(1);
  }

  const baseUrl = resolveMindbrainUrl(parsed.url);
  const url = buildOntologyInspectUrl(baseUrl, parsed);
  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok) {
    console.error(
      `gcp brain ontology inspect: backend returned HTTP ${res.status}: ${text}`
    );
    process.exit(1);
  }
  process.stdout.write(text.endsWith("\n") ? text : `${text}\n`);
}

export function parseOntologyCompileArgs(args) {
  let workspaceName = null;
  let sqlitePathFromCli = null;
  let workspaceId = null;
  let ontologyId = null;
  let inputPath = null;
  let outputPath = null;
  let ntriplesPath = null;
  let importToDb = false;
  let force = false;
  let profile = null;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--workspace" || a === "-w") {
      if (!args[i + 1]) {
        return {
          error: "gcp brain ontology compile: --workspace requires a name."
        };
      }
      workspaceName = slugifyWorkspace(args[++i]);
      continue;
    }
    if (a === "--db") {
      if (!args[i + 1]) {
        return {
          error: "gcp brain ontology compile: --db requires a path argument."
        };
      }
      sqlitePathFromCli = args[++i];
      continue;
    }
    if (a === "--workspace-id") {
      if (!args[i + 1]) {
        return {
          error: "gcp brain ontology compile: --workspace-id requires an id."
        };
      }
      workspaceId = args[++i];
      continue;
    }
    if (a === "--ontology-id") {
      if (!args[i + 1]) {
        return {
          error: "gcp brain ontology compile: --ontology-id requires an id."
        };
      }
      ontologyId = args[++i];
      continue;
    }
    if (a === "--input" || a === "-i") {
      if (!args[i + 1]) {
        return {
          error: "gcp brain ontology compile: --input requires a path."
        };
      }
      inputPath = args[++i];
      continue;
    }
    if (a === "--output" || a === "-o") {
      if (!args[i + 1]) {
        return {
          error: "gcp brain ontology compile: --output requires a path."
        };
      }
      outputPath = args[++i];
      continue;
    }
    if (a === "--ntriples") {
      if (!args[i + 1]) {
        return {
          error: "gcp brain ontology compile: --ntriples requires a path."
        };
      }
      ntriplesPath = args[++i];
      continue;
    }
    if (a === "--import-db") {
      importToDb = true;
      continue;
    }
    if (a === "--force") {
      force = true;
      continue;
    }
    if (a === "--profile") {
      if (!args[i + 1]) {
        return {
          error:
            "gcp brain ontology compile: --profile requires a name (e.g. syndic)."
        };
      }
      profile = args[++i];
      continue;
    }
    return { error: `gcp brain ontology compile: unknown argument "${a}".` };
  }

  if (!workspaceId) {
    return { error: "gcp brain ontology compile: --workspace-id is required." };
  }
  if (!ontologyId) {
    return { error: "gcp brain ontology compile: --ontology-id is required." };
  }
  if (!inputPath) {
    return { error: "gcp brain ontology compile: --input is required." };
  }

  return {
    workspaceName,
    sqlitePathFromCli,
    workspaceId,
    ontologyId,
    inputPath,
    outputPath,
    ntriplesPath,
    importToDb,
    force,
    profile
  };
}

export function parseOntologyExportLinkmlArgs(args) {
  let workspaceName = null;
  let sqlitePathFromCli = null;
  let ontologyId = null;
  let bundlePath = null;
  let outputPath = null;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--workspace" || a === "-w") {
      if (!args[i + 1]) {
        return {
          error:
            "gcp brain ontology export-linkml: --workspace requires a name."
        };
      }
      workspaceName = slugifyWorkspace(args[++i]);
      continue;
    }
    if (a === "--db") {
      if (!args[i + 1]) {
        return {
          error:
            "gcp brain ontology export-linkml: --db requires a path argument."
        };
      }
      sqlitePathFromCli = args[++i];
      continue;
    }
    if (a === "--ontology-id") {
      if (!args[i + 1]) {
        return {
          error:
            "gcp brain ontology export-linkml: --ontology-id requires an id."
        };
      }
      ontologyId = args[++i];
      continue;
    }
    if (a === "--input" || a === "-i") {
      if (!args[i + 1]) {
        return {
          error:
            "gcp brain ontology export-linkml: --input requires a bundle path."
        };
      }
      bundlePath = args[++i];
      continue;
    }
    if (a === "--output" || a === "-o") {
      if (!args[i + 1]) {
        return {
          error: "gcp brain ontology export-linkml: --output requires a path."
        };
      }
      outputPath = args[++i];
      continue;
    }
    return {
      error: `gcp brain ontology export-linkml: unknown argument "${a}".`
    };
  }

  if (!ontologyId) {
    return {
      error: "gcp brain ontology export-linkml: --ontology-id is required."
    };
  }
  if (!bundlePath && !sqlitePathFromCli && !workspaceName) {
    return {
      error:
        "gcp brain ontology export-linkml: provide --input bundle.json, --db, or --workspace."
    };
  }

  return {
    workspaceName,
    sqlitePathFromCli,
    ontologyId,
    bundlePath,
    outputPath
  };
}

export function parseOntologyInspectArgs(args) {
  let url = null;
  let workspaceId = null;
  let ontologyId = null;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--url") {
      if (!args[i + 1]) {
        return { error: "gcp brain ontology inspect: --url requires a value." };
      }
      url = args[++i];
      continue;
    }
    if (a === "--workspace-id") {
      if (!args[i + 1]) {
        return {
          error: "gcp brain ontology inspect: --workspace-id requires an id."
        };
      }
      workspaceId = args[++i];
      continue;
    }
    if (a === "--ontology-id") {
      if (!args[i + 1]) {
        return {
          error: "gcp brain ontology inspect: --ontology-id requires an id."
        };
      }
      ontologyId = args[++i];
      continue;
    }
    return { error: `gcp brain ontology inspect: unknown argument "${a}".` };
  }

  if (!ontologyId) {
    return { error: "gcp brain ontology inspect: --ontology-id is required." };
  }

  return {
    url,
    workspaceId,
    ontologyId
  };
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

export function resolveMindbrainUrl(urlFromCli = null) {
  const candidate =
    urlFromCli?.trim() || process.env.GHOSTCRAB_MINDBRAIN_URL?.trim();
  return (candidate || "http://127.0.0.1:8091").replace(/\/$/, "");
}

export function buildOntologyInspectUrl(baseUrl, parsed) {
  const url = new URL("/api/mindbrain/ontology/inspect", `${baseUrl}/`);
  url.searchParams.set("ontology_id", parsed.ontologyId);
  if (parsed.workspaceId) {
    url.searchParams.set("workspace_id", parsed.workspaceId);
  }
  return url;
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
       gcp brain ontology compile --workspace-id <id> --ontology-id <id> --input <schema.yaml>
                                  [--output <slice.json>] [--ntriples <file.nt>]
                                  [--import-db] [--workspace <name>] [--db <path>]
       gcp brain ontology export-linkml --ontology-id <id>
                                        (--input <bundle.json> | --db <path> | --workspace <name>)
                                        [--output <schema.yaml>]
       gcp brain ontology inspect --ontology-id <id> [--workspace-id <id>] [--url <backend>]

  Import/export normalized OWL2/RDF N-Triples through the native MindBrain ontology importer.
  compile/export-linkml convert between LinkML YAML and GhostCrab native ontology tables.
  inspect reads the native ontology_* view from the running MindBrain HTTP backend.

Examples:
  gcp brain ontology compile --workspace-id immeuble-demo --ontology-id immeuble-demo::core \\
    --input ontologies/immeuble-demo/core.yaml --output /tmp/ontology-slice.json
  gcp brain ontology export-linkml --ontology-id immeuble-demo::core \\
    --input examples/immeuble-demo/bundle.json --output /tmp/exported.yaml
  gcp brain ontology inspect --ontology-id immeuble-demo::core --workspace-id immeuble-demo
`.trim()
  );
}

export const __private__ = {
  buildOntologyCompileLinkmlEngineArgs,
  buildOntologyExportEngineArgs,
  buildOntologyExportLinkmlEngineArgs,
  buildOntologyImportEngineArgs,
  buildOntologyInspectUrl,
  parseOntologyCompileArgs,
  parseOntologyExportArgs,
  parseOntologyExportLinkmlArgs,
  parseOntologyImportArgs,
  parseOntologyInspectArgs,
  resolveMindbrainUrl
};
