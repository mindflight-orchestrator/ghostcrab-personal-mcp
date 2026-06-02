import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  IMPORT_DOC_TOPICS,
  PKG_ROOT,
  readImportDoc
} from "../../bin/lib/import-docs.mjs";

describe("gcp brain docs runbooks", () => {
  it("resolves packaged runbook paths", () => {
    for (const entry of Object.values(IMPORT_DOC_TOPICS)) {
      expect(existsSync(join(PKG_ROOT, entry.path))).toBe(true);
    }
  });

  it("reads structured runbook with pipeline section", () => {
    const text = readImportDoc("structured");
    expect(text).toContain("gcp brain structured-import");
    expect(text).toContain("load-ws");
  });

  it("reads document runbook", () => {
    const text = readImportDoc("document");
    expect(text).toContain("gcp brain document");
    expect(text).toContain("document-ingest");
  });
});
