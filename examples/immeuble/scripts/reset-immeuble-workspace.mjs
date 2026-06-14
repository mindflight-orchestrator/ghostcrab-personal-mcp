#!/usr/bin/env node
/**
 * Reset a clean immeuble workspace and run the canonical pipeline.
 *
 * Usage:
 *   node examples/immeuble/scripts/reset-immeuble-workspace.mjs [options]
 *
 * Options:
 *   --db <path>              SQLite target (default: data/immeuble.sqlite)
 *   --keep-db                Do not delete existing file first
 *   --with-bundle-load       After import, load bundle/immeuble.bundle.json
 *   --with-artifact-seed     Seed answer artifacts via demo-load profile
 *   --with-business-capabilities  Seed ghostcrab:business-capability records
 *   --engine legacy|both     Import engine (default: legacy)
 *   --skip-provenance-validation
 *   --require-hybrid         Fail if hybrid-compare missing or non-zero deltas
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const immeubleRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkgRoot = resolve(immeubleRoot, "..", "..");
const node = process.execPath;
const reportsDir = join(immeubleRoot, "reports");

const args = process.argv.slice(2);
const dbPath = resolve(parseFlag(args, "--db", join(pkgRoot, "data/immeuble.sqlite")));
const engine = parseFlag(args, "--engine", "legacy");
const keepDb = args.includes("--keep-db");
const withBundle = args.includes("--with-bundle-load");
const withArtifacts = args.includes("--with-artifact-seed");
const withBusinessCapabilities = args.includes("--with-business-capabilities");
const skipProvenance = args.includes("--skip-provenance-validation");
const requireHybrid = args.includes("--require-hybrid");

const report = {
  ok: true,
  db_path: dbPath,
  steps: [],
  started_at: new Date().toISOString()
};

try {
  if (!keepDb && existsSync(dbPath)) {
    rmSync(dbPath);
    report.steps.push({ step: "delete_db", ok: true });
  }
  mkdirSync(dirname(dbPath), { recursive: true });

  runStep("build", [join(immeubleRoot, "scripts/build-immeuble-model.mjs")]);

  const importArgs = [
    join(immeubleRoot, "scripts/run-immeuble-import.mjs"),
    "--apply",
    "--db", dbPath,
    "--engine", engine,
    "--skip-preflight",
    "--force"
  ];
  if (skipProvenance) importArgs.push("--skip-provenance-validation");
  if (engine === "both") {
    importArgs.push("--compare-output", join(reportsDir, "hybrid-compare.json"));
  }
  runStep("import", importArgs);

  if (withArtifacts) {
    runStep("artifact_seed", [
      join(pkgRoot, "bin/gcp.mjs"),
      "load", join(immeubleRoot, "contracts/answer_artifacts.seed.jsonl"),
      "--workspace", "immeuble"
    ], { env: { GHOSTCRAB_SQLITE_PATH: dbPath } });
  }

  if (withBusinessCapabilities) {
    runStep("business_capability_seed", [
      join(pkgRoot, "bin/gcp.mjs"),
      "load", join(immeubleRoot, "contracts/business_capabilities.seed.jsonl"),
      "--workspace", "immeuble"
    ], { env: { GHOSTCRAB_SQLITE_PATH: dbPath } });
  }

  if (withBundle) {
    runStep("bundle_load", [
      join(pkgRoot, "bin/gcp.mjs"),
      "load", join(immeubleRoot, "bundle/immeuble.bundle.json"),
      "--workspace", "immeuble",
      "--reindex", "all"
    ], { env: { GHOSTCRAB_SQLITE_PATH: dbPath } });
  }

  const verifyArgs = [
    join(immeubleRoot, "scripts/verify-immeuble-acceptance.mjs"),
    "--db", dbPath
  ];
  if (requireHybrid) verifyArgs.push("--require-hybrid");
  if (withBundle) verifyArgs.push("--require-bundle");
  if (withBusinessCapabilities) verifyArgs.push("--require-business-capabilities");
  runStep("verify_acceptance", verifyArgs);

  runStep("audit_projections", [join(immeubleRoot, "scripts/audit-immeuble-projections.mjs")], { optional: true });

  report.finished_at = new Date().toISOString();
  writeFileSync(join(reportsDir, "reset-immeuble-workspace.json"), JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log(JSON.stringify({ ok: true, db_path: dbPath, steps: report.steps.length }, null, 2));
} catch (err) {
  report.ok = false;
  report.error = err instanceof Error ? err.message : String(err);
  report.finished_at = new Date().toISOString();
  writeFileSync(join(reportsDir, "reset-immeuble-workspace.json"), JSON.stringify(report, null, 2) + "\n", "utf8");
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

function runStep(name, cmdArgs, opts = {}) {
  const env = { ...process.env, ...(opts.env ?? {}), GHOSTCRAB_SQLITE_PATH: opts.env?.GHOSTCRAB_SQLITE_PATH ?? dbPath };
  let res = spawnSync(node, cmdArgs, { cwd: pkgRoot, env, encoding: "utf8" });
  if (res.status !== 0 && opts.fallback) {
    res = spawnSync(opts.fallback[0], opts.fallback.slice(1), { cwd: pkgRoot, env, encoding: "utf8" });
  }
  const ok = res.status === 0;
  report.steps.push({
    step: name,
    ok,
    status: res.status,
    stderr: (res.stderr || "").slice(0, 400)
  });
  if (!ok && !opts.optional) {
    throw new Error(`${name} failed: ${res.stderr || res.stdout}`);
  }
}

function parseFlag(argv, name, defaultValue) {
  const index = argv.indexOf(name);
  if (index === -1) return defaultValue;
  return argv[index + 1] ?? defaultValue;
}
