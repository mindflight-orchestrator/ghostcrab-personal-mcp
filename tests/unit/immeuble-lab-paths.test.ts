import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = join(import.meta.dirname, "..", "..");

describe("immeuble MCP lab paths", () => {
  it("expected-coverage.json lives under corpus/", () => {
    const coveragePath = join(
      repoRoot,
      "examples/immeuble/mcp-lab/corpus/expected-coverage.json"
    );
    expect(() => readFileSync(coveragePath, "utf8")).not.toThrow();
  });

  it("lab script references corpus/expected-coverage.json not the stale root path", () => {
    const script = readFileSync(
      join(repoRoot, "scripts/run-test-immo-mcp3-lab.sh"),
      "utf8"
    );
    expect(script).toContain("mcp-lab/corpus/expected-coverage.json");
    expect(script).not.toContain("mcp-lab/expected-coverage.json");
  });
});
