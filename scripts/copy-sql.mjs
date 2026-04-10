import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const sourceDirectory = resolve("src/db/migrations");
const targetDirectory = resolve("dist/db/migrations");

await rm(targetDirectory, { force: true, recursive: true });
await mkdir(resolve("dist/db"), { recursive: true });
await cp(sourceDirectory, targetDirectory, { recursive: true });
