import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function read(relPath: string): string {
  return readFileSync(join(ROOT, relPath), "utf8");
}

function stripFencedCode(text: string): string {
  return text.replace(/```[\s\S]*?```/g, "");
}

describe("current documentation contract", () => {
  const currentDocs = [
    "README.md",
    "docs/reference/api-reference-blindspots.md",
    "docs/reference/gcp-commands.md",
    "docs/reference/mcp-tools.md",
    "docs/reference/operator-catalog.md",
    "docs/methodology/ghostcrab-query-layers.md",
    "docs/methodology/fr/ghostcrab-query-layers.md"
  ];

  it("does not publish stale MCP tool counts in current docs", () => {
    const stalePatterns = [
      /53 registered/i,
      /12 recommended/i,
      /41 extended/i,
      /all 50/i,
      /50 remain/i,
      /12 default tools/i,
      /12 tools\)/i
    ];

    for (const relPath of currentDocs) {
      const text = stripFencedCode(read(relPath));
      for (const pattern of stalePatterns) {
        expect(text, `${relPath} contains stale count ${pattern}`).not.toMatch(
          pattern
        );
      }
    }
  });

  it("documents live answer refresh as exact-id, no-wildcard, POST-backed", () => {
    const gcpCommands = read("docs/reference/gcp-commands.md");
    expect(gcpCommands).toContain(
      "refreshes **one** live answer view by\nexact registry id"
    );
    expect(gcpCommands).toContain("Wildcards and shell globs are not supported");
    expect(gcpCommands).toContain("MCP callers use the same rule");
    expect(gcpCommands).toContain("The refresh endpoint is an HTTP `POST` route");
    expect(gcpCommands).toContain("405 MethodNotAllowed");
  });
});
