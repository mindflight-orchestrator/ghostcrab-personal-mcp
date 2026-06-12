#!/usr/bin/env node
/**
 * Generic structured-import system runner.
 *
 * Input: YAML/JSON manifest describing source/mapping/ontology + import options.
 * Output: prints a compact JSON summary and the underlying gcp CLI line by line.
 */

import {
  closeSync,
  existsSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
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
let skipProvenanceValidation = false;
let engine = "legacy";
let compareOutputPath = null;
let forceBackend = false;

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
  if (a === "--skip-provenance-validation" || a === "--no-validate-provenance") {
    skipProvenanceValidation = true;
    continue;
  }
  if (a === "--force") {
    forceBackend = true;
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
  const starterkitRoot = resolveOptionalPath(parsed, "starterkit_root", baseDir)
    || process.env.GCP_STARTERKIT_ROOT
    || resolveDefaultStarterkitRoot(baseDir);

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
      preflight_validate: preflightValidate,
      skip_provenance_validation: skipProvenanceValidation
    },
    starterkit_root: starterkitRoot,
    output_dir: outDir,
    source_kind: parsed.source?.kind || "auto",
    delimiter: parsed.source?.delimiter || ",",
    mode: parsed.import?.mode || "append",
    skip_profile_validation: Boolean(parsed.import?.skip_profile_validation),
    reindex: parsed.import?.reindex?.enabled !== false,
    reindex_scope: parsed.import?.reindex?.scope || "all"
  };
}

function resolveDefaultStarterkitRoot(baseDir) {
  const candidates = [
    resolvePath(pkgRoot, "..", "starter-kit-ghostcrab-perso", "starterkit"),
    resolvePath(baseDir, "..", "..", "starter-kit-ghostcrab-perso", "starterkit")
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
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
    const workspaceAligned =
      !manifestRun.declared_mapping_workspace_id ||
      manifestRun.declared_mapping_workspace_id === manifestRun.workspace_id ||
      manifestRun.import?.allow_workspace_mismatch;

    if (!workspaceAligned) {
      fallback = true;
      summary = runLegacy(manifestRun, runDbPath);
      summaryParsed = parseSummary(summary);
    } else {
      summary = runHybrid(manifestRun, runDbPath);
      summaryParsed = parseSummary(summary);
    }

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
      if (!manifestRun.import?.skip_provenance_validation) {
        runGcp({
          dbPath: runDbPath,
          commandArgs: ["structured-import", "validate-provenance", "--workspace-id", manifestRun.workspace_id],
          label: "validate-provenance"
        });
      }
      summary = JSON.stringify(
        {
          engine: "hybrid",
          project: summaryParsed,
          reindex: parseSummary(reindexSummary),
          provenance_validation_skipped: manifestRun.import?.skip_provenance_validation === true
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
    return true;
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
  const { path: mappingPath, patched: mappingPatched, reason: mappingReason } = buildLegacyCompatibleMapping(
    manifestConfig.mapping_file,
    manifestConfig
  );
  if (mappingPatched) {
    console.log(
      `run-structured-import-system: legacy mapping normalized (reason=${mappingReason}) -> ${mappingPath}`
    );
  }

  const mappingMeta = readLegacyMappingMeta(mappingPath);
  const importReady = mappingMeta.import_ready;

  if (apply && importReady) {
    const facetsCsv = resolveLegacyImportReadyArtifact(
      manifestConfig,
      mappingPath,
      importReady.facets_csv,
      "facets"
    );
    const edgesCsv = importReady.edges_csv
      ? resolveLegacyImportReadyArtifact(
          manifestConfig,
          mappingPath,
          importReady.edges_csv,
          "edges"
        )
      : null;

    return runGcp({
      dbPath: runDbPath,
      commandArgs: [
        "structured-import",
        "apply",
        "--workspace-id",
        manifestConfig.workspace_id,
        "--mode",
        manifestConfig.mode,
        "--mapping",
        mappingPath,
        "--facets",
        facetsCsv,
        ...(edgesCsv ? ["--edges", edgesCsv] : [])
      ],
      label: "apply"
    });
  }

  if (!apply && importReady) {
    const facetsCsv = resolveLegacyImportReadyArtifact(
      manifestConfig,
      mappingPath,
      importReady.facets_csv,
      "facets"
    );
    const edgesCsv = importReady.edges_csv
      ? resolveLegacyImportReadyArtifact(
          manifestConfig,
          mappingPath,
          importReady.edges_csv,
          "edges"
        )
      : null;

    const dryRunArgs = ["structured-import", "dry-run", "--facets", facetsCsv];
    if (edgesCsv) {
      dryRunArgs.push("--edges", edgesCsv);
    }
    return runGcp({
      dbPath: runDbPath,
      commandArgs: dryRunArgs,
      label: "dry-run"
    });
  }

  const kitArgs = [
    "structured-import",
    "kit",
    "--workspace-id",
    manifestConfig.workspace_id,
    "--input",
    manifestConfig.source_input,
    "--mapping",
    mappingPath,
    "--mode",
    manifestConfig.mode
  ];
  if (manifestConfig.starterkit_root) {
    kitArgs.push("--starterkit-root", manifestConfig.starterkit_root);
  }
  if (manifestConfig.source_kind && manifestConfig.source_kind !== "auto") {
    kitArgs.push("--source-kind", manifestConfig.source_kind);
  }
  if (manifestConfig.delimiter && manifestConfig.delimiter !== ",") {
    kitArgs.push("--delimiter", manifestConfig.delimiter);
  }

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

function readLegacyMappingMeta(mappingPath) {
  try {
    const raw = readFileSync(mappingPath, "utf8");
    const parsed = parseStructuredFile(raw, mappingPath);
    const importReady = parsed?.import_ready;
    const facetsCsv =
      importReady && typeof importReady.facets_csv === "string" ? importReady.facets_csv : null;
    const edgesCsv =
      importReady && typeof importReady.edges_csv === "string" ? importReady.edges_csv : null;

    return {
      import_ready: facetsCsv || edgesCsv ? { facets_csv: facetsCsv, edges_csv: edgesCsv } : null,
      mapping_workspace_id: typeof parsed?.workspace_id === "string" ? parsed.workspace_id : null
    };
  } catch {
    return { import_ready: null, mapping_workspace_id: null };
  }
}

function resolveLegacyImportReadyArtifact(manifestConfig, mappingPath, relPath, kind) {
  const sourceWorkspace = manifestConfig.declared_mapping_workspace_id || manifestConfig.workspace_id;
  const targetWorkspace = manifestConfig.workspace_id;
  const resolved = resolveMappingArtifactPath(
    manifestConfig.source_root,
    resolvePath(mappingPath, ".."),
    manifestConfig.source_input,
    relPath
  );
  if (!sourceWorkspace || sourceWorkspace === targetWorkspace) {
    return resolved;
  }
  return normalizeLegacyImportReadyCsv(resolved, kind, sourceWorkspace, targetWorkspace);
}

function normalizeLegacyImportReadyCsv(filePath, kind, sourceWorkspace, targetWorkspace) {
  if (!existsSync(filePath)) {
    return filePath;
  }
  if (!sourceWorkspace || sourceWorkspace === targetWorkspace) {
    return filePath;
  }

  const { headers, rows } = parseCsvStrict(readFileSync(filePath, "utf8"));
  if (!headers.length) {
    return filePath;
  }

  const workspaceIndex = headers.indexOf("workspace_id");
  const schemaIdIndex = headers.indexOf("schema_id");
  const sourceIndex = headers.indexOf("source");
  const targetIndex = headers.indexOf("target");
  const sourceRefIndex = headers.indexOf("source_ref");
  const facetsIndex = headers.indexOf("facets");
  const outputPath = mkdtempSync(join(tmpdir(), "gcp-structured-import-legacy-import-ready-"));

  const normalizedRows = rows.map((row) => {
    if (workspaceIndex !== -1 && row[workspaceIndex] === sourceWorkspace) {
      row[workspaceIndex] = targetWorkspace;
    }
    if (schemaIdIndex !== -1 && row[schemaIdIndex]) {
      row[schemaIdIndex] = normalizeLegacySchemaId(row[schemaIdIndex], sourceWorkspace, targetWorkspace);
    }
    if (sourceRefIndex !== -1 && row[sourceRefIndex]) {
      row[sourceRefIndex] = normalizeLegacyEntityRef(row[sourceRefIndex], sourceWorkspace, targetWorkspace);
    }
    if (sourceIndex !== -1 && row[sourceIndex]) {
      row[sourceIndex] = normalizeLegacyEntityRef(row[sourceIndex], sourceWorkspace, targetWorkspace);
    }
    if (targetIndex !== -1 && row[targetIndex]) {
      row[targetIndex] = normalizeLegacyEntityRef(row[targetIndex], sourceWorkspace, targetWorkspace);
    }
    if (facetsIndex !== -1 && row[facetsIndex]) {
      row[facetsIndex] = normalizeLegacyFacetsCell(row[facetsIndex], sourceWorkspace, targetWorkspace);
    }
    if (kind === "edges" && sourceIndex !== -1 && targetIndex !== -1) {
      if (!row[sourceIndex] && !row[targetIndex]) {
        return null;
      }
    }
    return row;
  }).filter(Boolean);

  const output = `${headers.join(",")}\n${normalizedRows
    .map((row) => row.map((value) => csvEscape(value).replace(/\\r/g, "")).join(","))
    .join("\n")}\n`;
  const outFileName = kind === "edges" ? "edges.csv" : "facets.csv";
  const outPath = resolvePath(outputPath, outFileName);
  writeFileSync(outPath, output, "utf8");
  return outPath;
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll("\"", "\"\"")}"`;
  }
  return text;
}

function parseCsvStrict(raw) {
  const rows = [];
  const parsed = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < raw.length; i += 1) {
    const char = raw[i];
    const next = raw[i + 1];

    if (char === "\"" && inQuotes && next === "\"") {
      field += "\"";
      i += 1;
      continue;
    }
    if (char === "\"") {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && raw[i + 1] === "\n") {
        i += 1;
      }
      parsed.push(row.concat(field));
      row = [];
      field = "";
      continue;
    }
    field += char;
  }

  if (field.length || row.length) {
    parsed.push(row.concat(field));
  }

  if (!parsed.length || !parsed[0]?.length) {
    return { headers: [], rows: [] };
  }
  const headers = parsed[0];
  for (let i = 1; i < parsed.length; i++) {
    rows.push(parsed[i]);
  }
  return { headers, rows };
}

function normalizeLegacySchemaId(value, sourceWorkspace, targetWorkspace) {
  if (typeof value !== "string" || !sourceWorkspace) {
    return value;
  }
  const prefix = `${sourceWorkspace}:`;
  if (value.startsWith(prefix)) {
    return `${targetWorkspace}:${value.slice(prefix.length)}`;
  }
  return value;
}

function normalizeLegacyEntityRef(value, sourceWorkspace, targetWorkspace) {
  if (typeof value !== "string" || !sourceWorkspace) {
    return value;
  }
  if (!value.includes(":")) {
    return value;
  }
  const parts = value.split(":");
  if (parts.length === 3) {
    if (parts[0] === sourceWorkspace) {
      return `${parts[1]}:${parts[2]}`;
    }
    if (parts[0] === parts[1]) {
      return `${parts[1]}:${parts[2]}`;
    }
  }
  if (!value.startsWith(`${sourceWorkspace}:`)) {
    return value;
  }
  return `${targetWorkspace}:${parts.slice(1).join(":")}`;
}

function normalizeLegacyFacetsCell(rawValue, sourceWorkspace, targetWorkspace) {
  try {
    const parsed = JSON.parse(rawValue);
    if (typeof parsed !== "object" || !parsed) {
      return rawValue;
    }
    if (typeof parsed.record_id === "string") {
      parsed.record_id = normalizeLegacyEntityRef(parsed.record_id, sourceWorkspace, targetWorkspace);
    }
    if (typeof parsed.source_ref === "string") {
      parsed.source_ref = normalizeLegacyEntityRef(parsed.source_ref, sourceWorkspace, targetWorkspace);
    }
    if (typeof parsed.source === "string") {
      parsed.source = normalizeLegacyEntityRef(parsed.source, sourceWorkspace, targetWorkspace);
    }
    return JSON.stringify(parsed);
  } catch {
    return rawValue;
  }
}

function buildLegacyCompatibleMapping(mappingPath, manifestConfig) {
  if (!mappingPath || !existsSync(mappingPath)) {
    return { path: mappingPath, patched: false };
  }

  let mapping;
  try {
    mapping = parseStructuredFile(readFileSync(mappingPath, "utf8"), mappingPath);
  } catch {
    return { path: mappingPath, patched: false };
  }

  if (!mapping || typeof mapping !== "object") {
    return { path: mappingPath, patched: false };
  }

  if (Array.isArray(mapping.entities)) {
    return { path: mappingPath, patched: false };
  }

  if (!mapping.entities || typeof mapping.entities !== "object") {
    return { path: mappingPath, patched: false };
  }

  const objectEntities = mapping.entities;
  const convertedEntities = [];
  const convertedEntitiesByType = {};
  for (const [nodeType, value] of Object.entries(objectEntities)) {
    if (!value || typeof value !== "object") continue;

    const entityName = value.node_type || nodeType;
    const recordIdColumn = value.record_id_column || "record_id";
    const sourceCsv = typeof value.csv === "string" ? value.csv : null;
    const contentColumns = Array.isArray(value.content_columns) ? value.content_columns : [];
    const primaryContentField = typeof value.content_field === "string" ? value.content_field : contentColumns[0] || null;
    const schemaId = value.target_schema_id || value.schema_id || null;
    const recordIdFormula =
      typeof value.record_id_formula === "string"
        ? value.record_id_formula
        : `{raw:${recordIdColumn}}`;
    const sourceFormula =
      typeof value.source_ref_formula === "string"
        ? value.source_ref_formula
        : recordIdFormula;

    const facets = {};
    if (typeof value.facets === "object" && value.facets !== null) {
      Object.assign(facets, value.facets);
    } else if (contentColumns.length) {
      for (const column of contentColumns) {
        if (typeof column !== "string" || !column.trim()) continue;
        facets[column] = { from: column };
      }
    }

    convertedEntities.push({
      node_type: entityName,
      target_schema_id: schemaId,
      record_id_formula: recordIdFormula,
      source_ref_formula: sourceFormula,
      ...(sourceCsv ? { csv: sourceCsv } : {}),
      ...(primaryContentField ? { content_field: primaryContentField } : {}),
      ...(Object.keys(facets).length ? { facets } : {})
    });

    convertedEntitiesByType[nodeType] = {
      nodeType: entityName,
      recordIdColumn
    };
  }

  const convertedEdges = [];
  const explicitEdges = Array.isArray(mapping.edges) ? mapping.edges : [];
  const contractRelations = Array.isArray(mapping.contract_relations) ? mapping.contract_relations : [];

  if (explicitEdges.length) {
    for (const edge of explicitEdges) {
      if (!edge || typeof edge !== "object") continue;
      convertedEdges.push(edge);
    }
  } else if (contractRelations.length) {
    for (const relation of contractRelations) {
      if (!relation || typeof relation !== "object") continue;
      const sourceType = relation.source_type;
      const targetType = relation.target_type;
      if (!sourceType || !targetType) continue;

      const sourceInfo = convertedEntitiesByType[sourceType];
      const targetInfo = convertedEntitiesByType[targetType];

      const sourceRefColumn = relation.source_ref_column || sourceInfo?.recordIdColumn || "record_id";
      const targetRecordColumn = relation.target_ref_column || targetInfo?.recordIdColumn || "record_id";
      const edgeLabel = relation.edge_label || relation.label || "RELATED_TO";

      convertedEdges.push({
        label: edgeLabel,
        source_record_id_formula: `{raw:${sourceRefColumn}}`,
        target_record_id_formula: `{raw:${targetRecordColumn}}`,
        source_ref_formula: `{raw:${sourceRefColumn}}`,
        target_ref_formula: `{raw:${targetRecordColumn}}`,
        confidence: 1,
        metadata: {
          source: "legacy-compatible-normalizer",
          mapped_from: "contract_relations"
        }
      });
    }
  }

  if (!convertedEntities.length) {
    return { path: mappingPath, patched: false };
  }

  const mappingWorkspace = manifestConfig.workspace_id || mapping.workspace_id;
  const schemaIdWorkspace = mappingWorkspace?.trim();

  const normalized = {
    ...mapping,
    workspace_id: schemaIdWorkspace || mapping.workspace_id,
    entities: convertedEntities,
    edges: convertedEdges,
    import_ready: mapping.import_ready || null
  };

  const next = normalizeLegacyMappingFilePaths(normalized, mappingPath, manifestConfig);

  const normalizedSchemaId = schemaIdWorkspace
    ? normalizeSchemaIds(next.entities, schemaIdWorkspace)
    : next.entities;
  next.entities = normalizedSchemaId;

  const runTempDir = mkdtempSync(join(tmpdir(), "gcp-structured-import-legacy-mapping-"));
  const outPath = resolvePath(runTempDir, "mapping.legacy-compatible.json");
  writeFileSync(outPath, JSON.stringify(next, null, 2), "utf8");

  return {
    path: outPath,
    patched: true,
    reason: "object-to-array-entities"
  };
}

function normalizeLegacyMappingFilePaths(mappingPayload, originalMappingPath, manifestConfig) {
  const mappingRoot = resolvePath(originalMappingPath, "..");
  const sourceInputPath = manifestConfig.source_input;
  const sourceRoot = manifestConfig.source_root || resolveSourceRoot(sourceInputPath);
  const output = { ...mappingPayload };
  output.entities = output.entities.map((entity) => {
    if (!entity || typeof entity !== "object" || typeof entity.csv !== "string") {
      return entity;
    }
    return {
      ...entity,
      csv: resolveMappingArtifactPath(sourceRoot, mappingRoot, sourceInputPath, entity.csv)
    };
  });
  return output;
}

function normalizeSchemaIds(entities, workspaceId) {
  return entities.map((entity) => {
    if (!entity || typeof entity !== "object") return entity;
    if (typeof entity.target_schema_id !== "string" || !entity.target_schema_id.includes(":")) return entity;
    const prefix = entity.target_schema_id.split(":")[0];
    if (!prefix || prefix === workspaceId) return entity;
    return {
      ...entity,
      target_schema_id: entity.target_schema_id.replace(`${prefix}:`, `${workspaceId}:`)
    };
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
  const cmd = [gcp, "brain"];
  if (forceBackend && commandArgs[0] === "structured-import") {
    cmd.push("structured-import", "--force", ...commandArgs.slice(1));
  } else {
    cmd.push(...commandArgs);
  }
  console.log(`run-structured-import-system: gcp ${commandArgs.join(" ")}`);
  const ioDir = mkdtempSync(join(tmpdir(), "gcp-structured-import-command-"));
  const stdoutPath = join(ioDir, "stdout.log");
  const stderrPath = join(ioDir, "stderr.log");
  const stdoutHandle = openSync(stdoutPath, "w");
  const stderrHandle = openSync(stderrPath, "w");
  const r = spawnSync(process.execPath, cmd, {
    cwd: pkgRoot,
    stdio: ["ignore", stdoutHandle, stderrHandle],
    env: {
      ...process.env,
      ...(dbPath ? { GHOSTCRAB_SQLITE_PATH: dbPath } : {})
    }
  });
  closeSync(stdoutHandle);
  closeSync(stderrHandle);
  const stdoutText = readFileSync(stdoutPath, "utf8");
  const stderrText = readFileSync(stderrPath, "utf8");
  rmSync(ioDir, { recursive: true, force: true });

  if (r.status !== 0) {
    if (stdoutText) {
      console.error(stdoutText);
    }
    if (stderrText) {
      console.error(stderrText);
    }
    throw new Error(`run-structured-import-system: gcp ${commandArgs[0]} ${commandArgs[1]} ${label} failed (${r.status})`);
  }
  return stdoutText.trim();
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
  const left = normalizeComparableSummary(legacy.summary_parsed || {});
  const right = normalizeComparableSummary(hybrid.summary_parsed || {});
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

function normalizeComparableSummary(summary) {
  if (!summary || typeof summary !== "object") {
    return {};
  }
  if (summary.engine !== "hybrid") {
    return summary;
  }
  const project = typeof summary.project === "object" && summary.project ? summary.project : {};
  const reindex = typeof summary.reindex === "object" && summary.reindex ? summary.reindex : {};
  return {
    ...reindex,
    ...project,
    provenance_validation_skipped: summary.provenance_validation_skipped
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
    [--skip-provenance-validation|--no-validate-provenance]
    [--force]

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
    skip_provenance_validation     true|false (default: false)
    output_dir                    Optional artifacts directory
    reindex.enabled               default true
    reindex.scope                 all|graph|facets|provenance
  expected_taxonomies             Optional names checked with --expect-taxonomy
`);
}

export { };
