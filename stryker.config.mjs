import { readFileSync } from "node:fs";

// Mutate executable handlers, not MCP descriptions and JSON schema literals.
const handlerRange = (file) => {
  const lines = readFileSync(file, "utf8").split("\n");
  const start = lines.findIndex((line) => line.includes("async handler(")) + 1;
  if (start === 0) throw new Error(`Handler not found: ${file}`);
  return `${file}:${start}-${lines.length}`;
};

// Select each handler body, including records.ts which has two handlers.
// Descriptions and JSON Schema documentation are not executable write logic.
const handlerRanges = (file) => {
  const lines = readFileSync(file, "utf8").split("\n");
  return lines.flatMap((line, start) => {
    const match = line.match(/^(\s*)async handler\(/);
    if (!match) return [];
    const end = lines.findIndex(
      (candidate, index) => index > start && candidate === `${match[1]}}`
    );
    if (end < 0) throw new Error(`Handler end not found: ${file}`);
    return [`${file}:${start + 1}-${end + 1}`];
  });
};
const sourceRange = (file, startMarker, endMarker) => {
  const lines = readFileSync(file, "utf8").split("\n");
  const start = lines.findIndex((line) => line.includes(startMarker));
  const end = lines.findIndex(
    (line, index) => index > start && line.includes(endMarker)
  );
  if (start < 0 || end < 0)
    throw new Error(`Mutation range not found: ${file}`);
  return `${file}:${start + 1}-${end}`;
};

export default {
  $schema: "./node_modules/@stryker-mutator/core/schema/stryker-schema.json",
  testRunner: "vitest",
  plugins: ["@stryker-mutator/vitest-runner"],
  vitest: { configFile: "vitest.integrity.config.ts" },
  // Existing integrity writes plus all new record handlers and the upsert CAS guard.
  mutate: [
    handlerRange("src/tools/dgraph/learn.ts"),
    "src/db/graph.ts",
    handlerRange("src/tools/workspace/reset.ts"),
    handlerRange("src/tools/workspace/delete.ts"),
    ...handlerRanges("src/tools/dgraph/business-records.ts"),
    sourceRange(
      "src/tools/dgraph/business-records.ts",
      "const reserved",
      "const schemas"
    ),
    ...handlerRanges("src/tools/facets/records.ts"),
    sourceRange(
      "src/tools/facets/upsert.ts",
      "input.expected_version !== undefined",
      "if (!existing && input.set_content"
    )
  ],
  concurrency: 2,
  reporters: ["clear-text", "json", "html"],
  jsonReporter: { fileName: "reports/mutation/mutation.json" },
  htmlReporter: { fileName: "reports/mutation/index.html" },
  thresholds: { high: 95, low: 90, break: 90 },
  timeoutMS: 10_000,
  ignorePatterns: [
    "**",
    "!src/**/*.ts",
    "!tests/**/*.ts",
    "!vendor/mindbrain/sql/sqlite_mindbrain--1.0.0.sql",
    "!vitest.integrity.config.ts",
    "!package.json",
    "!tsconfig.json"
  ]
};
