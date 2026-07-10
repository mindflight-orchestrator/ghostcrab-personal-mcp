#!/usr/bin/env node
/**
 * Structural check: infer output matches semantic_proposal.golden.json shape.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const demoRoot = join(pkgRoot, "examples", "immeuble");
const goldenPath = join(demoRoot, "contracts", "semantic_proposal.golden.json");
const model = join(
  demoRoot,
  "contracts",
  "immeuble_structured_import_model.json"
);
const mapping = join(
  demoRoot,
  "contracts",
  "mapping_external_to_canonical.json"
);
const engine = join(
  pkgRoot,
  "vendor",
  "mindbrain",
  "zig-out",
  "bin",
  "mindbrain-standalone-tool"
);

const res = spawnSync(
  engine,
  ["structured-import-infer", "--model", model, "--mapping", mapping],
  { encoding: "utf8" }
);
if (res.status !== 0) {
  console.error(res.stderr || res.stdout);
  process.exit(1);
}

const golden = JSON.parse(readFileSync(goldenPath, "utf8"));
const actualLine =
  res.stdout
    .trim()
    .split("\n")
    .find((l) => l.startsWith("{")) ?? res.stdout.trim();
const actual = JSON.parse(actualLine);

function assertArray(name, g, a) {
  if (!Array.isArray(g) || !Array.isArray(a)) {
    throw new Error(`${name}: expected arrays`);
  }
  if (g.length !== a.length) {
    throw new Error(`${name}: length ${a.length} !== golden ${g.length}`);
  }
}

assertArray("table_semantics", golden.table_semantics, actual.table_semantics);
assertArray(
  "column_semantics",
  golden.column_semantics,
  actual.column_semantics
);
assertArray(
  "relation_semantics",
  golden.relation_semantics,
  actual.relation_semantics
);
assertArray("source_mappings", golden.source_mappings, actual.source_mappings);

const sample = actual.table_semantics.find(
  (t) => t.table_name === "copropriete"
);
if (!sample?.notes?.includes("schema_id")) {
  throw new Error("copropriete table notes missing schema_id");
}
const col = actual.column_semantics.find(
  (c) => c.table_name === "copropriete" && c.column_name === "record_id"
);
if (!col?.public_column_role) {
  throw new Error("copropriete.record_id missing public_column_role");
}

console.log(
  JSON.stringify({
    ok: true,
    tables: actual.table_semantics.length,
    columns: actual.column_semantics.length,
    relations: actual.relation_semantics.length
  })
);
