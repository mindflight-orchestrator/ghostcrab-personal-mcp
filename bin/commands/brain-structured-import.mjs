/**
 * gcp brain structured-import — tabular data import (ghostcrab-document / Zig).
 * Stop MCP / ghostcrab-backend before database-backed commands unless --force.
 */

import { basename, dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
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

  if (sub === "kit") {
    const kitParsed = parseStructuredImportKitArgs(forward.slice(1));
    if (kitParsed.error) {
      console.error(kitParsed.error);
      process.exit(1);
    }
    if (kitParsed.apply) {
      await preflightBrainDatabaseOrExit(sqlitePathResolved, force);
    }
    await runStructuredImportKit(kitParsed, sqlitePathResolved);
    return;
  }

  if (subcommandUsesDatabase(sub)) {
    await preflightBrainDatabaseOrExit(sqlitePathResolved, force);
  }

  const childArgs = buildStructuredImportEngineArgs(
    sub,
    `structured-import-${sub}`,
    forward.slice(1),
    sqlitePathResolved
  );
  runNativeEngineOrExit(pkgRoot, childArgs, { preferDev: true });
}

/**
 * @param {string[]} args
 */
async function runStructuredImportKit(parsed, sqlitePathResolved) {
  const runDir = ensureRunDir(parsed.outputDir);

  if (parsed.expectTaxonomies.length) {
    validateExpectedTaxonomies(parsed.mapping, parsed.expectTaxonomies);
  }

  if (parsed.input) {
    const files = collectSourceFiles(parsed.input);
    if (!files.length) {
      console.error(
        `gcp brain structured-import kit: no supported CSV/JSON/JSONL source files found in ${parsed.input}`
      );
      process.exit(1);
    }

    const profilePaths = [];
    const transformReportPaths = [];
    const mappingValidationPaths = [];
    const recordsParts = [];
    const edgesParts = [];

    for (const sourceFile of files) {
      const stem = sanitizeStem(sourceFile);
      const profileOut = join(runDir, `${stem}.source.profile.json`);
      runKitScript("profile_source", parsed.starterkitRoot, {
        input: sourceFile,
        workspace: parsed.workspaceId,
        kind: parsed.sourceKind,
        delimiter: parsed.delimiter,
        output: profileOut
      });
      profilePaths.push(profileOut);

      if (!parsed.skipProfileValidation) {
        const validateOut = join(runDir, `${stem}.mapping.validation.json`);
        runKitScript("validate_mapping_contract", parsed.starterkitRoot, {
          mapping: parsed.mapping,
          "source-profile": profileOut,
          model: parsed.model ?? undefined,
          output: validateOut
        });
        mappingValidationPaths.push(validateOut);
        parsed.mappingReport = parsed.mappingReport || validateOut;
      }

      const transformedRecords = join(
        runDir,
        `${stem}.normalized_records.jsonl`
      );
      const transformedEdges = join(runDir, `${stem}.normalized_edges.jsonl`);
      const transformOut = join(runDir, `${stem}.transform.report.json`);
      runKitScript("transform_source_to_jsonb", parsed.starterkitRoot, {
        input: sourceFile,
        workspace: parsed.workspaceId,
        "mapping-json": parsed.mapping,
        kind: parsed.sourceKind,
        delimiter: parsed.delimiter,
        "output-records": transformedRecords,
        "output-edges": transformedEdges,
        report: transformOut
      });
      transformReportPaths.push(transformOut);
      recordsParts.push(transformedRecords);
      edgesParts.push(transformedEdges);
    }

    const recordsAll = join(runDir, "normalized_records.jsonl");
    const edgesAll = join(runDir, "normalized_edges.jsonl");
    concatJsonlFiles(recordsParts, recordsAll);
    concatJsonlFiles(edgesParts, edgesAll);

    runKitScript("import_facets", parsed.starterkitRoot, {
      records: recordsAll,
      workspace: parsed.workspaceId,
      output: join(runDir, "import_facets.jsonl"),
      report: join(runDir, "import_facets.report.json")
    });

    runKitScript(
      "materialize_graph_from_edges",
      parsed.starterkitRoot,
      {
        records: recordsAll,
        edges: edgesAll,
        workspace: parsed.workspaceId,
        "output-nodes": join(runDir, "graph_nodes.jsonl"),
        "output-edges": join(runDir, "graph_edges.jsonl"),
        report: join(runDir, "materialize_graph.report.json")
      },
      { allowUnresolvedGraph: true }
    );

    runKitScript("write_pending_files", parsed.starterkitRoot, {
      "transform-report": transformReportPaths[0],
      "graph-report": join(runDir, "materialize_graph.report.json"),
      "pending-review": join(runDir, "pending_review.json"),
      "pending-ddl": join(runDir, "pending_ddl.json")
    });

    runKitScript(
      "audit_import_pipeline",
      parsed.starterkitRoot,
      {
        "profile-report": profilePaths[0],
        "mapping-report":
          parsed.mappingReport ??
          mappingValidationPaths[0] ??
          join(
            runDir,
            `${sanitizeStem(parsed.mapping)}.mapping.validation.json`
          ),
        "transform-report": transformReportPaths[0],
        "pending-report": join(runDir, "pending_review.json"),
        "facet-report": join(runDir, "import_facets.report.json"),
        "graph-report": join(runDir, "materialize_graph.report.json"),
        output: join(runDir, "pipeline_audit.json")
      },
      { allowUnresolvedGraphAuditOnly: true }
    );

    const facetsCsv = join(runDir, "mfo_facets_import.csv");
    const edgesCsv = join(runDir, "graph_edges_import.csv");
    convertNormalizedRecordsToImportCsv(
      recordsAll,
      edgesAll,
      parsed.workspaceId,
      facetsCsv,
      edgesCsv
    );

    parsed.generatedFacets = facetsCsv;
    if (existsSync(facetsCsv)) {
      parsed.facets = parsed.facets || facetsCsv;
    }
    if (existsSync(edgesCsv)) {
      parsed.edges = parsed.edges || edgesCsv;
    }
  }

  if (!parsed.facets) {
    console.error(
      "gcp brain structured-import kit: no facets CSV produced and none provided."
    );
    console.error(
      "  Provide --facets or use --input with source files and a mapping contract."
    );
    process.exit(1);
  }

  if (!parsed.apply) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          runDir,
          facets: parsed.facets,
          edges: parsed.edges || null
        },
        null,
        2
      )
    );
    return;
  }

  if (!parsed.model) {
    console.error(
      "gcp brain structured-import kit --apply: --model is required for register-semantics."
    );
    process.exit(1);
  }

  runNativeStructuredImport(
    "register-semantics",
    [
      "--workspace-id",
      parsed.workspaceId,
      "--model",
      parsed.model,
      "--mapping",
      parsed.mapping
    ],
    sqlitePathResolved
  );

  const baseApplyArgs = [
    "--workspace-id",
    parsed.workspaceId,
    "--mode",
    parsed.mode,
    "--mapping",
    parsed.mapping
  ];

  if (parsed.entitiesFirst) {
    runNativeStructuredImport(
      "apply",
      [...baseApplyArgs, "--facets", parsed.facets],
      sqlitePathResolved
    );
    if (parsed.edges && csvHasDataRows(parsed.edges)) {
      runNativeStructuredImport(
        "apply",
        [...baseApplyArgs, "--facets", parsed.facets, "--edges", parsed.edges],
        sqlitePathResolved
      );
    } else if (parsed.edges) {
      console.log(
        `gcp brain structured-import kit: skipping edges apply for ${parsed.edges} (no data rows).`
      );
    }
  } else {
    const applyArgs = [...baseApplyArgs, "--facets", parsed.facets];
    if (parsed.edges && csvHasDataRows(parsed.edges)) {
      applyArgs.push("--edges", parsed.edges);
    } else if (parsed.edges) {
      console.log(
        `gcp brain structured-import kit: skipping edges apply for ${parsed.edges} (no data rows).`
      );
    }
    runNativeStructuredImport("apply", applyArgs, sqlitePathResolved);
  }

  if (parsed.reindex) {
    runNativeStructuredImport(
      "reindex",
      ["--workspace-id", parsed.workspaceId, "--scope", parsed.reindexScope],
      sqlitePathResolved
    );
    runNativeStructuredImport(
      "validate-provenance",
      ["--workspace-id", parsed.workspaceId],
      sqlitePathResolved
    );
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        runDir,
        facets: parsed.facets,
        edges: parsed.edges || null,
        applied: true
      },
      null,
      2
    )
  );
}

function runNativeStructuredImport(sub, args, sqlitePathResolved) {
  const childArgs = [
    `structured-import-${sub}`,
    "--db",
    sqlitePathResolved,
    ...args
  ];
  runNativeEngineOrExit(pkgRoot, childArgs, { preferDev: true });
}

function ensureRunDir(outputDir) {
  if (outputDir) {
    mkdirSync(outputDir, { recursive: true });
    return outputDir;
  }
  const runDir = mkdtempSync(join(tmpdir(), "gcp-structured-import-kit-"));
  mkdirSync(runDir, { recursive: true });
  return runDir;
}

function runKitScript(scriptName, starterkitRoot, options, policy = {}) {
  const script = join(starterkitRoot, "scripts", `${scriptName}.mjs`);
  if (!existsSync(script)) {
    console.error(`gcp brain structured-import kit: missing script ${script}`);
    process.exit(1);
  }
  const scriptArgs = optionsToArgs(options);
  const r = spawnSync(process.execPath, [script, ...scriptArgs], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"]
  });
  if (r.status !== 0) {
    if (
      policy.allowUnresolvedGraph &&
      isMaterializeGraphTolerableFailure(scriptName, options.report)
    ) {
      console.error(
        `gcp brain structured-import kit: ${scriptName} returned warnings only. Continuing.`
      );
      return;
    }
    if (
      policy.allowUnresolvedGraphAuditOnly &&
      isAuditGraphTolerableFailure(scriptName, options.output)
    ) {
      console.error(
        `gcp brain structured-import kit: ${scriptName} has unresolved-graph findings only. Continuing.`
      );
      return;
    }
    console.error(r.stdout || "");
    console.error(r.stderr || "");
    process.exit(r.status || 1);
  }
}

function isMaterializeGraphTolerableFailure(scriptName, reportPath) {
  if (
    scriptName !== "materialize_graph_from_edges" ||
    !reportPath ||
    !existsSync(reportPath)
  ) {
    return false;
  }

  try {
    const raw = readFileSync(reportPath, "utf8");
    const report = JSON.parse(raw);
    const unresolved =
      Array.isArray(report.unresolved_edges) &&
      report.unresolved_edges.length > 0;
    const hasErrors =
      (Array.isArray(report.errors) && report.errors.length > 0) ||
      (Array.isArray(report.failed) && report.failed.length > 0);
    if (!unresolved || hasErrors) {
      return false;
    }
    const unresolvedCount = report.counts?.unresolved_edges;
    return (
      unresolvedCount === undefined ||
      unresolvedCount === report.unresolved_edges.length
    );
  } catch {
    return false;
  }
}

function isAuditGraphTolerableFailure(scriptName, reportPath) {
  if (
    scriptName !== "audit_import_pipeline" ||
    !reportPath ||
    !existsSync(reportPath)
  ) {
    return false;
  }

  try {
    const raw = readFileSync(reportPath, "utf8");
    const report = JSON.parse(raw);
    const failed = Array.isArray(report.failed_reports)
      ? report.failed_reports
      : [];
    if (!report || report.ok !== false || failed.length !== 1) {
      return false;
    }
    if (failed[0]?.name !== "graph") {
      return false;
    }
    const unresolved = Array.isArray(report.reports?.graph?.unresolved_edges)
      ? report.reports.graph.unresolved_edges
      : null;
    const failedEdges = Array.isArray(failed[0]?.errors)
      ? failed[0].errors
      : null;
    return (
      Array.isArray(unresolved) &&
      Array.isArray(failedEdges) &&
      unresolved.length > 0 &&
      failedEdges.length === unresolved.length
    );
  } catch {
    return false;
  }
}

function optionsToArgs(options) {
  const out = [];
  for (const [k, v] of Object.entries(options)) {
    if (v === undefined || v === null || v === false) continue;
    if (v === true) {
      out.push(`--${k}`);
    } else {
      out.push(`--${k}`, String(v));
    }
  }
  return out;
}

function concatJsonlFiles(inputs, output) {
  const lines = [];
  for (const p of inputs) {
    if (!existsSync(p)) continue;
    const raw = readFileSync(p, "utf8").trim();
    if (!raw) continue;
    lines.push(raw);
  }
  writeFileSync(output, lines.length ? `${lines.join("\n")}\n` : "", "utf8");
}

function readJsonl(filePath) {
  if (!existsSync(filePath)) return [];
  return readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function csvHasDataRows(path) {
  if (!existsSync(path)) {
    return false;
  }
  const raw = readFileSync(path, "utf8").trim();
  if (!raw) {
    return false;
  }
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.length > 1;
}

function convertNormalizedRecordsToImportCsv(
  recordsPath,
  edgesPath,
  workspaceId,
  facetsOut,
  edgesOut
) {
  const records = readJsonl(recordsPath);
  const facetHeader = [
    "content",
    "facets",
    "schema_id",
    "source_ref",
    "workspace_id"
  ];
  const facetRows = records
    .map((row) => {
      if (!row || !row.schema_id) return null;
      const facets = { ...(row.facets || {}) };
      if (!facets.record_id) {
        facets.record_id = row.facets?.record_id || row.source_ref || "";
      }
      return [
        csvEscape(String(row.content ?? "")),
        csvEscape(JSON.stringify(facets)),
        csvEscape(String(row.schema_id)),
        csvEscape(String(row.source_ref ?? row.facets?.record_id ?? "")),
        csvEscape(String(workspaceId))
      ].join(",");
    })
    .filter(Boolean);
  writeFileSync(
    facetsOut,
    `${facetHeader.join(",")}\n${facetRows.join("\n")}\n`,
    "utf8"
  );

  const edges = readJsonl(edgesPath);
  const edgeHeader = [
    "confidence",
    "label",
    "metadata_json",
    "source",
    "target",
    "workspace_id"
  ];
  const edgeRows = edges
    .map((row) => {
      if (!row || !row.source || !row.target || !row.label) return null;
      const metadata = row.metadata_json || row.metadata || {};
      return [
        csvEscape(String(row.confidence ?? 1)),
        csvEscape(String(row.label)),
        csvEscape(JSON.stringify(metadata)),
        csvEscape(String(row.source)),
        csvEscape(String(row.target)),
        csvEscape(String(workspaceId))
      ].join(",");
    })
    .filter(Boolean);
  writeFileSync(
    edgesOut,
    `${edgeHeader.join(",")}\n${edgeRows.join("\n")}\n`,
    "utf8"
  );
}

function validateExpectedTaxonomies(mappingPath, expectTaxonomies) {
  if (!expectTaxonomies.length) return;
  const mappingText = readFileSync(mappingPath, "utf8");
  const missing = expectTaxonomies.filter(
    (name) => !mappingText.includes(name)
  );
  if (missing.length) {
    console.error(
      `gcp brain structured-import kit: expected taxonomies missing from mapping: ${missing.join(", ")}`
    );
    process.exit(1);
  }
}

function collectSourceFiles(inputPath) {
  const out = [];
  const allowed = new Set([".csv", ".json", ".jsonl", ".ndjson"]);
  const walk = (entry) => {
    if (!existsSync(entry)) return;
    const stats = statSync(entry);
    if (stats.isFile()) {
      if (allowed.has(extname(entry).toLowerCase())) out.push(entry);
      return;
    }
    if (stats.isDirectory()) {
      for (const child of readdirSync(entry)) {
        walk(join(entry, child));
      }
    }
  };
  walk(inputPath);
  out.sort();
  return out;
}

function sanitizeStem(filePath) {
  return basename(filePath)
    .replace(/\.[^/.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_");
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

/**
 * @param {string} subcommand
 */
function buildStructuredImportEngineArgs(
  subcommand,
  engineSub,
  rest,
  sqlitePathResolved
) {
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
        return {
          error: "gcp brain structured-import: --workspace requires a name."
        };
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
        return {
          error: "gcp brain structured-import: --db requires a path argument."
        };
      }
      sqlitePathFromCli = args[++i];
      continue;
    }
    forward.push(a);
  }
  return { workspaceName, sqlitePathFromCli, force, forward };
}

function parseStructuredImportKitArgs(args) {
  let workspaceId = null;
  let input = null;
  let mapping = null;
  let model = null;
  let outputDir = null;
  let starterkitRoot = process.env.GCP_STARTERKIT_ROOT || null;
  let facets = null;
  let edges = null;
  let apply = false;
  let mode = "append";
  let reindex = true;
  let reindexScope = "all";
  let sourceKind = "auto";
  let delimiter = ",";
  let skipProfileValidation = false;
  let mappingReport = null;
  let entitiesFirst = true;
  let expectTaxonomies = [];

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--workspace-id") {
      if (!args[i + 1]) {
        return {
          error:
            "gcp brain structured-import kit: --workspace-id requires a value."
        };
      }
      workspaceId = args[++i];
      continue;
    }
    if (a === "--input") {
      if (!args[i + 1]) {
        return {
          error: "gcp brain structured-import kit: --input requires a path."
        };
      }
      input = args[++i];
      continue;
    }
    if (a === "--mapping") {
      if (!args[i + 1]) {
        return {
          error: "gcp brain structured-import kit: --mapping requires a path."
        };
      }
      mapping = args[++i];
      continue;
    }
    if (a === "--model") {
      if (!args[i + 1]) {
        return {
          error: "gcp brain structured-import kit: --model requires a path."
        };
      }
      model = args[++i];
      continue;
    }
    if (a === "--output-dir") {
      if (!args[i + 1]) {
        return {
          error:
            "gcp brain structured-import kit: --output-dir requires a path."
        };
      }
      outputDir = args[++i];
      continue;
    }
    if (a === "--starterkit-root") {
      if (!args[i + 1]) {
        return {
          error:
            "gcp brain structured-import kit: --starterkit-root requires a path."
        };
      }
      starterkitRoot = args[++i];
      continue;
    }
    if (a === "--facets") {
      if (!args[i + 1]) {
        return {
          error: "gcp brain structured-import kit: --facets requires a path."
        };
      }
      facets = args[++i];
      continue;
    }
    if (a === "--edges") {
      if (!args[i + 1]) {
        return {
          error: "gcp brain structured-import kit: --edges requires a path."
        };
      }
      edges = args[++i];
      continue;
    }
    if (a === "--source-kind") {
      if (!args[i + 1]) {
        return {
          error:
            "gcp brain structured-import kit: --source-kind requires value."
        };
      }
      sourceKind = args[++i];
      continue;
    }
    if (a === "--delimiter") {
      if (!args[i + 1]) {
        return {
          error: "gcp brain structured-import kit: --delimiter requires value."
        };
      }
      delimiter = args[++i];
      continue;
    }
    if (a === "--mode") {
      if (!args[i + 1]) {
        return {
          error: "gcp brain structured-import kit: --mode requires a value."
        };
      }
      mode = args[++i];
      continue;
    }
    if (a === "--reindex-scope") {
      if (!args[i + 1]) {
        return {
          error:
            "gcp brain structured-import kit: --reindex-scope requires a value."
        };
      }
      reindexScope = args[++i];
      continue;
    }
    if (a === "--mapping-report") {
      if (!args[i + 1]) {
        return {
          error:
            "gcp brain structured-import kit: --mapping-report requires a path."
        };
      }
      mappingReport = args[++i];
      continue;
    }
    if (a === "--skip-profile-validation") {
      skipProfileValidation = true;
      continue;
    }
    if (a === "--no-edges-first") {
      entitiesFirst = false;
      continue;
    }
    if (a === "--expect-taxonomy") {
      if (!args[i + 1]) {
        return {
          error:
            "gcp brain structured-import kit: --expect-taxonomy requires a comma-separated list."
        };
      }
      expectTaxonomies = args[++i]
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      continue;
    }
    if (a === "--apply") {
      apply = true;
      continue;
    }
    if (a === "--no-reindex") {
      reindex = false;
      continue;
    }
    if (a === "--help" || a === "-h") {
      printStructuredImportHelp();
      process.exit(0);
    }
    return {
      error: `gcp brain structured-import kit: unknown argument "${a}".`
    };
  }

  if (!workspaceId) {
    return {
      error: "gcp brain structured-import kit: --workspace-id is required."
    };
  }
  if (!mapping) {
    return { error: "gcp brain structured-import kit: --mapping is required." };
  }
  if (!starterkitRoot) {
    return {
      error:
        "gcp brain structured-import kit: --starterkit-root is required unless --facets is provided without source processing."
    };
  }

  return {
    workspaceId,
    input,
    mapping,
    model,
    outputDir,
    starterkitRoot,
    facets,
    edges,
    apply,
    mode,
    reindex,
    reindexScope,
    sourceKind,
    delimiter,
    skipProfileValidation,
    entitiesFirst,
    mappingReport,
    expectTaxonomies
  };
}

function printStructuredImportHelp() {
  console.log(
    `
Usage: gcp brain structured-import [--workspace <name>] [--db <path>] [--force] <subcommand> [...]

Tabular structured import (CSV, JSON, JSONL, YAML, XLSX, TOON) into MindBrain SQLite.
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
  kit                   StarterKit bridge: normalize CSV/JSON/JSONL source, validate contracts, produce artifacts, optional apply

Examples:
  gcp brain structured-import kit --workspace-id immeuble-structured-import \
    --input examples/immeuble/structured-import/fake_data \
    --mapping examples/immeuble/structured-import/contracts/mapping_external_to_canonical.json \
    --model examples/immeuble/structured-import/contracts/immeuble_structured_import_model.json \
    --starterkit-root /path/to/starter-kit-ghostcrab-perso/starterkit \
    --apply

  gcp brain structured-import apply \
    --workspace-id immeuble-structured-import \
    --mode append \
    --mapping examples/immeuble/structured-import/contracts/mapping_external_to_canonical.json \
    --facets examples/immeuble/structured-import/fixtures/import_ready/mfo_facets_import.csv \
    --edges examples/immeuble/structured-import/fixtures/import_ready/graph_edges_import.csv
`.trim()
  );
}

export const __private__ = {
  parseStructuredImportArgs,
  buildStructuredImportEngineArgs,
  subcommandUsesDatabase,
  parseStructuredImportKitArgs
};
