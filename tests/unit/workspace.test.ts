import { describe, expect, it } from "vitest";

import { WORKSPACE_ID_REGEX, WorkspaceIdSchema, CreateWorkspaceInputSchema } from "../../src/types/workspace.js";

describe("WORKSPACE_ID_REGEX", () => {
  it("accepts valid ids", () => {
    const valid = ["default", "my-workspace", "ws1", "prod-eu-west", "ab"];
    for (const id of valid) {
      expect(WORKSPACE_ID_REGEX.test(id), id).toBe(true);
    }
  });

  it("rejects ids starting with a digit", () => {
    expect(WORKSPACE_ID_REGEX.test("1bad")).toBe(false);
  });

  it("rejects ids with uppercase", () => {
    expect(WORKSPACE_ID_REGEX.test("MyWorkspace")).toBe(false);
  });

  it("rejects ids with underscores", () => {
    expect(WORKSPACE_ID_REGEX.test("my_workspace")).toBe(false);
  });

  it("rejects single-char ids", () => {
    expect(WORKSPACE_ID_REGEX.test("a")).toBe(false);
  });

  it("rejects ids ending with a hyphen", () => {
    expect(WORKSPACE_ID_REGEX.test("bad-")).toBe(false);
  });
});

describe("WorkspaceIdSchema", () => {
  it("parses valid id", () => {
    expect(WorkspaceIdSchema.parse("default")).toBe("default");
  });

  it("throws on invalid id", () => {
    expect(() => WorkspaceIdSchema.parse("Bad_ID")).toThrow();
  });
});

describe("CreateWorkspaceInputSchema", () => {
  it("parses complete input", () => {
    const result = CreateWorkspaceInputSchema.parse({
      id: "my-ws",
      label: "My Workspace",
      description: "Test workspace",
      created_by: "agent"
    });
    expect(result.id).toBe("my-ws");
    expect(result.label).toBe("My Workspace");
    expect(result.description).toBe("Test workspace");
    expect(result.created_by).toBe("agent");
  });

  it("parses minimal input (id + label only)", () => {
    const result = CreateWorkspaceInputSchema.parse({
      id: "ab",
      label: "Min"
    });
    expect(result.description).toBeUndefined();
    expect(result.created_by).toBeUndefined();
  });

  it("rejects missing label", () => {
    expect(() =>
      CreateWorkspaceInputSchema.parse({ id: "ws1" })
    ).toThrow();
  });

  it("rejects invalid workspace_id", () => {
    expect(() =>
      CreateWorkspaceInputSchema.parse({ id: "Bad", label: "x" })
    ).toThrow();
  });
});
