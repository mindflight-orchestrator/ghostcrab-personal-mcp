import { copyFile, mkdir, rm } from "node:fs/promises";
import { basename, resolve } from "node:path";

const targetDirectory = resolve("dist/db/migrations");
const canonicalSqlPath = resolve(
  "vendor/mindbrain/sql/sqlite_mindbrain--1.0.0.sql"
);

await rm(targetDirectory, { force: true, recursive: true });
await mkdir(targetDirectory, { recursive: true });
await copyFile(
  canonicalSqlPath,
  resolve(targetDirectory, basename(canonicalSqlPath))
);
