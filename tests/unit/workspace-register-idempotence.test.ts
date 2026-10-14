import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { resolveNativeEnginePath } from "../../bin/lib/brain-engine-runner.mjs";
import { registerMindbrainWorkspace } from "../../bin/lib/mindbrain-workspace-register.mjs";

const pkgRoot = resolve(import.meta.dirname, "../..");
const nativeEngineAvailable =
  resolveNativeEnginePath(pkgRoot, { preferDev: true }) !== null;
const describeNative = nativeEngineAvailable ? describe : describe.skip;

describeNative("mindbrain workspace registration", () => {
  it("does not reset an existing workspace metadata, columns, or data", () => {
    const root = mkdtempSync(join(tmpdir(), "g08-workspace-register-"));
    const sqlitePath = join(root, "workspace.sqlite");

    try {
      const first = registerMindbrainWorkspace({
        pkgRoot,
        sqlitePath,
        workspaceId: "g08-existing",
        label: "Original label",
        description: "Original description",
        profile: "original-profile",
        quiet: true
      });
      expect(first.ok, first.stderr || first.stdout).toBe(true);

      const database = new DatabaseSync(sqlitePath);
      try {
        const workspaceBefore = database
          .prepare("SELECT * FROM workspaces WHERE workspace_id = ?")
          .get("g08-existing");
        expect(workspaceBefore).toBeDefined();

        database.exec(
          "CREATE TABLE g08_workspace_data (workspace_id TEXT NOT NULL, value TEXT NOT NULL)"
        );
        database
          .prepare("INSERT INTO g08_workspace_data(workspace_id, value) VALUES (?, ?)")
          .run("g08-existing", "must-survive");
        const columnsBefore = database
          .prepare("PRAGMA table_info(workspaces)")
          .all();

        const second = registerMindbrainWorkspace({
          pkgRoot,
          sqlitePath,
          workspaceId: "g08-existing",
          label: "Replacement label",
          description: "Replacement description",
          profile: "replacement-profile",
          quiet: true
        });
        expect(second.ok, second.stderr || second.stdout).toBe(true);

        const third = registerMindbrainWorkspace({
          pkgRoot,
          sqlitePath,
          workspaceId: "g08-existing",
          label: "Another replacement label",
          description: "Another replacement description",
          profile: "another-replacement-profile",
          quiet: true
        });
        expect(third.ok, third.stderr || third.stdout).toBe(true);

        expect(
          database
            .prepare("SELECT * FROM workspaces WHERE workspace_id = ?")
            .get("g08-existing")
        ).toEqual(workspaceBefore);
        expect(database.prepare("PRAGMA table_info(workspaces)").all()).toEqual(
          columnsBefore
        );
        expect(
          database
            .prepare("SELECT value FROM g08_workspace_data WHERE workspace_id = ?")
            .get("g08-existing")
        ).toEqual({ value: "must-survive" });
      } finally {
        database.close();
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
