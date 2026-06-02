import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { PKG_ROOT } from "../../bin/lib/mcp-global-setup.mjs";
import { runSetupPostInstall } from "../../bin/lib/mcp-setup-post.mjs";

describe("runSetupPostInstall", () => {
  let cwd = "";
  let fakeHome = "";
  /** @type {string | undefined} */
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
    }
  });

  function useFakeHome() {
    prevHome = process.env.HOME;
    fakeHome = mkdtempSync(join(tmpdir(), "gc-setup-post-home-"));
    process.env.HOME = fakeHome;
    process.env.USERPROFILE = fakeHome;
  }

  it("dry-run cursor reports basic permissions (12 tools) and skill bundle", async () => {
    cwd = mkdtempSync(join(tmpdir(), "gc-setup-post-cwd-"));
    useFakeHome();

    const result = await runSetupPostInstall({
      target: "cursor",
      cwd,
      pkgRoot: PKG_ROOT,
      serverName: "ghostcrab-personal-mcp",
      permissionsPreset: "basic",
      permissionsScope: "user",
      skipPermissions: false,
      skipSkills: false,
      force: false,
      dryRun: true
    });

    expect(result.ok).toBe(true);
    const text = (result.messages ?? []).join("\n");
    expect(text).toMatch(/Would write Cursor mcpAllowlist \(basic, 12 tools\)/);
    expect(text).toMatch(/Would install cursor skill bundle from .*bin\/ide-skills/);
    expect(text).toContain(join(fakeHome, ".cursor", "skills"));
    expect(text).toMatch(/ghostcrab-memory/);
    expect(text).toMatch(/mindbrain-comparison-writer/);
    expect(text).toMatch(/Would write skill reference/);
  });

  it("skipPermissions skips cursor allowlist dry-run line", async () => {
    cwd = mkdtempSync(join(tmpdir(), "gc-setup-post-cwd-"));
    useFakeHome();

    const result = await runSetupPostInstall({
      target: "cursor",
      cwd,
      pkgRoot: PKG_ROOT,
      serverName: "ghostcrab-personal-mcp",
      permissionsPreset: "basic",
      permissionsScope: "user",
      skipPermissions: true,
      skipSkills: false,
      force: false,
      dryRun: true
    });

    expect(result.ok).toBe(true);
    const text = (result.messages ?? []).join("\n");
    expect(text).not.toMatch(/mcpAllowlist/);
    expect(text).toMatch(/Would install cursor skill bundle/);
    expect(text).toContain(join(fakeHome, ".cursor", "skills"));
  });

  it("skipSkills skips bundle install message", async () => {
    cwd = mkdtempSync(join(tmpdir(), "gc-setup-post-cwd-"));
    useFakeHome();

    const result = await runSetupPostInstall({
      target: "cursor",
      cwd,
      pkgRoot: PKG_ROOT,
      serverName: "ghostcrab-personal-mcp",
      permissionsPreset: "basic",
      permissionsScope: "user",
      skipPermissions: false,
      skipSkills: true,
      force: false,
      dryRun: true
    });

    expect(result.ok).toBe(true);
    const text = (result.messages ?? []).join("\n");
    expect(text).toMatch(/mcpAllowlist \(basic, 12 tools\)/);
    expect(text).not.toMatch(/skill bundle/);
  });

  it("codex dry-run installs skills only (no cursor/claude permissions)", async () => {
    cwd = mkdtempSync(join(tmpdir(), "gc-setup-post-cwd-"));
    useFakeHome();

    const result = await runSetupPostInstall({
      target: "codex",
      cwd,
      pkgRoot: PKG_ROOT,
      serverName: "ghostcrab-personal-mcp",
      permissionsPreset: "basic",
      permissionsScope: "user",
      skipPermissions: false,
      skipSkills: false,
      force: false,
      dryRun: true
    });

    expect(result.ok).toBe(true);
    const text = (result.messages ?? []).join("\n");
    expect(text).not.toMatch(/mcpAllowlist/);
    expect(text).not.toMatch(/Claude permissions/);
    expect(text).toMatch(/Would install codex skill bundle/);
    expect(text).toContain(join(fakeHome, ".agents", "skills"));
  });

  it("generic dry-run installs portable skills only", async () => {
    cwd = mkdtempSync(join(tmpdir(), "gc-setup-post-cwd-"));
    useFakeHome();

    const result = await runSetupPostInstall({
      target: "generic",
      cwd,
      pkgRoot: PKG_ROOT,
      serverName: "ghostcrab-personal-mcp",
      permissionsPreset: "none",
      permissionsScope: "user",
      skipPermissions: true,
      skipSkills: false,
      force: false,
      dryRun: true
    });

    expect(result.ok).toBe(true);
    const text = (result.messages ?? []).join("\n");
    expect(text).toMatch(/Would install generic skill bundle/);
    expect(text).toContain(join(fakeHome, ".agents", "skills"));
    expect(text).not.toMatch(/mcpAllowlist/);
    expect(text).not.toMatch(/Claude permissions/);
  });

  it("live cursor post-install writes permissions and skill bundle", async () => {
    cwd = mkdtempSync(join(tmpdir(), "gc-setup-post-cwd-"));
    useFakeHome();

    const result = await runSetupPostInstall({
      target: "cursor",
      cwd,
      pkgRoot: PKG_ROOT,
      serverName: "ghostcrab-personal-mcp",
      permissionsPreset: "basic",
      permissionsScope: "user",
      skipPermissions: false,
      skipSkills: false,
      force: true,
      dryRun: false
    });

    expect(result.ok).toBe(true);
    const { existsSync, readFileSync } = await import("node:fs");
    const permissionsPath = join(fakeHome, ".cursor", "permissions.json");
    expect(existsSync(permissionsPath)).toBe(true);
    const doc = JSON.parse(readFileSync(permissionsPath, "utf8")) as {
      mcpAllowlist: string[];
    };
    expect(doc.mcpAllowlist).toHaveLength(12);
    expect(existsSync(join(cwd, ".ghostcrab", "skills", "shared", "ONBOARDING_CONTRACT.md"))).toBe(
      true
    );
    expect(existsSync(join(cwd, ".cursor", "rules", "ghostcrab-memory.mdc"))).toBe(false);
    expect(existsSync(join(fakeHome, ".cursor", "skills", "ghostcrab-memory", "SKILL.md"))).toBe(true);
    expect(existsSync(join(cwd, ".ghostcrab", "skills", "installed.json"))).toBe(true);
  });
});
