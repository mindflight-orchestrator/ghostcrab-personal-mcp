import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import { loadMigrationFiles, runMigrations } from "../../src/db/migrate.js";

describe("loadMigrationFiles", () => {
  let tempDirectoryPath: string | undefined;

  afterEach(async () => {
    if (tempDirectoryPath) {
      await rm(tempDirectoryPath, { force: true, recursive: true });
      tempDirectoryPath = undefined;
    }
  });

  it("loads SQL files in lexicographic order and reads transaction directives", async () => {
    tempDirectoryPath = await mkdtemp(join(tmpdir(), "ghostcrab-migrations-"));

    await writeFile(join(tempDirectoryPath, "002_second.sql"), "SELECT 2;\n");
    await writeFile(join(tempDirectoryPath, "001_first.sql"), "SELECT 1;\n");
    await writeFile(
      join(tempDirectoryPath, "003_no_transaction.sql"),
      "-- @no-transaction\nSELECT 3;\n"
    );

    const migrations = await loadMigrationFiles(
      pathToFileURL(tempDirectoryPath)
    );

    expect(migrations.map((migration) => migration.filename)).toEqual([
      "001_first.sql",
      "002_second.sql",
      "003_no_transaction.sql"
    ]);
    expect(migrations[0]?.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(migrations[0]?.useTransaction).toBe(true);
    expect(migrations[2]?.useTransaction).toBe(false);
  });

  it("loads the canonical vendored SQLite schema without a marker fallback", async () => {
    const migrations = await loadMigrationFiles();
    const baseline = migrations.find(
      (migration) => migration.filename === "sqlite_mindbrain--1.0.0.sql"
    );
    const canonicalSql = await readFile(
      join("vendor", "mindbrain", "sql", "sqlite_mindbrain--1.0.0.sql"),
      "utf8"
    );

    expect(baseline).toBeDefined();
    expect(baseline?.sql).toBe(canonicalSql);
    expect(baseline?.sql).not.toContain("ghostcrab-baseline-vendor");
    expect(baseline?.sql).toContain("This file is intentionally SQLite-only");
    expect(baseline?.sql).toContain(
      "CREATE VIRTUAL TABLE IF NOT EXISTS search_fts USING fts5"
    );
  });

  it("does not apply migrations through the MCP client path", async () => {
    const database = {
      query: vi.fn(),
      transaction: vi.fn(),
      close: vi.fn(),
      ping: vi.fn()
    };

    const summary = await runMigrations(
      database as never,
      pathToFileURL("vendor/mindbrain/sql")
    );

    expect(summary).toMatchObject({
      applied: [],
      discovered: ["sqlite_mindbrain--1.0.0.sql"],
      skipped: ["sqlite_mindbrain--1.0.0.sql"]
    });
    expect(database.query).not.toHaveBeenCalled();
    expect(database.transaction).not.toHaveBeenCalled();
  });
});
