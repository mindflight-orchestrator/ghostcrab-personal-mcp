import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  mergeClaudeSettingsFragment,
  mergeClaudeSettingsPermissions,
  mergeCursorPermissionsJson,
  pruneGhostcrabMcpRules
} from "../../bin/lib/mcp-permissions-adapters.mjs";
import {
  installIdeSkillsBundleForTarget,
  resolveIdeSkillsBundleRoot
} from "../../bin/lib/install-ide-skills.mjs";
import { PKG_ROOT } from "../../bin/lib/mcp-global-setup.mjs";

describe("mcp-permissions-adapters", () => {
  it("prunes ghostcrab MCP rules", () => {
    const rules = [
      "mcp__ghostcrab-personal-mcp__ghostcrab_status",
      "Bash(git status)",
      "mcp__other__tool"
    ];
    const pruned = pruneGhostcrabMcpRules(rules, ["ghostcrab-personal-mcp"]);
    expect(pruned).toEqual(["Bash(git status)", "mcp__other__tool"]);
  });

  it("merges Claude permissions without removing hooks", () => {
    const existing = {
      hooks: { SessionStart: [] },
      permissions: { allow: ["mcp__ghostcrab-personal-mcp__ghostcrab_status"] }
    };
    const merged = mergeClaudeSettingsPermissions(
      existing,
      { allow: ["mcp__ghostcrab-personal-mcp__ghostcrab_search"] },
      { force: false }
    );
    expect(merged.hooks).toEqual(existing.hooks);
    expect(merged.permissions.allow).toContain(
      "mcp__ghostcrab-personal-mcp__ghostcrab_search"
    );
  });

  it("mergeClaudeSettingsFragment adds hooks when missing", () => {
    const merged = mergeClaudeSettingsFragment(null, {
      hooks: { PostToolUse: [] }
    });
    expect(merged.hooks).toEqual({ PostToolUse: [] });
  });

  it("mergeCursorPermissionsJson deduplicates allowlist", () => {
    const merged = mergeCursorPermissionsJson(
      { mcpAllowlist: ["ghostcrab-personal-mcp:ghostcrab_status"] },
      ["ghostcrab-personal-mcp:ghostcrab_status", "ghostcrab-personal-mcp:ghostcrab_search"],
      { force: false }
    );
    expect(merged.mcpAllowlist).toHaveLength(2);
  });

  it("mergeCursorPermissionsJson force prunes ghostcrab entries before merge", () => {
    const merged = mergeCursorPermissionsJson(
      {
        mcpAllowlist: [
          "ghostcrab-personal-mcp:ghostcrab_status",
          "other-server:tool"
        ]
      },
      ["ghostcrab-personal-mcp:ghostcrab_search"],
      { force: true, serverNames: ["ghostcrab-personal-mcp"] }
    );
    expect(merged.mcpAllowlist).toEqual([
      "other-server:tool",
      "ghostcrab-personal-mcp:ghostcrab_search"
    ]);
  });
});

describe("apply permissions on disk", () => {
  let fakeHome = "";
  let cwd = "";
  /** @type {string | undefined} */
  let prevHome: string | undefined;

  afterEach(() => {
    if (fakeHome) {
      rmSync(fakeHome, { recursive: true, force: true });
      fakeHome = "";
    }
    if (cwd) {
      rmSync(cwd, { recursive: true, force: true });
      cwd = "";
    }
    if (prevHome !== undefined) {
      process.env.HOME = prevHome;
      process.env.USERPROFILE = prevHome;
    }
  });

  it("applyCursorPermissions writes 12 basic tools to HOME/.cursor/permissions.json", async () => {
    const { applyCursorPermissions } =
      await import("../../bin/lib/mcp-permissions-adapters.mjs");
    prevHome = process.env.HOME;
    fakeHome = mkdtempSync(join(tmpdir(), "gc-perm-cursor-home-"));
    process.env.HOME = fakeHome;
    process.env.USERPROFILE = fakeHome;

    const result = await applyCursorPermissions({
      preset: "basic",
      serverName: "ghostcrab-personal-mcp",
      force: true,
      dryRun: false
    });
    expect(result.ok).toBe(true);
    expect(result.allowCount).toBe(12);

    const doc = JSON.parse(
      readFileSync(join(fakeHome, ".cursor", "permissions.json"), "utf8")
    );
    expect(doc.mcpAllowlist).toHaveLength(12);
    expect(doc.mcpAllowlist[0]).toMatch(/^ghostcrab-personal-mcp:ghostcrab_/);
  });

  it("applyClaudePermissions project scope writes .claude/settings.json in cwd", async () => {
    const { applyClaudePermissions } =
      await import("../../bin/lib/mcp-permissions-adapters.mjs");
    cwd = mkdtempSync(join(tmpdir(), "gc-perm-claude-proj-"));

    const result = await applyClaudePermissions({
      preset: "basic",
      serverName: "ghostcrab-personal-mcp",
      permissionsScope: "project",
      cwd,
      force: true,
      dryRun: false
    });
    expect(result.ok).toBe(true);
    expect(result.allowCount).toBe(12);

    const settings = JSON.parse(
      readFileSync(join(cwd, ".claude", "settings.json"), "utf8")
    );
    expect(settings.permissions.allow).toHaveLength(12);
    expect(settings.permissions.allow[0]).toMatch(
      /^mcp__ghostcrab-personal-mcp__ghostcrab_/
    );
  });

  it("applyClaudePermissions force replaces stale ghostcrab allow rules", async () => {
    const { applyClaudePermissions } =
      await import("../../bin/lib/mcp-permissions-adapters.mjs");
    cwd = mkdtempSync(join(tmpdir(), "gc-perm-claude-force-"));
    mkdirSync(join(cwd, ".claude"), { recursive: true });
    writeFileSync(
      join(cwd, ".claude", "settings.json"),
      JSON.stringify(
        {
          permissions: {
            allow: [
              "mcp__ghostcrab-personal-mcp__ghostcrab_workspace_delete",
              "Bash(git status)"
            ]
          }
        },
        null,
        2
      )
    );

    await applyClaudePermissions({
      preset: "basic",
      serverName: "ghostcrab-personal-mcp",
      permissionsScope: "project",
      cwd,
      force: true,
      dryRun: false
    });

    const settings = JSON.parse(
      readFileSync(join(cwd, ".claude", "settings.json"), "utf8")
    );
    expect(settings.permissions.allow).toHaveLength(13);
    expect(settings.permissions.allow).not.toContain(
      "mcp__ghostcrab-personal-mcp__ghostcrab_workspace_delete"
    );
    expect(settings.permissions.allow).toContain("Bash(git status)");
    const ghostcrabRules = settings.permissions.allow.filter((r: string) =>
      r.startsWith("mcp__ghostcrab-personal-mcp__")
    );
    expect(ghostcrabRules).toHaveLength(12);
  });
});

describe("install-ide-skills bundles", () => {
  let cwd = "";
  let fakeHome = "";
  let prevHome: string | undefined;

  afterEach(() => {
    if (cwd) {
      rmSync(cwd, { recursive: true, force: true });
      cwd = "";
    }
    if (fakeHome) {
      rmSync(fakeHome, { recursive: true, force: true });
      fakeHome = "";
    }
    if (prevHome !== undefined) {
      process.env.HOME = prevHome;
      process.env.USERPROFILE = prevHome;
      prevHome = undefined;
    }
  });

  function useFakeHome() {
    prevHome = process.env.HOME;
    fakeHome = mkdtempSync(join(tmpdir(), "gc-skills-home-"));
    process.env.HOME = fakeHome;
    process.env.USERPROFILE = fakeHome;
  }

  it("resolves bin/ide-skills bundle root", () => {
    const root = resolveIdeSkillsBundleRoot(PKG_ROOT);
    expect(root).toBeTruthy();
    expect(existsSync(join(root!, "shared", "ONBOARDING_CONTRACT.md"))).toBe(true);
  });

  it("installs cursor bundle globally as selectable skills without rules", () => {
    cwd = mkdtempSync(join(tmpdir(), "gc-skills-cursor-"));
    useFakeHome();
    mkdirSync(join(cwd, ".cursor", "rules"), { recursive: true });
    writeFileSync(join(cwd, ".cursor", "rules", "ghostcrab-memory.mdc"), "legacy");
    const result = installIdeSkillsBundleForTarget({
      target: "cursor",
      cwd,
      pkgRoot: PKG_ROOT,
      force: true,
      context: "setup"
    });
    expect(result.ok).toBe(true);
    expect(
      existsSync(join(cwd, ".cursor", "rules", "ghostcrab-memory.mdc"))
    ).toBe(false);
    expect(
      existsSync(join(fakeHome, ".cursor", "skills", "ghostcrab-memory", "SKILL.md"))
    ).toBe(true);
    expect(
      existsSync(join(fakeHome, ".cursor", "skills", "mindbrain-comparison-writer", "references", "article-blueprint.md"))
    ).toBe(true);
    expect(
      existsSync(join(fakeHome, ".cursor", "skills", "ghostcrab-shared", "ONBOARDING_CONTRACT.md"))
    ).toBe(true);
    expect(
      existsSync(join(cwd, ".ghostcrab", "skills", "shared", "ONBOARDING_CONTRACT.md"))
    ).toBe(true);
    expect(
      existsSync(join(cwd, ".ghostcrab", "skills", "installed.json"))
    ).toBe(true);
    expect(
      existsSync(join(cwd, ".ghostcrab", "skills", "installed-cursor.json"))
    ).toBe(true);
    const skill = readFileSync(
      join(fakeHome, ".cursor", "skills", "ghostcrab-memory", "SKILL.md"),
      "utf8"
    );
    expect(skill).toContain("disable-model-invocation: true");
  });

  it("can install cursor skills project-locally on explicit scope", () => {
    cwd = mkdtempSync(join(tmpdir(), "gc-skills-cursor-project-"));
    useFakeHome();
    const result = installIdeSkillsBundleForTarget({
      target: "cursor",
      cwd,
      pkgRoot: PKG_ROOT,
      force: true,
      context: "setup",
      scope: "project"
    });
    expect(result.ok).toBe(true);
    expect(
      existsSync(join(cwd, ".cursor", "skills", "ghostcrab-memory", "SKILL.md"))
    ).toBe(true);
    expect(
      existsSync(join(fakeHome, ".cursor", "skills", "ghostcrab-memory", "SKILL.md"))
    ).toBe(false);
  });

  it("installs claude bundle globally with user settings merge", () => {
    cwd = mkdtempSync(join(tmpdir(), "gc-skills-claude-"));
    useFakeHome();
    mkdirSync(join(fakeHome, ".claude"), { recursive: true });
    writeFileSync(
      join(fakeHome, ".claude", "settings.json"),
      JSON.stringify({ hooks: { SessionStart: [] } }, null, 2)
    );

    const result = installIdeSkillsBundleForTarget({
      target: "claude-code",
      cwd,
      pkgRoot: PKG_ROOT,
      force: true,
      context: "setup",
      permissionsAllow: ["mcp__ghostcrab-personal-mcp__ghostcrab_status"]
    });
    expect(result.ok).toBe(true);
    const settings = JSON.parse(
      readFileSync(join(fakeHome, ".claude", "settings.json"), "utf8")
    );
    expect(settings.hooks.SessionStart).toEqual([]);
    expect(settings.permissions.allow).toContain(
      "mcp__ghostcrab-personal-mcp__ghostcrab_status"
    );
    expect(
      existsSync(join(fakeHome, ".claude", "skills", "ghostcrab-memory", "SKILL.md"))
    ).toBe(true);
    expect(
      existsSync(join(fakeHome, ".claude", "skills", "ghostcrab-data-architect", "SKILL.md"))
    ).toBe(true);
    expect(
      existsSync(join(fakeHome, ".claude", "skills", "ghostcrab-shared", "ONBOARDING_CONTRACT.md"))
    ).toBe(true);
    const installed = JSON.parse(
      readFileSync(join(cwd, ".ghostcrab", "skills", "installed.json"), "utf8")
    );
    expect(installed.target).toBe("claude-code");
    expect(installed.scope).toBe("user");
    expect(installed.skills).toContain("mindbrain-comparison-writer");
  });

  it("installs codex bundle globally into .agents skills with patched shared links", () => {
    cwd = mkdtempSync(join(tmpdir(), "gc-skills-codex-"));
    useFakeHome();
    const result = installIdeSkillsBundleForTarget({
      target: "codex",
      cwd,
      pkgRoot: PKG_ROOT,
      force: true,
      context: "setup"
    });
    expect(result.ok).toBe(true);
    const skill = readFileSync(
      join(fakeHome, ".agents", "skills", "ghostcrab-memory", "SKILL.md"),
      "utf8"
    );
    expect(skill).toContain("../ghostcrab-shared/ONBOARDING_CONTRACT.md");
    expect(
      existsSync(join(fakeHome, ".agents", "skills", "ghostcrab-prompt-guide", "SKILL.md"))
    ).toBe(true);
    expect(
      existsSync(join(fakeHome, ".agents", "skills", "ghostcrab-memory", "agents", "openai.yaml"))
    ).toBe(true);
    expect(
      existsSync(
        join(fakeHome, ".agents", "skills", "ghostcrab-shared", "ONBOARDING_CONTRACT.md")
      )
    ).toBe(true);
    const installed = JSON.parse(
      readFileSync(join(cwd, ".ghostcrab", "skills", "installed.json"), "utf8")
    );
    expect(installed.installedSkillRoot).toContain(join(".agents", "skills"));
  });

  it("installs generic bundle into .agents skills", () => {
    cwd = mkdtempSync(join(tmpdir(), "gc-skills-generic-"));
    useFakeHome();
    const result = installIdeSkillsBundleForTarget({
      target: "generic",
      cwd,
      pkgRoot: PKG_ROOT,
      force: true,
      context: "setup"
    });
    expect(result.ok).toBe(true);
    expect(
      existsSync(join(fakeHome, ".agents", "skills", "ghostcrab-memory", "SKILL.md"))
    ).toBe(true);
    expect(
      existsSync(join(fakeHome, ".agents", "skills", "ghostcrab-shared", "ONBOARDING_CONTRACT.md"))
    ).toBe(true);
    const installed = JSON.parse(
      readFileSync(join(cwd, ".ghostcrab", "skills", "installed.json"), "utf8")
    );
    expect(installed.target).toBe("generic");
  });
});
