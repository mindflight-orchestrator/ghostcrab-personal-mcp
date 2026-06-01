/**
 * gcp brain structured-import — tabular data import (ghostcrab-document / Zig).
 * Stop MCP / ghostcrab-backend before database-backed subcommands.
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

/** Subcommands that do not require --db injection. */
const SUBCOMMANDS_WITHOUT_DB = new Set([
  "validate",
  "validate-drift",
  "dry-run",
  "profile",
  "infer"
]);

/**
 * @param {string[]} args
 */
export async function cmdBrainStructuredImport(args) {
  if (!args.length || args[0] === "--help" || args[0] === "-h") {
    printStructuredImportHelp();
    return;
  }

  const parsed = parseStructuredImportArgs(args);
  if (parsed.error) {
    console.error(parsed.error);
    process.exit(1);
  }
  const { workspaceName, sqlitePathFromCli, force, forward } = parsed;

  if (!forward.length || forward[0] === "--help" || forward[0] === "-h") {
    printStructuredImportHelp();
    return;
  }

  const sub = forward[0];
  if (sub.startsWith("-")) {
    console.error(
      `gcp brain structured-import: expected a subcommand first (validate, apply, …), got "${sub}".`
    );
    process.exit(1);
  }

  const { sqlitePathResolved } = resolveGhostcrabSqlite({
    workspaceNameFromCli: workspaceName,
    sqlitePathFromCli
  });

  if (subcommandUsesDatabase(sub)) {
    await preflightBrainDatabaseOrExit(sqlitePathResolved, force);
  }

  const engineSub = `structured-import-${sub}`;
  const childArgs = buildStructuredImportEngineArgs(
    sub,
    engineSub,
    forward.slice(1),
    sqlitePathResolved
  );
  runNativeEngineOrExit(pkgRoot, childArgs, { preferDev: true });
}

/**
 * @param {string} subcommand
 * @param {string} engineSub
 * @param {string[]} rest
 * @param {string} sqlitePathResolved
 */
function buildStructuredImportEngineArgs(subcommand, engineSub, rest, sqlitePathResolved) {
  if (!subcommandUsesDatabase(subcommand)) {
    return [engineSub, ...rest];
  }
  return [engineSub, "--db", sqlitePathResolved, ...rest];
}

/**
 * @param {string} subcommand
 */
function subcommandUsesDatabase(subcommand) {
  return !SUBCOMMANDS_WITHOUT_DB.has(subcommand);
}

/**
 * @param {string[]} args
 */
function parseStructuredImportArgs(args) {
  let workspaceName = null;
  let sqlitePathFromCli = null;
  let force = false;
  /** @type {string[]} */
  const forward = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--workspace" || a === "-w") {
      if (!args[i + 1]) {
        return { error: "gcp brain structured-import: --workspace requires a name." };
      }
      workspaceName = slugifyWorkspace(args[++i]);
      continue;
    }
    if (a === "--force") {
      force = true;
      continue;
    }
    if (a === "--db") {
      if (!args[i + 1]) {
        return { error: "gcp brain structured-import: --db requires a path argument." };
      }
      sqlitePathFromCli = args[++i];
      continue;
    }
    forward.push(a);
  }
  return { workspaceName, sqlitePathFromCli, force, forward };
}

function printStructuredImportHelp() {
  console.log(
    `
Usage: gcp brain structured-import [--workspace <name>] [--db <path>] [--force] <subcommand> [...]

  Tabular structured import (CSV/JSON/YAML/XLSX/TOON) into MindBrain SQLite.
  Parsing and DB writes run in the Zig engine (ghostcrab-document); this wrapper
  only resolves paths and spawns the native binary.

  Stop MCP / ghostcrab-backend before database-backed commands unless --force.

Subcommands:
  validate              Validate model + mapping + fixtures (no DB)
  dry-run               Count rows in facet/edge CSVs (no DB)
  infer                 Propose table_semantics JSON from model + mapping (no DB)
  register-semantics    Upsert table/column/relation semantics + source_mappings
  apply                 Load import-ready CSVs into agent_facts + entities_raw/relations_raw
  project               Apply using mapping contract paths
  reindex               Rebuild graph and/or agent_facts FTS (scope graph|facets|all|provenance)
  validate-provenance   Check structured_import_provenance ↔ agent_facts coherence
  validate-drift        Compare observed columns vs model / registered semantics
  audit-orphans         Report import entities without graph edges
  ddl-propose           Generate CREATE TABLE ws_* SQL from table_semantics
  ddl-execute           Apply proposed ws_* DDL SQL
  load-ws               Load mapping CSVs into ws_* staging tables
  profile               Infer column profile from a CSV (no DB)

Examples:
  gcp brain structured-import validate \\
    --model examples/immeuble/structured-import/contracts/immeuble_structured_import_model.json \\
    --mapping examples/immeuble/structured-import/contracts/mapping_external_to_canonical.json \\
    --input examples/immeuble/structured-import/fixtures

  gcp brain structured-import infer \\
    --model examples/immeuble/structured-import/contracts/immeuble_structured_import_model.json \\
    --mapping examples/immeuble/structured-import/contracts/mapping_external_to_canonical.json \\
    --output /tmp/infer.json

  gcp brain structured-import register-semantics \\
    --workspace-id immeuble-structured-import \\
    --model examples/immeuble/structured-import/contracts/immeuble_structured_import_model.json \\
    --mapping examples/immeuble/structured-import/contracts/mapping_external_to_canonical.json

  gcp brain structured-import apply \\
    --workspace-id immeuble-structured-import \\
    --mode append \\
    --mapping examples/immeuble/structured-import/contracts/mapping_external_to_canonical.json \\
    --facets examples/immeuble/structured-import/fixtures/import_ready/mfo_facets_import.csv \\
    --edges examples/immeuble/structured-import/fixtures/import_ready/graph_edges_import.csv

  gcp brain structured-import apply \\
    --workspace-id immeuble-structured-import \\
    --mapping examples/immeuble/structured-import/contracts/mapping_external_to_canonical_ws.json

  gcp brain structured-import reindex --workspace-id immeuble-structured-import --scope all

See docs/setup/structured-import.md and examples/immeuble/structured-import/README.md.
`.trim()
  );
}

export const __private__ = {
  parseStructuredImportArgs,
  buildStructuredImportEngineArgs,
  subcommandUsesDatabase
};
