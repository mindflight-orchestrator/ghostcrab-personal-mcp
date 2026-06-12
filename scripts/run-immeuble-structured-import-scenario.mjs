#!/usr/bin/env node
/**
 * Reproducible Immeuble structured-import scenario runner.
 *
 * Steps:
 * 1) plan manifest
 * 2) apply manifest
 * 3) reindex all
 * 4) validate provenance
 */

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const pkgRoot = resolve(fileURLToPath(import.meta.url), "..", "..");
const gcp = join(pkgRoot, "bin", "gcp.mjs");
const runner = join(pkgRoot, "scripts", "run-structured-import-system.mjs");
const defaultManifest = resolve(pkgRoot, "examples/immeuble/structured-import/manifests/manifest-fake-data.yaml");
const manifests = [parseFlag(process.argv.slice(2), "--manifest", defaultManifest)];

const args = process.argv.slice(2);
const workspaceId = parseFlag(args, "--workspace-id", "immeuble");
const engine = parseFlag(args, "--engine", "legacy");
const dbPath = parseFlag(
  args,
  "--db",
  join(mkdtempSync(join(tmpdir(), "gcp-immeuble-structured-import-")), "immeuble.sqlite")
);
const evidenceDir = parseFlag(
  args,
  "--evidence-dir",
  resolve(pkgRoot, "artifacts", "immeuble-structured-import")
);
const runWithSkipPreflight = args.includes("--skip-preflight");
const runWithPreflight = args.includes("--preflight");
const runWithSkipProvenance = args.includes("--skip-provenance-validation") || args.includes("--no-validate-provenance");
const runWithForce = args.includes("--force");

mkdirSync(evidenceDir, { recursive: true });

const evidence = {
  workspace_id: workspaceId,
  db_path: dbPath,
  preflight: runWithSkipPreflight ? "skipped" : runWithPreflight ? "forced" : "manifest-default",
  provenance: runWithSkipProvenance ? "skipped" : "forced",
  phases: [],
  ok: true
};

try {
  for (const manifestPath of manifests) {
    const plan = runRunner(manifestPath, false);
    const apply = runRunner(manifestPath, true);

    const planSummary = parseSummary(plan.stdout);
    const applySummary = parseSummary(apply.stdout);
    const applyKit = extractKitSummary(applySummary);
    const planKit = extractKitSummary(planSummary);

    assertObject(`plan summary missing for ${manifestPath}`, planSummary);
    assertObject(`apply payload missing for ${manifestPath}`, applySummary);
    assertAtLeastOneEntity(manifestPath, applyKit);
    assertAtLeastOneEntity(manifestPath, planKit);
    assertObject(`plan parsed summary expected for ${manifestPath}`, planKit);
    assertObject(`apply parsed summary expected for ${manifestPath}`, applyKit);

    evidence.phases.push({
      manifest: manifestPath,
      plan: planSummary,
      apply: applySummary
    });
  }

  const reindexArgs = ["structured-import", "reindex", "--workspace-id", workspaceId, "--scope", "all"];
  if (runWithForce) {
    reindexArgs.splice(1, 0, "--force");
  }
  const reindex = runGcp(reindexArgs, true);
  const provenance = runWithSkipProvenance
    ? { json: { ok: true, skipped: true } }
    : runGcp([
    "structured-import",
    "validate-provenance",
    "--workspace-id",
    workspaceId
  ], true);

  evidence.reindex = reindex.json;
  evidence.provenance = provenance.json;

  if (typeof reindex.json?.graph_projected === "number" && reindex.json.graph_projected <= 0) {
    throw new Error(`reindex.graph_projected expected > 0, got ${reindex.json.graph_projected}`);
  }

  if (!runWithSkipProvenance && provenance.json?.ok !== true) {
    throw new Error(`provenance validation failed unexpectedly: ${JSON.stringify(provenance.json)}`);
  }

  const reportPath = join(evidenceDir, "immeuble-structured-import-scenario.json");
  evidence.report_path = reportPath;
  writeFileSync(reportPath, JSON.stringify(evidence, null, 2) + "\n", "utf8");
  console.log(JSON.stringify({ ...evidence, ok: true }, null, 2));
} catch (err) {
  evidence.ok = false;
  evidence.error = err instanceof Error ? err.message : String(err);
  const reportPath = join(evidenceDir, "immeuble-structured-import-scenario.json");
  evidence.report_path = reportPath;
  writeFileSync(reportPath, JSON.stringify(evidence, null, 2) + "\n", "utf8");
  console.error(JSON.stringify({ ...evidence, ok: false }, null, 2));
  process.exit(1);
}

function runRunner(manifestArgs, includeApply) {
  const runnerArgs = [
    "--manifest",
    manifestArgs,
    "--workspace-id",
    workspaceId,
    "--db",
    dbPath
  ];
  runnerArgs.push("--engine", engine);
  if (runWithPreflight) {
    runnerArgs.push("--preflight");
  } else if (runWithSkipPreflight) {
    runnerArgs.push("--skip-preflight");
  }
  if (runWithSkipProvenance) {
    runnerArgs.push("--skip-provenance-validation");
  }
  if (runWithForce) {
    runnerArgs.push("--force");
  }
  if (includeApply) {
    runnerArgs.push("--apply");
  }
  const res = runCommand(process.execPath, [runner, ...runnerArgs], `run-structured-import-system`);
  if (res.status !== 0) {
    throw new Error(`${res.label} failed (${res.status}): ${res.output}`);
  }
  return { status: res.status, stdout: res.stdout };
}

function runGcp(args, parseJson = false) {
  const res = runCommand(process.execPath, [gcp, "brain", ...args], "gcp structured-import");
  const output = res.output;
  if (res.status !== 0) {
    throw new Error(`${res.label} failed (${res.status}): ${output}`);
  }
  return {
    status: res.status,
    stdout: output,
    json: parseJson ? parseSummary(output) : null
  };
}

function runCommand(executable, args, label) {
  const direct = spawnSync(process.execPath, args, {
    cwd: pkgRoot,
    env: {
      ...process.env,
      GHOSTCRAB_SQLITE_PATH: dbPath
    },
    encoding: "utf8"
  });
  if (direct.error) {
    const shellCommand = shellJoin([executable, ...args]);
    const shell = spawnSync("/bin/sh", ["-lc", shellCommand], {
      cwd: pkgRoot,
      env: {
        ...process.env,
        GHOSTCRAB_SQLITE_PATH: dbPath
      },
      encoding: "utf8"
    });
    const shellOutput = (shell.stdout || "") + (shell.stderr || "");
    const shellStdout = shell.stdout || "";
    const shellStderr = shell.stderr || "";
    const shellStatus = shell.status ?? 0;
    if (shell.error) {
      return {
        status: 1,
        stdout: shellStdout,
        stderr: shellStderr,
        output: shellOutput,
        label
      };
    }
    return {
      status: shellStatus,
      stdout: shellStdout,
      stderr: shellStderr,
      output: shellOutput,
      label
    };
  }
  const output = [direct.stdout || "", direct.stderr || ""].join("");
  const stdout = direct.stdout || "";
  const stderr = direct.stderr || "";
  return {
    status: direct.status ?? 0,
    stdout,
    stderr,
    output,
    label
  };
}

function parseSummary(text) {
  if (typeof text !== "string") {
    return null;
  }
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    // continue
  }

  const lines = trimmed.split("\n");
  let firstJsonLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === "{") {
      firstJsonLine = i;
      break;
    }
  }
  if (firstJsonLine >= 0) {
    try {
      return JSON.parse(lines.slice(firstJsonLine).join("\n"));
    } catch {
      // continue
    }
  }

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line.startsWith("{") && line.endsWith("}")) {
      try {
        return JSON.parse(line);
      } catch {
        // continue
      }
    }
  }
  return null;
}

function shellJoin(parts) {
  return parts.map((part) => `'${String(part).replaceAll("'", "'\"'\"'")}'`).join(" ");
}

function extractKitSummary(payload) {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  if (payload.runs && typeof payload.runs === "object") {
    const merged = {};
    for (const run of Object.values(payload.runs)) {
      if (!run || typeof run !== "object") {
        continue;
      }
      const runSummary = extractRunSummary(run);
      if (runSummary && typeof runSummary === "object") {
        Object.assign(merged, runSummary);
      }
    }
    return Object.keys(merged).length > 0 ? merged : null;
  }
  const project = payload?.project;
  if (project && typeof project === "object") {
    return project;
  }
  if (typeof payload.summary === "string") {
    return parseSummary(payload.summary);
  }
  if (typeof payload.summary === "object") {
    return payload.summary;
  }
  return null;
}

function extractRunSummary(run) {
  if (run.summary_parsed && typeof run.summary_parsed === "object") {
    return run.summary_parsed;
  }
  if (typeof run.summary === "string") {
    return parseSummary(run.summary);
  }
  if (typeof run.summary === "object") {
    return run.summary;
  }
  return null;
}

function assertObject(label, value) {
  if (!value || typeof value !== "object") {
    throw new Error(label);
  }
}

function assertAtLeastOneEntity(manifestPath, kitSummary) {
  const total = [
    "entities_upserted",
    "entities_updated",
    "entities_skipped",
    "facets_inserted",
    "facets_updated",
    "facets_skipped",
    "edges_inserted",
    "edges_updated",
    "edges_skipped",
    "facet_rows",
    "edge_rows"
  ].reduce((acc, key) => acc + numeric(kitSummary?.[key]), 0);
  assertPositive(`activity for ${manifestPath}`, total);
}

function numeric(value) {
  return typeof value === "number" ? value : 0;
}

function assertPositive(label, value) {
  if (typeof value !== "number" || value <= 0) {
    throw new Error(`${label}: expected > 0, got ${String(value)}`);
  }
}

function parseFlag(argv, name, defaultValue) {
  const index = argv.indexOf(name);
  if (index === -1) return defaultValue;
  return argv[index + 1] ?? defaultValue;
}
