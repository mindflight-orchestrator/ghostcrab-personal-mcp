import { describe, expect, it } from "vitest";

import { validateProposedSql } from "../../src/db/trigger-generator.js";

describe("validateProposedSql", () => {
  it("accepts CREATE TABLE", () => {
    expect(
      validateProposedSql("CREATE TABLE foo (id INTEGER PRIMARY KEY)")
    ).toBeNull();
  });

  it("accepts ALTER TABLE ADD COLUMN", () => {
    expect(validateProposedSql("ALTER TABLE foo ADD COLUMN bar TEXT")).toBeNull();
  });

  it("accepts CREATE INDEX", () => {
    expect(
      validateProposedSql("CREATE INDEX IF NOT EXISTS idx_foo ON bar(baz)")
    ).toBeNull();
  });

  it("blocks destructive table operations", () => {
    expect(validateProposedSql("DROP TABLE foo")).not.toBeNull();
    expect(validateProposedSql("TRUNCATE TABLE foo")).not.toBeNull();
    expect(validateProposedSql("DELETE FROM foo WHERE id = 1")).not.toBeNull();
    expect(validateProposedSql("ALTER TABLE foo DROP COLUMN bar")).not.toBeNull();
  });

  it("blocks unsupported privilege and database attachment operations", () => {
    expect(validateProposedSql("GRANT SELECT ON foo TO bar")).not.toBeNull();
    expect(validateProposedSql("REVOKE SELECT ON foo FROM bar")).not.toBeNull();
    expect(validateProposedSql("ATTACH DATABASE 'x.db' AS x")).not.toBeNull();
    expect(validateProposedSql("DETACH DATABASE x")).not.toBeNull();
  });

  it("blocks local file and extension escape hatches", () => {
    expect(validateProposedSql("VACUUM INTO '/tmp/out.db'")).not.toBeNull();
    expect(validateProposedSql("SELECT load_extension('x')")).not.toBeNull();
    expect(validateProposedSql("PRAGMA writable_schema = ON")).not.toBeNull();
  });
});
