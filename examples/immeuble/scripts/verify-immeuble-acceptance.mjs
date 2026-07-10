#!/usr/bin/env node
/**
 * Verify immeuble ACCEPTANCE.yaml against filesystem reports and optional DB.
 *
 * Usage:
 *   node examples/immeuble/scripts/verify-immeuble-acceptance.mjs [--db path] [--require-hybrid]
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { parse as parseYaml } from "yaml";

const immeubleRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const reportsDir = join(immeubleRoot, "reports");

const args = process.argv.slice(2);
const dbPath = parseFlag(args, "--db", process.env.GHOSTCRAB_SQLITE_PATH ?? "");
const requireHybrid = args.includes("--require-hybrid");
const requireBundle = args.includes("--require-bundle");
const projectionStrict = args.includes("--projection-strict");
const requireBusinessCapabilities = args.includes(
  "--require-business-capabilities"
);

const acceptance = parseYaml(
  readFileSync(join(immeubleRoot, "ACCEPTANCE.yaml"), "utf8")
);
const results = { ok: true, checks: [], workspace_id: acceptance.workspace_id };

function check(name, ok, detail) {
  results.checks.push({ name, ok, detail });
  if (!ok) results.ok = false;
}

function readJson(rel) {
  const path = join(immeubleRoot, rel);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

const pipeline = readJson("reports/pipeline_audit.json");
check(
  "pipeline_audit exists",
  pipeline != null,
  pipeline ? "ok" : "missing reports/pipeline_audit.json"
);
if (pipeline) {
  check("pipeline_audit.ok", pipeline.ok === true, String(pipeline.ok));
  check(
    "facet_rows",
    pipeline.facet_rows === acceptance.import_ready.facet_rows,
    `${pipeline.facet_rows} vs ${acceptance.import_ready.facet_rows}`
  );
  check(
    "edge_rows",
    pipeline.edge_rows === acceptance.import_ready.edge_rows,
    `${pipeline.edge_rows} vs ${acceptance.import_ready.edge_rows}`
  );
  for (const [type, expected] of Object.entries(
    acceptance.import_ready.entity_type_counts
  )) {
    const actual = pipeline.counts?.[type];
    check(
      `entity_count.${type}`,
      actual === expected,
      `${actual} vs ${expected}`
    );
  }
}

const prefixReport = readJson("reports/01-model.validation.json");
if (prefixReport) {
  check(
    "schema_id_prefix",
    prefixReport.ok === true && prefixReport.prefix_violations === 0,
    JSON.stringify(prefixReport)
  );
}

const hybridPath = join(reportsDir, "hybrid-compare.json");
if (existsSync(hybridPath)) {
  const hybrid = JSON.parse(readFileSync(hybridPath, "utf8"));
  const deltas = hybrid.compare?.deltas ?? {};
  for (const [key, max] of Object.entries(
    acceptance.hybrid_compare.max_deltas
  )) {
    const delta = deltas[key]?.delta;
    if (typeof delta === "number") {
      check(`hybrid_delta.${key}`, Math.abs(delta) <= max, `delta=${delta}`);
    }
  }
} else if (requireHybrid || acceptance.hybrid_compare.required) {
  check("hybrid_compare report", false, "missing reports/hybrid-compare.json");
}

if (dbPath && existsSync(dbPath)) {
  const ws = acceptance.workspace_id;
  const q = (sql) => {
    const res = spawnSync("sqlite3", [dbPath, "-json", sql], {
      encoding: "utf8"
    });
    if (res.status !== 0) return null;
    try {
      return JSON.parse(res.stdout || "[]");
    } catch {
      return [];
    }
  };

  const facts = q(
    `SELECT COUNT(*) AS count FROM agent_facts WHERE workspace_id='${ws}'`
  );
  const factsCount = Number(facts?.[0]?.count ?? 0);
  check(
    "db.agent_facts",
    factsCount >= acceptance.db_after_import.agent_facts_min,
    `${factsCount} >= ${acceptance.db_after_import.agent_facts_min}`
  );

  const violations = q(
    `SELECT schema_id FROM agent_facts WHERE workspace_id='${ws}' AND schema_id NOT LIKE '${acceptance.schema_id_prefix}%' LIMIT 5`
  );
  check(
    "db.schema_id_violations",
    (violations?.length ?? 0) ===
      acceptance.db_after_import.schema_id_violations,
    JSON.stringify(violations?.map((r) => r.schema_id) ?? [])
  );

  const rels = q(
    `SELECT COUNT(*) AS count FROM relations_raw WHERE workspace_id='${ws}'`
  );
  check(
    "db.relations_raw",
    Number(rels?.[0]?.count ?? 0) >=
      acceptance.db_after_import.relations_raw_min,
    String(rels?.[0]?.count)
  );

  const graph = q(
    `SELECT COUNT(*) AS count FROM graph_entity WHERE workspace_id='${ws}'`
  );
  check(
    "db.graph_entity",
    Number(graph?.[0]?.count ?? 0) >=
      acceptance.db_after_import.graph_entity_min,
    String(graph?.[0]?.count)
  );

  if (requireBusinessCapabilities) {
    const businessCapabilities = acceptance.business_capabilities ?? {};
    const activeMin = Number(businessCapabilities.active_min ?? 1);
    const active = q(
      `SELECT COUNT(*) AS count FROM agent_facts WHERE workspace_id='${ws}' AND schema_id='ghostcrab:business-capability' AND json_extract(facets_json, '$.activation_status') = 'active'`
    );
    const activeCount = Number(active?.[0]?.count ?? 0);
    check(
      "db.business_capability_active_count",
      activeCount >= activeMin,
      `${activeCount} >= ${activeMin}`
    );

    const requiredArtifacts = Array.isArray(
      businessCapabilities.required_artifact_ids
    )
      ? businessCapabilities.required_artifact_ids
          .map((value) => String(value))
          .filter(Boolean)
      : [];
    if (requiredArtifacts.length > 0) {
      const rows = q(
        `SELECT json_extract(facets_json, '$.artifact_id') AS artifact_id FROM agent_facts WHERE workspace_id='${ws}' AND schema_id='ghostcrab:business-capability' AND json_extract(facets_json, '$.activation_status') = 'active' AND json_extract(facets_json, '$.artifact_id') IS NOT NULL`
      );
      const present = new Set(
        (rows ?? []).map((row) => String(row.artifact_id))
      );
      for (const artifactId of requiredArtifacts) {
        check(
          `db.business_capability_artifact_id.${artifactId}`,
          present.has(artifactId),
          present.has(artifactId) ? "present" : "missing"
        );
      }
    }
  }
} else {
  results.checks.push({
    name: "db checks",
    ok: true,
    detail: "skipped (no --db)"
  });
}

const starterkitAudit = acceptance.starterkit_projection_audit;
const auditReportPath = join(
  reportsDir,
  `projection_audit_${acceptance.workspace_id}.json`
);
if (starterkitAudit && existsSync(auditReportPath)) {
  const auditReport = JSON.parse(readFileSync(auditReportPath, "utf8"));
  const summary = auditReport.summary ?? {};
  const enforce = !starterkitAudit.strict_only || projectionStrict;

  if (enforce) {
    check(
      "starterkit.quality_score",
      Number(summary.quality_score ?? 0) >=
        Number(starterkitAudit.quality_score_min ?? 0),
      `${summary.quality_score} >= ${starterkitAudit.quality_score_min}`
    );
    check(
      "starterkit.facet_gaps",
      Number(summary.required_facet_observation_gap_count ?? 0) <=
        Number(starterkitAudit.required_facet_observation_gap_max ?? 0),
      String(summary.required_facet_observation_gap_count)
    );
    check(
      "starterkit.schema_gaps",
      Number(summary.required_schema_record_gap_count ?? 0) <=
        Number(starterkitAudit.required_schema_record_gap_max ?? 0),
      String(summary.required_schema_record_gap_count)
    );
    check(
      "starterkit.edge_gaps",
      Number(summary.required_edge_type_gap_count ?? 0) <=
        Number(starterkitAudit.required_edge_type_gap_max ?? 0),
      String(summary.required_edge_type_gap_count)
    );
    check(
      "starterkit.planned_missing",
      Number(summary.planned_missing_count ?? 0) <=
        Number(starterkitAudit.planned_missing_count_max ?? 0),
      String(summary.planned_missing_count)
    );
  } else {
    results.checks.push({
      name: "starterkit_projection_audit",
      ok: true,
      detail: "informational (use --projection-strict to enforce)"
    });
  }
} else if (starterkitAudit && projectionStrict) {
  check(
    "starterkit_projection_audit report",
    false,
    `missing ${auditReportPath}`
  );
}

if (requireBundle) {
  const bundlePath = join(immeubleRoot, acceptance.bundle.path);
  if (existsSync(bundlePath)) {
    const bundle = JSON.parse(readFileSync(bundlePath, "utf8"));
    check(
      "bundle.scope",
      bundle.scope?.workspace_id === acceptance.workspace_id,
      bundle.scope?.workspace_id
    );
    check(
      "bundle.documents_raw",
      (bundle.documents_raw?.length ?? 0) === acceptance.bundle.documents_raw,
      String(bundle.documents_raw?.length)
    );
    check(
      "bundle.entities_raw",
      (bundle.entities_raw?.length ?? 0) >= acceptance.bundle.entities_raw_min,
      String(bundle.entities_raw?.length)
    );
  } else {
    check("bundle file", false, acceptance.bundle.path);
  }
}

mkdirSync(reportsDir, { recursive: true });
writeFileSync(
  join(reportsDir, "acceptance.validation.json"),
  JSON.stringify(results, null, 2) + "\n",
  "utf8"
);
console.log(JSON.stringify(results, null, 2));
process.exit(results.ok ? 0 : 1);

function parseFlag(argv, name, defaultValue) {
  const index = argv.indexOf(name);
  if (index === -1) return defaultValue;
  return argv[index + 1] ?? defaultValue;
}
