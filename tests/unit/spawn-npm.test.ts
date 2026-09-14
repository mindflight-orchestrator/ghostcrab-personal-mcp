import { describe, expect, it } from "vitest";

import { spawnNpm } from "../../scripts/lib/spawn-npm.mjs";

describe("spawnNpm", () => {
  it("returns a normal nonzero command result without dereferencing a missing spawn error", () => {
    const result = spawnNpm(["run", "__ghostcrab_missing_script__"], {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: "pipe"
    });

    expect(result.status).not.toBe(0);
  });
});
