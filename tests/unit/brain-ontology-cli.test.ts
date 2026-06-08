import { describe, expect, it } from "vitest";

import { __private__ } from "../../bin/commands/brain-ontology.mjs";

describe("gcp brain ontology helpers", () => {
  it("parses ontology compile flags", () => {
    expect(
      __private__.parseOntologyCompileArgs([
        "--workspace-id",
        "immeuble-demo",
        "--ontology-id",
        "immeuble-demo::core",
        "--input",
        "core.yaml",
        "--output",
        "slice.json",
        "--import-db"
      ])
    ).toEqual({
      workspaceName: null,
      sqlitePathFromCli: null,
      workspaceId: "immeuble-demo",
      ontologyId: "immeuble-demo::core",
      inputPath: "core.yaml",
      outputPath: "slice.json",
      ntriplesPath: null,
      importToDb: true,
      force: false,
      profile: null
    });
  });

  it("parses ontology compile --profile syndic", () => {
    expect(
      __private__.parseOntologyCompileArgs([
        "--workspace-id",
        "test-immo-mcp3",
        "--ontology-id",
        "test-immo-mcp3::core",
        "--input",
        "core.yaml",
        "--profile",
        "syndic",
        "--import-db"
      ])
    ).toEqual({
      workspaceName: null,
      sqlitePathFromCli: null,
      workspaceId: "test-immo-mcp3",
      ontologyId: "test-immo-mcp3::core",
      inputPath: "core.yaml",
      outputPath: null,
      ntriplesPath: null,
      importToDb: true,
      force: false,
      profile: "syndic"
    });
  });

  it("forwards --profile syndic to native compile args", () => {
    const parsed = __private__.parseOntologyCompileArgs([
      "--workspace-id",
      "test-immo-mcp3",
      "--ontology-id",
      "test-immo-mcp3::core",
      "--input",
      "core.yaml",
      "--profile",
      "syndic",
      "--import-db"
    ]);

    expect(
      __private__.buildOntologyCompileLinkmlEngineArgs(
        parsed,
        "/tmp/brain.sqlite"
      )
    ).toEqual([
      "ontology-compile-linkml",
      "--workspace-id",
      "test-immo-mcp3",
      "--ontology-id",
      "test-immo-mcp3::core",
      "--input",
      "core.yaml",
      "--profile",
      "syndic",
      "--db",
      "/tmp/brain.sqlite"
    ]);
  });

  it("parses ontology export-linkml flags", () => {
    expect(
      __private__.parseOntologyExportLinkmlArgs([
        "--ontology-id",
        "immeuble-demo::core",
        "--input",
        "bundle.json",
        "-o",
        "exported.yaml"
      ])
    ).toEqual({
      workspaceName: null,
      sqlitePathFromCli: null,
      ontologyId: "immeuble-demo::core",
      bundlePath: "bundle.json",
      outputPath: "exported.yaml"
    });
  });

  it("parses ontology inspect flags", () => {
    expect(
      __private__.parseOntologyInspectArgs([
        "--url",
        "http://127.0.0.1:8092/",
        "--workspace-id",
        "immeuble-demo",
        "--ontology-id",
        "immeuble-demo::core"
      ])
    ).toEqual({
      url: "http://127.0.0.1:8092/",
      workspaceId: "immeuble-demo",
      ontologyId: "immeuble-demo::core"
    });
  });

  it("builds ontology inspect HTTP URL", () => {
    const parsed = __private__.parseOntologyInspectArgs([
      "--workspace-id",
      "immeuble-demo",
      "--ontology-id",
      "immeuble-demo::core"
    ]);

    expect(
      __private__
        .buildOntologyInspectUrl("http://127.0.0.1:8092", parsed)
        .toString()
    ).toBe(
      "http://127.0.0.1:8092/api/mindbrain/ontology/inspect?ontology_id=immeuble-demo%3A%3Acore&workspace_id=immeuble-demo"
    );
  });

  it("builds native ontology-compile-linkml args", () => {
    const parsed = __private__.parseOntologyCompileArgs([
      "--workspace-id",
      "immeuble-demo",
      "--ontology-id",
      "immeuble-demo::core",
      "--input",
      "core.yaml",
      "--output",
      "slice.json",
      "--ntriples",
      "slice.nt",
      "--import-db"
    ]);

    expect(
      __private__.buildOntologyCompileLinkmlEngineArgs(
        parsed,
        "/tmp/brain.sqlite"
      )
    ).toEqual([
      "ontology-compile-linkml",
      "--workspace-id",
      "immeuble-demo",
      "--ontology-id",
      "immeuble-demo::core",
      "--input",
      "core.yaml",
      "--output",
      "slice.json",
      "--ntriples",
      "slice.nt",
      "--db",
      "/tmp/brain.sqlite"
    ]);
  });

  it("builds native ontology-export-linkml args", () => {
    const parsed = __private__.parseOntologyExportLinkmlArgs([
      "--ontology-id",
      "immeuble-demo::core",
      "--input",
      "bundle.json",
      "-o",
      "exported.yaml"
    ]);

    expect(__private__.buildOntologyExportLinkmlEngineArgs(parsed)).toEqual([
      "ontology-export-linkml",
      "--ontology-id",
      "immeuble-demo::core",
      "--input-bundle",
      "bundle.json",
      "--output",
      "exported.yaml"
    ]);
  });

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
