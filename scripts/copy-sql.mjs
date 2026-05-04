import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { access } from "node:fs/promises";
import { constants } from "node:fs";

const sourceDirectory = resolve("src/db/migrations");
const targetDirectory = resolve("dist/db/migrations");
const baselineVendorMarker = "-- ghostcrab-baseline-vendor";
const vendorBaselinePath = resolve(
  "vendor/mindbrain/sql/sqlite_mindbrain--1.0.0.sql"
);

await rm(targetDirectory, { force: true, recursive: true });
await mkdir(resolve("dist/db"), { recursive: true });
await cp(sourceDirectory, targetDirectory, { recursive: true });

const baselineMigrationPath = resolve(
  targetDirectory,
  "001_mindbrain_baseline.sql"
);
const baselineMigrationBody = await readFile(baselineMigrationPath, "utf8");

if (baselineMigrationBody.includes(baselineVendorMarker)) {
  await access(vendorBaselinePath, constants.R_OK);
  await writeFile(
    baselineMigrationPath,
    await readFile(vendorBaselinePath, "utf8"),
    "utf8"
  );
}
