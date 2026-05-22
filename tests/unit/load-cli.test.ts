import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { __private__ } from "../../bin/commands/load.mjs";

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
      tableId: null
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
});
