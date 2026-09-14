import { defineConfig } from "vitest/config";

export default defineConfig({
  cacheDir: "/tmp/ghostcrab-vite-cache",
  test: {
    fileParallelism: false,
    include: ["tests/unit/**/*.test.ts", "tests/tools/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      reporter: ["text-summary", "json-summary", "html"],
      thresholds: {
        // Measured baseline including files never imported by the tests.
        lines: 66.55,
        statements: 65.84,
        functions: 74.39,
        branches: 55.27,
        "src/db/graph.ts": { lines: 95, branches: 90 },
        "src/tools/dgraph/learn.ts": { lines: 95, branches: 90 },
        "src/tools/workspace/{reset,delete}.ts": {
          perFile: true,
          lines: 100,
          branches: 100
        }
      }
    },
    // Integration suites run migrations + bootstrap in beforeAll; avoid flaky timeouts.
    hookTimeout: 120_000,
    testTimeout: 60_000
  }
});
