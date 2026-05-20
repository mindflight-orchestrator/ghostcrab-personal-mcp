import { describe, expect, it } from "vitest";

import { __private__ } from "../../bin/commands/brain-backup.mjs";

describe("gcp brain backup helpers", () => {
  it("parses workspace-scoped backup flags", () => {
    expect(
      __private__.parseBackupArgs([
        "--workspace",
        "My App",
        "--workspace-id",
        "ws_real",
        "--db",
        "/tmp/brain.sqlite",
        "--output",
        "backup.json",
        "--no-vectors",
        "--force"
      ])
    ).toEqual({
      workspaceName: "my-app",
      workspaceId: "ws_real",
      sqlitePathFromCli: "/tmp/brain.sqlite",
      outputPath: "backup.json",
      collectionId: null,
      scope: "workspace",
      includeVectors: false,
      force: true
    });
  });

  it("builds native backup-export args for taxonomies", () => {
    const parsed = __private__.parseBackupArgs([
      "--workspace-id",
      "ws",
      "--scope",
      "taxonomies",
      "-o",
      "taxonomies.json"
    ]);
    expect(
      __private__.buildBackupEngineArgs(parsed, "/tmp/brain.sqlite")
    ).toEqual([
      "backup-export",
      "--db",
      "/tmp/brain.sqlite",
      "--workspace-id",
      "ws",
      "--scope",
      "taxonomies",
      "--output",
      "taxonomies.json"
    ]);
  });

  it("requires collection id for collection scoped backups", () => {
    expect(__private__.parseBackupArgs(["--scope", "collection"])).toEqual({
      error: "gcp brain backup: --scope collection requires --collection-id."
    });
  });

  it("uses workspace slug or config default as workspace id fallback", () => {
    const parsed = __private__.parseBackupArgs(["--workspace", "Client Space"]);
    expect(__private__.resolveBackupWorkspaceId(parsed, {})).toBe(
      "client-space"
    );
    expect(
      __private__.resolveBackupWorkspaceId(
        { ...parsed, workspaceName: null },
        { defaultWorkspace: "main_ws" }
      )
    ).toBe("main_ws");
    expect(
      __private__.resolveBackupWorkspaceId(
        { ...parsed, workspaceName: null },
        {}
      )
    ).toBe("default");
  });
});
