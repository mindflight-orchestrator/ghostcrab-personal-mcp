import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
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
  runSetupClaude,
  runSetupCodex
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
      cwd: cleanCwd
    });
    expect(l.command).toBe("pnpm");
    expect(l.args).toEqual([
      "dlx",
      "@mindflight/ghostcrab-personal-mcp@latest",
      "gcp",
      "brain",
      "up",
      "--workspace",
      "my-app"
    ]);
  });

  it("buildMcpLaunch includes db path after workspace", () => {
    const l = buildMcpLaunch({
      runner: "pnpm",
      packageName: "@mindflight/ghostcrab-personal-mcp",
      workspace: "my-app",
      dbPath: "/tmp/ghostcrab.sqlite",
      cwd: cleanCwd
    });
    expect(l.args).toEqual([
      "dlx",
      "@mindflight/ghostcrab-personal-mcp@latest",
      "gcp",
      "brain",
      "up",
      "--workspace",
      "my-app",
      "--db",
      "/tmp/ghostcrab.sqlite"
    ]);
  });

  it("buildMcpLaunch npx without local install uses --package= and absolute npx path", () => {
    const l = buildMcpLaunch({
      runner: "npx",
      packageName: "@x/pkg",
      workspace: null,
      cwd: cleanCwd
    });
    expect(l.runner).toBe("npx");
    // command must be an absolute path to npx (or bare "npx" when not found on PATH in CI)
    expect(l.command === "npx" || l.command.endsWith("/npx")).toBe(true);
    expect(l.args).toEqual([
      "-y",
      "--package=@x/pkg@latest",
      "gcp",
      "brain",
      "up"
    ]);
  });

  it("buildMcpLaunch npx upgrades to node + absolute path when locally installed", () => {
    const pkgName = "@mindflight/ghostcrab-personal-mcp";
    const binDir = join(
      cleanCwd,
      "node_modules",
      "@mindflight",
      "ghostcrab-personal-mcp",
      "bin"
    );
    mkdirSync(binDir, { recursive: true });
    const gcpMjs = join(binDir, "gcp.mjs");
    writeFileSync(gcpMjs, "#!/usr/bin/env node\n");

    const l = buildMcpLaunch({
      runner: "npx",
      packageName: pkgName,
      workspace: null,
      cwd: cleanCwd
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
        cwd: cleanCwd
      })
    ).toThrow(/could not find/i);
  });

  it("buildMcpLaunch gcp uses absolute PATH-resolved binary or throws", () => {
    try {
      const l = buildMcpLaunch({
        runner: "gcp",
        packageName: "ignored",
        workspace: "w",
        cwd: cleanCwd
      });
      expect(l.command).not.toBe("gcp"); // must be absolute, never bare
      expect(
        l.command.endsWith("/gcp") || l.command.endsWith("\\gcp.exe")
      ).toBe(true);
      expect(l.args).toEqual(["brain", "up", "--workspace", "w"]);
    } catch (e) {
      expect((e as Error).message).toMatch(/no gcp on PATH/);
    }
  });

  it("findLocalGcpMjs walks up parent directories", () => {
    const pkgName = "@mindflight/ghostcrab-personal-mcp";
    const binDir = join(
      cleanCwd,
      "node_modules",
      "@mindflight",
      "ghostcrab-personal-mcp",
      "bin"
    );
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
        [SERVER_KEY]: { type: "stdio", command: "old" }
      }
    };
    const entry = {
      type: "stdio",
      command: "pnpm",
      args: ["a"],
      env: getDefaultMcpEnv()
    };
    const r = mergeCursorMcpDocument(existing, entry, { force: false });
    expect("error" in r && r.error).toBe("exists");
  });

  it("mergeCursorMcpDocument replaces with force", () => {
    const existing = {
      mcpServers: {
        [SERVER_KEY]: { type: "stdio", command: "old" }
      }
    };
    const entry = {
      type: "stdio",
      command: "node",
      args: ["/abs/path/bin/gcp.mjs", "brain", "up"],
      env: { GHOSTCRAB_EMBEDDINGS_MODE: "disabled" }
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
      env: { ...getDefaultMcpEnv(), FOO: "bar" }
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
          args: [
            "-y",
            "@mindflight/ghostcrab-personal-mcp@latest",
            "gcp",
            "brain",
            "up"
          ],
          env: { GHOSTCRAB_EMBEDDINGS_MODE: "disabled" }
        },
        unrelated: {
          type: "stdio",
          command: "other-server",
          args: [],
          env: { OTHER: "1" }
        }
      }
    };
    const entry = {
      type: "stdio",
      command: "node",
      args: ["/abs/bin/gcp.mjs", "brain", "up"],
      env: getDefaultMcpEnv()
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
          env: { UNRELATED: "1" }
        }
      }
    };
    const entry = {
      type: "stdio",
      command: "node",
      args: ["/abs/bin/gcp.mjs", "brain", "up"],
      env: getDefaultMcpEnv()
    };
    const r = mergeCursorMcpDocument(existing, entry, { force: false });
    if (!("doc" in r)) throw new Error("expected doc");
    expect(r.doc.mcpServers.ghostcrab).toBeDefined();
    expect(r.prunedLegacy).toEqual([]);
  });

  it("cursorStdioEntryFromLaunch includes merged env", () => {
    const launch = {
      command: "pnpm",
      args: ["dlx", "@p@latest", "gcp", "brain", "up"]
    };
    const env = {
      ...getDefaultMcpEnv(),
      GHOSTCRAB_SQLITE_PATH: "/tmp/x.sqlite"
    };
    const e = cursorStdioEntryFromLaunch(launch, env);
    expect(e.type).toBe("stdio");
    expect(e.env.GHOSTCRAB_SQLITE_PATH).toBe("/tmp/x.sqlite");
  });

  it("formatCodexTomlBlock includes env table under the new server key", () => {
    const t = formatCodexTomlBlock(
      "pnpm",
      ["dlx", "@p@latest", "gcp", "brain", "up"],
      {
        A: "1",
        B: "2"
      }
    );
    expect(t).toContain(`[mcp_servers.${SERVER_KEY}]`);
    expect(t).toContain(`[mcp_servers.${SERVER_KEY}.env]`);
    expect(t).toContain(`A = "1"`);
  });

  it("formatCodexTomlBlock quotes server keys with spaces", () => {
    const t = formatCodexTomlBlock(
      "node",
      ["/x/gcp.mjs", "brain", "up"],
      {},
      "ghostcrab-personal-mcp story2doc"
    );
    expect(t).toContain(`[mcp_servers."ghostcrab-personal-mcp story2doc"]`);
  });

  it("runSetupCodex dry-run includes env flags, custom name, and db path", () => {
    const r = runSetupCodex({
      packageName: "@mindflight/ghostcrab-personal-mcp",
      runner: "pnpm",
      workspace: null,
      dbPath: "/tmp/story2doc.sqlite",
      serverName: "ghostcrab-personal-mcp story2doc",
      extraEnv: { GHOSTCRAB_EMBEDDINGS_MODE: "disabled" },
      dryRun: true,
      cwd: cleanCwd
    });
    expect(r.shell).toContain(`--env GHOSTCRAB_EMBEDDINGS_MODE=disabled`);
    expect(r.shell).toContain(`"ghostcrab-personal-mcp story2doc"`);
    expect(r.shell).toContain(`--db /tmp/story2doc.sqlite`);
    expect(r.toml).toContain(
      `[mcp_servers."ghostcrab-personal-mcp story2doc"]`
    );
  });

  it("formatClaudeMcpAdd builds a multiline user-scoped command with the new server key", () => {
    const s = formatClaudeMcpAdd(
      "pnpm dlx @p@latest gcp brain up",
      getDefaultMcpEnv(),
      "user"
    );
    expect(s).toContain("claude mcp add --transport stdio");
    expect(s).not.toContain("GHOSTCRAB_DATABASE_KIND");
    expect(s).toContain("--scope user");
    expect(s).toContain(`${SERVER_KEY} --`);
  });

  it("formatClaudeMcpAdd with scope project", () => {
    const s = formatClaudeMcpAdd("gcp brain up", getDefaultMcpEnv(), "project");
    expect(s).toContain("--scope project");
  });

  it("runSetupClaude dry-run includes explicit scope, custom name, env, and db path", () => {
    const r = runSetupClaude({
      packageName: "@mindflight/ghostcrab-personal-mcp",
      runner: "pnpm",
      workspace: null,
      dbPath: "/tmp/story2doc.sqlite",
      serverName: "ghostcrab-personal-mcp",
      scope: "user",
      extraEnv: { GHOSTCRAB_EMBEDDINGS_MODE: "disabled" },
      dryRun: true,
      cwd: cleanCwd
    });
    expect(r.shell).toContain("claude mcp add --transport stdio");
    expect(r.shell).toContain("--scope user");
    expect(r.shell).toContain("--env GHOSTCRAB_EMBEDDINGS_MODE=disabled");
    expect(r.shell).toContain("--db /tmp/story2doc.sqlite");
    expect(r.shell).toContain(`${SERVER_KEY} --`);
  });

  it("runSetupClaude force removes the scoped entry before add", () => {
    const logPath = join(cleanCwd, "claude-args.log");
    const claudeBin = join(cleanCwd, "claude-fake.mjs");
    writeFileSync(
      claudeBin,
      [
        "#!/usr/bin/env node",
        'import { appendFileSync } from "node:fs";',
        "appendFileSync(process.env.CLAUDE_TEST_LOG, JSON.stringify(process.argv.slice(2)) + '\\n');",
        "process.exit(0);",
        ""
      ].join("\n")
    );
    chmodSync(claudeBin, 0o755);

    const previousLogEnv = process.env.CLAUDE_TEST_LOG;
    process.env.CLAUDE_TEST_LOG = logPath;
    try {
      const r = runSetupClaude({
        packageName: "@mindflight/ghostcrab-personal-mcp",
        runner: "pnpm",
        workspace: null,
        scope: "local",
        force: true,
        dryRun: false,
        claudeBin,
        cwd: cleanCwd
      });
      expect(r.ok).toBe(true);
    } finally {
      if (previousLogEnv === undefined) {
        delete process.env.CLAUDE_TEST_LOG;
      } else {
        process.env.CLAUDE_TEST_LOG = previousLogEnv;
      }
    }

    const calls = readFileSync(logPath, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(calls[0]).toEqual([
      "mcp",
      "remove",
      "--scope",
      "local",
      SERVER_KEY
    ]);
    expect(calls[1]).toEqual([
      "mcp",
      "add",
      "--transport",
      "stdio",
      "--env",
      "GHOSTCRAB_EMBEDDINGS_MODE=disabled",
      "--scope",
      "local",
      SERVER_KEY,
      "--",
      "pnpm",
      "dlx",
      "@mindflight/ghostcrab-personal-mcp@latest",
      "gcp",
      "brain",
      "up"
    ]);
  });
});
