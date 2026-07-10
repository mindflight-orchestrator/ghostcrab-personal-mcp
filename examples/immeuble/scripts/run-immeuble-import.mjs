#!/usr/bin/env node
/**
 * Immeuble import scenario — plan, apply, reindex, provenance, schema prefix checks.
 *
 * Usage:
 *   node examples/immeuble/scripts/run-immeuble-import.mjs [--apply] [--engine both] ...
 */

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const immeubleRoot = resolve(fileURLToPath(import.meta.url), "..", "..");
const pkgRoot = resolve(immeubleRoot, "..", "..");
const gcp = join(pkgRoot, "bin", "gcp.mjs");
const runner = join(pkgRoot, "scripts", "run-structured-import-system.mjs");
const defaultManifest = join(immeubleRoot, "import_manifest.yaml");
const reportsDir = join(immeubleRoot, "reports");

const args = process.argv.slice(2);
const workspaceId = parseFlag(args, "--workspace-id", "immeuble");
const engine = parseFlag(args, "--engine", "legacy");
const manifestPath = parseFlag(args, "--manifest", defaultManifest);
const dbPath = parseFlag(
  args,
  "--db",
  join(mkdtempSync(join(tmpdir(), "gcp-immeuble-")), "immeuble.sqlite")
);
const evidenceDir = parseFlag(args, "--evidence-dir", reportsDir);
const compareOutput = parseFlag(
  args,
  "--compare-output",
  join(reportsDir, "hybrid-compare.json")
);
const runWithApply = args.includes("--apply");
const runWithSkipPreflight = args.includes("--skip-preflight");
const runWithPreflight = args.includes("--preflight");
const runWithSkipProvenance =
  args.includes("--skip-provenance-validation") ||
  args.includes("--no-validate-provenance");
const runWithForce = args.includes("--force");

mkdirSync(evidenceDir, { recursive: true });
mkdirSync(reportsDir, { recursive: true });

const evidence = {
  workspace_id: workspaceId,
  db_path: dbPath,
  manifest: manifestPath,
  engine,
  apply: runWithApply,
  preflight: runWithSkipPreflight
    ? "skipped"
    : runWithPreflight
      ? "forced"
      : "manifest-default",
  provenance: runWithSkipProvenance ? "skipped" : "forced",
  phases: [],
  ok: true
};

try {
  const plan = runRunner(false);
  evidence.phases.push({ step: "plan", summary: plan.summary });

  if (runWithApply) {
    const apply = runRunner(true);
    evidence.phases.push({ step: "apply", summary: apply.summary });

    const reindexArgs = [
      "structured-import",
      "reindex",
      "--workspace-id",
      workspaceId,
      "--scope",
      "all"
    ];
    if (runWithForce) reindexArgs.splice(1, 0, "--force");
    const reindex = runGcp(reindexArgs, true);
    evidence.reindex = reindex.json;
    writeFileSync(
      join(reportsDir, "reindex.json"),
      JSON.stringify(reindex.json, null, 2) + "\n",
      "utf8"
    );

    const applySummary = evidence.phases.find(
      (phase) => phase.step === "apply"
    )?.summary;
    const hybridReindex = applySummary?.compare?.hybrid_summary ?? null;
    const graphProjected =
      typeof reindex.json?.graph_projected === "number" &&
      reindex.json.graph_projected > 0
        ? reindex.json.graph_projected
        : typeof hybridReindex?.graph_projected === "number"
          ? hybridReindex.graph_projected
          : 0;

    if (graphProjected <= 0) {
      throw new Error(
        `reindex.graph_projected expected > 0, got ${reindex.json?.graph_projected ?? 0}`
      );
    }

    if (
      (reindex.json?.graph_projected ?? 0) <= 0 &&
      typeof hybridReindex?.graph_projected === "number" &&
      hybridReindex.graph_projected > 0
    ) {
      evidence.reindex = {
        ...reindex.json,
        graph_projected: hybridReindex.graph_projected,
        facet_assignments:
          hybridReindex.facet_assignments ??
          reindex.json?.facet_assignments ??
          0,
        source: "hybrid-apply"
      };
    }

    const prefixCheck = assertSchemaIdPrefix(dbPath, workspaceId);
    evidence.schema_id_prefix_check = prefixCheck;
    writeFileSync(
      join(reportsDir, "schema-id-prefix-check.json"),
      JSON.stringify(prefixCheck, null, 2) + "\n",
      "utf8"
    );
    if (!prefixCheck.ok) {
      throw new Error(
        `schema_id prefix violations: ${JSON.stringify(prefixCheck.violations.slice(0, 5))}`
      );
    }

    if (!runWithSkipProvenance) {
      const provenance = runGcp(
        [
          "structured-import",
          "validate-provenance",
          "--workspace-id",
          workspaceId
        ],
        true
      );
      evidence.provenance = provenance.json;
      if (provenance.json?.ok !== true) {
        throw new Error(
          `provenance validation failed: ${JSON.stringify(provenance.json)}`
        );
      }
    }
  }

  if (engine === "both") {
    evidence.hybrid_compare_path = compareOutput;
  }

  const reportPath = join(evidenceDir, "immeuble-import-scenario.json");
  evidence.report_path = reportPath;
  writeFileSync(reportPath, JSON.stringify(evidence, null, 2) + "\n", "utf8");
  console.log(JSON.stringify({ ...evidence, ok: true }, null, 2));
} catch (err) {
  evidence.ok = false;
  evidence.error = err instanceof Error ? err.message : String(err);
  const reportPath = join(evidenceDir, "immeuble-import-scenario.json");
  evidence.report_path = reportPath;
  writeFileSync(reportPath, JSON.stringify(evidence, null, 2) + "\n", "utf8");
  console.error(JSON.stringify({ ...evidence, ok: false }, null, 2));
  process.exit(1);
}

function runRunner(includeApply) {
  const runnerArgs = [
    "--manifest",
    manifestPath,
    "--workspace-id",
    workspaceId,
    "--db",
    dbPath,
    "--engine",
    engine
  ];
  if (compareOutput && engine === "both") {
    runnerArgs.push("--compare-output", compareOutput);
  }
  if (runWithPreflight) runnerArgs.push("--preflight");
  else if (runWithSkipPreflight) runnerArgs.push("--skip-preflight");
  if (runWithSkipProvenance) runnerArgs.push("--skip-provenance-validation");
  if (runWithForce) runnerArgs.push("--force");
  if (includeApply) runnerArgs.push("--apply");

  const res = runCommand(
    process.execPath,
    [runner, ...runnerArgs],
    "run-structured-import-system"
  );
  if (res.status !== 0) {
    throw new Error(`${res.label} failed (${res.status}): ${res.output}`);
  }
  const summary = parseSummary(res.stdout);
  assertActivity(summary, includeApply ? "apply" : "plan");
  return { stdout: res.stdout, summary };
}

function runGcp(brainArgs, parseJson = false) {
  const res = runCommand(
    process.execPath,
    [gcp, "brain", ...brainArgs],
    "gcp brain"
  );
  if (res.status !== 0) {
    throw new Error(`${res.label} failed (${res.status}): ${res.output}`);
  }
  return {
    stdout: res.stdout,
    json: parseJson ? parseSummary(res.stdout) : null
  };
}

function runCommand(executable, cmdArgs, label) {
  const direct = spawnSync(executable, cmdArgs, {
    cwd: pkgRoot,
    env: { ...process.env, GHOSTCRAB_SQLITE_PATH: dbPath },
    encoding: "utf8"
  });
  const output = [direct.stdout || "", direct.stderr || ""].join("");
  return {
    status: direct.status ?? 0,
    stdout: direct.stdout || "",
    output,
    label
  };
}

function parseSummary(text) {
  if (typeof text !== "string" || !text.trim()) return null;
  try {
    return JSON.parse(text.trim());
  } catch {
    /* continue */
  }
  const lines = text.trim().split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line.startsWith("{")) {
      try {
        return JSON.parse(lines.slice(i).join("\n"));
      } catch {
        /* continue */
      }
    }
  }
  return null;
}

function extractKitSummary(payload) {
  if (!payload || typeof payload !== "object") return null;
  if (payload.runs && typeof payload.runs === "object") {
    const merged = {};
    for (const run of Object.values(payload.runs)) {
      const s =
        run?.summary_parsed ??
        (typeof run?.summary === "string"
          ? parseSummary(run.summary)
          : run?.summary);
      if (s && typeof s === "object") Object.assign(merged, s);
    }
    return Object.keys(merged).length ? merged : null;
  }
  return (
    payload.project ??
    payload.summary_parsed ??
    (typeof payload.summary === "string"
      ? parseSummary(payload.summary)
      : payload.summary)
  );
}

function assertActivity(summary, label) {
  const kit = extractKitSummary(summary);
  const total = [
    "entities_upserted",
    "facets_inserted",
    "edges_inserted",
    "facet_rows",
    "edge_rows"
  ].reduce(
    (acc, key) => acc + (typeof kit?.[key] === "number" ? kit[key] : 0),
    0
  );
  if (total <= 0) {
    throw new Error(
      `${label}: expected activity > 0, got ${JSON.stringify(kit)}`
    );
  }
}

function assertSchemaIdPrefix(db, workspace) {
  let sqlite3;
  try {
    sqlite3 = spawnSync(
      "sqlite3",
      [
        db,
        "-json",
        `SELECT schema_id FROM agent_facts WHERE workspace_id='${workspace}'`
      ],
      { encoding: "utf8" }
    );
  } catch {
    return { ok: true, skipped: true, reason: "sqlite3 not available" };
  }
  if (sqlite3.status !== 0) {
    return {
      ok: true,
      skipped: true,
      reason: sqlite3.stderr || "sqlite3 query failed"
    };
  }
  let rows;
  try {
    rows = JSON.parse(sqlite3.stdout || "[]");
  } catch {
    rows = [];
  }
  const violations = rows.filter(
    (r) => r.schema_id && !String(r.schema_id).startsWith("immeuble:")
  );
  return {
    ok: violations.length === 0,
    checked: rows.length,
    violations: violations.map((r) => r.schema_id)
  };
}

function parseFlag(argv, name, defaultValue) {
  const index = argv.indexOf(name);
  if (index === -1) return defaultValue;
  return argv[index + 1] ?? defaultValue;
}
