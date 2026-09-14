import { readFileSync } from "node:fs";

// Mutate executable handlers, not MCP descriptions and JSON schema literals.
const handlerRange = (file) => {
  const lines = readFileSync(file, "utf8").split("\n");
  const start = lines.findIndex((line) => line.includes("async handler(")) + 1;
  if (start === 0) throw new Error(`Handler not found: ${file}`);
  return `${file}:${start}-${lines.length}`;
};

export default {
  $schema: "./node_modules/@stryker-mutator/core/schema/stryker-schema.json",
  testRunner: "vitest",
  plugins: ["@stryker-mutator/vitest-runner"],
  vitest: { configFile: "vitest.integrity.config.ts" },
  // Pilot: executable write logic, excluding learn's schema/description text.
  mutate: [
    handlerRange("src/tools/dgraph/learn.ts"),
    "src/db/graph.ts",
    handlerRange("src/tools/workspace/reset.ts"),
    handlerRange("src/tools/workspace/delete.ts")
  ],
  concurrency: 2,
  reporters: ["clear-text", "json", "html"],
  jsonReporter: { fileName: "reports/mutation/mutation.json" },
  htmlReporter: { fileName: "reports/mutation/index.html" },
  thresholds: { high: 90, low: 80, break: 80 },
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
