import {
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
  parseUpgradeArgs,
  runInstallUpgrade
} from "../../bin/lib/install-upgrade.mjs";

describe("install upgrade", () => {
  let root = "";

  afterEach(() => {
    if (root) {
      rmSync(root, { recursive: true, force: true });
      root = "";
    }
  });

  function makePackageRoot() {
    root = mkdtempSync(join(tmpdir(), "ghostcrab-upgrade-"));
    const pkgRoot = join(
      root,
      "project",
      "node_modules",
      "@mindflight",
      "ghostcrab-personal-mcp"
    );
    mkdirSync(pkgRoot, { recursive: true });
    writeFileSync(
      join(root, "project", "package.json"),
      JSON.stringify({ name: "consumer", private: true }),
      "utf8"
    );
    writeFileSync(
      join(pkgRoot, "package.json"),
      JSON.stringify({
        name: "@mindflight/ghostcrab-personal-mcp",
        version: "0.5.2"
      }),
      "utf8"
    );
    mkdirSync(join(pkgRoot, "bin"), { recursive: true });
    writeFileSync(join(pkgRoot, "bin", "gcp.mjs"), "", "utf8");
    return pkgRoot;
  }

  it("parses upgrade flags", () => {
    expect(
      parseUpgradeArgs([
        "--dry-run",
        "--json",
        "--no-kill-mcp",
        "--skip-config-cleanup",
        "--db",
        "/tmp/x.sqlite"
      ])
    ).toMatchObject({
      dryRun: true,
      json: true,
      noKillMcp: true,
      skipConfigCleanup: true,
      sqlitePathFromCli: "/tmp/x.sqlite"
    });
    expect(parseUpgradeArgs(["--db", "x", "--default"])).toMatchObject({
      error: expect.stringContaining("either")
    });
  });

  it("dry-run inventories GhostCrab processes without killing them", async () => {
    const pkgRoot = makePackageRoot();
    const report = await runInstallUpgrade({
      pkgRoot,
      dryRun: true,
      noKillMcp: false,
      skipConfigCleanup: true,
      home: root,
      io: {
        spawnSync: () => ({
          status: 0,
          stdout:
            " 100 1 /usr/bin/node /x/bin/gcp.mjs brain up\n" +
            " 101 1 /bin/other\n" +
            ` ${process.pid} 1 current\n`
        })
      }
    });

    expect(report.processes.map((p) => p.pid)).toEqual([100]);
    expect(report.killed).toEqual([]);
  });

  it("discovers consumer data sqlite files during dry-run", async () => {
    const pkgRoot = makePackageRoot();
    const dbDir = join(root, "project", "data");
    mkdirSync(dbDir, { recursive: true });
    writeFileSync(
      join(dbDir, "legacy.sqlite"),
      "SQLite format 3\0mindbrain_schema_migrations",
      "utf8"
    );

    const report = await runInstallUpgrade({
      pkgRoot,
      dryRun: true,
      noKillMcp: true,
      skipConfigCleanup: true,
      home: root
    });

    expect(
      report.databases.some((db) => db.path.endsWith("legacy.sqlite"))
    ).toBe(true);
    const legacy = report.databases.find((db) =>
      db.path.endsWith("legacy.sqlite")
    );
    expect(legacy?.schemaMigrationTableLikely).toBe(true);
    expect(legacy?.migration).toBe("would-apply");
  });

  it("replaces Cursor GhostCrab entries and preserves unrelated MCP servers", async () => {
    const pkgRoot = makePackageRoot();
    const cursorDir = join(root, ".cursor");
    mkdirSync(cursorDir, { recursive: true });
    const mcpPath = join(cursorDir, "mcp.json");
    writeFileSync(
      mcpPath,
      JSON.stringify(
        {
          mcpServers: {
            ghostcrab: {
              command: "npx",
              args: ["-y", "@mindflight/ghostcrab-personal-mcp@0.4.4"]
            },
            unrelated: { command: "other", args: [] }
          }
        },
        null,
        2
      ),
      "utf8"
    );

    const report = await runInstallUpgrade({
      pkgRoot,
      dryRun: false,
      noKillMcp: true,
      skipConfigCleanup: false,
      sqlitePathFromCli: join(root, "missing.sqlite"),
      home: root
    });

    expect(report.configs[0]?.status).toBe("updated");
    const updated = JSON.parse(readFileSync(mcpPath, "utf8"));
    expect(updated.mcpServers.ghostcrab).toBeUndefined();
    expect(updated.mcpServers.unrelated).toBeDefined();
    expect(updated.mcpServers["ghostcrab-personal-mcp"].args).toContain(
      "brain"
    );
  });

  it("replaces Codex GhostCrab TOML sections and preserves unrelated sections", async () => {
    const pkgRoot = makePackageRoot();
    const codexDir = join(root, ".codex");
    mkdirSync(codexDir, { recursive: true });
    const configPath = join(codexDir, "config.toml");
    writeFileSync(
      configPath,
      [
        "[mcp_servers.ghostcrab]",
        'command = "npx"',
        'args = ["-y", "@mindflight/ghostcrab-personal-mcp@0.4.4"]',
        "",
        "[mcp_servers.ghostcrab.env]",
        'GHOSTCRAB_EMBEDDINGS_MODE = "disabled"',
        "",
        "[mcp_servers.other]",
        'command = "other"'
      ].join("\n"),
      "utf8"
    );

    const report = await runInstallUpgrade({
      pkgRoot,
      dryRun: false,
      noKillMcp: true,
      skipConfigCleanup: false,
      sqlitePathFromCli: join(root, "missing.sqlite"),
      home: root
    });

    const codex = report.configs.find((entry) => entry.kind === "codex");
    expect(codex?.status).toBe("updated");
    const updated = readFileSync(configPath, "utf8");
    expect(updated).not.toContain("[mcp_servers.ghostcrab]");
    expect(updated).toContain("[mcp_servers.other]");
    expect(updated).toContain("[mcp_servers.ghostcrab-personal-mcp]");
    expect(updated).toContain("gcp.mjs");
  });
});
