import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
import {
  parseUpgradeArgs,
  runInstallUpgrade,
  printUpgradeReport,
  diffSchemaMigrations
} from "../../bin/lib/install-upgrade.mjs";
import {
  readSchemaMigrations
} from "../../bin/lib/sqlite-file-count.mjs";

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

  it("diffSchemaMigrations returns rows present only after upgrade", () => {
    const before = [{ id: "a", appliedAt: "2026-01-01" }];
    const after = [
      { id: "a", appliedAt: "2026-01-01" },
      { id: "b", appliedAt: "2026-06-11" }
    ];
    expect(diffSchemaMigrations(before, after)).toEqual([
      { id: "b", appliedAt: "2026-06-11" }
    ]);
  });

  it("printUpgradeReport lists migrations applied this run", () => {
    const lines: string[] = [];
    printUpgradeReport(
      {
        ok: true,
        version: "0.5.2",
        installKind: "source",
        consumerRoot: null,
        processes: [],
        killed: [],
        databases: [
          {
            path: "/tmp/x.sqlite",
            exists: true,
            backup: "/tmp/x.bak.sqlite",
            migration: "applied",
            migrationsBefore: [{ id: "old", appliedAt: "2026-01-01" }],
            migrationsAfter: [
              { id: "old", appliedAt: "2026-01-01" },
              { id: "new", appliedAt: "2026-06-11" }
            ],
            appliedThisRun: [{ id: "new", appliedAt: "2026-06-11" }]
          }
        ],
        migrations: [],
        configs: [],
        errors: []
      },
      (line) => lines.push(line)
    );
    expect(lines.some((line) => line.includes("migrations applied this run"))).toBe(
      true
    );
    expect(lines.some((line) => line.includes("+ new"))).toBe(true);
    expect(lines.some((line) => line.includes("schema migrations on disk: 2"))).toBe(
      true
    );
  });

  it("printUpgradeReport lists schema status and mindbrain stderr", () => {
    const lines: string[] = [];
    printUpgradeReport(
      {
        ok: true,
        version: "0.5.2",
        installKind: "source",
        consumerRoot: null,
        processes: [],
        killed: [],
        databases: [
          {
            path: "/tmp/x.sqlite",
            exists: true,
            backup: "/tmp/x.bak.sqlite",
            migration: "up-to-date",
            migrationsBefore: [{ id: "old", appliedAt: "2026-01-01" }],
            migrationsAfter: [{ id: "old", appliedAt: "2026-01-01" }],
            appliedThisRun: [],
            schemaStatus: {
              mindbrain_version: "1.7.1",
              schema_tables_count: 82,
              missing_columns: []
            },
            migrationLogs: [
              "[mindbrain] schema column added: documents_raw.summary"
            ]
          }
        ],
        migrations: [],
        configs: [],
        errors: []
      },
      (line) => lines.push(line)
    );
    expect(lines.some((line) => line.includes("mindbrain version: 1.7.1"))).toBe(
      true
    );
    expect(lines.some((line) => line.includes("missing columns: none"))).toBe(
      true
    );
    expect(
      lines.some((line) =>
        line.includes("[mindbrain] schema column added: documents_raw.summary")
      )
    ).toBe(true);
  });

  it("readSchemaMigrations reads mindbrain_schema_migrations when node:sqlite is available", () => {
    const DatabaseSync = (() => {
      try {
        return require("node:sqlite").DatabaseSync as new (path: string) => {
          close(): void;
          exec(sql: string): void;
        };
      } catch {
        return null;
      }
    })();
    if (!DatabaseSync) return;

    const dir = mkdtempSync(join(tmpdir(), "gc-migrations-"));
    const dbPath = join(dir, "test.sqlite");
    const db = new DatabaseSync(dbPath);
    db.exec(`
      CREATE TABLE mindbrain_schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO mindbrain_schema_migrations (id, applied_at)
      VALUES ('2026-05-30-facets-to-agent-facts-applied', '2026-05-30T12:00:00Z');
    `);
    db.close();

    expect(readSchemaMigrations(dbPath)).toEqual([
      {
        id: "2026-05-30-facets-to-agent-facts-applied",
        appliedAt: "2026-05-30T12:00:00Z"
      }
    ]);
    rmSync(dir, { recursive: true, force: true });
  });
});
