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
  writeFileSync(
    join(dir, "config.json"),
    JSON.stringify({ workspaces: {}, defaultWorkspace: null }),
    "utf8"
  );
  return dir;
}

/** Write a workspace entry with an explicit sqlitePath into a config dir. */
function writeWorkspaceConfig(
  configDir: string,
  wsName: string,
  sqlitePath: string
) {
  writeFileSync(
    join(configDir, "config.json"),
    JSON.stringify({
      workspaces: { [wsName]: { sqlitePath } },
      defaultWorkspace: wsName
    }),
    "utf8"
  );
}

describe("resolveGhostcrabSqlite — precedence", () => {
  let configDir: string;
  let dataDir: string;
  let homeDir: string;
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    configDir = makeEmptyConfigDir();
    dataDir = mkdtempSync(join(tmpdir(), "gc-sqlite-data-"));
    homeDir = mkdtempSync(join(tmpdir(), "gc-sqlite-home-"));
    savedEnv = {
      GHOSTCRAB_CONFIG_DIR: process.env.GHOSTCRAB_CONFIG_DIR,
      GHOSTCRAB_DATA_DIR: process.env.GHOSTCRAB_DATA_DIR,
      GHOSTCRAB_HOME: process.env.GHOSTCRAB_HOME,
      GHOSTCRAB_SQLITE_PATH: process.env.GHOSTCRAB_SQLITE_PATH,
      GHOSTCRAB_BACKEND_ADDR: process.env.GHOSTCRAB_BACKEND_ADDR
    };
    process.env.GHOSTCRAB_CONFIG_DIR = configDir;
    process.env.GHOSTCRAB_DATA_DIR = dataDir;
    delete process.env.GHOSTCRAB_HOME;
    delete process.env.GHOSTCRAB_SQLITE_PATH;
    delete process.env.GHOSTCRAB_BACKEND_ADDR;
  });

  afterEach(() => {
    rmSync(configDir, { recursive: true, force: true });
    rmSync(dataDir, { recursive: true, force: true });
    rmSync(homeDir, { recursive: true, force: true });
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = v;
      }
    }
  });

  it("falls back to the user-global ghostcrab.sqlite when nothing is set", () => {
    const r = resolveGhostcrabSqlite({});
    expect(r.sqlitePathResolved).toBe(
      resolve(dataDir, "databases", "ghostcrab.sqlite")
    );
    expect(r.sqlitePathSource).toMatch(/user default/);
    expect(r.backendAddr).toBeUndefined();
    expect(r.portExplicit).toBe(false);
  });

  it("uses GHOSTCRAB_HOME for the default database when GHOSTCRAB_DATA_DIR is unset", () => {
    delete process.env.GHOSTCRAB_DATA_DIR;
    process.env.GHOSTCRAB_HOME = homeDir;
    const r = resolveGhostcrabSqlite({});
    expect(r.sqlitePathResolved).toBe(
      resolve(homeDir, "databases", "ghostcrab.sqlite")
    );
  });

  it("--default marks the user-global database as explicitly selected", () => {
    const r = resolveGhostcrabSqlite({ defaultFromCli: true });
    expect(r.sqlitePathResolved).toBe(
      resolve(dataDir, "databases", "ghostcrab.sqlite")
    );
    expect(r.sqlitePathSource).toBe("CLI --default");
  });

  it("--db (sqlitePathFromCli) wins over cwd default", () => {
    const r = resolveGhostcrabSqlite({
      sqlitePathFromCli: "/tmp/explicit.sqlite"
    });
    expect(r.sqlitePathResolved).toBe("/tmp/explicit.sqlite");
    expect(r.sqlitePathSource).toBe("CLI --db");
    expect(r.portExplicit).toBe(false);
  });

  it("--db resolves relative paths against cwd", () => {
    const r = resolveGhostcrabSqlite({
      sqlitePathFromCli: "relative/path.sqlite"
    });
    expect(r.sqlitePathResolved).toBe(resolve("relative/path.sqlite"));
    expect(r.sqlitePathSource).toBe("CLI --db");
  });

  it("GHOSTCRAB_SQLITE_PATH env wins over --db", () => {
    process.env.GHOSTCRAB_SQLITE_PATH = "/tmp/from-env.sqlite";
    const r = resolveGhostcrabSqlite({
      sqlitePathFromCli: "/tmp/explicit.sqlite"
    });
    expect(r.sqlitePathResolved).toBe("/tmp/from-env.sqlite");
    expect(r.sqlitePathSource).toBe("GHOSTCRAB_SQLITE_PATH");
  });

  it("GHOSTCRAB_SQLITE_PATH env wins over workspace input", () => {
    writeWorkspaceConfig(configDir, "myapp", "/ws/ghostcrab.sqlite");
    process.env.GHOSTCRAB_SQLITE_PATH = "/tmp/from-env.sqlite";
    const r = resolveGhostcrabSqlite({ workspaceNameFromCli: "myapp" });
    expect(r.sqlitePathResolved).toBe("/tmp/from-env.sqlite");
    expect(r.sqlitePathSource).toBe("GHOSTCRAB_SQLITE_PATH");
  });

  it("--db wins over workspace input when env is unset", () => {
    writeWorkspaceConfig(configDir, "myapp", "/ws/ghostcrab.sqlite");
    const r = resolveGhostcrabSqlite({
      workspaceNameFromCli: "myapp",
      sqlitePathFromCli: "/tmp/explicit.sqlite"
    });
    expect(r.sqlitePathResolved).toBe("/tmp/explicit.sqlite");
    expect(r.sqlitePathSource).toBe("CLI --db");
  });

  it("workspace input does not select the SQLite file", () => {
    writeWorkspaceConfig(configDir, "myapp", "/ws/ghostcrab.sqlite");
    const r = resolveGhostcrabSqlite({ workspaceNameFromCli: "myapp" });
    expect(r.sqlitePathResolved).toBe(
      resolve(dataDir, "databases", "ghostcrab.sqlite")
    );
    expect(r.sqlitePathSource).toMatch(/user default/);
  });

  it("GHOSTCRAB_BACKEND_ADDR is picked up from env under --db branch", () => {
    process.env.GHOSTCRAB_BACKEND_ADDR = "127.0.0.1:9999";
    const r = resolveGhostcrabSqlite({
      sqlitePathFromCli: "/tmp/explicit.sqlite"
    });
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
