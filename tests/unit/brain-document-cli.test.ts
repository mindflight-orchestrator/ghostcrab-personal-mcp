import { describe, expect, it } from "vitest";

import { __private__ } from "../../bin/commands/brain-document.mjs";

describe("gcp brain document helpers", () => {
  it("classifies normalize/profile commands as not using the SQLite database", () => {
    expect(__private__.subcommandUsesDatabase("document-normalize")).toBe(
      false
    );
    expect(__private__.subcommandUsesDatabase("document-profile")).toBe(false);
    expect(__private__.subcommandUsesDatabase("corpus-eval")).toBe(false);
    expect(__private__.subcommandUsesDatabase("simulate")).toBe(false);
  });

  it("classifies enqueue/worker commands as database-backed", () => {
    expect(__private__.subcommandUsesDatabase("document-profile-enqueue")).toBe(
      true
    );
    expect(__private__.subcommandUsesDatabase("document-profile-worker")).toBe(
      true
    );
    expect(__private__.subcommandUsesDatabase("collection-import")).toBe(true);
    expect(__private__.subcommandUsesDatabase("qualification-vocab-list")).toBe(
      true
    );
    expect(__private__.subcommandUsesDatabase("document-qualify")).toBe(true);
  });

  it("parses wrapper-level --db without forwarding it as a raw argument", () => {
    expect(
      __private__.parseDocumentArgs([
        "--workspace",
        "My App",
        "--db",
        "/tmp/docs.sqlite",
        "--force",
        "document-profile-worker",
        "--limit",
        "2"
      ])
    ).toEqual({
      workspaceName: "my-app",
      sqlitePathFromCli: "/tmp/docs.sqlite",
      force: true,
      forward: ["document-profile-worker", "--limit", "2"]
    });
  });

  it("injects --db exactly once for database-backed document commands", () => {
    expect(
      __private__.buildDocumentEngineArgs(
        ["document-profile-worker", "--limit", "2"],
        "/tmp/docs.sqlite"
      )
    ).toEqual([
      "document-profile-worker",
      "--db",
      "/tmp/docs.sqlite",
      "--limit",
      "2"
    ]);
  });

  it("does not inject --db for document commands that do not use SQLite", () => {
    expect(
      __private__.buildDocumentEngineArgs(
        ["document-normalize", "--input", "paper.pdf", "--output-dir", "out"],
        "/tmp/docs.sqlite"
      )
    ).toEqual([
      "document-normalize",
      "--input",
      "paper.pdf",
      "--output-dir",
      "out"
    ]);
  });

  it("injects --db for qualification commands", () => {
    expect(
      __private__.buildDocumentEngineArgs(
        [
          "document-qualify",
          "--workspace-id",
          "ws",
          "--collection-id",
          "ws::docs",
          "--taxonomies",
          "ws::core",
          "--facets",
          "topic.category",
          "--dry-run"
        ],
        "/tmp/docs.sqlite"
      )
    ).toEqual([
      "document-qualify",
      "--db",
      "/tmp/docs.sqlite",
      "--workspace-id",
      "ws",
      "--collection-id",
      "ws::docs",
      "--taxonomies",
      "ws::core",
      "--facets",
      "topic.category",
      "--dry-run"
    ]);
  });

  it("formats backend lock diagnostics with writer status details", () => {
    const message = __private__.formatBackendRunningMessage(
      "/tmp/docs.sqlite",
      {
        url: "http://127.0.0.1:8091",
        pidFile: "/tmp/ghostcrab-backend.pid",
        writeStatus: {
          active_session_id: 7,
          busy_timeout_ms: 1000,
          completed: 3,
          failed: 1
        }
      }
    );

    expect(message).toContain("MindBrain backend appears to be running");
    expect(message).toContain("SQLite file: /tmp/docs.sqlite");
    expect(message).toContain("Backend URL: http://127.0.0.1:8091");
    expect(message).toContain('gcp brain db-who --path "/tmp/docs.sqlite"');
    expect(message).toContain("active_session_id=7");
    expect(message).toContain("busy_timeout_ms=1000");
  });
});
