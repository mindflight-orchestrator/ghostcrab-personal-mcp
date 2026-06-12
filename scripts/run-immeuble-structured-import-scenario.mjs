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
const manifests = [
  resolve(pkgRoot, "examples/immeuble/structured-import/manifests/manifest.yaml")
];

const args = process.argv.slice(2);
const workspaceId = parseFlag(args, "--workspace-id", "immeuble-structured-import");
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

mkdirSync(evidenceDir, { recursive: true });

const evidence = {
  workspace_id: workspaceId,
  db_path: dbPath,
  preflight: runWithSkipPreflight ? "skipped" : runWithPreflight ? "forced" : "manifest-default",
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

  const reindex = runGcp(["--force", "reindex", "--workspace-id", workspaceId, "--scope", "all"], true);
  const provenance = runGcp([
    "--force",
    "validate-provenance",
    "--workspace-id",
    workspaceId
  ], true);

  evidence.reindex = reindex.json;
  evidence.provenance = provenance.json;

  if (typeof reindex.json?.graph_projected === "number" && reindex.json.graph_projected <= 0) {
    throw new Error(`reindex.graph_projected expected > 0, got ${reindex.json.graph_projected}`);
  }

  if (provenance.json?.ok !== true) {
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
  if (runWithPreflight) {
    runnerArgs.push("--preflight");
  } else if (runWithSkipPreflight) {
    runnerArgs.push("--skip-preflight");
  }
  if (includeApply) {
    runnerArgs.push("--apply");
  }
  const res = spawnSync(process.execPath, [runner, ...runnerArgs], {
    cwd: pkgRoot,
    env: {
      ...process.env,
      GHOSTCRAB_SQLITE_PATH: dbPath
    },
    encoding: "utf8"
  });
  if (res.status !== 0) {
    throw new Error(`${res.argv ?? "run-structured-import-system"} failed (${res.status})`);
  }
  return { status: res.status, stdout: res.stdout || "" };
}

function runGcp(args, parseJson = false) {
  const res = spawnSync(process.execPath, [gcp, "brain", ...args], {
    cwd: pkgRoot,
    env: {
      ...process.env,
      GHOSTCRAB_SQLITE_PATH: dbPath
    },
    encoding: "utf8"
  });
  const output = res.stdout || "";
  if (res.status !== 0) {
    throw new Error(`gcp structured-import ${args.join(" ")} failed (${res.status}): ${output}`);
  }
  return {
    status: res.status,
    stdout: output,
    json: parseJson ? parseSummary(output) : null
  };
}

function parseSummary(text) {
  if (typeof text !== "string") {
    return null;
  }
  const lines = text.trim().split("\n");
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

function extractKitSummary(payload) {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  if (typeof payload.summary === "string") {
    return parseSummary(payload.summary);
  }
  if (typeof payload.summary === "object") {
    return payload.summary;
  }
  return null;
}

function assertObject(label, value) {
  if (!value || typeof value !== "object") {
    throw new Error(label);
  }
}

function assertAtLeastOneEntity(manifestPath, kitSummary) {
  const totalEntities = numeric(kitSummary?.entities_upserted) + numeric(kitSummary?.entities_updated);
  const totalFacets = numeric(kitSummary?.facets_inserted) + numeric(kitSummary?.facets_updated);
  const totalEdges = numeric(kitSummary?.edges_inserted) + numeric(kitSummary?.edges_updated);
  assertPositive(`entities for ${manifestPath}`, totalEntities);
  assertPositive(`facets for ${manifestPath}`, totalFacets);
  assertPositive(`edges for ${manifestPath}`, totalEdges);
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
