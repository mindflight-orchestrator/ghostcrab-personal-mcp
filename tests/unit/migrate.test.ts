import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { loadMigrationFiles } from "../../src/db/migrate.js";

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
});
