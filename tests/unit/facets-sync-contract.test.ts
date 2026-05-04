import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Static contract checks for the vendored SQLite baseline — no DB connection required.
 * Verifies the canonical SQL is idempotent and expresses the correct invariants.
 */
describe("sqlite_mindbrain--1.0.0.sql — facets sync contract", () => {
  async function loadCanonicalSql(): Promise<string> {
    return readFile(
      join(import.meta.dirname, "../../vendor/mindbrain/sql/sqlite_mindbrain--1.0.0.sql"),
      "utf8"
    );
  }

  it("defines nullable source_ref on facets", async () => {
    const sql = await loadCanonicalSql();
    expect(sql).toContain("source_ref TEXT");
  });

  it("creates a plain index on source_ref WHERE NOT NULL", async () => {
    const sql = await loadCanonicalSql();
    expect(sql).toContain("facets_source_ref_idx");
    expect(sql).toContain("WHERE source_ref IS NOT NULL");
  });

  it("creates a UNIQUE partial index on (source_ref, workspace_id)", async () => {
    const sql = await loadCanonicalSql();
    expect(sql).toContain("facets_source_ref_workspace_uniq");
    expect(sql).toContain("UNIQUE INDEX");
    expect(sql).toContain("(source_ref, workspace_id)");
  });

  it("partial unique index only applies to synced rows (WHERE source_ref IS NOT NULL)", async () => {
    const sql = await loadCanonicalSql();
    const uniqueIndexBlock = sql.slice(sql.indexOf("facets_source_ref_workspace_uniq"));
    expect(uniqueIndexBlock).toContain("WHERE source_ref IS NOT NULL");
  });

  it("does NOT use NOT NULL on source_ref column (historical rows compat)", async () => {
    const sql = await loadCanonicalSql();
    const facetsTableBlock = sql.match(
      /CREATE TABLE IF NOT EXISTS facets \([\s\S]*?\n\);/
    )?.[0];
    expect(facetsTableBlock).toBeDefined();
    expect(facetsTableBlock).not.toMatch(/source_ref\s+TEXT\s+NOT\s+NULL/i);
  });

  it("uses IF NOT EXISTS on all index creations (idempotent re-run)", async () => {
    const sql = await loadCanonicalSql();
    // Every CREATE [UNIQUE] INDEX statement must be followed by IF NOT EXISTS.
    const withoutIfNotExists = sql.match(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?!IF\s+NOT\s+EXISTS)\w/gi);
    expect(withoutIfNotExists).toBeNull();
  });
});
