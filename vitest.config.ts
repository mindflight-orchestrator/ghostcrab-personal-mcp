import { defineConfig } from "vitest/config";

export default defineConfig({
  cacheDir: "/tmp/ghostcrab-vite-cache",
  test: {
    fileParallelism: false,
    include: ["tests/unit/**/*.test.ts", "tests/tools/**/*.test.ts"],
    // Integration suites run migrations + bootstrap in beforeAll; avoid flaky timeouts.
    hookTimeout: 120_000,
    testTimeout: 60_000
  }
});
