import { createHash } from "node:crypto";
import { access, readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { DatabaseClient } from "./client.js";

const NO_TRANSACTION_DIRECTIVE = "-- @no-transaction";
const BASELINE_VENDOR_MARKER = "-- ghostcrab-baseline-vendor";
const BASELINE_VENDOR_REL = join(
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
      const rawSql = await readFile(
        new URL(filename, normalizedMigrationDirectory),
        "utf8"
      );
      const sql = await resolveMindbrainBaselineSql(
        normalizedMigrationDirectory,
        filename,
        rawSql
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
  return new URL("./migrations/", import.meta.url);
}

async function findPackageRoot(fromDirectory: string): Promise<string> {
  let directory = fromDirectory;

  for (;;) {
    try {
      await access(join(directory, "package.json"));
      return directory;
    } catch {
      const parent = dirname(directory);
      if (parent === directory) {
        throw new Error(
          "package.json not found while resolving mindbrain baseline SQL"
        );
      }
      directory = parent;
    }
  }
}

async function resolveMindbrainBaselineSql(
  migrationDirectoryUrl: URL,
  filename: string,
  rawSql: string
): Promise<string> {
  if (filename !== "001_mindbrain_baseline.sql") {
    return rawSql;
  }

  if (!rawSql.trimStart().startsWith(BASELINE_VENDOR_MARKER)) {
    return rawSql;
  }

  const migrationsDir = fileURLToPath(migrationDirectoryUrl);
  const packageRoot = await findPackageRoot(migrationsDir);
  const vendorPath = join(packageRoot, BASELINE_VENDOR_REL);

  return readFile(vendorPath, "utf8");
}
