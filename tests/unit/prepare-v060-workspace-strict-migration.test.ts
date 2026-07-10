import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const scriptPath = join(
  process.cwd(),
  "scripts",
  "prepare-v0.6.0-workspace-strict-migration.mjs"
);
const sqlite3Path = "/usr/bin/sqlite3";

function hasSqlite3(): boolean {
  if (!existsSync(sqlite3Path)) return false;
  const result = spawnSync(sqlite3Path, [":memory:", "SELECT 1;"], {
    encoding: "utf8"
  });
  return result.status === 0 && !result.error;
}

function sqlite(dbPath: string, sql: string): string {
  const result = spawnSync(sqlite3Path, [dbPath, sql], {
    encoding: "utf8"
  });
  if (result.status !== 0 || result.error) {
    throw new Error(
      `sqlite3 failed: ${result.error?.message ?? result.stderr}`
    );
  }
  return result.stdout;
}

function runScript(dbPath: string, args: string[] = []) {
  return spawnSync(process.execPath, [scriptPath, "--db", dbPath, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `/usr/bin:${process.env.PATH ?? ""}`
    }
  });
}

function seedBase(dbPath: string) {
  sqlite(
    dbPath,
    `
    CREATE TABLE workspaces (
      workspace_id TEXT PRIMARY KEY,
      label TEXT
    );
    CREATE TABLE mindbrain_answer_artifacts (
      artifact_id TEXT PRIMARY KEY,
      slug TEXT NOT NULL,
      workspace_id TEXT,
      agent_id TEXT,
      scope TEXT,
      artifact_kind TEXT NOT NULL,
      public_label_key TEXT,
      public_label TEXT NOT NULL,
      lifecycle TEXT NOT NULL DEFAULT 'active',
      state TEXT NOT NULL DEFAULT 'open',
      current_version INTEGER NOT NULL DEFAULT 1,
      payload_json TEXT NOT NULL DEFAULT '{}',
      legacy_ref TEXT,
      created_at_unix INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at_unix INTEGER NOT NULL DEFAULT (unixepoch()),
      CHECK (
        (artifact_kind = 'analysis_plan' AND workspace_id IS NULL AND agent_id IS NOT NULL AND scope IS NOT NULL) OR
        (artifact_kind IN ('live_answer_view', 'answer_snapshot') AND workspace_id IS NOT NULL) OR
        (artifact_kind = 'evidence_pack' AND json_extract(payload_json, '$.parent_artifact_id') IS NOT NULL)
      )
    );
    CREATE TABLE graph_gap_rules (
      rule_id TEXT PRIMARY KEY,
      ontology_id TEXT NOT NULL,
      workspace_id TEXT,
      entity_type TEXT NOT NULL,
      relation_type TEXT NOT NULL,
      direction TEXT NOT NULL,
      target_entity_type TEXT,
      min_count INTEGER NOT NULL DEFAULT 1,
      max_count INTEGER,
      severity TEXT NOT NULL DEFAULT 'warning',
      label TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO workspaces(workspace_id, label)
    VALUES ('ws_a', 'Workspace A'), ('ws_b', 'Workspace B');
    `
  );
}

describe.skipIf(!hasSqlite3())(
  "prepare-v0.6.0-workspace-strict-migration",
  () => {
    let dir: string;
    let dbPath: string;

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), "ghostcrab-v060-prep-"));
      dbPath = join(dir, "ghostcrab.sqlite");
      seedBase(dbPath);
    });

    afterEach(() => {
      rmSync(dir, { recursive: true, force: true });
    });

    it("reports auto-mappable rows without modifying them", () => {
      sqlite(
        dbPath,
        `
        INSERT INTO mindbrain_answer_artifacts(
          artifact_id, slug, workspace_id, agent_id, scope, artifact_kind, public_label
        )
        VALUES (
          'analysis_plan__auto', 'auto', NULL, 'agent:self', 'ws_a:scope', 'analysis_plan', 'Auto'
        );
        `
      );

      const result = runScript(dbPath);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("auto_mappable=1");
      const workspace = sqlite(
        dbPath,
        "SELECT COALESCE(workspace_id, '<null>') FROM mindbrain_answer_artifacts WHERE artifact_id='analysis_plan__auto';"
      ).trim();
      expect(workspace).toBe("<null>");
    });

    it("blocks unmappable analysis_plan rows until an explicit workspace is supplied", () => {
      sqlite(
        dbPath,
        `
        INSERT INTO mindbrain_answer_artifacts(
          artifact_id, slug, workspace_id, agent_id, scope, artifact_kind, public_label
        )
        VALUES (
          'analysis_plan__legacy', 'legacy', NULL, 'agent:self', 'unknown:scope', 'analysis_plan', 'Legacy'
        );
        `
      );

      const dryRun = runScript(dbPath);
      expect(dryRun.status).toBe(1);
      expect(dryRun.stdout).toContain(
        "blocker analysis_plan analysis_plan__legacy"
      );

      const apply = runScript(dbPath, [
        "--analysis-plan-workspace",
        "analysis_plan__legacy=ws_b",
        "--apply"
      ]);
      expect(apply.status).toBe(0);
      expect(apply.stdout).toContain(
        "analysis_plan analysis_plan__legacy -> ws_b"
      );

      const workspace = sqlite(
        dbPath,
        "SELECT workspace_id FROM mindbrain_answer_artifacts WHERE artifact_id='analysis_plan__legacy';"
      ).trim();
      expect(workspace).toBe("ws_b");
    });

    it("rejects mappings to unknown workspaces", () => {
      sqlite(
        dbPath,
        `
        INSERT INTO mindbrain_answer_artifacts(
          artifact_id, slug, workspace_id, agent_id, scope, artifact_kind, public_label
        )
        VALUES (
          'analysis_plan__legacy', 'legacy', NULL, 'agent:self', 'unknown:scope', 'analysis_plan', 'Legacy'
        );
        `
      );

      const result = runScript(dbPath, [
        "--analysis-plan-workspace",
        "analysis_plan__legacy=missing_ws",
        "--apply"
      ]);

      expect(result.status).toBe(2);
      expect(result.stderr).toContain("Unknown workspace_id: missing_ws");
    });

    it("reports null-workspace graph gap rules as migration blockers", () => {
      sqlite(
        dbPath,
        `
        INSERT INTO graph_gap_rules(
          rule_id, ontology_id, workspace_id, entity_type, relation_type, direction, label
        )
        VALUES (
          'rule:legacy', 'ws_a::core', NULL, 'unit', 'has_owner', 'out', 'Legacy rule'
        );
        `
      );

      const result = runScript(dbPath);

      expect(result.status).toBe(1);
      expect(result.stdout).toContain("graph_gap_rules null workspace: 1");
      expect(result.stdout).toContain("blocker graph_gap_rule rule:legacy");
    });
  }
);
