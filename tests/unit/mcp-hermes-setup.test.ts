import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildMcpLaunch,
  getDefaultMcpEnv
} from "../../bin/lib/mcp-global-setup.mjs";
import {
  defaultHermesDbPath,
  hermesStdioEntryFromLaunch,
  mergeHermesConfigDocument,
  resolveHermesToolsInclude,
  runSetupHermes
} from "../../bin/lib/mcp-hermes-setup.mjs";

describe("mcp-hermes-setup", () => {
  let cleanCwd = "";
  let hermesHome = "";

  beforeEach(() => {
    cleanCwd = mkdtempSync(join(tmpdir(), "hermes-setup-"));
    hermesHome = mkdtempSync(join(tmpdir(), "hermes-home-"));
  });

  afterEach(() => {
    for (const dir of [cleanCwd, hermesHome]) {
      if (dir) rmSync(dir, { recursive: true, force: true });
    }
    cleanCwd = "";
    hermesHome = "";
  });

  it("defaultHermesDbPath resolves under hermes home", () => {
    expect(defaultHermesDbPath("/tmp/.hermes")).toBe(
      "/tmp/.hermes/ghostcrab/ghostcrab.sqlite"
    );
  });

  it("hermesStdioEntryFromLaunch maps launch + env + tools.include", () => {
    const launch = { command: "npx", args: ["-y", "gcp", "brain", "up"] };
    const env = getDefaultMcpEnv();
    const entry = hermesStdioEntryFromLaunch(launch, env, [
      "ghostcrab_status",
      "ghostcrab_search"
    ]);
    expect(entry.command).toBe("npx");
    expect(entry.args).toEqual(["-y", "gcp", "brain", "up"]);
    expect(entry.tools).toEqual({
      include: ["ghostcrab_status", "ghostcrab_search"]
    });
  });

  it("mergeHermesConfigDocument refuses duplicate without force", () => {
    const existing = {
      mcp_servers: {
        "ghostcrab-personal-mcp": { command: "old", args: [] }
      }
    };
    const entry = { command: "npx", args: ["gcp"], env: getDefaultMcpEnv() };
    const r = mergeHermesConfigDocument(
      existing,
      "ghostcrab-personal-mcp",
      entry,
      { force: false }
    );
    expect("error" in r && r.error).toBe("exists");
  });

  it("mergeHermesConfigDocument preconfig external-dirs adds ~/.agents/skills", () => {
    const entry = { command: "npx", args: ["gcp"], env: getDefaultMcpEnv() };
    const r = mergeHermesConfigDocument(null, "ghostcrab-personal-mcp", entry, {
      preconfig: "external-dirs"
    });
    if (!("doc" in r)) throw new Error("expected doc");
    const agentsSuffix = join(".agents", "skills");
    expect(
      r.doc.skills.external_dirs.some((p: string) => p.endsWith(agentsSuffix))
    ).toBe(true);
  });

  it("buildMcpLaunch honors pinned package version in npx args", () => {
    const l = buildMcpLaunch({
      runner: "npx",
      packageName: "@mindflight/ghostcrab-personal-mcp@0.6.6",
      workspace: null,
      dbPath: "/tmp/hermes.sqlite",
      cwd: cleanCwd
    });
    expect(l.args).toContain(
      "--package=@mindflight/ghostcrab-personal-mcp@0.6.6"
    );
    expect(l.args).not.toContain(
      "--package=@mindflight/ghostcrab-personal-mcp@0.6.6@latest"
    );
  });

  it("resolveHermesToolsInclude returns basic tool names", async () => {
    const tools = await resolveHermesToolsInclude(
      "basic",
      "ghostcrab-personal-mcp"
    );
    expect(tools).toContain("ghostcrab_status");
    expect(tools).toContain("ghostcrab_search");
  });

  it("runSetupHermes dry-run writes nothing", async () => {
    const dbPath = defaultHermesDbPath(hermesHome);
    const out = await runSetupHermes({
      home: hermesHome,
      packageName: "@mindflight/ghostcrab-personal-mcp@0.6.6",
      runner: "npx",
      workspace: null,
      dbPath,
      serverName: "ghostcrab-personal-mcp",
      extraEnv: { GHOSTCRAB_ACTIVE_WORKSPACE_ID: "default" },
      dryRun: true,
      cwd: cleanCwd,
      permissionsPreset: "basic"
    });
    expect(out.ok).toBe(true);
    expect(out.doc?.mcp_servers?.["ghostcrab-personal-mcp"]?.args).toContain(
      "--db"
    );
    expect(() =>
      readFileSync(join(hermesHome, "config.yaml"), "utf8")
    ).toThrow();
  });

  it("runSetupHermes writes config.yaml and setup manifest", async () => {
    const dbPath = defaultHermesDbPath(hermesHome);
    const out = await runSetupHermes({
      home: hermesHome,
      packageName: "@mindflight/ghostcrab-personal-mcp@0.6.6",
      runner: "npx",
      workspace: null,
      dbPath,
      serverName: "ghostcrab-personal-mcp",
      extraEnv: { GHOSTCRAB_ACTIVE_WORKSPACE_ID: "default" },
      dryRun: false,
      cwd: cleanCwd,
      permissionsPreset: "basic",
      preconfig: "minimal"
    });
    expect(out.ok).toBe(true);
    const raw = readFileSync(join(hermesHome, "config.yaml"), "utf8");
    expect(raw).toContain("GhostCrab Personal MCP");
    const parsed = parseYaml(raw.replace(/^#.*\n/gm, ""));
    expect(parsed.mcp_servers["ghostcrab-personal-mcp"].command).toBeTruthy();
    expect(
      parsed.mcp_servers["ghostcrab-personal-mcp"].tools.include
    ).toContain("ghostcrab_status");
    expect(parsed.skills.external_dirs).toEqual([]);

    const manifest = JSON.parse(
      readFileSync(join(hermesHome, "ghostcrab", "setup-manifest.json"), "utf8")
    );
    expect(manifest.installer).toBe("gcp brain setup hermes");
    expect(manifest.db_path).toBe(dbPath);
  });
});
