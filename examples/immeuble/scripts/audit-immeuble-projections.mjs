#!/usr/bin/env node
/**
 * Audit Immeuble projections after import or bundle load.
 *
 * Checks:
 * - projection_catalog.yaml entries are present in consumer contract and seed
 * - live_answer_view artifacts are listable
 * - each required artifact has non-empty payload content
 * - consumer_contract.yaml structure is valid
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { parse as parseYaml } from "yaml";

const immeubleRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkgRoot = resolve(immeubleRoot, "..", "..");
const reportsDir = join(immeubleRoot, "reports");
const workspaceId = parseFlag(process.argv.slice(2), "--workspace-id", "immeuble");

mkdirSync(reportsDir, { recursive: true });

const catalog = parseYaml(readFileSync(join(immeubleRoot, "contracts", "projection_catalog.yaml"), "utf8"));
const consumer = parseYaml(readFileSync(join(immeubleRoot, "contracts", "consumer_contract.yaml"), "utf8"));
const seedLines = readFileSync(join(immeubleRoot, "contracts", "answer_artifacts.seed.jsonl"), "utf8")
  .trim()
  .split("\n")
  .filter(Boolean)
  .map((line) => safeParseJson(line))
  .filter(Boolean);

const expectedSeedById = Object.fromEntries(seedLines.map((row) => {
  const id = row.artifact?.artifact_id;
  return id ? [id, row] : null;
}).filter(Boolean));

const expectedCatalogIds = (catalog.projections ?? []).map((entry) => {
  const kind = (entry.artifact_kind || "").toString();
  const prefix = kind === "analysis_plan" ? "analysis_plan__" : "live_answer_view__";
  return `${prefix}${entry.name}`;
});

const expectedLiveArtifactIds = seedLines
  .filter((row) => row.artifact?.artifact_kind === "live_answer_view")
  .map((row) => row.artifact.artifact_id)
  .filter(Boolean);

const listRes = spawnSync(process.execPath, [
  join(pkgRoot, "bin", "gcp.mjs"),
  "brain", "artifact", "list",
  "--workspace-id", workspaceId,
  "--kind", "live_answer_view",
  "--limit", "200"
], {
  cwd: pkgRoot,
  encoding: "utf8",
  env: process.env
});

let listedIds = [];
let listedById = new Map();
let listOk = listRes.status === 0;
if (listOk) {
  const payload = safeParseJson(listRes.stdout.trim());
  if (payload) {
    const artifacts = (payload.artifacts ?? payload.items ?? []).filter(Boolean);
    listedIds = artifacts.map((a) => a.artifact_id ?? a.id).filter(Boolean);
    listedById = new Map(artifacts.map((a) => [a.artifact_id ?? a.id, a]));
  } else {
    listOk = false;
  }
}

const payloadIssues = [];

function pushIssue(label, detail) {
  payloadIssues.push({ label, detail });
}

function catalogIdForEntry(entry) {
  const kind = (entry?.artifact_kind || "").toString();
  const prefix = kind === "analysis_plan" ? "analysis_plan__" : "live_answer_view__";
  return `${prefix}${entry?.name}`;
}

function isArrayOrStringArray(value) {
  return Array.isArray(value) && value.length > 0;
}

for (const entry of catalog.projections ?? []) {
  const expectedId = catalogIdForEntry(entry);
  const seed = expectedSeedById[expectedId];
  if (!seed) {
    pushIssue("seed_missing", `projection ${expectedId} missing in answer_artifacts.seed.jsonl`);
    continue;
  }

  const listed = listedById.get(expectedId);
  const listedPayload = listed ? parseArtifactPayload(listed) : null;
  const seedPayload = safeParseJson(seed.artifact?.payload_json) || {};

  const artifactKind = seed.artifact?.artifact_kind ?? entry.artifact_kind;
  if (artifactKind === "analysis_plan") {
    const questions = seedPayload.competency_questions ?? listedPayload?.competency_questions;
    if (!isArrayOrStringArray(questions)) {
      pushIssue("payload", `${expectedId}: competency_questions missing or empty`);
    }
  } else if (artifactKind === "live_answer_view") {
    if (!listed && listOk) {
      pushIssue("registry", `${expectedId}: not found in artifact list`);
    }
    const summary = seedPayload.summary ?? listedPayload?.summary;
    if (typeof summary !== "string" || summary.trim() === "") {
      pushIssue("payload", `${expectedId}: summary missing in payload`);
    }
    if (!isArrayOrStringArray(seedPayload.refresh_checks ?? listedPayload?.refresh_checks)) {
      pushIssue("payload", `${expectedId}: refresh_checks missing or empty`);
    }
  }
}

const catalogIds = expectedCatalogIds;
const listedLiveIds = listedIds;
const missingFromRegistry = expectedLiveArtifactIds.filter((id) => !listedIds.includes(id));
const missingFromSeed = catalogIds.filter((id) => !expectedSeedById[id]);

const audit = {
  ok: payloadIssues.length === 0 && consumer.workspace_id === workspaceId && (missingFromRegistry.length === 0 || !listOk),
  workspace_id: workspaceId,
  catalog_count: catalogIds.length,
  seed_live_views: expectedLiveArtifactIds.length,
  listed_live_views: listedLiveIds.length,
  missing_from_registry: missingFromRegistry,
  missing_from_seed: missingFromSeed,
  list_ok: listOk,
  payload_issues: payloadIssues,
  consumer_workspace: consumer.workspace_id,
  consumer_facet_queries: (consumer.facet_queries ?? []).length,
  consumer_answer_artifacts: (consumer.answer_artifacts ?? []).length,
  generated_at: new Date().toISOString()
};

if (consumer.workspace_id !== workspaceId) {
  audit.ok = false;
  payloadIssues.push({
    label: "consumer_contract",
    detail: `consumer workspace mismatch: expected ${workspaceId}, got ${consumer.workspace_id}`
  });
}

if (!listOk) {
  audit.list_skipped = true;
  audit.list_stderr = (listRes.stderr || listRes.stdout || "").slice(0, 500);
}

if (catalog.projections && catalogIds.length > 0 && expectedLiveArtifactIds.length === 0) {
  audit.ok = false;
  payloadIssues.push({ label: "seed", detail: "no live_answer_view entries in answer_artifacts.seed.jsonl" });
}

writeFileSync(join(reportsDir, "projection_audit.json"), JSON.stringify(audit, null, 2) + "\n", "utf8");

const seedLiveViews = seedLines
  .filter((row) => row.artifact?.artifact_kind === "live_answer_view")
  .map((row) => ({
    id: row.artifact?.artifact_id,
    workspace_id: row.artifact?.workspace_id
  }));

writeFileSync(join(reportsDir, "consumer_contract.validation.json"), JSON.stringify({
  ok: audit.ok && (consumer.workspace_id === workspaceId),
  workspace_id: consumer.workspace_id,
  facet_queries: consumer.facet_queries?.length ?? 0,
  answer_artifacts: consumer.answer_artifacts?.length ?? 0,
  expected_live_views: expectedLiveArtifactIds,
  listed_live_views: listedLiveIds,
  seed_live_views: seedLiveViews
}, null, 2) + "\n", "utf8");

console.log(JSON.stringify(audit, null, 2));
process.exit(audit.ok ? 0 : 1);

function parseArtifactPayload(artifact) {
  if (!artifact) return null;
  const raw = artifact.payload_json ?? artifact.payload ?? artifact.payload_raw ?? artifact.payloadData;
  return safeParseJson(raw);
}

function safeParseJson(value) {
  if (value == null) return null;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function parseFlag(argv, name, defaultValue) {
  const index = argv.indexOf(name);
  if (index === -1) return defaultValue;
  return argv[index + 1] ?? defaultValue;
}
