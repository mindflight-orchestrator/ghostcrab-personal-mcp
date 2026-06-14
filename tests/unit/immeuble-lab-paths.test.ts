import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = join(import.meta.dirname, "..", "..");

describe("immeuble example paths", () => {
  it("expected-coverage.json lives under sources/documents/", () => {
    const coveragePath = join(
      repoRoot,
      "examples/immeuble/sources/documents/expected-coverage.json"
    );
    expect(() => readFileSync(coveragePath, "utf8")).not.toThrow();
  });

  it("success-criteria.yaml uses workspace immeuble", () => {
    const yaml = readFileSync(
      join(repoRoot, "examples/immeuble/success-criteria.yaml"),
      "utf8"
    );
    expect(yaml).toContain("workspace_id: immeuble");
  });
});
