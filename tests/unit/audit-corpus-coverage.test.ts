import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runAudit } from "../../scripts/audit-corpus-coverage.mjs";

const repoRoot = join(import.meta.dirname, "..", "..");
const require = createRequire(import.meta.url);
const documentsDir = join(repoRoot, "examples/immeuble/sources/documents");
const manifestPath = join(documentsDir, "manifest.json");
const expectedPath = join(documentsDir, "expected-coverage.json");
let testRoot = "";

afterEach(() => {
  if (testRoot) {
    rmSync(testRoot, { recursive: true, force: true });
    testRoot = "";
  }
});

describe("audit-corpus-coverage.mjs", () => {
  it("manifest lists 9 corpus files", () => {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      files: unknown[];
    };
    expect(manifest.files).toHaveLength(9);
    for (const file of manifest.files as Array<{ filename: string }>) {
      expect(existsSync(join(documentsDir, file.filename))).toBe(true);
    }
  });

  it("runAudit produces markdown from a read-only standalone fixture", () => {
    let DatabaseSync: typeof import("node:sqlite").DatabaseSync;
    try {
      DatabaseSync = require("node:sqlite").DatabaseSync;
    } catch {
      return;
    }

    testRoot = mkdtempSync(join(tmpdir(), "ghostcrab-corpus-audit-"));
    const fixtureDb = join(testRoot, "audit.sqlite");
    const db = new DatabaseSync(fixtureDb);
    db.exec(`
      CREATE TABLE documents_raw (
        doc_id INTEGER, source_ref TEXT, content TEXT,
        workspace_id TEXT, collection_id TEXT
      );
      CREATE TABLE chunks_raw (
        doc_id INTEGER, workspace_id TEXT, collection_id TEXT
      );
      CREATE TABLE facet_assignments_raw (
        doc_id INTEGER, workspace_id TEXT, collection_id TEXT,
        target_kind TEXT, namespace TEXT, dimension TEXT, value TEXT
      );
      CREATE TABLE entity_documents_raw (
        doc_id INTEGER, workspace_id TEXT, collection_id TEXT
      );
      CREATE TABLE entities_raw (
        entity_type TEXT, workspace_id TEXT, ontology_id TEXT
      );
      CREATE TABLE relations_raw (edge_type TEXT, workspace_id TEXT);
      CREATE TABLE ontology_entity_types (
        ontology_id TEXT, entity_type TEXT
      );
    `);
    db.close();
    chmodSync(fixtureDb, 0o444);

    const report = runAudit({
      workspaceId: "test-immo-mcp3",
      dbPath: fixtureDb,
      collectionId: "test-immo-mcp3::docs",
      ontologyId: "test-immo-mcp3::core",
      manifestPath,
      expectedPath,
      parsedJsonPath: null,
      outputPath: join(testRoot, "audit.md")
    });

    expect(report).toContain("# Corpus audit — test-immo-mcp3");
    expect(report).toContain("## Per-document checklist");
    expect(report).toContain("groupes-facturation.md");
    expect(report).toContain("## Entity counts vs expected-coverage");
  });
});
