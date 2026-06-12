#!/usr/bin/env node
/**
 * Generic structured-import system runner.
 *
 * Input: YAML/JSON manifest describing source/mapping/ontology + import options.
 * Output: prints a compact JSON summary and the underlying gcp CLI line by line.
 */

import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { dirname, isAbsolute, join, normalize, resolve as resolvePath } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { parse as parseYaml } from "yaml";

const pkgRoot = resolvePath(dirname(fileURLToPath(import.meta.url)), "..");
const gcp = join(pkgRoot, "bin", "gcp.mjs");

const args = process.argv.slice(2);
let manifestPath = null;
let apply = false;
let extraWorkspace = null;
let dbPath = null;
let skipPreflight = null;
let engine = "legacy";
let compareOutputPath = null;

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--manifest" || a === "-m") {
    manifestPath = args[++i];
    continue;
  }
  if (a === "--apply") {
    apply = true;
    continue;
  }
  if (a === "--workspace-id") {
    extraWorkspace = args[++i];
    continue;
  }
  if (a === "--db") {
    dbPath = args[++i];
    continue;
  }
  if (a === "--engine") {
    engine = args[++i] ?? "legacy";
    continue;
  }
  if (a === "--compare-output") {
    compareOutputPath = args[++i];
    continue;
  }
  if (a === "--skip-preflight" || a === "--no-preflight") {
    skipPreflight = true;
    continue;
  }
  if (a === "--preflight") {
    skipPreflight = false;
    continue;
  }
  if (a === "--help" || a === "-h") {
    printHelp();
    process.exit(0);
  }
  console.error(`run-structured-import-system: unknown argument "${a}"`);
  process.exit(1);
}

if (!manifestPath) {
  console.error("run-structured-import-system: --manifest is required.");
  printHelp();
  process.exit(1);
}

if (!"legacy|hybrid|both".split("|").includes(engine)) {
  console.error(`run-structured-import-system: unknown --engine "${engine}".`);
  console.error("run-structured-import-system: allowed engines are legacy, hybrid, both.");
  process.exit(1);
}

const manifest = loadManifest(manifestPath);
if (!manifest) {
  process.exit(1);
}

if (!manifest.ontology_model && manifest.import?.preflight_validate !== false) {
  manifest.import = manifest.import || {};
  manifest.import.preflight_validate = false;
}
if (skipPreflight !== null) {
  manifest.import = manifest.import || {};
  manifest.import.preflight_validate = !skipPreflight;
}
if (apply && !manifest.ontology_model) {
  console.error("run-structured-import-system: --apply requires ontology.model in manifest.");
  process.exit(1);
}
runPipeline();

function loadManifest(path) {
  if (!existsSync(path)) {
    console.error(`run-structured-import-system: manifest not found: ${path}`);
    return null;
  }
  const raw = readFileSync(path, "utf8");
  const baseDir = dirname(resolvePath(path));
  let parsed;

  if (path.endsWith(".json")) {
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      console.error(`run-structured-import-system: invalid JSON (${error.message})`);
      return null;
    }
  } else {
    try {
      parsed = parseYaml(raw);
    } catch (error) {
      console.error(`run-structured-import-system: invalid YAML (${error.message})`);
      return null;
    }
  }

  const workspaceId = extraWorkspace || parsed.workspace_id || parsed.workspace;
  if (!workspaceId) {
    console.error("run-structured-import-system: manifest requires workspace_id.");
    return null;
  }

  const mappingPath = resolveOptionalPath(parsed, "mapping.file", baseDir);
  if (!mappingPath) {
    console.error("run-structured-import-system: manifest requires mapping.file");
    return null;
  }

  const sourceInput = resolveOptionalPath(parsed, "source.input", baseDir);
  if (!sourceInput) {
    console.error("run-structured-import-system: manifest requires source.input");
    return null;
  }

  const sourceRoot = resolveSourceRoot(sourceInput);
  const modelPath = resolveOptionalPath(parsed, "ontology.model", baseDir, { mustExist: false });
  const mappingWorkspace = getDeclaredWorkspaceId(mappingPath);
  const mappingMeta = readMappingMeta(mappingPath);
  let preflightValidate = manifestImportBoolean(parsed.import?.preflight_validate, true);

  if (mappingWorkspace && mappingWorkspace !== workspaceId) {
    console.error(
      `run-structured-import-system: workspace mismatch (manifest=${workspaceId}, mapping=${mappingWorkspace}).`
    );
    console.error(
      "run-structured-import-system: legacy mappings often require matching ids; skipping preflight validation unless import.allow_workspace_mismatch is enabled."
    );
    if (!manifestImportBoolean(parsed.import?.allow_workspace_mismatch, false)) {
      preflightValidate = false;
    }
  }

  if (!modelPath) {
    preflightValidate = false;
  }
  if (skipPreflight === true) {
    preflightValidate = false;
  }
  if (skipPreflight === false) {
    preflightValidate = true;
  }

  const outDir =
    resolveOptionalPath(parsed, "import.output_dir", baseDir, { mustExist: false }) ||
    parsed.output_dir ||
    null;

  return {
    ...parsed,
    __baseDir: baseDir,
    workspace_id: workspaceId,
    mapping_file: mappingPath,
    source_input: sourceInput,
    source_root: sourceRoot,
    ontology_model: modelPath,
    declared_mapping_workspace_id: mappingWorkspace,
    mapping_meta: mappingMeta,
    import: {
      ...parsed.import,
      preflight_validate: preflightValidate
    },
    starterkit_root: resolveOptionalPath(parsed, "starterkit_root", baseDir) || process.env.GCP_STARTERKIT_ROOT,
    output_dir: outDir,
    source_kind: parsed.source?.kind || "auto",
    delimiter: parsed.source?.delimiter || ",",
    mode: parsed.import?.mode || "append",
    skip_profile_validation: Boolean(parsed.import?.skip_profile_validation),
    reindex: parsed.import?.reindex?.enabled !== false,
    reindex_scope: parsed.import?.reindex?.scope || "all"
  };
}

function resolveOptionalPath(obj, path, baseDir, options = { mustExist: true }) {
  const parts = path.split(".");
  let cursor = obj;
  for (const p of parts) {
    if (!cursor || typeof cursor !== "object" || !(p in cursor)) return null;
    cursor = cursor[p];
  }
  if (typeof cursor !== "string" || !cursor.trim()) return null;
  if (isAbsolute(cursor)) {
    return normalize(cursor);
  }
  const candidates = [
    resolvePath(baseDir, cursor),
    resolvePath(pkgRoot, cursor),
    resolvePath(process.cwd(), cursor)
  ].filter((p, i, all) => all.indexOf(p) === i);
  const existing = candidates.find((candidate) => existsSync(candidate));
  if (!existing && options.mustExist) {
    return null;
  }
  return normalize(existing ?? candidates[0]);
}

function resolveSourceRoot(rawSourceInput) {
  try {
    if (statSync(rawSourceInput).isDirectory()) {
      return normalize(rawSourceInput);
    }
    return normalize(dirname(rawSourceInput));
  } catch {
    return normalize(dirname(rawSourceInput));
  }
}

function resolveMappingArtifactPath(sourceRoot, mappingRoot, manifestSourcePath, relPath) {
  if (!relPath) return null;
  if (isAbsolute(relPath)) {
    return normalize(relPath);
  }
  const candidates = [
    resolvePath(sourceRoot, relPath),
    resolvePath(mappingRoot, relPath),
    resolvePath(mappingRoot, "fixtures", relPath),
    resolvePath(mappingRoot, "..", "fixtures", relPath),
    resolvePath(dirname(manifestSourcePath), relPath)
  ];
  const existing = candidates.find((candidate) => existsSync(candidate));
  return normalize(existing ?? candidates[0]);
}

function getDeclaredWorkspaceId(mappingPath) {
  if (!mappingPath || !existsSync(mappingPath)) {
    return null;
  }
  try {
    const raw = readFileSync(mappingPath, "utf8");
    const payload = parseStructuredFile(raw, mappingPath);
    return typeof payload?.workspace_id === "string" && payload.workspace_id.trim()
      ? payload.workspace_id.trim()
      : null;
  } catch {
    return null;
  }
}

function readMappingMeta(mappingPath) {
  if (!mappingPath || !existsSync(mappingPath)) {
    return { import_ready: null, data_plane: null, supports_project: false };
  }
  try {
    const payload = parseStructuredFile(readFileSync(mappingPath, "utf8"), mappingPath);
    if (!payload || typeof payload !== "object") {
      return { import_ready: null, data_plane: null, supports_project: false };
    }
    const importReady = payload?.import_ready;
    const facetsCsv = importReady && typeof importReady.facets_csv === "string" ? importReady.facets_csv : null;
    const edgesCsv = importReady && typeof importReady.edges_csv === "string" ? importReady.edges_csv : null;
    const dataPlane = typeof payload?.data_plane === "string" ? payload.data_plane : null;
    return {
      import_ready: facetsCsv || edgesCsv ? { facets_csv: facetsCsv, edges_csv: edgesCsv } : null,
      data_plane: dataPlane,
      supports_project: Boolean(facetsCsv || edgesCsv || dataPlane === "ws")
    };
  } catch {
    return { import_ready: null, data_plane: null, supports_project: false };
  }
}

function parseStructuredFile(raw, path) {
  const trimmed = raw.trim();
  if (path.endsWith(".yaml") || path.endsWith(".yml")) {
    return parseYaml(trimmed);
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return parseYaml(trimmed);
  }
}

function manifestImportBoolean(value, fallback) {
  return value === undefined ? fallback : Boolean(value);
}

function runPipeline() {
  if (engine === "both") {
    const runDir = mkdtempSync(join(tmpdir(), "gcp-structured-import-benchmark-"));
    const legacy = runPipelineForEngine({
      mode: "legacy",
      dbPath: resolvePath(runDir, "legacy.sqlite"),
      outputSuffix: "legacy",
      suffixOutput: true
    });
    const hybrid = runPipelineForEngine({
      mode: "hybrid",
      dbPath: resolvePath(runDir, "hybrid.sqlite"),
      outputSuffix: "hybrid",
      suffixOutput: true
    });

    const report = {
      ok: Boolean(legacy.ok && hybrid.ok),
      mode: "both",
      manifest: resolvePath(manifestPath),
      workspace_id: manifest.workspace_id,
      runs: {
        legacy,
        hybrid
      },
      compare: compareSummaries(legacy, hybrid)
    };

    if (compareOutputPath) {
      writeFileSync(compareOutputPath, JSON.stringify(report, null, 2) + "\n", "utf8");
    }

    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) process.exit(1);
    return;
  }

  const result = runPipelineForEngine({
    mode: engine,
    dbPath,
    outputSuffix: engine,
    suffixOutput: engine === "both"
  });

  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(1);
}

function runPipelineForEngine({ mode, dbPath: runDbPath, outputSuffix, suffixOutput = false }) {
  const outputDir = resolveEngineOutputDir(manifest.output_dir, outputSuffix, suffixOutput);
  const manifestRun = {
    ...manifest,
    output_dir: outputDir
  };

  if (manifestRun.import?.preflight_validate !== false && manifestRun.ontology_model) {
    runGcp({
      dbPath: runDbPath,
      commandArgs: [
        "structured-import",
        "validate",
        "--model",
        manifestRun.ontology_model,
        "--mapping",
        manifestRun.mapping_file,
        "--input",
        manifestRun.source_input
      ],
      label: "validate"
    });
  }

  let summary;
  let summaryParsed;
  let fallback = false;

  if (mode === "hybrid" && manifestRun.mapping_meta?.supports_project) {
    summary = runHybrid(manifestRun, runDbPath);
    summaryParsed = parseSummary(summary);

    if (manifestRun.reindex && apply) {
      const reindexSummary = runGcp({
        dbPath: runDbPath,
        commandArgs: [
          "structured-import",
          "reindex",
          "--workspace-id",
          manifestRun.workspace_id,
          "--scope",
          manifestRun.reindex_scope
        ],
        label: "reindex"
      });
      runGcp({
        dbPath: runDbPath,
        commandArgs: ["structured-import", "validate-provenance", "--workspace-id", manifestRun.workspace_id],
        label: "validate-provenance"
      });
      summary = JSON.stringify(
        {
          engine: "hybrid",
          project: summaryParsed,
          reindex: parseSummary(reindexSummary)
        },
        null,
        2
      );
      summaryParsed = {
        engine: "hybrid",
        project: summaryParsed,
        reindex: parseSummary(reindexSummary)
      };
    }
  } else if (mode === "hybrid" && !manifestRun.mapping_meta?.supports_project) {
    fallback = true;
    summary = runLegacy(manifestRun, runDbPath);
    summaryParsed = parseSummary(summary);
  } else {
    summary = runLegacy(manifestRun, runDbPath);
    summaryParsed = parseSummary(summary);
  }

  return {
    ok: isSummarySuccessful(summaryParsed),
    engine: mode,
    workspace_id: manifestRun.workspace_id,
    manifest: resolvePath(manifestPath),
    phase: apply ? "apply" : "plan",
    output_dir: manifestRun.output_dir,
    db_path: runDbPath,
    summary,
    summary_parsed: summaryParsed,
    fallback_used: fallback
  };
}

function isSummarySuccessful(summaryParsed) {
  if (!summaryParsed || typeof summaryParsed !== "object") {
    return false;
  }
  if (typeof summaryParsed.ok === "boolean") {
    return summaryParsed.ok !== false;
  }
  if (typeof summaryParsed.project?.ok === "boolean") {
    return summaryParsed.project.ok !== false;
  }
  return true;
}

function resolveEngineOutputDir(baseOutputDir, suffix, suffixOutput) {
  if (!suffix || !suffixOutput) {
    return baseOutputDir;
  }
  if (!baseOutputDir) {
    return null;
  }
  return `${baseOutputDir}-${suffix}`;
}

function runLegacy(manifestConfig, runDbPath) {
  const kitArgs = [
    "structured-import",
    "kit",
    "--workspace-id",
    manifestConfig.workspace_id,
    "--input",
    manifestConfig.source_input,
    "--mapping",
    manifestConfig.mapping_file,
    "--starterkit-root",
    manifestConfig.starterkit_root,
    "--source-kind",
    manifestConfig.source_kind,
    "--delimiter",
    manifestConfig.delimiter,
    "--mode",
    manifestConfig.mode
  ];

  if (manifestConfig.output_dir) {
    kitArgs.push("--output-dir", manifestConfig.output_dir);
  }
  if (manifestConfig.skip_profile_validation) {
    kitArgs.push("--skip-profile-validation");
  }
  if (manifestConfig.import?.edges_first === false) {
    kitArgs.push("--no-edges-first");
  }
  if (!manifestConfig.reindex) {
    kitArgs.push("--no-reindex");
  }
  if (manifestConfig.reindex_scope) {
    kitArgs.push("--reindex-scope", manifestConfig.reindex_scope);
  }
  if (manifestConfig.ontology_model && apply) {
    kitArgs.push("--model", manifestConfig.ontology_model);
  }
  if (manifestConfig.expected_taxonomies && manifestConfig.expected_taxonomies.length) {
    kitArgs.push("--expect-taxonomy", manifestConfig.expected_taxonomies.join(","));
  }
  if (apply) {
    kitArgs.push("--apply");
  }

  return runGcp({
    dbPath: runDbPath,
    commandArgs: kitArgs,
    label: "kit"
  });
}

function runHybrid(manifestConfig, runDbPath) {
  const importReady = manifestConfig.mapping_meta?.import_ready || null;

  if (!apply) {
    if (!importReady?.facets_csv) {
      return runLegacy(manifestConfig, runDbPath);
    }

    const dryRunArgs = [
      "structured-import",
      "dry-run",
      "--facets",
      resolveMappingArtifactPath(
        manifestConfig.source_root,
        manifestConfig.__baseDir,
        manifestConfig.source_input,
        importReady.facets_csv
      )
    ];

    const edgesPath =
      resolveMappingArtifactPath(
        manifestConfig.source_root,
        manifestConfig.__baseDir,
        manifestConfig.source_input,
        importReady.edges_csv
      );
    if (edgesPath) {
      dryRunArgs.push("--edges", edgesPath);
    }

    return runGcp({
      dbPath: runDbPath,
      commandArgs: dryRunArgs,
      label: "dry-run"
    });
  }

  return runGcp({
    dbPath: runDbPath,
    commandArgs: [
      "structured-import",
      "project",
      "--workspace-id",
      manifestConfig.workspace_id,
      "--model",
      manifestConfig.ontology_model,
      "--mapping",
      manifestConfig.mapping_file,
      "--input",
      manifestConfig.source_root,
      "--mode",
      manifestConfig.mode
    ],
    label: "project"
  });
}

function runGcp({ commandArgs, label, dbPath }) {
  const cmd = [gcp, ...commandArgs];
  console.log(`run-structured-import-system: gcp ${commandArgs.join(" ")}`);
  const r = spawnSync(process.execPath, cmd, {
    cwd: pkgRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      ...(dbPath ? { GHOSTCRAB_SQLITE_PATH: dbPath } : {})
    }
  });
  if (r.status !== 0) {
    if (r.stdout) {
      console.error(r.stdout);
    }
    if (r.stderr) {
      console.error(r.stderr);
    }
    throw new Error(`run-structured-import-system: gcp ${commandArgs[0]} ${commandArgs[1]} ${label} failed (${r.status})`);
  }
  return (r.stdout || "").trim();
}

function parseSummary(text) {
  if (typeof text !== "string") return null;
  const lines = text.trim().split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line.startsWith("{") || !line.endsWith("}")) {
      continue;
    }
    try {
      return JSON.parse(line);
    } catch {
      // continue
    }
  }
  return null;
}

function compareSummaries(legacy, hybrid) {
  const left = legacy.summary_parsed || {};
  const right = hybrid.summary_parsed || {};
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  const deltas = {};

  for (const key of keys) {
    const a = typeof left[key] === "number" ? left[key] : null;
    const b = typeof right[key] === "number" ? right[key] : null;
    if (typeof a === "number" || typeof b === "number") {
      deltas[key] = { legacy: a, hybrid: b, delta: b === null || a === null ? null : b - a };
    }
  }

  return {
    legacy_summary: left,
    hybrid_summary: right,
    deltas
  };
}

function printHelp() {
  console.log(`
Usage:
  node scripts/run-structured-import-system.mjs \
    --manifest <path-to-yaml-or-json> \
    [--apply] \
    [--engine legacy|hybrid|both] \
    [--compare-output <json-path>] \
    [--workspace-id <override-workspace>] \
    [--db <sqlite-path>] \
    [--skip-preflight|--preflight]

Modes:
  legacy  Use existing StarterKit bridge command (default).
  hybrid  Prefer native structured-import project flow when mapping exposes import_ready.
  both    Run legacy and hybrid on separate temp DBs and compare summaries.

Manifest keys (minimal):
  workspace_id                     MindBrain workspace
  source.input                     Source directory or file (.csv/.json/.jsonl)
  mapping.file                     mapping file
  ontology.model                   Optional for dry-run; required when --apply is used
  starterkit_root                  Path to starter-kit repo (or set GCP_STARTERKIT_ROOT)
  import:
    mode                          append | reset | ignore-duplicates
    preflight_validate             true|false (default: true when ontology.model exists)
    allow_workspace_mismatch       true|false (default: false)
    output_dir                    Optional artifacts directory
    reindex.enabled               default true
    reindex.scope                 all|graph|facets|provenance
  expected_taxonomies             Optional names checked with --expect-taxonomy
`);
}

export { };
