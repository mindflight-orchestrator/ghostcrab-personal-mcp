import { describe, expect, it } from "vitest";
import {
  formatDlxPackageSpec,
  formatNpxPackageArg,
  parseNpmPackageSpec
} from "../../bin/lib/npm-package-spec.mjs";

describe("npm-package-spec", () => {
  it("parses scoped package with version", () => {
    expect(
      parseNpmPackageSpec("@mindflight/ghostcrab-personal-mcp@0.6.6")
    ).toEqual({
      name: "@mindflight/ghostcrab-personal-mcp",
      version: "0.6.6"
    });
  });

  it("parses unscoped package with version", () => {
    expect(parseNpmPackageSpec("lodash@4.17.21")).toEqual({
      name: "lodash",
      version: "4.17.21"
    });
  });

  it("defaults version to latest when absent", () => {
    expect(parseNpmPackageSpec("@mindflight/ghostcrab-personal-mcp")).toEqual({
      name: "@mindflight/ghostcrab-personal-mcp",
      version: "latest"
    });
  });

  it("formats npx and dlx args without double @latest", () => {
    const spec = "@mindflight/ghostcrab-personal-mcp@0.6.6";
    expect(formatNpxPackageArg(spec)).toBe(
      "--package=@mindflight/ghostcrab-personal-mcp@0.6.6"
    );
    expect(formatDlxPackageSpec(spec)).toBe(
      "@mindflight/ghostcrab-personal-mcp@0.6.6"
    );
  });
});
