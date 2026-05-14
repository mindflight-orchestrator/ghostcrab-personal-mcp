import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildMcpLaunch,
  cursorStdioEntryFromLaunch,
  findLocalGcpMjs,
  formatClaudeMcpAdd,
  formatCodexTomlBlock,
  getDefaultMcpEnv,
  mergeCursorMcpDocument,
} from "../../bin/lib/mcp-global-setup.mjs";

const SERVER_KEY = "ghostcrab-personal-mcp";

describe("mcp-global-setup", () => {
  let cleanCwd = "";
  beforeEach(() => {
    // Use a clean temp dir as cwd so a host-machine local install doesn't bias buildMcpLaunch.
    cleanCwd = mkdtempSync(join(tmpdir(), "mcp-setup-"));
  });
  afterEach(() => {
    if (cleanCwd) {
      rmSync(cleanCwd, { recursive: true, force: true });
      cleanCwd = "";
    }
  });

  it("getDefaultMcpEnv returns stable defaults", () => {
    const e = getDefaultMcpEnv();
    expect(e).not.toHaveProperty("GHOSTCRAB_DATABASE_KIND");
    expect(e.GHOSTCRAB_EMBEDDINGS_MODE).toBe("disabled");
  });

  it("buildMcpLaunch pnpm with workspace", () => {
    const l = buildMcpLaunch({
      runner: "pnpm",
      packageName: "@mindflight/ghostcrab-personal-mcp",
      workspace: "my-app",
      cwd: cleanCwd,
    });
    expect(l.command).toBe("pnpm");
    expect(l.args).toEqual([
      "dlx",
      "@mindflight/ghostcrab-personal-mcp@latest",
      "gcp",
      "brain",
      "up",
      "--workspace",
      "my-app",
    ]);
  });

  it("buildMcpLaunch npx without local install uses --package= and absolute npx path", () => {
    const l = buildMcpLaunch({
      runner: "npx",
      packageName: "@x/pkg",
      workspace: null,
      cwd: cleanCwd,
    });
    expect(l.runner).toBe("npx");
    // command must be an absolute path to npx (or bare "npx" when not found on PATH in CI)
    expect(l.command === "npx" || l.command.endsWith("/npx")).toBe(true);
    expect(l.args).toEqual([
      "-y",
      "--package=@x/pkg@latest",
      "gcp",
      "brain",
      "up",
    ]);
  });

  it("buildMcpLaunch npx upgrades to node + absolute path when locally installed", () => {
    const pkgName = "@mindflight/ghostcrab-personal-mcp";
    const binDir = join(cleanCwd, "node_modules", "@mindflight", "ghostcrab-personal-mcp", "bin");
    mkdirSync(binDir, { recursive: true });
    const gcpMjs = join(binDir, "gcp.mjs");
    writeFileSync(gcpMjs, "#!/usr/bin/env node\n");

    const l = buildMcpLaunch({
      runner: "npx",
      packageName: pkgName,
      workspace: null,
      cwd: cleanCwd,
    });
    expect(l.runner).toBe("node");
    expect(l.command).toBe(process.execPath);
    expect(l.args).toEqual([gcpMjs, "brain", "up"]);
  });

  it("buildMcpLaunch node throws when no local install is found", () => {
    expect(() =>
      buildMcpLaunch({
        runner: "node",
        packageName: "@mindflight/ghostcrab-personal-mcp",
        workspace: null,
        cwd: cleanCwd,
      })
    ).toThrow(/could not find/i);
  });

  it("buildMcpLaunch gcp uses absolute PATH-resolved binary or throws", () => {
    try {
      const l = buildMcpLaunch({
        runner: "gcp",
        packageName: "ignored",
        workspace: "w",
        cwd: cleanCwd,
      });
      expect(l.command).not.toBe("gcp"); // must be absolute, never bare
      expect(l.command.endsWith("/gcp") || l.command.endsWith("\\gcp.exe")).toBe(true);
      expect(l.args).toEqual(["brain", "up", "--workspace", "w"]);
    } catch (e) {
      expect((e as Error).message).toMatch(/no gcp on PATH/);
    }
  });

  it("findLocalGcpMjs walks up parent directories", () => {
    const pkgName = "@mindflight/ghostcrab-personal-mcp";
    const binDir = join(cleanCwd, "node_modules", "@mindflight", "ghostcrab-personal-mcp", "bin");
    mkdirSync(binDir, { recursive: true });
    const gcpMjs = join(binDir, "gcp.mjs");
    writeFileSync(gcpMjs, "x");

    const child = join(cleanCwd, "deep", "nested");
    mkdirSync(child, { recursive: true });
    expect(findLocalGcpMjs(child, pkgName)).toBe(gcpMjs);
  });

  it("findLocalGcpMjs returns null when no install is reachable", () => {
    expect(findLocalGcpMjs(cleanCwd, "@x/missing")).toBeNull();
  });

  it("mergeCursorMcpDocument refuses duplicate without force", () => {
    const existing = {
      mcpServers: {
        [SERVER_KEY]: { type: "stdio", command: "old" },
      },
    };
    const entry = {
      type: "stdio",
      command: "pnpm",
      args: ["a"],
      env: getDefaultMcpEnv(),
    };
    const r = mergeCursorMcpDocument(existing, entry, { force: false });
    expect("error" in r && r.error).toBe("exists");
  });

  it("mergeCursorMcpDocument replaces with force", () => {
    const existing = {
      mcpServers: {
        [SERVER_KEY]: { type: "stdio", command: "old" },
      },
    };
    const entry = {
      type: "stdio",
      command: "node",
      args: ["/abs/path/bin/gcp.mjs", "brain", "up"],
      env: { GHOSTCRAB_EMBEDDINGS_MODE: "disabled" },
    };
    const r = mergeCursorMcpDocument(existing, entry, { force: true });
    if (!("doc" in r)) throw new Error("expected doc");
    expect(r.doc.mcpServers[SERVER_KEY].command).toBe("node");
  });

  it("mergeCursorMcpDocument creates mcpServers from null using server key", () => {
    const entry = {
      type: "stdio",
      command: "node",
      args: ["/abs/bin/gcp.mjs", "brain", "up"],
      env: { ...getDefaultMcpEnv(), FOO: "bar" },
    };
    const r = mergeCursorMcpDocument(null, entry, { force: false });
    if (!("doc" in r)) throw new Error("expected doc");
    expect(r.doc.mcpServers[SERVER_KEY]).toBeDefined();
    expect(r.doc.mcpServers[SERVER_KEY].env?.FOO).toBe("bar");
    expect(r.prunedLegacy).toEqual([]);
  });

  it("mergeCursorMcpDocument prunes legacy 'ghostcrab' entry that we wrote", () => {
    const existing = {
      mcpServers: {
        ghostcrab: {
          type: "stdio",
          command: "npx",
          args: ["-y", "@mindflight/ghostcrab-personal-mcp@latest", "gcp", "brain", "up"],
          env: { GHOSTCRAB_EMBEDDINGS_MODE: "disabled" },
        },
        unrelated: {
          type: "stdio",
          command: "other-server",
          args: [],
          env: { OTHER: "1" },
        },
      },
    };
    const entry = {
      type: "stdio",
      command: "node",
      args: ["/abs/bin/gcp.mjs", "brain", "up"],
      env: getDefaultMcpEnv(),
    };
    const r = mergeCursorMcpDocument(existing, entry, { force: false });
    if (!("doc" in r)) throw new Error("expected doc");
    expect(r.doc.mcpServers[SERVER_KEY]).toBeDefined();
    expect(r.doc.mcpServers.ghostcrab).toBeUndefined();
    expect(r.doc.mcpServers.unrelated).toBeDefined();
    expect(r.prunedLegacy).toEqual(["ghostcrab"]);
  });

  it("mergeCursorMcpDocument never prunes a 'ghostcrab' entry that is not ours", () => {
    const existing = {
      mcpServers: {
        ghostcrab: {
          type: "stdio",
          command: "user-thing",
          args: [],
          env: { UNRELATED: "1" },
        },
      },
    };
    const entry = {
      type: "stdio",
      command: "node",
      args: ["/abs/bin/gcp.mjs", "brain", "up"],
      env: getDefaultMcpEnv(),
    };
    const r = mergeCursorMcpDocument(existing, entry, { force: false });
    if (!("doc" in r)) throw new Error("expected doc");
    expect(r.doc.mcpServers.ghostcrab).toBeDefined();
    expect(r.prunedLegacy).toEqual([]);
  });

  it("cursorStdioEntryFromLaunch includes merged env", () => {
    const launch = {
      command: "pnpm",
      args: ["dlx", "@p@latest", "gcp", "brain", "up"],
    };
    const env = { ...getDefaultMcpEnv(), GHOSTCRAB_SQLITE_PATH: "/tmp/x.sqlite" };
    const e = cursorStdioEntryFromLaunch(launch, env);
    expect(e.type).toBe("stdio");
    expect(e.env.GHOSTCRAB_SQLITE_PATH).toBe("/tmp/x.sqlite");
  });

  it("formatCodexTomlBlock includes env table under the new server key", () => {
    const t = formatCodexTomlBlock("pnpm", ["dlx", "@p@latest", "gcp", "brain", "up"], {
      A: "1",
      B: "2",
    });
    expect(t).toContain(`[mcp_servers.${SERVER_KEY}]`);
    expect(t).toContain(`[mcp_servers.${SERVER_KEY}.env]`);
    expect(t).toContain(`A = "1"`);
  });

  it("formatClaudeMcpAdd builds a multiline command with the new server key", () => {
    const s = formatClaudeMcpAdd("pnpm dlx @p@latest gcp brain up", getDefaultMcpEnv(), false);
    expect(s).toContain("claude mcp add --transport stdio");
    expect(s).not.toContain("GHOSTCRAB_DATABASE_KIND");
    expect(s).toContain(`${SERVER_KEY} --`);
  });

  it("formatClaudeMcpAdd with scope project", () => {
    const s = formatClaudeMcpAdd("gcp brain up", getDefaultMcpEnv(), true);
    expect(s).toContain("--scope project");
  });
});
