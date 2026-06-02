import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const readmePath = join(process.cwd(), "README.md");

describe("README npm CLI hub", () => {
  const readme = readFileSync(readmePath, "utf8");

  it("documents gcp brain docs for full import runbooks", () => {
    expect(readme).toContain("gcp brain docs");
    expect(readme).toContain("gcp brain docs structured");
    expect(readme).toContain("gcp brain docs document");
  });

  it("documents structured-import CLI alongside document import", () => {
    expect(readme).toContain("gcp brain structured-import");
    expect(readme).toContain("CLI — bulk import");
  });

  it("points to in-package reference paths", () => {
    expect(readme).toContain("docs/reference/gcp-commands.md");
    expect(readme).toContain("docs/setup/structured-import.md");
    expect(readme).toContain("docs/setup/document-import.md");
  });
});
