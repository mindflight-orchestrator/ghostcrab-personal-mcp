import { accessSync, constants } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

const binary =
  process.env.MINDBRAIN_TEST_BINARY ??
  resolve("cmd/backend/zig-out/bin/ghostcrab-backend");
accessSync(binary, constants.X_OK);

export default defineConfig({
  cacheDir: "/tmp/ghostcrab-vite-integrity-native-cache",
  test: {
    fileParallelism: false,
    env: { MINDBRAIN_TEST_BINARY: binary },
    include: [
      "tests/integration/mcp/write-integrity.test.ts",
      "tests/unit/memory-personal-native.test.ts",
      "tests/unit/collection-facets-native.test.ts"
    ],
    hookTimeout: 20_000,
    testTimeout: 60_000
  }
});
