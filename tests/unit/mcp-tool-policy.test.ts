import { describe, expect, it } from "vitest";

import {
  buildToolPermissionPreset,
  DESTRUCTIVE_TOOL_NAMES,
  formatClaudeMcpRule,
  formatCursorMcpRule,
  policyToClaudePermissions,
  policyToCursorMcpAllowlist
} from "../../src/tools/mcp-tool-policy.js";
import { getBasicToolNames } from "../../src/tools/catalog.js";

describe("mcp-tool-policy", () => {
  const server = "ghostcrab-personal-mcp";

  it("basic preset exposes exactly 12 allow rules", () => {
    const policy = buildToolPermissionPreset("basic", { serverName: server });
    expect(policy.allow).toHaveLength(12);
    expect(policy.ask).toHaveLength(0);
    expect(getBasicToolNames()).toHaveLength(12);
    for (const name of getBasicToolNames()) {
      expect(policy.allow).toContainEqual({ serverName: server, toolName: name });
    }
  });

  it("balanced preset asks on destructive tools", () => {
    const policy = buildToolPermissionPreset("balanced", { serverName: server });
    for (const name of DESTRUCTIVE_TOOL_NAMES) {
      expect(policy.ask).toContainEqual({ serverName: server, toolName: name });
    }
    expect(policy.allow.some((ref) => ref.toolName === "ghostcrab_workspace_delete")).toBe(
      false
    );
  });

  it("formats Claude and Cursor rules", () => {
    expect(formatClaudeMcpRule(server, "ghostcrab_status")).toBe(
      "mcp__ghostcrab-personal-mcp__ghostcrab_status"
    );
    expect(formatCursorMcpRule(server, "ghostcrab_status")).toBe(
      "ghostcrab-personal-mcp:ghostcrab_status"
    );
  });

  it("renders policy to client-specific lists", () => {
    const policy = buildToolPermissionPreset("basic", { serverName: server });
    const claude = policyToClaudePermissions(policy);
    expect(claude.allow).toHaveLength(12);
    expect(claude.allow[0]).toMatch(/^mcp__ghostcrab-personal-mcp__/);

    const cursor = policyToCursorMcpAllowlist(policy);
    expect(cursor).toHaveLength(12);
    expect(cursor[0]).toMatch(/^ghostcrab-personal-mcp:ghostcrab_/);
  });

  it("custom preset honors explicit tool lists", () => {
    const policy = buildToolPermissionPreset("custom", {
      serverName: server,
      allowTools: ["ghostcrab_status", "ghostcrab_search"],
      askTools: ["ghostcrab_workspace_delete"]
    });
    expect(policy.allow).toHaveLength(2);
    expect(policy.ask).toHaveLength(1);
  });

  it("none preset is empty", () => {
    const policy = buildToolPermissionPreset("none", { serverName: server });
    expect(policy.allow).toHaveLength(0);
    expect(policy.ask).toHaveLength(0);
    expect(policy.deny).toHaveLength(0);
  });

  it("all preset allows entire server", () => {
    const policy = buildToolPermissionPreset("all", { serverName: server });
    expect(policy.allow).toEqual([{ serverName: server }]);
  });

  it("read preset asks on write and model tools", () => {
    const policy = buildToolPermissionPreset("read", { serverName: server });
    expect(policy.allow.length).toBeGreaterThan(0);
    expect(policy.ask.some((ref) => ref.toolName === "ghostcrab_remember")).toBe(
      true
    );
    expect(policy.ask.some((ref) => ref.toolName === "ghostcrab_project")).toBe(
      true
    );
    expect(policy.allow.some((ref) => ref.toolName === "ghostcrab_status")).toBe(
      true
    );
  });
});
