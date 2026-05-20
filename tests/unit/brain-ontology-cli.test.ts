import { describe, expect, it } from "vitest";

import { __private__ } from "../../bin/commands/brain-ontology.mjs";

describe("gcp brain ontology helpers", () => {
  it("parses ontology import flags", () => {
    expect(
      __private__.parseOntologyImportArgs([
        "--workspace",
        "My App",
        "--db",
        "/tmp/brain.sqlite",
        "--workspace-id",
        "ws",
        "--ontology-id",
        "ws::owl",
        "--input",
        "ontology.nt",
        "--name",
        "OWL Core",
        "--materialize-graph",
        "--force"
      ])
    ).toEqual({
      workspaceName: "my-app",
      sqlitePathFromCli: "/tmp/brain.sqlite",
      workspaceId: "ws",
      ontologyId: "ws::owl",
      inputPath: "ontology.nt",
      name: "OWL Core",
      materializeGraph: true,
      force: true
    });
  });

  it("builds native ontology-import args", () => {
    const parsed = __private__.parseOntologyImportArgs([
      "--workspace-id",
      "ws",
      "--ontology-id",
      "ws::owl",
      "-i",
      "ontology.nt",
      "--materialize-graph"
    ]);

    expect(
      __private__.buildOntologyImportEngineArgs(parsed, "/tmp/brain.sqlite")
    ).toEqual([
      "ontology-import",
      "--db",
      "/tmp/brain.sqlite",
      "--workspace-id",
      "ws",
      "--ontology-id",
      "ws::owl",
      "--input",
      "ontology.nt",
      "--materialize-graph"
    ]);
  });

  it("requires import workspace, ontology and input", () => {
    expect(__private__.parseOntologyImportArgs([])).toEqual({
      error: "gcp brain ontology import: --workspace-id is required."
    });
    expect(
      __private__.parseOntologyImportArgs(["--workspace-id", "ws"])
    ).toEqual({
      error: "gcp brain ontology import: --ontology-id is required."
    });
    expect(
      __private__.parseOntologyImportArgs([
        "--workspace-id",
        "ws",
        "--ontology-id",
        "ws::owl"
      ])
    ).toEqual({
      error: "gcp brain ontology import: --input is required."
    });
  });

  it("parses ontology export flags", () => {
    expect(
      __private__.parseOntologyExportArgs([
        "--workspace",
        "My App",
        "--db",
        "/tmp/brain.sqlite",
        "--workspace-id",
        "ws",
        "--ontology-id",
        "ws::owl",
        "--format",
        "bundle",
        "-o",
        "taxonomy.json",
        "--force"
      ])
    ).toEqual({
      workspaceName: "my-app",
      sqlitePathFromCli: "/tmp/brain.sqlite",
      workspaceId: "ws",
      ontologyId: "ws::owl",
      outputPath: "taxonomy.json",
      format: "bundle",
      force: true
    });
  });

  it("builds native ontology-export args", () => {
    const parsed = __private__.parseOntologyExportArgs([
      "--workspace-id",
      "ws",
      "--ontology-id",
      "ws::owl",
      "--format",
      "bundle",
      "--output",
      "taxonomy.json"
    ]);

    expect(
      __private__.buildOntologyExportEngineArgs(parsed, "/tmp/brain.sqlite")
    ).toEqual([
      "ontology-export",
      "--db",
      "/tmp/brain.sqlite",
      "--ontology-id",
      "ws::owl",
      "--format",
      "bundle",
      "--workspace-id",
      "ws",
      "--output",
      "taxonomy.json"
    ]);
  });

  it("requires workspace id for bundle export", () => {
    expect(
      __private__.parseOntologyExportArgs([
        "--ontology-id",
        "ws::owl",
        "--format",
        "bundle"
      ])
    ).toEqual({
      error:
        "gcp brain ontology export: --format bundle requires --workspace-id."
    });
  });
});
