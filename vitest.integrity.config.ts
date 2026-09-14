import { defineConfig } from "vitest/config";

export default defineConfig({
  cacheDir: "/tmp/ghostcrab-vite-integrity-cache",
  test: {
    fileParallelism: false,
    env: { GHOSTCRAB_TEST_REQUIRE_SQLITE: "1" },
    include: [
      "tests/tools/learn-sqlite.test.ts",
      "tests/tools/graph-storage-sqlite.test.ts",
      "tests/tools/workspace-integrity-sqlite.test.ts",
      "tests/tools/facets-archive-sqlite.test.ts",
      "tests/unit/facets-fts-catchup.test.ts"
    ],
    testTimeout: 60_000
  }
});
