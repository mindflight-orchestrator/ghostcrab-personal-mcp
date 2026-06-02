import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getConfigDir, getDataDir } from "../../bin/lib/data-dir.mjs";

describe("GhostCrab user directories", () => {
  let homeDir = "";
  let configDir = "";
  let dataDir = "";
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    homeDir = mkdtempSync(join(tmpdir(), "gc-home-"));
    configDir = mkdtempSync(join(tmpdir(), "gc-config-"));
    dataDir = mkdtempSync(join(tmpdir(), "gc-data-"));
    savedEnv = {
      HOME: process.env.HOME,
      USERPROFILE: process.env.USERPROFILE,
      GHOSTCRAB_HOME: process.env.GHOSTCRAB_HOME,
      GHOSTCRAB_CONFIG_DIR: process.env.GHOSTCRAB_CONFIG_DIR,
      GHOSTCRAB_DATA_DIR: process.env.GHOSTCRAB_DATA_DIR
    };
    process.env.HOME = homeDir;
    process.env.USERPROFILE = homeDir;
    delete process.env.GHOSTCRAB_HOME;
    delete process.env.GHOSTCRAB_CONFIG_DIR;
    delete process.env.GHOSTCRAB_DATA_DIR;
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = v;
      }
    }
    rmSync(homeDir, { recursive: true, force: true });
    rmSync(configDir, { recursive: true, force: true });
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("defaults config and data to ~/.ghostcrab", () => {
    expect(getConfigDir()).toBe(join(homeDir, ".ghostcrab"));
    expect(getDataDir()).toBe(join(homeDir, ".ghostcrab"));
  });

  it("supports GHOSTCRAB_HOME as a shared override", () => {
    process.env.GHOSTCRAB_HOME = join(homeDir, "custom-ghostcrab");
    expect(getConfigDir()).toBe(join(homeDir, "custom-ghostcrab"));
    expect(getDataDir()).toBe(join(homeDir, "custom-ghostcrab"));
  });

  it("lets specific config and data overrides win over GHOSTCRAB_HOME", () => {
    process.env.GHOSTCRAB_HOME = join(homeDir, "custom-ghostcrab");
    process.env.GHOSTCRAB_CONFIG_DIR = configDir;
    process.env.GHOSTCRAB_DATA_DIR = dataDir;
    expect(getConfigDir()).toBe(configDir);
    expect(getDataDir()).toBe(dataDir);
  });
});
