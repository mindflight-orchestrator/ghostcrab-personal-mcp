import { describe, expect, it } from "vitest";

import {
  IMPORT_PIPELINES,
  buildImportPipelinesInstructionsBlock,
  buildImportPipelinesMarkdownSection,
  buildImportPipelinesStatusPayload
} from "../../src/mcp/import-pipelines.js";

describe("import-pipelines", () => {
  it("defines structured and document pipelines", () => {
    expect(IMPORT_PIPELINES.map((p) => p.id)).toEqual([
      "structured",
      "document"
    ]);
  });

  it("mentions gcp brain docs in instructions", () => {
    const block = buildImportPipelinesInstructionsBlock();
    expect(block).toContain("gcp brain structured-import");
    expect(block).toContain("gcp brain document");
    expect(block).toContain("gcp brain docs structured");
  });

  it("status payload includes both pipelines", () => {
    const payload = buildImportPipelinesStatusPayload();
    expect(payload.pipelines).toHaveLength(2);
    expect(payload.docs_command).toBe("gcp brain docs");
  });

  it("readme section references CLI wrappers", () => {
    const md = buildImportPipelinesMarkdownSection();
    expect(md).toContain("gcp brain structured-import");
    expect(md).toContain("ghostcrab_graph_reindex");
  });
});
