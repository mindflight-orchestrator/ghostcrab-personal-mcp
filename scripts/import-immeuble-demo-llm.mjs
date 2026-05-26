#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveNativeEnginePath } from "../bin/lib/brain-engine-runner.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

const GOLDEN_WORKSPACE = "immeuble-demo";
const LLM_WORKSPACE = "immeuble-demo-llm";
const GOLDEN_COLLECTION = "immeuble-demo::docs";
const LLM_COLLECTION = "immeuble-demo-llm::docs";
const ONTOLOGY_ID = "immeuble-demo::core";
const SOURCE_TABLE_ID = 78001;
const SOURCE_FACETS = [
  "domain.building",
  "domain.decision",
  "domain.role",
  "domain.scenario",
  "domain.unit",
  "finance.payment_status",
  "source.document_type"
];
const ENTITY_TYPE_MAP = {
  buildings: "building",
  blocks: "block",
  units: "unit",
  households: "household",
  cellars: "cellar",
  private_gardens: "private_garden",
  lease_contracts: "lease_contract",
  coda_entries: "coda_entry"
};

const args = parseArgs(process.argv.slice(2));
loadLocalEnv();

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const dbPath = resolve(repoRoot, args.db ?? "data/immeuble-demo-llm.sqlite");
const reportDir = resolve(
  repoRoot,
  args.reportDir ?? `reports/immeuble-demo-llm/${timestamp}`
);
const manifestPath = join(
  repoRoot,
  "examples/immeuble-demo/sources/manifest.json"
);
const expectedPath = join(
  repoRoot,
  "examples/immeuble-demo/sources/expected-coverage.json"
);
const bundlePath = join(repoRoot, "examples/immeuble-demo/bundle.json");
const ontologyPath = join(repoRoot, "ontologies/immeuble-demo/core.yaml");

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});

async function main() {
  if (args.help) {
    printHelp();
    return;
  }
  if (!["live", "mock", "dry-run"].includes(args.mode)) {
    throw new Error(
      `Invalid --mode ${args.mode}; expected live, mock, or dry-run.`
    );
  }
  if (
    args.resumeFrom &&
    !["qualification", "extraction"].includes(args.resumeFrom)
  ) {
    throw new Error(
      `Invalid --resume-from ${args.resumeFrom}; expected qualification or extraction.`
    );
  }
  if (args.resumeFrom && args.reset) {
    throw new Error("--reset cannot be used with --resume-from.");
  }
  if (args.mode === "live") assertLiveEnv();

  mkdirSync(dirname(dbPath), { recursive: true });
  mkdirSync(reportDir, { recursive: true });
  if (args.reset) {
    for (const path of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
      if (existsSync(path)) rmSync(path);
    }
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const expected = JSON.parse(readFileSync(expectedPath, "utf8"));
  const goldenBundle = JSON.parse(readFileSync(bundlePath, "utf8"));
  const selectedFiles = manifest.files.slice(
    0,
    args.limitDocs ?? manifest.files.length
  );

  writeJson(
    "run-config.json",
    redactSecrets({
      dbPath,
      reportDir,
      mode: args.mode,
      reset: args.reset,
      resumeFrom: args.resumeFrom,
      limitDocs: args.limitDocs,
      qualificationMaxTokens: args.qualificationMaxTokens,
      extractionMaxTokens: args.extractionMaxTokens,
      extractionTimeoutMs: args.extractionTimeoutMs,
      debugPrompts: args.debugPrompts,
      model: process.env.MB_DOCUMENTS_LLM_MODEL,
      baseUrl: process.env.MB_DOCUMENTS_LLM_BASE_URL
    })
  );
  writeJson("engine-info.json", collectEngineInfo());

  const facetBootstrapPath = join(
    reportDir,
    "source-facet-bootstrap.bundle.json"
  );
  writeJsonAbs(facetBootstrapPath, buildSourceFacetBootstrapBundle());

  if (!args.resumeFrom) {
    runGcp([
      "load",
      bundlePath,
      "--workspace",
      GOLDEN_WORKSPACE,
      "--reindex",
      "all",
      "--force"
    ]);
    runGcp([
      "brain",
      "ontology",
      "compile",
      "--workspace-id",
      LLM_WORKSPACE,
      "--ontology-id",
      ONTOLOGY_ID,
      "--input",
      ontologyPath,
      "--import-db",
      "--db",
      dbPath,
      "--force"
    ]);
    runDoc([
      "collection-create",
      "--workspace-id",
      LLM_WORKSPACE,
      "--collection-id",
      LLM_COLLECTION,
      "--name",
      "Documents sources syndic demo",
      "--language",
      "fr"
    ]);
    runDoc([
      "ontology-attach",
      "--workspace-id",
      LLM_WORKSPACE,
      "--collection-id",
      LLM_COLLECTION,
      "--ontology-id",
      ONTOLOGY_ID,
      "--role",
      "primary"
    ]);

    runGcp([
      "load",
      facetBootstrapPath,
      "--workspace",
      LLM_WORKSPACE,
      "--reindex",
      "none",
      "--force"
    ]);

    for (const file of selectedFiles) {
      const sourcePath = join(
        repoRoot,
        "examples/immeuble-demo/sources",
        file.filename
      );
      runDoc([
        "document-ingest",
        "--workspace-id",
        LLM_WORKSPACE,
        "--collection-id",
        LLM_COLLECTION,
        "--doc-id",
        String(file.doc_id),
        "--source-ref",
        sourcePath,
        "--language",
        manifest.language ?? "fr",
        "--strategy",
        "paragraph",
        "--content-file",
        sourcePath
      ]);
    }
  } else {
    assertResumeDatabaseReady();
    runGcp([
      "load",
      bundlePath,
      "--workspace",
      GOLDEN_WORKSPACE,
      "--reindex",
      "none",
      "--force"
    ]);
  }

  if (args.resumeFrom === "extraction") {
    writeText("qualification-resume.txt", "skipped: resume-from extraction\n");
  } else if (args.mode === "dry-run") {
    const qualificationDryRun = runDocCapture([
      "document-qualify",
      "--workspace-id",
      LLM_WORKSPACE,
      "--collection-id",
      LLM_COLLECTION,
      "--taxonomies",
      ONTOLOGY_ID,
      "--facets",
      SOURCE_FACETS.join(","),
      "--dry-run",
      "--limit",
      String(selectedFiles.length)
    ]);
    if (qualificationDryRun.stdout.trim()) {
      writeText("qualification-dry-run.json", qualificationDryRun.stdout);
    } else {
      writeJson("qualification-dry-run.json", {
        ok: true,
        source: "script-fallback",
        payload: {
          dry_run_prompt: buildQualificationPromptFallback({
            selectedFiles,
            manifest
          })
        }
      });
    }
  } else {
    const profileArgs = [
      "document-profile-worker",
      "--limit",
      String(selectedFiles.length)
    ];
    if (args.mode === "mock") {
      profileArgs.push(
        "--mock-profile-json",
        "vendor/mindbrain/fixtures/corpus_eval/business_rule/expected_profile.json"
      );
    }
    runDoc(profileArgs);

    const vocab = runDocCapture([
      "qualification-vocab-list",
      "--workspace-id",
      LLM_WORKSPACE,
      "--collection-id",
      LLM_COLLECTION
    ]);
    writeText("qualification-vocab.json", vocab.stdout);

    if (args.mode === "mock") {
      runDoc([
        "document-qualify",
        "--workspace-id",
        LLM_WORKSPACE,
        "--collection-id",
        LLM_COLLECTION,
        "--taxonomies",
        ONTOLOGY_ID,
        "--facets",
        SOURCE_FACETS.join(","),
        "--mock-qualification-json",
        "tests/fixtures/immeuble-demo-source-qualification.json",
        "--limit",
        String(selectedFiles.length)
      ]);
    } else {
      let qualificationPrompt = null;
      if (args.debugPrompts) {
        qualificationPrompt = captureQualificationDryRun({
          selectedFiles,
          manifest
        });
        writeJson(
          "qualification-request.json",
          buildQualificationRequestArtifact(qualificationPrompt)
        );
      }
      try {
        const qualifyArgs = [
          "document-qualify",
          "--workspace-id",
          LLM_WORKSPACE,
          "--collection-id",
          LLM_COLLECTION,
          "--taxonomies",
          ONTOLOGY_ID,
          "--facets",
          SOURCE_FACETS.join(",")
        ];
        if (args.qualificationMaxTokens !== null) {
          qualifyArgs.push("--max-tokens", String(args.qualificationMaxTokens));
        }
        qualifyArgs.push("--limit", String(selectedFiles.length));
        runDoc(qualifyArgs);
      } catch (error) {
        writeJson("qualification-error.json", {
          ok: false,
          mode: args.mode,
          stage: "document-qualify",
          message: error instanceof Error ? error.message : String(error),
          prompt_artifact: args.debugPrompts
            ? "qualification-dry-run.json"
            : null
        });
        throw error;
      }
    }
  }

  const extraction = await extractBusinessBundle({
    mode: args.mode,
    manifest,
    expected,
    goldenBundle,
    selectedFiles,
    extractionMaxTokens: args.extractionMaxTokens,
    extractionTimeoutMs: args.extractionTimeoutMs
  });
  const extractedBundlePath = join(
    reportDir,
    "llm-extracted-business.bundle.json"
  );
  if (extraction.bundle) writeJsonAbs(extractedBundlePath, extraction.bundle);

  if (args.mode !== "dry-run" && !extraction.appliedInDb) {
    runGcp([
      "load",
      facetBootstrapPath,
      "--workspace",
      LLM_WORKSPACE,
      "--reindex",
      "all",
      "--force"
    ]);
  }

  const llmBundle =
    args.mode === "live"
      ? exportWorkspaceBundle(extractedBundlePath)
      : extraction.bundle;
  if (args.mode === "live") {
    runGcp([
      "load",
      extractedBundlePath,
      "--workspace",
      LLM_WORKSPACE,
      "--reindex",
      "graph",
      "--document-table-id",
      String(SOURCE_TABLE_ID),
      "--force"
    ]);
  }

  const report = buildComparisonReport({
    goldenBundle,
    llmBundle,
    expected,
    selectedFiles,
    mode: args.mode
  });
  writeJson("report.json", report);
  writeText("report.md", renderReportMarkdown(report));
  console.log(`report: ${join(reportDir, "report.md")}`);
  if (report.status === "fail") process.exitCode = 2;
}

function parseArgs(argv) {
  const out = {
    mode: "live",
    db: null,
    reportDir: null,
    reset: false,
    resumeFrom: null,
    limitDocs: null,
    qualificationMaxTokens: null,
    extractionMaxTokens: null,
    extractionTimeoutMs: 180000,
    debugPrompts: false,
    help: false
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg === "--mode") out.mode = requireValue(argv, ++i, arg);
    else if (arg === "--db") out.db = requireValue(argv, ++i, arg);
    else if (arg === "--report-dir")
      out.reportDir = requireValue(argv, ++i, arg);
    else if (arg === "--reset") out.reset = true;
    else if (arg === "--resume-from")
      out.resumeFrom = requireValue(argv, ++i, arg);
    else if (arg === "--debug-prompts") out.debugPrompts = true;
    else if (arg === "--limit-docs") {
      out.limitDocs = Number.parseInt(requireValue(argv, ++i, arg), 10);
      if (!Number.isInteger(out.limitDocs) || out.limitDocs < 1) {
        throw new Error("--limit-docs must be a positive integer.");
      }
    } else if (arg === "--qualification-max-tokens") {
      out.qualificationMaxTokens = Number.parseInt(
        requireValue(argv, ++i, arg),
        10
      );
      if (
        !Number.isInteger(out.qualificationMaxTokens) ||
        out.qualificationMaxTokens < 1
      ) {
        throw new Error(
          "--qualification-max-tokens must be a positive integer."
        );
      }
    } else if (arg === "--extraction-max-tokens") {
      out.extractionMaxTokens = Number.parseInt(
        requireValue(argv, ++i, arg),
        10
      );
      if (
        !Number.isInteger(out.extractionMaxTokens) ||
        out.extractionMaxTokens < 1
      ) {
        throw new Error("--extraction-max-tokens must be a positive integer.");
      }
    } else if (arg === "--extraction-timeout-ms") {
      out.extractionTimeoutMs = Number.parseInt(
        requireValue(argv, ++i, arg),
        10
      );
      if (
        !Number.isInteger(out.extractionTimeoutMs) ||
        out.extractionTimeoutMs < 1
      ) {
        throw new Error("--extraction-timeout-ms must be a positive integer.");
      }
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return out;
}

function requireValue(argv, index, flag) {
  if (!argv[index]) throw new Error(`${flag} requires a value.`);
  return argv[index];
}

function printHelp() {
  console.log(`Usage: node scripts/import-immeuble-demo-llm.mjs [options]

Options:
  --mode live|mock|dry-run   LLM mode. Default: live.
  --db <path>                SQLite target. Default: data/immeuble-demo-llm.sqlite.
  --report-dir <path>        Report output directory.
  --reset                    Delete the target SQLite file before running.
  --resume-from qualification|extraction
                             Reuse an existing DB and rerun from the selected stage.
  --limit-docs <n>           Import only the first n source documents.
  --qualification-max-tokens <n>
                             Optional output token cap for live document qualification.
  --extraction-max-tokens <n>
                             Optional output token cap for live business extraction.
  --extraction-timeout-ms <n>
                             Timeout for live business extraction. Default: 180000.
  --debug-prompts            Write prompt payloads even in live mode.
`);
}

function loadLocalEnv() {
  const envPath = process.env.GHOSTCRAB_ENV_PATH || join(repoRoot, ".env");
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function assertLiveEnv() {
  const missing = [];
  if (!process.env.MB_DOCUMENTS_LLM_BASE_URL)
    missing.push("MB_DOCUMENTS_LLM_BASE_URL");
  if (!process.env.MB_DOCUMENTS_LLM_MODEL)
    missing.push("MB_DOCUMENTS_LLM_MODEL");
  if (!process.env.MB_DOCUMENTS_LLM_API_KEY)
    missing.push("MB_DOCUMENTS_LLM_API_KEY");
  if (missing.length) {
    throw new Error(`Live mode requires ${missing.join(", ")}.`);
  }
}

function assertResumeDatabaseReady() {
  if (!existsSync(dbPath)) {
    throw new Error(
      `--resume-from qualification requires an existing SQLite DB: ${dbPath}`
    );
  }
}

function collectEngineInfo() {
  const resolvedEnginePath = resolveNativeEnginePath(repoRoot, {
    preferDev: true
  });
  const cmdBackendDocumentPath = join(
    repoRoot,
    "cmd/backend/zig-out/bin",
    process.platform === "win32"
      ? "ghostcrab-document.exe"
      : "ghostcrab-document"
  );
  const vendorStandalonePath = join(
    repoRoot,
    "vendor/mindbrain/zig-out/bin",
    process.platform === "win32"
      ? "mindbrain-standalone-tool.exe"
      : "mindbrain-standalone-tool"
  );
  return {
    resolved_engine_path: resolvedEnginePath,
    resolved_engine: fileInfo(resolvedEnginePath),
    ghostcrab_document_path: cmdBackendDocumentPath,
    ghostcrab_document: fileInfo(cmdBackendDocumentPath),
    vendor_standalone_path: vendorStandalonePath,
    vendor_standalone: fileInfo(vendorStandalonePath),
    ghostcrab_document_engine_env:
      process.env.GHOSTCRAB_DOCUMENT_ENGINE ?? null,
    vendor_mindbrain_head: gitOutput([
      "-C",
      join(repoRoot, "vendor/mindbrain"),
      "rev-parse",
      "HEAD"
    ]),
    vendor_mindbrain_status: gitOutput([
      "-C",
      join(repoRoot, "vendor/mindbrain"),
      "status",
      "--short"
    ]),
    parent_submodule_status: gitOutput([
      "submodule",
      "status",
      "vendor/mindbrain"
    ])
  };
}

function fileInfo(path) {
  if (!path || !existsSync(path)) return { exists: false };
  const stat = statSync(path);
  return {
    exists: true,
    size: stat.size,
    mtime_ms: stat.mtimeMs,
    mtime: stat.mtime.toISOString()
  };
}

function gitOutput(argsToRun) {
  const result = spawnSync("git", argsToRun, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "pipe"
  });
  if (result.status !== 0) {
    return {
      ok: false,
      stderr: result.stderr.trim(),
      stdout: result.stdout.trim()
    };
  }
  return {
    ok: true,
    stdout: result.stdout.trim()
  };
}

function runGcp(argsToRun) {
  return run(process.execPath, ["bin/gcp.mjs", ...argsToRun]);
}

function runDoc(argsToRun) {
  return runGcp(["brain", "document", "--force", ...argsToRun]);
}

function runDocCapture(argsToRun) {
  return run(
    process.execPath,
    ["bin/gcp.mjs", "brain", "document", "--force", ...argsToRun],
    {
      capture: true
    }
  );
}

function captureQualificationDryRun({ selectedFiles, manifest }) {
  const qualificationDryRun = runDocCapture([
    "document-qualify",
    "--workspace-id",
    LLM_WORKSPACE,
    "--collection-id",
    LLM_COLLECTION,
    "--taxonomies",
    ONTOLOGY_ID,
    "--facets",
    SOURCE_FACETS.join(","),
    "--dry-run",
    "--limit",
    String(selectedFiles.length)
  ]);
  const dryRunText = qualificationDryRun.stdout.trim();
  if (dryRunText && hasQualificationDryRunPrompt(dryRunText)) {
    writeText("qualification-dry-run.json", qualificationDryRun.stdout);
    return JSON.parse(dryRunText).payload.dry_run_prompt;
  } else {
    const fallbackPrompt = buildQualificationPromptFallback({
      selectedFiles,
      manifest
    });
    writeJson("qualification-dry-run.json", {
      ok: true,
      source: "script-fallback",
      payload: {
        dry_run_prompt: fallbackPrompt
      }
    });
    return fallbackPrompt;
  }
}

function buildQualificationRequestArtifact(prompt) {
  const model = process.env.MB_DOCUMENTS_LLM_MODEL ?? "";
  const body = {
    model,
    messages: [
      {
        role: "system",
        content:
          "You qualify source documents against a controlled ontology. Return strict JSON only."
      },
      {
        role: "user",
        content: prompt
      }
    ],
    response_format: { type: "json_object" }
  };
  if (args.qualificationMaxTokens !== null) {
    if (isReasoningChatModel(model)) {
      body.max_completion_tokens = args.qualificationMaxTokens;
    } else {
      body.temperature = 0;
      body.max_tokens = args.qualificationMaxTokens;
    }
  } else if (!isReasoningChatModel(model)) {
    body.temperature = 0;
  }
  return body;
}

function hasQualificationDryRunPrompt(text) {
  try {
    const payload = JSON.parse(text);
    return Boolean(payload?.payload?.dry_run_prompt);
  } catch {
    return false;
  }
}

function run(command, argsToRun, options = {}) {
  const commandLine = `${command} ${argsToRun.join(" ")}`;
  if (!options.quiet) console.log(`run: ${commandLine}`);
  const result = spawnSync(command, argsToRun, {
    cwd: repoRoot,
    env: {
      ...process.env,
      GHOSTCRAB_SQLITE_PATH: dbPath,
      MB_DOCUMENTS_LLM_MODE: args.mode
    },
    encoding: "utf8",
    stdio: "pipe"
  });
  appendCommandLog(commandLine, result);
  if (result.status !== 0) {
    throw new Error(
      `Command failed: ${command} ${argsToRun.join(" ")}\n${result.stderr ?? ""}${result.stdout ?? ""}`
    );
  }
  return result;
}

function appendCommandLog(commandLine, result) {
  mkdirSync(reportDir, { recursive: true });
  appendFileSync(
    join(reportDir, "commands.jsonl"),
    `${JSON.stringify({
      command: commandLine,
      status: result.status,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? ""
    })}\n`
  );
}

function buildSourceFacetBootstrapBundle() {
  return {
    kind: "ghostcrab_backup_bundle",
    schema_version: "2",
    scope: {
      kind: "collection",
      workspace_id: LLM_WORKSPACE,
      collection_id: LLM_COLLECTION
    },
    workspaces: [
      {
        workspace_id: LLM_WORKSPACE,
        label: "Immeuble demo LLM",
        description:
          "Workspace reconstruit depuis sources documentaires et LLM.",
        domain_profile: "syndic"
      }
    ],
    collections: [
      {
        collection_id: LLM_COLLECTION,
        workspace_id: LLM_WORKSPACE,
        name: "Documents sources syndic demo",
        key_kind: "doc_id",
        chunk_bits: 8,
        default_language: "fr",
        metadata_json: '{"synthetic":true,"source":"llm-import"}'
      }
    ],
    ontologies: [],
    ontology_namespaces: [],
    ontology_dimensions: [],
    ontology_values: [],
    ontology_entity_types: [],
    ontology_edge_types: [],
    ontology_entities: [],
    ontology_relations: [],
    ontology_triples: [],
    collection_ontologies: [
      {
        workspace_id: LLM_WORKSPACE,
        collection_id: LLM_COLLECTION,
        ontology_id: ONTOLOGY_ID,
        role: "primary"
      }
    ],
    workspace_settings: [],
    facet_tables: [
      {
        table_id: SOURCE_TABLE_ID,
        workspace_id: LLM_WORKSPACE,
        collection_id: LLM_COLLECTION,
        schema_name: "public",
        table_name: LLM_COLLECTION,
        chunk_bits: 8,
        key_column: "doc_id",
        content_column: "content",
        metadata_column: "metadata_json",
        language: "fr",
        bm25_enabled: true
      }
    ],
    facet_definitions: SOURCE_FACETS.map((facetName, index) => ({
      table_id: SOURCE_TABLE_ID,
      facet_id: index + 1,
      facet_name: facetName
    })),
    documents_raw: [],
    chunks_raw: [],
    documents_raw_vector: [],
    chunks_raw_vector: [],
    facet_assignments_raw: [],
    entities_raw: [],
    entity_aliases_raw: [],
    relations_raw: [],
    relation_properties_raw: [],
    entity_documents_raw: [],
    entity_chunks_raw: [],
    document_links_raw: [],
    external_links_raw: []
  };
}

async function extractBusinessBundle({
  mode,
  manifest,
  expected,
  goldenBundle,
  selectedFiles,
  extractionMaxTokens,
  extractionTimeoutMs
}) {
  if (mode === "mock" || mode === "dry-run") {
    const bundle = remapGoldenBusinessBundle(goldenBundle);
    writeText(
      "business-extraction-mode.txt",
      `${mode}: golden remap fixture\n`
    );
    return { bundle };
  }

  const outputPath = join(
    reportDir,
    "business-extraction-response.parsed.json"
  );
  const rawOutputPath = join(
    reportDir,
    "business-extraction-response.raw.json"
  );
  const requestOutputPath = join(reportDir, "business-extraction-request.json");
  try {
    const extractArgs = [
      "document-business-extract",
      "--workspace-id",
      LLM_WORKSPACE,
      "--collection-id",
      LLM_COLLECTION,
      "--ontology-id",
      ONTOLOGY_ID,
      "--expected-coverage-json",
      expectedPath,
      "--limit",
      String(selectedFiles.length),
      "--output",
      outputPath,
      "--raw-output",
      rawOutputPath,
      "--request-output",
      requestOutputPath
    ];
    if (extractionMaxTokens !== null) {
      extractArgs.push("--max-tokens", String(extractionMaxTokens));
    }
    runDoc(extractArgs);
  } catch (error) {
    writeJson("business-extraction-error.json", {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : null,
      timeoutMs: extractionTimeoutMs,
      request_artifact: "business-extraction-request.json"
    });
    throw error;
  }
  const parsed = parseJsonPayload(readFileSync(outputPath, "utf8"));
  writeJson("business-extraction-applied.json", {
    ok: true,
    mode,
    applied_in_db: true,
    parsed_artifact: "business-extraction-response.parsed.json",
    raw_artifact: "business-extraction-response.raw.json",
    request_artifact: "business-extraction-request.json"
  });

  const bundle = normalizeExtractionToBundle(parsed);
  return { bundle, appliedInDb: true };
}

function exportWorkspaceBundle(outputPath) {
  runGcp([
    "brain",
    "backup",
    "--workspace-id",
    LLM_WORKSPACE,
    "--db",
    dbPath,
    "--output",
    outputPath,
    "--force"
  ]);
  return parseJsonPayload(readFileSync(outputPath, "utf8"));
}

function isReasoningChatModel(model) {
  return /^gpt-5/.test(model) || /^o[134]/.test(model);
}

function parseJsonPayload(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("LLM response is not JSON.");
    return JSON.parse(match[0]);
  }
}

function normalizeExtractionToBundle(extracted) {
  const bundle = buildEmptyBusinessBundle();
  bundle.entities_raw = normalizeRows(extracted.entities_raw).map((row) => ({
    workspace_id: LLM_WORKSPACE,
    ontology_id: row.ontology_id ?? ONTOLOGY_ID,
    entity_id: row.entity_id == null ? null : Number(row.entity_id),
    external_id: row.external_id == null ? null : String(row.external_id),
    entity_type: String(row.entity_type),
    name: String(row.name),
    confidence: Number(row.confidence ?? 0.7),
    metadata_json: stringifyMetadata(row.metadata_json)
  }));
  bundle.relations_raw = normalizeRows(extracted.relations_raw).map((row) => ({
    workspace_id: LLM_WORKSPACE,
    ontology_id: row.ontology_id ?? ONTOLOGY_ID,
    relation_id: row.relation_id == null ? null : Number(row.relation_id),
    external_id: row.external_id == null ? null : String(row.external_id),
    edge_type: String(row.edge_type),
    source_entity_id:
      row.source_entity_id == null ? null : Number(row.source_entity_id),
    target_entity_id:
      row.target_entity_id == null ? null : Number(row.target_entity_id),
    source_external_id:
      row.source_external_id == null ? null : String(row.source_external_id),
    target_external_id:
      row.target_external_id == null ? null : String(row.target_external_id),
    valid_from: row.valid_from ?? null,
    valid_to: row.valid_to ?? null,
    confidence: Number(row.confidence ?? 0.7),
    metadata_json: stringifyMetadata(row.metadata_json)
  }));
  bundle.entity_aliases_raw = normalizeRows(extracted.entity_aliases_raw).map(
    (row) => ({
      workspace_id: LLM_WORKSPACE,
      entity_id: row.entity_id == null ? null : Number(row.entity_id),
      entity_external_id:
        row.entity_external_id == null ? null : String(row.entity_external_id),
      term: String(row.term),
      confidence: Number(row.confidence ?? row.weight ?? 1)
    })
  );
  bundle.entity_documents_raw = normalizeRows(
    extracted.entity_documents_raw
  ).map((row) => ({
    workspace_id: LLM_WORKSPACE,
    entity_id: row.entity_id == null ? null : Number(row.entity_id),
    entity_external_id:
      row.entity_external_id == null ? null : String(row.entity_external_id),
    collection_id: LLM_COLLECTION,
    doc_id: Number(row.doc_id),
    role: String(row.role ?? row.evidence_kind ?? "llm_extracted"),
    confidence: Number(row.confidence ?? 0.7)
  }));
  bundle.entity_chunks_raw = normalizeRows(extracted.entity_chunks_raw).map(
    (row) => ({
      workspace_id: LLM_WORKSPACE,
      entity_id: row.entity_id == null ? null : Number(row.entity_id),
      entity_external_id:
        row.entity_external_id == null ? null : String(row.entity_external_id),
      collection_id: LLM_COLLECTION,
      doc_id: Number(row.doc_id),
      chunk_index: Number(row.chunk_index ?? 0),
      role: String(row.role ?? row.evidence_kind ?? "llm_extracted"),
      confidence: Number(row.confidence ?? 0.7)
    })
  );
  bundle.relation_properties_raw = normalizeRows(
    extracted.relation_properties_raw
  ).map((row) => ({
    workspace_id: LLM_WORKSPACE,
    relation_id: row.relation_id == null ? null : Number(row.relation_id),
    relation_external_id:
      row.relation_external_id == null
        ? null
        : String(row.relation_external_id),
    property_key: String(row.property_key ?? row.property_name),
    value_type: String(row.value_type ?? "text"),
    value_text:
      row.value_text ??
      (row.value_json == null ? null : stringifyMetadata(row.value_json)),
    value_number: row.value_number == null ? null : Number(row.value_number),
    value_integer: row.value_integer == null ? null : Number(row.value_integer),
    ref_doc_id: row.ref_doc_id == null ? null : Number(row.ref_doc_id),
    currency: row.currency ?? null
  }));
  return bundle;
}

function normalizeRows(value) {
  return Array.isArray(value) ? value : [];
}

function stringifyMetadata(value) {
  if (typeof value === "string") {
    JSON.parse(value);
    return value;
  }
  return JSON.stringify(value ?? {});
}

function remapGoldenBusinessBundle(goldenBundle) {
  const cloneRows = (rows) =>
    rows.map((row) => {
      const next = { ...row, workspace_id: LLM_WORKSPACE };
      if (next.collection_id === GOLDEN_COLLECTION)
        next.collection_id = LLM_COLLECTION;
      if (next.table_id === 77001) next.table_id = SOURCE_TABLE_ID;
      return next;
    });
  const bundle = buildEmptyBusinessBundle();
  bundle.entities_raw = cloneRows(goldenBundle.entities_raw);
  bundle.entity_aliases_raw = cloneRows(goldenBundle.entity_aliases_raw);
  bundle.relations_raw = cloneRows(goldenBundle.relations_raw);
  bundle.relation_properties_raw = cloneRows(
    goldenBundle.relation_properties_raw
  );
  bundle.entity_documents_raw = cloneRows(
    goldenBundle.entity_documents_raw
  ).filter((row) => row.doc_id <= 8);
  bundle.entity_chunks_raw = cloneRows(goldenBundle.entity_chunks_raw).filter(
    (row) => row.doc_id <= 8
  );
  return bundle;
}

function buildEmptyBusinessBundle() {
  return {
    kind: "ghostcrab_backup_bundle",
    schema_version: "2",
    scope: {
      kind: "workspace",
      workspace_id: LLM_WORKSPACE,
      collection_id: null
    },
    workspaces: [],
    collections: [],
    ontologies: [],
    ontology_namespaces: [],
    ontology_dimensions: [],
    ontology_values: [],
    ontology_entity_types: [],
    ontology_edge_types: [],
    ontology_entities: [],
    ontology_relations: [],
    ontology_triples: [],
    collection_ontologies: [],
    workspace_settings: [],
    facet_tables: [],
    facet_definitions: [],
    documents_raw: [],
    chunks_raw: [],
    documents_raw_vector: [],
    chunks_raw_vector: [],
    facet_assignments_raw: [],
    entities_raw: [],
    entity_aliases_raw: [],
    relations_raw: [],
    relation_properties_raw: [],
    entity_documents_raw: [],
    entity_chunks_raw: [],
    document_links_raw: [],
    external_links_raw: []
  };
}

function buildComparisonReport({
  goldenBundle,
  llmBundle,
  expected,
  selectedFiles,
  mode
}) {
  const goldenCounts = countEntities(goldenBundle.entities_raw);
  const llmCounts = countEntities(llmBundle.entities_raw);
  const expectedCounts = expected.counts ?? {};
  const countChecks = Object.entries(ENTITY_TYPE_MAP).map(
    ([label, entityType]) => ({
      label,
      entity_type: entityType,
      expected: expectedCounts[label] ?? null,
      golden: goldenCounts[entityType] ?? 0,
      actual: llmCounts[entityType] ?? 0,
      ok:
        (llmCounts[entityType] ?? 0) ===
        (expectedCounts[label] ?? goldenCounts[entityType] ?? 0)
    })
  );
  const relationChecks = (expected.relation_edges ?? []).map((edgeType) => {
    const golden = goldenBundle.relations_raw.filter(
      (row) => row.edge_type === edgeType
    ).length;
    const actual = llmBundle.relations_raw.filter(
      (row) => row.edge_type === edgeType
    ).length;
    return { edge_type: edgeType, golden, actual, ok: actual === golden };
  });
  const unitChecks = compareUnits(
    goldenBundle.entities_raw,
    llmBundle.entities_raw
  );
  const quotaChecks = compareQuotaTotals(
    goldenBundle.entities_raw,
    llmBundle.entities_raw
  );
  const failures = [
    ...countChecks.filter((row) => !row.ok),
    ...relationChecks.filter((row) => !row.ok),
    ...unitChecks.missing,
    ...unitChecks.extra,
    ...quotaChecks.filter((row) => !row.ok)
  ].length;
  return {
    status: mode === "dry-run" ? "partial" : failures === 0 ? "pass" : "fail",
    mode,
    generated_at: new Date().toISOString(),
    workspaces: { golden: GOLDEN_WORKSPACE, llm: LLM_WORKSPACE },
    selected_documents: selectedFiles.map((file) => file.filename),
    counts: countChecks,
    relations: relationChecks,
    units: unitChecks,
    quotities: quotaChecks,
    totals: {
      golden_entities: goldenBundle.entities_raw.length,
      llm_entities: llmBundle.entities_raw.length,
      golden_relations: goldenBundle.relations_raw.length,
      llm_relations: llmBundle.relations_raw.length
    }
  };
}

function buildQualificationPromptFallback({ selectedFiles, manifest }) {
  const documents = selectedFiles.map((file) => {
    const sourcePath = join(
      repoRoot,
      "examples/immeuble-demo/sources",
      file.filename
    );
    return [
      `doc_id=${file.doc_id}`,
      `source_ref=${sourcePath}`,
      `declared_document_type=${file.document_type}`,
      "content:",
      readFileSync(sourcePath, "utf8").slice(0, 5000),
      "---"
    ].join("\n");
  });
  return [
    "Classify the following MindBrain documents.",
    'Return JSON exactly as {"assignments":[...]}.',
    "Each assignment requires target_kind, doc_id, namespace, dimension, value, weight.",
    `Use ontology_id "${manifest.ontology_id ?? ONTOLOGY_ID}" unless a row needs a more specific attached ontology.`,
    "Allowed target: doc.",
    `Allowed facets: ${SOURCE_FACETS.join(",")}.`,
    "Only use values that are directly supported by the text. Do not invent facts.",
    "",
    "Documents:",
    "",
    documents.join("\n")
  ].join("\n");
}

function countEntities(rows) {
  const out = {};
  for (const row of rows ?? [])
    out[row.entity_type] = (out[row.entity_type] ?? 0) + 1;
  return out;
}

function compareUnits(goldenEntities, llmEntities) {
  const golden = indexUnits(goldenEntities);
  const actual = indexUnits(llmEntities);
  const missing = [];
  const extra = [];
  const mismatched = [];
  for (const [key, unit] of golden.entries()) {
    const other = actual.get(key);
    if (!other) {
      missing.push({ key, name: unit.name });
      continue;
    }
    const a = metadata(unit);
    const b = metadata(other);
    for (const field of ["tantiemes", "quota_basis", "usage_status"]) {
      if (a[field] !== b[field]) {
        mismatched.push({ key, field, golden: a[field], actual: b[field] });
      }
    }
  }
  for (const [key, unit] of actual.entries()) {
    if (!golden.has(key)) extra.push({ key, name: unit.name });
  }
  return { missing, extra, mismatched };
}

function indexUnits(entities) {
  const out = new Map();
  for (const entity of entities ?? []) {
    if (entity.entity_type !== "unit") continue;
    out.set(unitKey(entity), entity);
  }
  return out;
}

function unitKey(entity) {
  const meta = metadata(entity);
  return [
    meta.building_id ?? meta.building ?? "",
    meta.block ?? "",
    meta.floor ?? "",
    meta.lot ?? "",
    meta.door_label ?? ""
  ].join("|");
}

function compareQuotaTotals(goldenEntities, llmEntities) {
  const golden = quotaTotals(goldenEntities);
  const actual = quotaTotals(llmEntities);
  const keys = new Set([...Object.keys(golden), ...Object.keys(actual)]);
  return [...keys].sort().map((building) => ({
    building,
    golden: golden[building] ?? 0,
    actual: actual[building] ?? 0,
    ok: (golden[building] ?? 0) === (actual[building] ?? 0)
  }));
}

function quotaTotals(entities) {
  const out = {};
  for (const entity of entities ?? []) {
    if (entity.entity_type !== "unit") continue;
    const meta = metadata(entity);
    const building = String(meta.building_id ?? meta.building ?? "unknown");
    out[building] = (out[building] ?? 0) + Number(meta.tantiemes ?? 0);
  }
  return out;
}

function metadata(row) {
  try {
    return typeof row.metadata_json === "string"
      ? JSON.parse(row.metadata_json)
      : (row.metadata_json ?? {});
  } catch {
    return {};
  }
}

function renderReportMarkdown(report) {
  const lines = [];
  lines.push(`# Immeuble demo LLM comparison`);
  lines.push("");
  lines.push(`Status: **${report.status}**`);
  lines.push(`Mode: \`${report.mode}\``);
  lines.push(`Generated: ${report.generated_at}`);
  lines.push("");
  lines.push("## Entity counts");
  lines.push("");
  lines.push("| Label | Entity type | Expected | Golden | Actual | OK |");
  lines.push("|---|---:|---:|---:|---:|---|");
  for (const row of report.counts) {
    lines.push(
      `| ${row.label} | ${row.entity_type} | ${row.expected ?? ""} | ${row.golden} | ${row.actual} | ${row.ok ? "yes" : "no"} |`
    );
  }
  lines.push("");
  lines.push("## Relations");
  lines.push("");
  lines.push("| Edge type | Golden | Actual | OK |");
  lines.push("|---|---:|---:|---|");
  for (const row of report.relations) {
    lines.push(
      `| ${row.edge_type} | ${row.golden} | ${row.actual} | ${row.ok ? "yes" : "no"} |`
    );
  }
  lines.push("");
  lines.push("## Units");
  lines.push("");
  lines.push(`Missing: ${report.units.missing.length}`);
  lines.push(`Extra: ${report.units.extra.length}`);
  lines.push(`Mismatched: ${report.units.mismatched.length}`);
  lines.push("");
  lines.push("## Quotities");
  lines.push("");
  lines.push("| Building | Golden | Actual | OK |");
  lines.push("|---|---:|---:|---|");
  for (const row of report.quotities) {
    lines.push(
      `| ${row.building} | ${row.golden} | ${row.actual} | ${row.ok ? "yes" : "no"} |`
    );
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function writeJson(name, value) {
  writeJsonAbs(join(reportDir, name), value);
}

function writeJsonAbs(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(name, value) {
  const path = join(reportDir, name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value);
}

function redactSecrets(value) {
  const json = JSON.parse(JSON.stringify(value));
  for (const key of Object.keys(json)) {
    if (/key|secret/i.test(key) && json[key]) json[key] = "[redacted]";
  }
  return json;
}
