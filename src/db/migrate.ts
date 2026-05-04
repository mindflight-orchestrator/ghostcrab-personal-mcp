import { createHash } from "node:crypto";
import { access, readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { DatabaseClient } from "./client.js";

const MIGRATIONS_TABLE_NAME = "mindbrain_schema_migrations";
const MIGRATIONS_LOCK_NAME = "mindbrain_schema_migrations";
const NO_TRANSACTION_DIRECTIVE = "-- @no-transaction";
const BASELINE_VENDOR_MARKER = "-- ghostcrab-baseline-vendor";
const BASELINE_VENDOR_REL = join(
  "vendor",
  "mindbrain",
  "sql",
  "pg_layer2_mindbrain_baseline.sql"
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

interface AppliedMigrationRow {
  checksum: string;
  filename: string;
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
  database: DatabaseClient,
  migrationDirectory = getDefaultMigrationDirectory()
): Promise<MigrationRunSummary> {
  await ensureMigrationsTable(database);
  await database.query("SELECT pg_advisory_lock(hashtext($1))", [
    MIGRATIONS_LOCK_NAME
  ]);

  try {
    const migrationFiles = await loadMigrationFiles(migrationDirectory);
    const appliedMigrations = await getAppliedMigrations(database);
    const summary: MigrationRunSummary = {
      applied: [],
      discovered: migrationFiles.map((file) => file.filename),
      skipped: []
    };

    for (const migrationFile of migrationFiles) {
      const existingChecksum = appliedMigrations.get(migrationFile.filename);

      if (existingChecksum) {
        if (existingChecksum !== migrationFile.checksum) {
          throw new Error(
            `Migration checksum mismatch for ${migrationFile.filename}. The file was already applied with different contents.`
          );
        }

        summary.skipped.push(migrationFile.filename);
        continue;
      }

      await applyMigration(database, migrationFile);
      summary.applied.push(migrationFile.filename);
    }

    return summary;
  } finally {
    await database.query("SELECT pg_advisory_unlock(hashtext($1))", [
      MIGRATIONS_LOCK_NAME
    ]);
  }
}

export function getDefaultMigrationDirectory(): URL {
  return new URL("./migrations/", import.meta.url);
}

async function applyMigration(
  database: DatabaseClient,
  migrationFile: MigrationFile
): Promise<void> {
  if (migrationFile.useTransaction) {
    await database.transaction(async (queryable) => {
      await queryable.query(migrationFile.sql);
      await queryable.query(
        `
          INSERT INTO mindbrain_schema_migrations (filename, checksum)
          VALUES ($1, $2)
        `,
        [migrationFile.filename, migrationFile.checksum]
      );
    });

    return;
  }

  await database.query(migrationFile.sql);
  await database.query(
    `
      INSERT INTO mindbrain_schema_migrations (filename, checksum)
      VALUES ($1, $2)
    `,
    [migrationFile.filename, migrationFile.checksum]
  );
}

async function ensureMigrationsTable(database: DatabaseClient): Promise<void> {
  await database.query(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE_NAME} (
      filename TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
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

async function getAppliedMigrations(
  database: DatabaseClient
): Promise<Map<string, string>> {
  const rows = await database.query<AppliedMigrationRow>(`
    SELECT filename, checksum
    FROM ${MIGRATIONS_TABLE_NAME}
    ORDER BY filename
  `);

  return new Map(rows.map((row) => [row.filename, row.checksum]));
}
