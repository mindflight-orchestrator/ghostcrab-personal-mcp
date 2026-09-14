import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanDist } from "../../scripts/clean-dist.mjs";

describe("clean-dist", () => {
  let root = "";

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it("removes stale compiler output without touching sibling files", () => {
    root = mkdtempSync(join(tmpdir(), "ghostcrab-clean-dist-"));
    mkdirSync(join(root, "dist", "removed-module"), { recursive: true });
    writeFileSync(join(root, "dist", "removed-module", "stale.js"), "stale");
    writeFileSync(join(root, "keep.txt"), "keep");

    cleanDist(root);

    expect(existsSync(join(root, "dist"))).toBe(false);
    expect(existsSync(join(root, "keep.txt"))).toBe(true);
  });
});
