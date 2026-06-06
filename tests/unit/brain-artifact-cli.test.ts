import { describe, expect, it } from "vitest";

import { __private__ } from "../../bin/commands/brain-artifact.mjs";

describe("gcp brain artifact command helpers", () => {
  it("re-exports parseArtifactArgs from shared lib", () => {
    expect(__private__.parseArtifactArgs(["list", "--kind", "analysis_plan"])).toMatchObject({
      subcommand: "list",
      kind: "analysis_plan"
    });
  });

  it("builds migrate engine args for repair", () => {
    expect(
      __private__.buildArtifactMigrateEngineArgs("/tmp/brain.sqlite", {
        dryRun: false,
        repair: true
      })
    ).toEqual([
      "artifact-migrate",
      "--db",
      "/tmp/brain.sqlite",
      "--repair"
    ]);
  });
});
