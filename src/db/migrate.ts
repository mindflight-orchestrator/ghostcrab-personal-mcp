import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { DatabaseClient } from "./client.js";

const NO_TRANSACTION_DIRECTIVE = "-- @no-transaction";
const CANONICAL_SQL_REL = join(
  "vendor",
  "mindbrain",
  "sql",
  "sqlite_mindbrain--1.0.0.sql"
);

export interface MigrationFile {
  checksum: string;
  filename: string;
  sql: string;
  useTransaction: boolean;
}

export interface MigrationRunSummary {
  applied: string[];
  discovered: string[];
  skipped: string[];
}

export async function loadMigrationFiles(
  migrationDirectory = getDefaultMigrationDirectory()
): Promise<MigrationFile[]> {
  const normalizedMigrationDirectory = migrationDirectory.href.endsWith("/")
    ? migrationDirectory
    : new URL(`${migrationDirectory.href}/`);

  const directoryEntries = await readdir(normalizedMigrationDirectory, {
    withFileTypes: true
  });

  const migrationFilenames = directoryEntries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  return Promise.all(
    migrationFilenames.map(async (filename) => {
      const sql = await readFile(
        new URL(filename, normalizedMigrationDirectory),
        "utf8"
      );

      return {
        checksum: createHash("sha256").update(sql).digest("hex"),
        filename,
        sql,
        useTransaction: !sql.includes(NO_TRANSACTION_DIRECTIVE)
      };
    })
  );
}

export async function runMigrations(
  _database: DatabaseClient,
  migrationDirectory = getDefaultMigrationDirectory()
): Promise<MigrationRunSummary> {
  const migrationFiles = await loadMigrationFiles(migrationDirectory);
  const discovered = migrationFiles.map((file) => file.filename);

  return {
    applied: [],
    discovered,
    skipped: discovered
  };
}

export function getDefaultMigrationDirectory(): URL {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  const packageRoot = findPackageRootSync(moduleDirectory);
  const vendoredSqlDirectory = join(packageRoot, dirname(CANONICAL_SQL_REL));

  if (existsSync(join(vendoredSqlDirectory, "sqlite_mindbrain--1.0.0.sql"))) {
    return pathToFileURL(`${vendoredSqlDirectory}/`);
  }

  return new URL("./migrations/", import.meta.url);
}

function findPackageRootSync(fromDirectory: string): string {
  let directory = fromDirectory;

  for (;;) {
    if (existsSync(join(directory, "package.json"))) {
      return directory;
    }

    const parent = dirname(directory);
    if (parent === directory) {
      throw new Error(
        "package.json not found while resolving mindbrain SQLite SQL"
      );
    }
    directory = parent;
  }
}
