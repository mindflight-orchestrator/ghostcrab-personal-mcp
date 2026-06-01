import { describe, expect, it } from "vitest";

import { __private__ } from "../../bin/commands/brain-structured-import.mjs";

describe("gcp brain structured-import helpers", () => {
  it("classifies validate/dry-run/profile/infer as not using SQLite", () => {
    expect(__private__.subcommandUsesDatabase("validate")).toBe(false);
    expect(__private__.subcommandUsesDatabase("dry-run")).toBe(false);
    expect(__private__.subcommandUsesDatabase("profile")).toBe(false);
    expect(__private__.subcommandUsesDatabase("infer")).toBe(false);
  });

  it("classifies apply/project/reindex as database-backed", () => {
    expect(__private__.subcommandUsesDatabase("apply")).toBe(true);
    expect(__private__.subcommandUsesDatabase("project")).toBe(true);
    expect(__private__.subcommandUsesDatabase("reindex")).toBe(true);
  });

  it("maps npm subcommand to structured-import-* engine verb", () => {
    expect(
      __private__.buildStructuredImportEngineArgs(
        "validate",
        "structured-import-validate",
        ["--model", "model.json"],
        "/tmp/x.sqlite"
      )
    ).toEqual(["structured-import-validate", "--model", "model.json"]);
  });

  it("injects --db for apply", () => {
    expect(
      __private__.buildStructuredImportEngineArgs(
        "apply",
        "structured-import-apply",
        ["--workspace-id", "ws", "--facets", "f.csv"],
        "/tmp/db.sqlite"
      )
    ).toEqual([
      "structured-import-apply",
      "--db",
      "/tmp/db.sqlite",
      "--workspace-id",
      "ws",
      "--facets",
      "f.csv"
    ]);
  });
});
