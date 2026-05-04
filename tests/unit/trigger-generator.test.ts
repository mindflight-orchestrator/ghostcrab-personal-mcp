import { describe, it, expect } from "vitest";

import {
  generateSyncTrigger,
  validateGeneratedSyncTriggerSql,
  validateProposedSql
} from "../../src/db/trigger-generator.js";
import type { SyncFieldSpec } from "../../src/types/facets.js";

describe("validateProposedSql", () => {
  it("accepts CREATE TABLE", () => {
    expect(validateProposedSql("CREATE TABLE foo (id SERIAL PRIMARY KEY)")).toBeNull();
  });

  it("accepts ALTER TABLE ADD COLUMN", () => {
    expect(validateProposedSql("ALTER TABLE foo ADD COLUMN bar TEXT")).toBeNull();
  });

  it("accepts CREATE INDEX", () => {
    expect(validateProposedSql("CREATE INDEX IF NOT EXISTS idx_foo ON bar(baz)")).toBeNull();
  });

  it("blocks DROP TABLE", () => {
    expect(validateProposedSql("DROP TABLE foo")).not.toBeNull();
  });

  it("blocks TRUNCATE", () => {
    expect(validateProposedSql("TRUNCATE TABLE foo")).not.toBeNull();
  });

  it("blocks DELETE FROM", () => {
    expect(validateProposedSql("DELETE FROM foo WHERE id = 1")).not.toBeNull();
  });

  it("blocks GRANT", () => {
    expect(validateProposedSql("GRANT SELECT ON foo TO bar")).not.toBeNull();
  });

  it("blocks REVOKE", () => {
    expect(validateProposedSql("REVOKE SELECT ON foo FROM bar")).not.toBeNull();
  });

  it("blocks ALTER TABLE DROP COLUMN", () => {
    expect(validateProposedSql("ALTER TABLE foo DROP COLUMN bar")).not.toBeNull();
  });

  it("blocks COPY ... PROGRAM", () => {
    expect(
      validateProposedSql("COPY t TO PROGRAM 'curl evil'")
    ).not.toBeNull();
  });

  it("blocks DO $$ blocks", () => {
    expect(validateProposedSql("DO $$ BEGIN NULL; END $$")).not.toBeNull();
  });

  it("blocks CREATE FUNCTION", () => {
    expect(
      validateProposedSql("CREATE FUNCTION f() RETURNS int LANGUAGE sql AS $$ SELECT 1 $$")
    ).not.toBeNull();
  });

  it("blocks pg_read_file", () => {
    expect(validateProposedSql("SELECT pg_read_file('/etc/passwd')")).not.toBeNull();
  });

  it("allows EXECUTE FUNCTION in trigger DDL", () => {
    expect(
      validateProposedSql(
        "CREATE TRIGGER t AFTER INSERT ON foo FOR EACH ROW EXECUTE FUNCTION bar();"
      )
    ).toBeNull();
  });
});

describe("validateGeneratedSyncTriggerSql", () => {
  it("accepts generated scalar sync trigger SQL", () => {
    const { sql } = generateSyncTrigger({
      sourceTable: "public.articles",
      workspaceId: "ws1",
      fields: [
        { column_name: "title", facet_key: "title", index_in_bm25: true, facet_type: "term" }
      ]
    });
    expect(validateGeneratedSyncTriggerSql(sql)).toBeNull();
  });

  it("blocks injected pg_read_file in generated-shaped SQL", () => {
    expect(validateGeneratedSyncTriggerSql("SELECT pg_read_file('x')")).not.toBeNull();
  });
});

describe("generateSyncTrigger — scalar (term)", () => {
  const fields: SyncFieldSpec[] = [
    { column_name: "title", facet_key: "title", index_in_bm25: true, facet_type: "term" }
  ];

  it("generates trigger and function SQL", () => {
    const result = generateSyncTrigger({
      sourceTable: "public.articles",
      workspaceId: "default",
      fields
    });
    expect(result.functionName).toContain("mindbrain_sync");
    expect(result.triggerName).toContain("trg_mindbrain_sync");
    expect(result.sql).toContain("CREATE OR REPLACE FUNCTION");
    expect(result.sql).toContain("CREATE TRIGGER");
    expect(result.sql).toContain("AFTER INSERT OR UPDATE OR DELETE");
  });

  it("includes workspace_id in INSERT", () => {
    const result = generateSyncTrigger({
      sourceTable: "public.articles",
      workspaceId: "my-ws",
      fields
    });
    expect(result.sql).toContain("'my-ws'");
  });

  it("includes facet_key in jsonb_build_object", () => {
    const result = generateSyncTrigger({
      sourceTable: "public.articles",
      workspaceId: "default",
      fields
    });
    expect(result.sql).toContain("'title'");
    expect(result.sql).toContain("jsonb_build_object(");
  });

  it("uses default PK column 'id'", () => {
    const result = generateSyncTrigger({
      sourceTable: "public.articles",
      workspaceId: "default",
      fields
    });
    expect(result.sql).toContain("NEW.id::text");
  });

  it("respects custom sourcePrimaryKeyColumn", () => {
    const result = generateSyncTrigger({
      sourceTable: "public.articles",
      workspaceId: "default",
      fields,
      sourcePrimaryKeyColumn: "uid"
    });
    expect(result.sql).toContain("NEW.uid::text");
    expect(result.sql).not.toContain("NEW.id::text");
  });

  it("uses TG_TABLE_NAME as schema_id by default", () => {
    const result = generateSyncTrigger({
      sourceTable: "public.articles",
      workspaceId: "default",
      fields
    });
    expect(result.sql).toContain("TG_TABLE_NAME");
  });

  it("uses explicit targetSchemaId when provided", () => {
    const result = generateSyncTrigger({
      sourceTable: "public.articles",
      workspaceId: "default",
      fields,
      targetSchemaId: "content:article"
    });
    expect(result.sql).toContain("'content:article'");
    expect(result.sql).not.toContain("TG_TABLE_NAME");
  });

  it("includes ON CONFLICT with partial index WHERE clause", () => {
    const result = generateSyncTrigger({
      sourceTable: "public.articles",
      workspaceId: "default",
      fields
    });
    expect(result.sql).toContain("WHERE source_ref IS NOT NULL DO UPDATE");
  });

  it("returns a non-empty summary", () => {
    const result = generateSyncTrigger({
      sourceTable: "public.articles",
      workspaceId: "default",
      fields
    });
    expect(result.summary).toContain("public.articles");
    expect(result.summary).toContain("default");
    expect(result.summary).toContain("title");
  });

  it("DELETE block guards source_ref IS NOT NULL", () => {
    const result = generateSyncTrigger({
      sourceTable: "public.articles",
      workspaceId: "default",
      fields
    });
    const deleteBlock = result.sql.slice(
      result.sql.indexOf("IF (TG_OP = 'DELETE')"),
      result.sql.indexOf("RETURN OLD;") + 12
    );
    expect(deleteBlock).toContain("source_ref IS NOT NULL");
  });

  it("uses concat_ws for content when index_in_bm25 is true", () => {
    const result = generateSyncTrigger({
      sourceTable: "public.articles",
      workspaceId: "default",
      fields
    });
    expect(result.sql).toContain("concat_ws(");
    expect(result.sql).toContain("NEW.title");
  });
});

describe("generateSyncTrigger — index_in_bm25 gating", () => {
  it("excludes field from content when index_in_bm25 = false", () => {
    const fields: SyncFieldSpec[] = [
      { column_name: "internal_code", facet_key: "code", index_in_bm25: false, facet_type: "term" }
    ];
    const result = generateSyncTrigger({
      sourceTable: "public.items",
      workspaceId: "default",
      fields
    });
    expect(result.sql).toContain("jsonb_build_object('code', NEW.internal_code)");
    expect(result.sql).toContain("content");
    expect(result.sql).toMatch(/content\s*\)[\s\S]*''/);
    expect(result.sql).not.toContain("concat_ws");
  });

  it("includes field in content when index_in_bm25 = true", () => {
    const fields: SyncFieldSpec[] = [
      { column_name: "name", facet_key: "name", index_in_bm25: true, facet_type: "term" }
    ];
    const result = generateSyncTrigger({
      sourceTable: "public.items",
      workspaceId: "default",
      fields
    });
    expect(result.sql).toContain("concat_ws(");
    expect(result.sql).toContain("NEW.name");
  });

  it("mixed scalars: only bm25-indexed fields appear in concat_ws", () => {
    const fields: SyncFieldSpec[] = [
      { column_name: "title", facet_key: "title", index_in_bm25: true, facet_type: "term" },
      { column_name: "slug", facet_key: "slug", index_in_bm25: false, facet_type: "term" },
      { column_name: "body", facet_key: "body", index_in_bm25: true, facet_type: "term" }
    ];
    const result = generateSyncTrigger({
      sourceTable: "public.posts",
      workspaceId: "default",
      fields
    });
    expect(result.sql).toContain("concat_ws(");
    expect(result.sql).toContain("NEW.title");
    expect(result.sql).toContain("NEW.body");

    const concatMatch = result.sql.match(/concat_ws\([^)]+\)/);
    expect(concatMatch).toBeTruthy();
    const concatExpr = concatMatch![0];
    expect(concatExpr).not.toContain("NEW.slug");
  });

  it("all scalars with index_in_bm25 = false produce empty content", () => {
    const fields: SyncFieldSpec[] = [
      { column_name: "a", facet_key: "a", index_in_bm25: false, facet_type: "term" },
      { column_name: "b", facet_key: "b", index_in_bm25: false, facet_type: "integer" }
    ];
    const result = generateSyncTrigger({
      sourceTable: "public.data",
      workspaceId: "default",
      fields
    });
    expect(result.sql).not.toContain("concat_ws");
    const insertBlock = result.sql.slice(
      result.sql.indexOf("-- scalar fields merged"),
      result.sql.indexOf("ON CONFLICT")
    );
    expect(insertBlock).toContain("''");
  });

  it("array field with index_in_bm25 = false writes empty content per element", () => {
    const fields: SyncFieldSpec[] = [
      { column_name: "tags", facet_key: "tags", index_in_bm25: false, facet_type: "array" }
    ];
    const result = generateSyncTrigger({
      sourceTable: "public.posts",
      workspaceId: "default",
      fields
    });
    const arrayBlock = result.sql.slice(
      result.sql.indexOf("-- tags: array"),
      result.sql.indexOf("WHERE elem_val IS NOT NULL;") + 30
    );
    expect(arrayBlock).toContain("''");
    expect(arrayBlock).not.toMatch(/elem_val::text\s*$/m);
  });

  it("array field with index_in_bm25 = true uses elem_val for content", () => {
    const fields: SyncFieldSpec[] = [
      { column_name: "keywords", facet_key: "kw", index_in_bm25: true, facet_type: "array" }
    ];
    const result = generateSyncTrigger({
      sourceTable: "public.posts",
      workspaceId: "default",
      fields
    });
    expect(result.sql).toContain("elem_val::text");
  });

  it("ltree field with index_in_bm25 = false writes empty content", () => {
    const fields: SyncFieldSpec[] = [
      { column_name: "path", facet_key: "category", index_in_bm25: false, facet_type: "ltree" }
    ];
    const result = generateSyncTrigger({
      sourceTable: "public.categories",
      workspaceId: "default",
      fields
    });
    const ltreeBlock = result.sql.slice(
      result.sql.indexOf("-- category: ltree"),
      result.sql.indexOf("WHERE NEW.path IS NOT NULL;") + 30
    );
    expect(ltreeBlock).toContain("''");
  });

  it("ltree field with index_in_bm25 = true uses subpath for content", () => {
    const fields: SyncFieldSpec[] = [
      { column_name: "path", facet_key: "category", index_in_bm25: true, facet_type: "ltree" }
    ];
    const result = generateSyncTrigger({
      sourceTable: "public.categories",
      workspaceId: "default",
      fields
    });
    expect(result.sql).toMatch(/subpath.*::text/);
  });
});

describe("generateSyncTrigger — transform", () => {
  it("applies transform with $value placeholder to scalar field", () => {
    const fields: SyncFieldSpec[] = [
      { column_name: "title", facet_key: "title", index_in_bm25: true, facet_type: "term", transform: "lower($value)" }
    ];
    const result = generateSyncTrigger({
      sourceTable: "public.articles",
      workspaceId: "default",
      fields
    });
    expect(result.sql).toContain("lower(NEW.title)");
    expect(result.sql).not.toContain("$value");
  });

  it("applies transform to facets jsonb_build_object too", () => {
    const fields: SyncFieldSpec[] = [
      { column_name: "email", facet_key: "email", index_in_bm25: true, facet_type: "term", transform: "lower(trim($value))" }
    ];
    const result = generateSyncTrigger({
      sourceTable: "public.users",
      workspaceId: "default",
      fields
    });
    expect(result.sql).toContain("jsonb_build_object('email', lower(trim(NEW.email)))");
  });

  it("applies transform to array elements via elem_val", () => {
    const fields: SyncFieldSpec[] = [
      { column_name: "labels", facet_key: "labels", index_in_bm25: true, facet_type: "array", transform: "upper($value)" }
    ];
    const result = generateSyncTrigger({
      sourceTable: "public.tickets",
      workspaceId: "default",
      fields
    });
    expect(result.sql).toContain("upper(elem_val)");
    expect(result.sql).not.toContain("$value");
  });

  it("only applies transform to the field that declares it", () => {
    const fields: SyncFieldSpec[] = [
      { column_name: "title", facet_key: "title", index_in_bm25: true, facet_type: "term", transform: "lower($value)" },
      { column_name: "status", facet_key: "status", index_in_bm25: false, facet_type: "term" }
    ];
    const result = generateSyncTrigger({
      sourceTable: "public.tasks",
      workspaceId: "default",
      fields
    });
    expect(result.sql).toContain("lower(NEW.title)");
    expect(result.sql).toContain("'status', NEW.status");
    expect(result.sql).not.toContain("lower(NEW.status)");
  });

  it("mentions transform in summary", () => {
    const fields: SyncFieldSpec[] = [
      { column_name: "name", facet_key: "name", index_in_bm25: true, facet_type: "term", transform: "initcap($value)" }
    ];
    const result = generateSyncTrigger({
      sourceTable: "public.contacts",
      workspaceId: "default",
      fields
    });
    expect(result.summary).toContain("transform: initcap($value)");
  });
});

describe("generateSyncTrigger — merged scalar INSERT", () => {
  it("produces a single INSERT for multiple scalar fields", () => {
    const fields: SyncFieldSpec[] = [
      { column_name: "title", facet_key: "title", index_in_bm25: true, facet_type: "term" },
      { column_name: "author", facet_key: "author", index_in_bm25: true, facet_type: "term" },
      { column_name: "year", facet_key: "year", index_in_bm25: false, facet_type: "integer" }
    ];
    const result = generateSyncTrigger({
      sourceTable: "public.books",
      workspaceId: "default",
      fields
    });
    const insertCount = (result.sql.match(/INSERT INTO facets/g) || []).length;
    expect(insertCount).toBe(1);
  });

  it("merged INSERT includes all scalar facet keys in jsonb_build_object", () => {
    const fields: SyncFieldSpec[] = [
      { column_name: "title", facet_key: "title", index_in_bm25: true, facet_type: "term" },
      { column_name: "rating", facet_key: "rating", index_in_bm25: false, facet_type: "float" }
    ];
    const result = generateSyncTrigger({
      sourceTable: "public.movies",
      workspaceId: "default",
      fields
    });
    expect(result.sql).toContain("'title', NEW.title");
    expect(result.sql).toContain("'rating', NEW.rating");
  });

  it("merged INSERT ON CONFLICT merges facets with || operator", () => {
    const fields: SyncFieldSpec[] = [
      { column_name: "x", facet_key: "x", index_in_bm25: true, facet_type: "term" },
      { column_name: "y", facet_key: "y", index_in_bm25: true, facet_type: "term" }
    ];
    const result = generateSyncTrigger({
      sourceTable: "public.coords",
      workspaceId: "default",
      fields
    });
    expect(result.sql).toContain("facets.facets ||");
  });
});

describe("generateSyncTrigger — array", () => {
  const fields: SyncFieldSpec[] = [
    { column_name: "tags", facet_key: "tags", index_in_bm25: false, facet_type: "array" }
  ];

  it("uses unnest in the SQL", () => {
    const result = generateSyncTrigger({
      sourceTable: "public.posts",
      workspaceId: "default",
      fields
    });
    expect(result.sql).toContain("unnest");
    expect(result.sql).toContain("WITH ORDINALITY");
  });

  it("suffixes source_ref with element index", () => {
    const result = generateSyncTrigger({
      sourceTable: "public.posts",
      workspaceId: "default",
      fields
    });
    expect(result.sql).toContain(":tags:");
  });

  it("DELETE block guards source_ref IS NOT NULL before re-insert", () => {
    const result = generateSyncTrigger({
      sourceTable: "public.posts",
      workspaceId: "default",
      fields
    });
    expect(result.sql).toContain("source_ref IS NOT NULL");
  });
});

describe("generateSyncTrigger — ltree", () => {
  const fields: SyncFieldSpec[] = [
    { column_name: "path", facet_key: "category", index_in_bm25: false, facet_type: "ltree" }
  ];

  it("uses generate_series and subpath", () => {
    const result = generateSyncTrigger({
      sourceTable: "public.categories",
      workspaceId: "default",
      fields
    });
    expect(result.sql).toContain("generate_series");
    expect(result.sql).toContain("subpath");
    expect(result.sql).toContain("nlevel");
  });
});

describe("generateSyncTrigger — geo", () => {
  const fields: SyncFieldSpec[] = [
    { column_name: "location", facet_key: "location", index_in_bm25: false, facet_type: "geo" }
  ];

  it("inserts into geo_entities", () => {
    const result = generateSyncTrigger({
      sourceTable: "public.places",
      workspaceId: "default",
      fields
    });
    expect(result.sql).toContain("geo_entities");
  });

  it("guards geo insert with to_regclass check (graceful when PostGIS absent)", () => {
    const result = generateSyncTrigger({
      sourceTable: "public.places",
      workspaceId: "default",
      fields
    });
    expect(result.sql).toContain("to_regclass('public.geo_entities')");
  });

  it("uses the provided workspace_id for geo insert", () => {
    const result = generateSyncTrigger({
      sourceTable: "public.places",
      workspaceId: "geo-ws",
      fields
    });
    expect(result.sql).toContain("'geo-ws'");
  });

  it("cleans up geo_entities on DELETE when geo fields are configured", () => {
    const result = generateSyncTrigger({
      sourceTable: "public.places",
      workspaceId: "default",
      fields
    });
    expect(result.sql).toContain("DELETE FROM geo_entities");
    expect(result.sql).toContain("source_ref = OLD.id::text");
  });
});

describe("generateSyncTrigger — embedding", () => {
  const fields: SyncFieldSpec[] = [
    { column_name: "embedding", facet_key: "embedding", index_in_bm25: false, facet_type: "embedding" }
  ];

  it("skips embedding fields entirely (no SQL block generated)", () => {
    const result = generateSyncTrigger({
      sourceTable: "public.articles",
      workspaceId: "default",
      fields
    });
    expect(result.sql).not.toContain("INSERT INTO facets");
    expect(result.sql).toContain("no fields to sync");
  });

  it("mentions embedding skip in summary", () => {
    const result = generateSyncTrigger({
      sourceTable: "public.articles",
      workspaceId: "default",
      fields
    });
    expect(result.summary).toContain("mindCLI");
  });
});

describe("generateSyncTrigger — mixed types", () => {
  const fields: SyncFieldSpec[] = [
    { column_name: "title", facet_key: "title", index_in_bm25: true, facet_type: "term" },
    { column_name: "tags", facet_key: "tags", index_in_bm25: false, facet_type: "array" },
    { column_name: "path", facet_key: "category", index_in_bm25: false, facet_type: "ltree" },
    { column_name: "vec", facet_key: "vec", index_in_bm25: false, facet_type: "embedding" }
  ];

  it("generates blocks for term, array, ltree but not embedding", () => {
    const result = generateSyncTrigger({
      sourceTable: "public.docs",
      workspaceId: "default",
      fields
    });
    expect(result.sql).toContain("scalar fields merged: title");
    expect(result.sql).toContain("tags: array");
    expect(result.sql).toContain("category: ltree");
    expect(result.sql).not.toContain("vec: embedding");
  });

  it("summary lists all non-embedding fields", () => {
    const result = generateSyncTrigger({
      sourceTable: "public.docs",
      workspaceId: "default",
      fields
    });
    expect(result.summary).toContain("title");
    expect(result.summary).toContain("tags");
    expect(result.summary).toContain("category");
  });

  it("scalar INSERT comes before array/ltree blocks", () => {
    const result = generateSyncTrigger({
      sourceTable: "public.docs",
      workspaceId: "default",
      fields
    });
    const scalarPos = result.sql.indexOf("scalar fields merged");
    const arrayPos = result.sql.indexOf("tags: array");
    const ltreePos = result.sql.indexOf("category: ltree");
    expect(scalarPos).toBeLessThan(arrayPos);
    expect(scalarPos).toBeLessThan(ltreePos);
  });
});
