#!/usr/bin/env node
/**
 * Generic structured-import system runner.
 *
 * Input: YAML/JSON manifest describing source/mapping/ontology + import options.
 * Output: prints a compact JSON summary and the underlying gcp CLI line by line.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, normalize, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { parse as parseYaml } from "yaml";

const pkgRoot = join(fileURLToPath(import.meta.url), "..", "..");
const gcp = join(pkgRoot, "bin", "gcp.mjs");

const args = process.argv.slice(2);
let manifestPath = null;
let apply = false;
let extraWorkspace = null;
let dbPath = null;
let skipPreflight = null;

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
if (!manifest.ontology_model && manifest.import.preflight_validate !== false) {
  manifest.import.preflight_validate = false;
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

  const modelPath = resolveOptionalPath(parsed, "ontology.model", baseDir);
  const mappingWorkspace = getDeclaredWorkspaceId(mappingPath);
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

  return {
    ...parsed,
    __baseDir: baseDir,
    workspace_id: workspaceId,
    mapping_file: mappingPath,
    source_input: sourceInput,
    ontology_model: modelPath,
    declared_mapping_workspace_id: mappingWorkspace,
    import: {
      ...parsed.import,
      preflight_validate: preflightValidate
    },
    starterkit_root: resolveOptionalPath(parsed, "starterkit_root", baseDir) || process.env.GCP_STARTERKIT_ROOT,
    output_dir:
      resolveOptionalPath(parsed, "import.output_dir", baseDir) ||
      parsed.output_dir ||
      null,
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

function getDeclaredWorkspaceId(mappingPath) {
  if (!mappingPath || !existsSync(mappingPath)) {
    return null;
  }
  try {
    const raw = readFileSync(mappingPath, "utf8");
    const payload = JSON.parse(raw);
    return typeof payload?.workspace_id === "string" && payload.workspace_id.trim()
      ? payload.workspace_id.trim()
      : null;
  } catch {
    return null;
  }
}

function manifestImportBoolean(value, fallback) {
  return value === undefined ? fallback : Boolean(value);
}

function runPipeline() {
  if (manifest.import?.preflight_validate !== false) {
    runGcp([
      "structured-import",
      "validate",
      "--model",
      manifest.ontology_model,
      "--mapping",
      manifest.mapping_file,
      "--input",
      manifest.source_input
    ], "validate");
  }

  const kitArgs = [
    "structured-import",
    "kit",
    "--workspace-id",
    manifest.workspace_id,
    "--input",
    manifest.source_input,
    "--mapping",
    manifest.mapping_file,
    "--starterkit-root",
    manifest.starterkit_root,
    "--source-kind",
    manifest.source_kind,
    "--delimiter",
    manifest.delimiter,
    "--mode",
    manifest.mode
  ];

  if (manifest.output_dir) {
    kitArgs.push("--output-dir", manifest.output_dir);
  }
  if (manifest.skip_profile_validation) {
    kitArgs.push("--skip-profile-validation");
  }
  if (manifest.import?.edges_first === false) {
    kitArgs.push("--no-edges-first");
  }
  if (!manifest.reindex) {
    kitArgs.push("--no-reindex");
  }
  if (manifest.reindex_scope) {
    kitArgs.push("--reindex-scope", manifest.reindex_scope);
  }

  if (manifest.ontology_model && apply) {
    kitArgs.push("--model", manifest.ontology_model);
  }
  if (manifest.expected_taxonomies && manifest.expected_taxonomies.length) {
    kitArgs.push("--expect-taxonomy", manifest.expected_taxonomies.join(","));
  }
  if (apply) {
    kitArgs.push("--apply");
  }

  const summary = runGcp(kitArgs, "kit");
  console.log(JSON.stringify({
    ok: true,
    manifest: resolvePath(manifestPath),
    workspace_id: manifest.workspace_id,
    phase: apply ? "apply" : "plan",
    output_dir: manifest.output_dir,
    summary
  }, null, 2));
}

function runGcp(args, label) {
  const cmd = [gcp, ...args];
  console.log(`run-structured-import-system: gcp ${args.join(" ")}`);
  const r = spawnSync(process.execPath, cmd, {
    cwd: pkgRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      ...(dbPath ? { GHOSTCRAB_SQLITE_PATH: dbPath } : {})
    }
  });
  if (r.status !== 0) {
    console.error(r.stdout || "");
    console.error(r.stderr || "");
    throw new Error(`run-structured-import-system: gcp structured-import ${label} failed (${r.status})`);
  }
  const out = (r.stdout || "").trim();
  return out;
}

function printHelp() {
  console.log(`
Usage:
  node scripts/run-structured-import-system.mjs \
    --manifest <path-to-yaml-or-json> \
    [--apply] \
    [--workspace-id <override-workspace>] \
    [--db <sqlite-path>]
    [--skip-preflight|--preflight]

Manifest keys (minimal):
  workspace_id                     MindBrain workspace
  source.input                     Source directory or file (.csv/.json/.jsonl)
  mapping.file                     mapping_external_to_canonical.json
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
