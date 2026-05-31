import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runAudit } from "../../scripts/audit-corpus-coverage.mjs";

const repoRoot = join(import.meta.dirname, "..", "..");
const require = createRequire(import.meta.url);
const manifestPath = join(
  repoRoot,
  "examples/immeuble/mcp-lab/corpus/manifest.json"
);
const expectedPath = join(
  repoRoot,
  "examples/immeuble/mcp-lab/corpus/expected-coverage.json"
);
const installRoot =
  process.env.GHOSTCRAB_INSTALL ??
  "/home/dlamotte/Documents/ghostcrab-personal-mcp";
const installDb = join(installRoot, "data/ghostcrab.sqlite");
const parsedJson = join(
  installRoot,
  "reports/test-immo-mcp3/business-extraction.parsed.json"
);

describe("audit-corpus-coverage.mjs", () => {
  it("manifest lists 9 corpus files", () => {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      files: unknown[];
    };
    expect(manifest.files).toHaveLength(9);
    for (const file of manifest.files as Array<{ filename: string }>) {
      expect(
        existsSync(join(repoRoot, "examples/immeuble/mcp-lab/corpus", file.filename))
      ).toBe(true);
    }
  });

  it("runAudit produces markdown for test-immo-mcp3 when install DB exists", () => {
    if (!existsSync(installDb)) {
      return;
    }
    try {
      require("node:sqlite");
    } catch {
      return;
    }

    const report = runAudit({
      workspaceId: "test-immo-mcp3",
      dbPath: installDb,
      collectionId: "test-immo-mcp3::docs",
      ontologyId: "test-immo-mcp3::core",
      manifestPath,
      expectedPath,
      parsedJsonPath: existsSync(parsedJson) ? parsedJson : null,
      outputPath: join(repoRoot, "reports/corpus-audit-test-immo-mcp3.md")
    });

    expect(report).toContain("# Corpus audit — test-immo-mcp3");
    expect(report).toContain("## Per-document checklist");
    expect(report).toContain("groupes-facturation.md");
    expect(report).toContain("## Entity counts vs expected-coverage");
  });
});
