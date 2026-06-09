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

  it("prints refresh help with exact-id, no-wildcard, and 405 guidance", () => {
    const help = __private__.artifactHelpText();
    expect(help).toContain("The id must be exact");
    expect(help).toContain("globs/wildcards");
    expect(help).toContain("live_answer_view__foo_*");
    expect(help).toContain("The refresh route is POST");
    expect(help).toContain("405 MethodNotAllowed");
  });
});
