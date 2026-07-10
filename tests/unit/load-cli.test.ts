import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { __private__, cmdLoad } from "../../bin/commands/load.mjs";

describe("gcp load helpers", () => {
  it("detects backup bundle JSON objects separately from JSONL profiles", () => {
    const dir = mkdtempSync(join(tmpdir(), "gcp-load-"));
    const bundle = join(dir, "backup.json");
    const profile = join(dir, "profile.jsonl");
    writeFileSync(bundle, JSON.stringify({ kind: "ghostcrab_backup_bundle" }));
    writeFileSync(profile, '{"kind":"profile"}\n{"kind":"remember"}\n');

    expect(__private__.detectLoadKind(bundle)).toBe("backup-bundle");
    expect(__private__.detectLoadKind(profile)).toBe("jsonl-profile");
  });

  it("parses backup-load wrapper flags", () => {
    expect(
      __private__.parseLoadArgs([
        "--workspace",
        "My App",
        "--db",
        "/tmp/brain.sqlite",
        "--dry-run",
        "--overwrite",
        "--confirm",
        "--force",
        "backup.json"
      ])
    ).toEqual({
      file: "backup.json",
      workspaceName: "my-app",
      sqlitePathFromCli: "/tmp/brain.sqlite",
      force: true,
      dryRun: true,
      reindex: "graph",
      documentTableId: null,
      collectionId: null,
      tableId: null,
      overwrite: true,
      confirm: true
    });
  });

  it("defaults backup reindex to graph", () => {
    expect(__private__.parseLoadArgs(["backup.json"]).reindex).toBe("graph");
    expect(
      __private__.buildBackupLoadEngineArgs(
        __private__.parseLoadArgs(["backup.json"]),
        "/tmp/brain.sqlite",
        "/tmp/backup.json"
      )
    ).toEqual([
      "backup-load",
      "--db",
      "/tmp/brain.sqlite",
      "--bundle",
      "/tmp/backup.json",
      "--reindex",
      "graph"
    ]);
  });

  it("builds native backup-load args", () => {
    expect(
      __private__.buildBackupLoadEngineArgs(
        {
          dryRun: true,
          overwrite: true,
          confirm: true,
          reindex: "all",
          documentTableId: "7",
          collectionId: "ws::main",
          tableId: "9"
        },
        "/tmp/brain.sqlite",
        "/tmp/backup.json"
      )
    ).toEqual([
      "backup-load",
      "--db",
      "/tmp/brain.sqlite",
      "--bundle",
      "/tmp/backup.json",
      "--dry-run",
      "--overwrite",
      "--confirm",
      "--reindex",
      "all",
      "--document-table-id",
      "7",
      "--collection-id",
      "ws::main",
      "--table-id",
      "9"
    ]);
  });

  it("help mentions upgrade before backup load", async () => {
    const logs: string[] = [];
    const log = console.log;
    console.log = (...args) => logs.push(args.join(" "));
    try {
      await cmdLoad(["--help"]);
    } finally {
      console.log = log;
    }
    expect(logs.join("\n")).toContain("gcp brain upgrade --db");
    expect(logs.join("\n")).toContain("--overwrite --confirm");
  });
});

describe("workspace-strict bundle preflight", () => {
  const writeBundle = (artifacts: unknown[]) => {
    const dir = mkdtempSync(join(tmpdir(), "gcp-load-preflight-"));
    const path = join(dir, "bundle.json");
    writeFileSync(
      path,
      JSON.stringify({
        kind: "ghostcrab_backup_bundle",
        scope: { kind: "workspace", workspace_id: "demo", collection_id: null },
        mindbrain_answer_artifacts: artifacts
      })
    );
    return path;
  };

  const legacyPlan = {
    artifact_id: "analysis_plan__legacy",
    slug: "legacy",
    workspace_id: null,
    scope: "demo",
    artifact_kind: "analysis_plan"
  };

  it("passes bundles whose answer artifacts all carry workspace_id", () => {
    const path = writeBundle([{ ...legacyPlan, workspace_id: "demo" }]);
    const result = __private__.preflightWorkspaceStrictBundle(path, null);
    expect(result.ok).toBe(true);
    expect(result.bundlePath).toBe(path);
    expect(result.backfilled).toEqual([]);
  });

  it("fails without --workspace and names the offending artifacts", () => {
    const path = writeBundle([legacyPlan]);
    const result = __private__.preflightWorkspaceStrictBundle(path, null);
    expect(result.ok).toBe(false);
    expect(result.message).toContain("analysis_plan__legacy");
    expect(result.message).toContain("workspace-strict");
    expect(result.message).toContain("--workspace");
  });

  it("backfills null workspace_id into a patched copy when --workspace is given", () => {
    const path = writeBundle([legacyPlan]);
    const result = __private__.preflightWorkspaceStrictBundle(path, "demo");
    expect(result.ok).toBe(true);
    expect(result.backfilled).toEqual(["analysis_plan__legacy"]);
    expect(result.bundlePath).not.toBe(path);

    const patched = JSON.parse(readFileSync(result.bundlePath, "utf8"));
    expect(patched.mindbrain_answer_artifacts[0].workspace_id).toBe("demo");
    // The original bundle stays untouched.
    const original = JSON.parse(readFileSync(path, "utf8"));
    expect(original.mindbrain_answer_artifacts[0].workspace_id).toBeNull();
  });
});

describe("shipped immeuble demo bundle", () => {
  it("has no null workspace_id in workspace-strict answer artifacts", () => {
    // Regression guard for the 0.6.4 bug: the shipped demo bundle carried an
    // analysis_plan artifact with workspace_id null, which the workspace-strict
    // schema (2026-06-16 migration) rejects on a fresh load.
    const bundlePath = fileURLToPath(
      new URL(
        "../../examples/immeuble/bundle/immeuble.bundle.json",
        import.meta.url
      )
    );
    const bundle = JSON.parse(readFileSync(bundlePath, "utf8"));
    const artifacts = bundle.mindbrain_answer_artifacts ?? [];
    expect(artifacts.length).toBeGreaterThan(0);
    for (const row of artifacts) {
      expect(
        typeof row.workspace_id === "string" && row.workspace_id.length > 0,
        `artifact ${row.artifact_id} must carry a non-null workspace_id`
      ).toBe(true);
    }
  });
});
