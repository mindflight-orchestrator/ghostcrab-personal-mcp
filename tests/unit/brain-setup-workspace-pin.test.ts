import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { parseSetupArgs } from "../../bin/commands/brain.mjs";

/**
 * Guards the install-cycle workspace pin: every IDE launch baked by
 * `gcp brain setup` must carry a deterministic GHOSTCRAB_ACTIVE_WORKSPACE_ID so
 * the MCP session never silently drifts back to the "default" workspace.
 */
describe("gcp brain setup — workspace pin variables", () => {
  let root = "";
  let prevConfigDir: string | undefined;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "gcp-setup-"));
    prevConfigDir = process.env.GHOSTCRAB_CONFIG_DIR;
    process.env.GHOSTCRAB_CONFIG_DIR = root;
  });

  afterEach(() => {
    if (prevConfigDir === undefined) delete process.env.GHOSTCRAB_CONFIG_DIR;
    else process.env.GHOSTCRAB_CONFIG_DIR = prevConfigDir;
    if (root) {
      rmSync(root, { recursive: true, force: true });
      root = "";
    }
  });

  function writeConfig(obj: Record<string, unknown>) {
    writeFileSync(join(root, "config.json"), JSON.stringify(obj), "utf8");
  }

  it("--mindbrain-workspace-id wins over --workspace and config default", () => {
    writeConfig({ defaultWorkspace: "cfg-ws" });
    const parsed = parseSetupArgs([
      "cursor",
      "--workspace",
      "flag-ws",
      "--mindbrain-workspace-id",
      "explicit-ws"
    ]) as { extraEnv: Record<string, string> };
    expect(parsed.extraEnv.GHOSTCRAB_ACTIVE_WORKSPACE_ID).toBe("explicit-ws");
  });

  it("--workspace pins the session when no explicit mindbrain id", () => {
    writeConfig({ defaultWorkspace: "cfg-ws" });
    const parsed = parseSetupArgs(["cursor", "--workspace", "flag-ws"]) as {
      extraEnv: Record<string, string>;
    };
    expect(parsed.extraEnv.GHOSTCRAB_ACTIVE_WORKSPACE_ID).toBe("flag-ws");
  });

  it("falls back to config.defaultWorkspace when no flags are given", () => {
    writeConfig({ defaultWorkspace: "serenity-coproprietes" });
    const parsed = parseSetupArgs(["cursor"]) as {
      extraEnv: Record<string, string>;
    };
    expect(parsed.extraEnv.GHOSTCRAB_ACTIVE_WORKSPACE_ID).toBe(
      "serenity-coproprietes"
    );
  });

  it("leaves the pin unset when there is no flag and no default workspace", () => {
    writeConfig({});
    const parsed = parseSetupArgs(["cursor"]) as {
      extraEnv: Record<string, string>;
    };
    expect(parsed.extraEnv.GHOSTCRAB_ACTIVE_WORKSPACE_ID).toBeUndefined();
  });

  it("respects an explicit --env GHOSTCRAB_ACTIVE_WORKSPACE_ID override", () => {
    writeConfig({ defaultWorkspace: "cfg-ws" });
    const parsed = parseSetupArgs([
      "cursor",
      "--env",
      "GHOSTCRAB_ACTIVE_WORKSPACE_ID=env-ws"
    ]) as { extraEnv: Record<string, string> };
    expect(parsed.extraEnv.GHOSTCRAB_ACTIVE_WORKSPACE_ID).toBe("env-ws");
  });
});
