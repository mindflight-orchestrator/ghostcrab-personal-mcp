#!/usr/bin/env node
/**
 * One-off preflight/remediation helper for the v0.6.0 workspace-strict
 * MindBrain migrations.
 *
 * It intentionally does not infer ambiguous workspaces. Operators must provide
 * explicit mappings for legacy rows that cannot be mapped by the native
 * migration guard.
 */
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

function usage() {
  return `
Usage:
  node scripts/prepare-v0.6.0-workspace-strict-migration.mjs --db <sqlite> [options]

Options:
  --apply
      Apply explicit mappings. Without this flag the script is read-only.

  --analysis-plan-workspace <artifact_id>=<workspace_id>
      Assign one legacy analysis_plan row to a registered workspace. Repeatable.

  --graph-gap-rule-workspace <rule_id>=<workspace_id>
      Assign one legacy graph_gap_rules row to a registered workspace. Repeatable.

  --json
      Print the report as JSON.

This helper is deliberately narrow: it prepares only the v0.6.0
workspace-strict migration guards and refuses to guess workspace ownership.
`.trim();
}

function parseArgs(argv) {
  const out = {
    apply: false,
    dbPath: null,
    json: false,
    analysisPlanMappings: new Map(),
    graphGapRuleMappings: new Map()
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") return "help";
    if (arg === "--apply") {
      out.apply = true;
      continue;
    }
    if (arg === "--json") {
      out.json = true;
      continue;
    }
    if (arg === "--db" && argv[i + 1]) {
      out.dbPath = argv[++i];
      continue;
    }
    if (arg === "--analysis-plan-workspace" && argv[i + 1]) {
      addMapping(out.analysisPlanMappings, argv[++i], arg);
      continue;
    }
    if (arg === "--graph-gap-rule-workspace" && argv[i + 1]) {
      addMapping(out.graphGapRuleMappings, argv[++i], arg);
      continue;
    }
    throw new Error(`Unknown or incomplete argument: ${arg}`);
  }

  if (!out.dbPath) throw new Error("--db <sqlite> is required.");
  return out;
}

function addMapping(map, raw, flag) {
  const idx = raw.indexOf("=");
  if (idx <= 0 || idx === raw.length - 1) {
    throw new Error(`${flag} expects <id>=<workspace_id>, got: ${raw}`);
  }
  const key = raw.slice(0, idx);
  const value = raw.slice(idx + 1);
  if (map.has(key)) throw new Error(`Duplicate mapping for ${key}`);
  map.set(key, value);
}

function runSqlite(dbPath, args) {
  const result = spawnSync("sqlite3", [dbPath, ...args], {
    encoding: "utf8"
  });
  if (result.error) {
    throw new Error(`sqlite3 failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `sqlite3 exited ${result.status}.\nSTDERR:\n${result.stderr}\nSTDOUT:\n${result.stdout}`
    );
  }
  return result.stdout;
}

function queryJson(dbPath, sql) {
  const stdout = runSqlite(dbPath, ["-json", sql]);
  const trimmed = stdout.trim();
  return trimmed ? JSON.parse(trimmed) : [];
}

function execSql(dbPath, sql) {
  runSqlite(dbPath, [sql]);
}

function q(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function tableExists(dbPath, tableName) {
  const rows = queryJson(
    dbPath,
    `SELECT name FROM sqlite_master WHERE type='table' AND name=${q(tableName)}`
  );
  return rows.length > 0;
}

function getTableCreateSql(dbPath, tableName) {
  const rows = queryJson(
    dbPath,
    `SELECT sql FROM sqlite_master WHERE type='table' AND name=${q(tableName)}`
  );
  return rows[0]?.sql ?? null;
}

function getIndexCreateSql(dbPath, tableName) {
  return queryJson(
    dbPath,
    `
    SELECT name, sql
    FROM sqlite_master
    WHERE type='index'
      AND tbl_name=${q(tableName)}
      AND sql IS NOT NULL
    ORDER BY name
    `
  );
}

function needsAnswerArtifactCheckRelaxation(dbPath) {
  const createSql = getTableCreateSql(dbPath, "mindbrain_answer_artifacts");
  return (
    typeof createSql === "string" &&
    createSql.includes("artifact_kind = 'analysis_plan'") &&
    createSql.includes("workspace_id IS NULL")
  );
}

function relaxLegacyAnswerArtifactCheck(dbPath) {
  if (!needsAnswerArtifactCheckRelaxation(dbPath)) return false;

  const indexes = getIndexCreateSql(dbPath, "mindbrain_answer_artifacts");
  const dropIndexes = indexes
    .map((row) => `DROP INDEX IF EXISTS ${quoteIdentifier(row.name)};`)
    .join("\n");
  const recreateIndexes = indexes
    .map((row) => row.sql)
    .filter(Boolean)
    .join(";\n");

  execSql(
    dbPath,
    `
    PRAGMA foreign_keys=OFF;
    BEGIN IMMEDIATE;
    ${dropIndexes}
    ALTER TABLE mindbrain_answer_artifacts RENAME TO mindbrain_answer_artifacts__v060_prep_legacy_check;
    CREATE TABLE mindbrain_answer_artifacts (
      artifact_id TEXT PRIMARY KEY,
      slug TEXT NOT NULL,
      workspace_id TEXT,
      agent_id TEXT,
      scope TEXT,
      artifact_kind TEXT NOT NULL CHECK (artifact_kind IN ('analysis_plan', 'live_answer_view', 'answer_snapshot', 'evidence_pack')),
      public_label_key TEXT,
      public_label TEXT NOT NULL,
      lifecycle TEXT NOT NULL CHECK (lifecycle IN ('draft', 'active', 'frozen', 'stale', 'archived', 'deleted')),
      state TEXT NOT NULL,
      current_version INTEGER NOT NULL DEFAULT 1 CHECK (current_version >= 1),
      payload_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(payload_json)),
      legacy_ref TEXT,
      created_at_unix INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at_unix INTEGER NOT NULL DEFAULT (unixepoch()),
      CHECK (
        (artifact_kind = 'analysis_plan' AND agent_id IS NOT NULL AND scope IS NOT NULL) OR
        (artifact_kind IN ('live_answer_view', 'answer_snapshot') AND workspace_id IS NOT NULL) OR
        (artifact_kind = 'evidence_pack' AND json_extract(payload_json, '$.parent_artifact_id') IS NOT NULL)
      )
    );
    INSERT INTO mindbrain_answer_artifacts(
      artifact_id, slug, workspace_id, agent_id, scope, artifact_kind,
      public_label_key, public_label, lifecycle, state, current_version,
      payload_json, legacy_ref, created_at_unix, updated_at_unix
    )
    SELECT
      artifact_id, slug, workspace_id, agent_id, scope, artifact_kind,
      public_label_key, public_label, lifecycle, state, current_version,
      payload_json, legacy_ref, created_at_unix, updated_at_unix
    FROM mindbrain_answer_artifacts__v060_prep_legacy_check;
    DROP TABLE mindbrain_answer_artifacts__v060_prep_legacy_check;
    ${recreateIndexes ? `${recreateIndexes};` : ""}
    COMMIT;
    PRAGMA foreign_keys=ON;
    `
  );
  return true;
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function assertWorkspaceExists(workspaces, workspaceId) {
  if (!workspaces.some((row) => row.workspace_id === workspaceId)) {
    throw new Error(`Unknown workspace_id: ${workspaceId}`);
  }
}

function classifyAnalysisPlan(row, workspaces) {
  const matches =
    row.scope === null
      ? []
      : workspaces
          .filter(
            (workspace) =>
              row.scope === workspace.workspace_id ||
              row.scope.startsWith(`${workspace.workspace_id}:`)
          )
          .map((workspace) => workspace.workspace_id);

  if (row.workspace_id !== null && row.workspace_id !== undefined) {
    return { ...row, status: "workspace_owned", matching_workspaces: matches };
  }
  if (matches.length === 1) {
    return { ...row, status: "auto_mappable", matching_workspaces: matches };
  }
  if (matches.length > 1) {
    return { ...row, status: "ambiguous", matching_workspaces: matches };
  }
  return { ...row, status: "unmappable", matching_workspaces: [] };
}

function collectReport(dbPath, workspaces) {
  const hasArtifacts = tableExists(dbPath, "mindbrain_answer_artifacts");
  const hasGapRules = tableExists(dbPath, "graph_gap_rules");

  const analysisPlans = hasArtifacts
    ? queryJson(
        dbPath,
        `
        SELECT artifact_id, slug, workspace_id, agent_id, scope, public_label,
               legacy_ref, payload_json
        FROM mindbrain_answer_artifacts
        WHERE artifact_kind='analysis_plan'
        ORDER BY artifact_id
      `
      ).map((row) => classifyAnalysisPlan(row, workspaces))
    : [];

  const graphGapRules = hasGapRules
    ? queryJson(
        dbPath,
        `
        SELECT rule_id, ontology_id, workspace_id, entity_type, relation_type,
               label, metadata_json
        FROM graph_gap_rules
        WHERE workspace_id IS NULL
        ORDER BY rule_id
      `
      )
    : [];

  return {
    db: dbPath,
    workspaces,
    analysis_plans: analysisPlans,
    graph_gap_rules_null_workspace: graphGapRules
  };
}

function applyMappings(dbPath, options, report) {
  const relaxedAnswerArtifacts =
    options.analysisPlanMappings.size > 0
      ? relaxLegacyAnswerArtifactCheck(dbPath)
      : false;
  const statements = ["BEGIN IMMEDIATE;"];
  const updates = [];
  const workspaces = report.workspaces;

  for (const [artifactId, workspaceId] of options.analysisPlanMappings) {
    assertWorkspaceExists(workspaces, workspaceId);
    const row = report.analysis_plans.find(
      (item) => item.artifact_id === artifactId
    );
    if (!row)
      throw new Error(`Unknown analysis_plan artifact_id: ${artifactId}`);
    if (row.workspace_id !== null && row.workspace_id !== undefined) {
      throw new Error(`analysis_plan already has workspace_id: ${artifactId}`);
    }
    statements.push(
      `
      UPDATE mindbrain_answer_artifacts
      SET workspace_id=${q(workspaceId)}, updated_at_unix=unixepoch()
      WHERE artifact_id=${q(artifactId)}
        AND artifact_kind='analysis_plan'
        AND workspace_id IS NULL;
      `
    );
    updates.push({
      kind: "analysis_plan",
      id: artifactId,
      workspace_id: workspaceId,
      relaxed_legacy_check: relaxedAnswerArtifacts
    });
  }

  for (const [ruleId, workspaceId] of options.graphGapRuleMappings) {
    assertWorkspaceExists(workspaces, workspaceId);
    const row = report.graph_gap_rules_null_workspace.find(
      (item) => item.rule_id === ruleId
    );
    if (!row)
      throw new Error(
        `Unknown null-workspace graph_gap_rules rule_id: ${ruleId}`
      );
    statements.push(
      `
      UPDATE graph_gap_rules
      SET workspace_id=${q(workspaceId)}, updated_at=CURRENT_TIMESTAMP
      WHERE rule_id=${q(ruleId)}
        AND workspace_id IS NULL;
      `
    );
    updates.push({
      kind: "graph_gap_rule",
      id: ruleId,
      workspace_id: workspaceId
    });
  }

  statements.push("COMMIT;");
  if (updates.length > 0) execSql(dbPath, statements.join("\n"));
  return updates;
}

function unresolvedBlockers(report) {
  return {
    analysis_plans: report.analysis_plans.filter(
      (row) => row.workspace_id === null && row.status !== "auto_mappable"
    ),
    graph_gap_rules: report.graph_gap_rules_null_workspace
  };
}

function printHuman(report, updates, blockers, options) {
  console.log(`[prepare-v0.6.0] db: ${report.db}`);
  console.log(`[prepare-v0.6.0] mode: ${options.apply ? "apply" : "dry-run"}`);
  console.log(`[prepare-v0.6.0] workspaces: ${report.workspaces.length}`);

  const auto = report.analysis_plans.filter(
    (row) => row.status === "auto_mappable"
  );
  const unmappable = report.analysis_plans.filter(
    (row) => row.status === "unmappable"
  );
  const ambiguous = report.analysis_plans.filter(
    (row) => row.status === "ambiguous"
  );
  const owned = report.analysis_plans.filter(
    (row) => row.status === "workspace_owned"
  );
  console.log(
    `[prepare-v0.6.0] analysis_plan: owned=${owned.length}, auto_mappable=${auto.length}, unmappable=${unmappable.length}, ambiguous=${ambiguous.length}`
  );
  for (const row of [...unmappable, ...ambiguous]) {
    const matches = row.matching_workspaces.length
      ? row.matching_workspaces.join(", ")
      : "none";
    console.log(
      `  blocker analysis_plan ${row.artifact_id}: status=${row.status}, scope=${row.scope ?? "<null>"}, matches=${matches}`
    );
  }

  console.log(
    `[prepare-v0.6.0] graph_gap_rules null workspace: ${report.graph_gap_rules_null_workspace.length}`
  );
  for (const row of report.graph_gap_rules_null_workspace) {
    console.log(
      `  blocker graph_gap_rule ${row.rule_id}: ontology=${row.ontology_id}, label=${row.label}`
    );
  }

  if (updates.length > 0) {
    console.log(`[prepare-v0.6.0] applied updates: ${updates.length}`);
    for (const update of updates) {
      console.log(`  ${update.kind} ${update.id} -> ${update.workspace_id}`);
    }
  }

  if (
    blockers.analysis_plans.length === 0 &&
    blockers.graph_gap_rules.length === 0
  ) {
    console.log(
      "[prepare-v0.6.0] ready: workspace-strict migration guards should pass."
    );
  } else {
    console.log(
      "[prepare-v0.6.0] blocked: provide explicit mappings, then rerun with --apply."
    );
  }
}

function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed === "help") {
    console.log(usage());
    return 0;
  }
  if (!existsSync(parsed.dbPath)) {
    throw new Error(`SQLite database not found: ${parsed.dbPath}`);
  }

  const workspaces = tableExists(parsed.dbPath, "workspaces")
    ? queryJson(
        parsed.dbPath,
        "SELECT workspace_id, label FROM workspaces ORDER BY workspace_id"
      )
    : [];
  const before = collectReport(parsed.dbPath, workspaces);

  let updates = [];
  if (parsed.apply) {
    updates = applyMappings(parsed.dbPath, parsed, before);
  } else if (
    parsed.analysisPlanMappings.size > 0 ||
    parsed.graphGapRuleMappings.size > 0
  ) {
    throw new Error("Explicit mappings require --apply.");
  }

  const after = parsed.apply
    ? collectReport(parsed.dbPath, workspaces)
    : before;
  const blockers = unresolvedBlockers(after);
  const payload = { ...after, updates, blockers };
  if (parsed.json) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    printHuman(after, updates, blockers, parsed);
  }
  return blockers.analysis_plans.length === 0 &&
    blockers.graph_gap_rules.length === 0
    ? 0
    : 1;
}

try {
  process.exitCode = main();
} catch (error) {
  console.error(
    `[prepare-v0.6.0] error: ${error instanceof Error ? error.message : String(error)}`
  );
  process.exitCode = 2;
}
