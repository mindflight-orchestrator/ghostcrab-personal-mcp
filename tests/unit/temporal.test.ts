import { describe, expect, it } from "vitest";

import {
  ACTIVE_FACT_WINDOW_SQL,
  ARCHIVE_CLOSE_UNIX_EXPR,
  activeFactWindowSql
} from "../../src/db/temporal.js";

describe("active fact window", () => {
  it("bounds reads on both ends of the validity range", () => {
    expect(ACTIVE_FACT_WINDOW_SQL).toContain("valid_until_unix >");
    expect(ACTIVE_FACT_WINDOW_SQL).toContain("valid_from_unix <=");
  });

  it("tolerates rows written before valid_from_unix was stamped", () => {
    // Legacy rows carry NULL on both ends; neither clause may exclude them.
    expect(ACTIVE_FACT_WINDOW_SQL).toContain("valid_until_unix IS NULL");
    expect(ACTIVE_FACT_WINDOW_SQL).toContain("valid_from_unix IS NULL");
  });

  it("qualifies every column when an alias is given", () => {
    const sql = activeFactWindowSql("f");
    expect(sql).not.toMatch(/(?<!f\.)valid_(from|until)_unix/);
  });
});

describe("archive close instant", () => {
  it("never closes an archive before its own start", () => {
    // SQLite has no CHECK constraint on this table, so a naive close at "now"
    // would silently produce valid_until < valid_from on a future-dated fact.
    expect(ARCHIVE_CLOSE_UNIX_EXPR).toContain("MAX(");
    expect(ARCHIVE_CLOSE_UNIX_EXPR).toContain("COALESCE(valid_from_unix");
    // MAX() applies no column affinity: SQLite orders every INTEGER before
    // every TEXT, so an uncast strftime would always win and defeat the guard.
    expect(ARCHIVE_CLOSE_UNIX_EXPR).not.toMatch(
      /MAX\([^)]*[^)]strftime\('%s','now'\)(?! AS INTEGER)/
    );
    expect(ARCHIVE_CLOSE_UNIX_EXPR).toContain("CAST(strftime('%s','now') AS INTEGER)");
  });
});
