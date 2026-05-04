import { defineConfig } from "vitest/config";

export default defineConfig({
  cacheDir: "/tmp/ghostcrab-vite-cache",
  test: {
    fileParallelism: false,
    include: ["tests/integration/**/*.test.ts", "tests/e2e/**/*.test.ts"],
    hookTimeout: 120_000,
    testTimeout: 60_000
  }
});
