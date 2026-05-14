import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// The module under test is an ESM .mjs file; vitest handles this via the
// vite config's ESM interop. We import it dynamically after setting env so
// vi.resetModules can isolate each test's module-level state.
import { resolveGhostcrabSqlite } from "../../bin/lib/resolve-ghostcrab-sqlite.mjs";

/** Isolate the GhostCrab config dir to a temp directory with no workspaces. */
function makeEmptyConfigDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "gc-sqlite-resolve-"));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "config.json"), JSON.stringify({ workspaces: {}, defaultWorkspace: null }), "utf8");
  return dir;
}

/** Write a workspace entry with an explicit sqlitePath into a config dir. */
function writeWorkspaceConfig(configDir: string, wsName: string, sqlitePath: string) {
  writeFileSync(
    join(configDir, "config.json"),
    JSON.stringify({ workspaces: { [wsName]: { sqlitePath } }, defaultWorkspace: wsName }),
    "utf8"
  );
}

describe("resolveGhostcrabSqlite — precedence", () => {
  let configDir: string;
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    configDir = makeEmptyConfigDir();
    savedEnv = {
      GHOSTCRAB_CONFIG_DIR: process.env.GHOSTCRAB_CONFIG_DIR,
      GHOSTCRAB_SQLITE_PATH: process.env.GHOSTCRAB_SQLITE_PATH,
      GHOSTCRAB_BACKEND_ADDR: process.env.GHOSTCRAB_BACKEND_ADDR,
    };
    process.env.GHOSTCRAB_CONFIG_DIR = configDir;
    delete process.env.GHOSTCRAB_SQLITE_PATH;
    delete process.env.GHOSTCRAB_BACKEND_ADDR;
  });

  afterEach(() => {
    rmSync(configDir, { recursive: true, force: true });
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = v;
      }
    }
  });

  it("falls back to data/ghostcrab.sqlite in cwd when nothing is set", () => {
    const r = resolveGhostcrabSqlite({});
    expect(r.sqlitePathResolved).toBe(resolve(process.cwd(), "data", "ghostcrab.sqlite"));
    expect(r.sqlitePathSource).toMatch(/fallback/);
    expect(r.backendAddr).toBeUndefined();
    expect(r.portExplicit).toBe(false);
  });

  it("--db (sqlitePathFromCli) wins over cwd default", () => {
    const r = resolveGhostcrabSqlite({ sqlitePathFromCli: "/tmp/explicit.sqlite" });
    expect(r.sqlitePathResolved).toBe("/tmp/explicit.sqlite");
    expect(r.sqlitePathSource).toBe("CLI --db");
    expect(r.portExplicit).toBe(false);
  });

  it("--db resolves relative paths against cwd", () => {
    const r = resolveGhostcrabSqlite({ sqlitePathFromCli: "relative/path.sqlite" });
    expect(r.sqlitePathResolved).toBe(resolve("relative/path.sqlite"));
    expect(r.sqlitePathSource).toBe("CLI --db");
  });

  it("GHOSTCRAB_SQLITE_PATH env wins over --db", () => {
    process.env.GHOSTCRAB_SQLITE_PATH = "/tmp/from-env.sqlite";
    const r = resolveGhostcrabSqlite({ sqlitePathFromCli: "/tmp/explicit.sqlite" });
    expect(r.sqlitePathResolved).toBe("/tmp/from-env.sqlite");
    expect(r.sqlitePathSource).toBe("GHOSTCRAB_SQLITE_PATH");
  });

  it("GHOSTCRAB_SQLITE_PATH env wins over workspace config", () => {
    writeWorkspaceConfig(configDir, "myapp", "/ws/ghostcrab.sqlite");
    process.env.GHOSTCRAB_SQLITE_PATH = "/tmp/from-env.sqlite";
    const r = resolveGhostcrabSqlite({ workspaceNameFromCli: "myapp" });
    expect(r.sqlitePathResolved).toBe("/tmp/from-env.sqlite");
    expect(r.sqlitePathSource).toBe("GHOSTCRAB_SQLITE_PATH");
  });

  it("--db wins over workspace config when env is unset", () => {
    writeWorkspaceConfig(configDir, "myapp", "/ws/ghostcrab.sqlite");
    const r = resolveGhostcrabSqlite({
      workspaceNameFromCli: "myapp",
      sqlitePathFromCli: "/tmp/explicit.sqlite",
    });
    expect(r.sqlitePathResolved).toBe("/tmp/explicit.sqlite");
    expect(r.sqlitePathSource).toBe("CLI --db");
  });

  it("workspace sqlitePath is used when neither env nor --db is set", () => {
    writeWorkspaceConfig(configDir, "myapp", "/ws/ghostcrab.sqlite");
    const r = resolveGhostcrabSqlite({ workspaceNameFromCli: "myapp" });
    expect(r.sqlitePathResolved).toBe("/ws/ghostcrab.sqlite");
    expect(r.sqlitePathSource).toMatch(/workspace "myapp"/);
  });

  it("GHOSTCRAB_BACKEND_ADDR is picked up from env under --db branch", () => {
    process.env.GHOSTCRAB_BACKEND_ADDR = "127.0.0.1:9999";
    const r = resolveGhostcrabSqlite({ sqlitePathFromCli: "/tmp/explicit.sqlite" });
    expect(r.backendAddr).toBe("127.0.0.1:9999");
    expect(r.portExplicit).toBe(true);
  });

  it("GHOSTCRAB_BACKEND_ADDR is picked up from env under env branch", () => {
    process.env.GHOSTCRAB_SQLITE_PATH = "/tmp/from-env.sqlite";
    process.env.GHOSTCRAB_BACKEND_ADDR = "127.0.0.1:9999";
    const r = resolveGhostcrabSqlite({});
    expect(r.backendAddr).toBe("127.0.0.1:9999");
    expect(r.portExplicit).toBe(true);
  });
});
