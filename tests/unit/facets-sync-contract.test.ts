import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Static contract checks for migration 011 — no DB connection required.
 * Verifies the migration SQL is idempotent and expresses the correct invariants.
 */
describe("011_facets_sync_contract.sql — static contract", () => {
  async function loadMigration(): Promise<string> {
    return readFile(
      join(import.meta.dirname, "../../src/db/migrations/011_facets_sync_contract.sql"),
      "utf8"
    );
  }

  it("adds source_ref with IF NOT EXISTS (idempotent)", async () => {
    const sql = await loadMigration();
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS source_ref TEXT");
  });

  it("creates a plain index on source_ref WHERE NOT NULL", async () => {
    const sql = await loadMigration();
    expect(sql).toContain("mfo_facets_source_ref_idx");
    expect(sql).toContain("WHERE source_ref IS NOT NULL");
  });

  it("creates a UNIQUE partial index on (source_ref, workspace_id)", async () => {
    const sql = await loadMigration();
    expect(sql).toContain("mfo_facets_source_ref_workspace_uniq");
    expect(sql).toContain("UNIQUE INDEX");
    expect(sql).toContain("(source_ref, workspace_id)");
  });

  it("partial unique index only applies to synced rows (WHERE source_ref IS NOT NULL)", async () => {
    const sql = await loadMigration();
    const uniqueIndexBlock = sql.slice(sql.indexOf("mfo_facets_source_ref_workspace_uniq"));
    expect(uniqueIndexBlock).toContain("WHERE source_ref IS NOT NULL");
  });

  it("does NOT use NOT NULL on source_ref column (historical rows compat)", async () => {
    const sql = await loadMigration();
    expect(sql).not.toMatch(/source_ref\s+TEXT\s+NOT\s+NULL/i);
  });

  it("uses IF NOT EXISTS on all index creations (idempotent re-run)", async () => {
    const sql = await loadMigration();
    // Every CREATE [UNIQUE] INDEX statement must be followed by IF NOT EXISTS.
    const withoutIfNotExists = sql.match(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?!IF\s+NOT\s+EXISTS)\w/gi);
    expect(withoutIfNotExists).toBeNull();
  });
});
