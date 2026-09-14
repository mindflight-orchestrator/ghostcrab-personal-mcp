import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { canonicalJsonHash } from "../../src/db/canonical-json.js";
import type { DatabaseClient, Queryable } from "../../src/db/client.js";
import { ensureSearchFtsCaughtUp } from "../../src/db/facets-fts-search.js";
import { FACETS_SEARCH_TABLE_ID } from "../../src/db/fact-store.js";
import { upsertTool } from "../../src/tools/facets/upsert.js";
import { createToolContext } from "../helpers/tool-context.js";

/**
 * Archive behaviour of ghostcrab_upsert against a **real** SQLite carrying the
 * vendored MindBrain schema — triggers included.
 *
 * The mocked-database tests in facets.test.ts cannot see any of this: the
 * schema's trg_sync_agent_facts_compat_after_insert trigger backfills the
 * archive's doc_id, and the compat trigger mirrors facets/facets_json. Both
 * only exist in the canonical DDL, so a mock proves nothing about them.
 */

import { loadSqliteDatabase } from "../helpers/real-sqlite.js";

type RealDb = {
  exec(sql: string): void;
  prepare(sql: string): {
    all(...params: readonly unknown[]): unknown[];
    run(...params: readonly unknown[]): unknown;
  };
  close(): void;
};

function loadDatabaseSync(): (new (path: string) => RealDb) | null {
  return loadSqliteDatabase();
}

function canonicalSchema(): string {
  return readFileSync(
    join(
      import.meta.dirname,
      "../../vendor/mindbrain/sql/sqlite_mindbrain--1.0.0.sql"
    ),
    "utf8"
  );
}

function asDatabaseClient(db: RealDb): DatabaseClient {
  const queryable: Queryable = {
    kind: "sqlite",
    query: async <T = Record<string, unknown>>(
      sql: string,
      params: readonly unknown[] = []
    ): Promise<T[]> => {
      const stmt = db.prepare(sql);
      if (/^\s*(with|select)/i.test(sql)) {
        return stmt.all(...params) as T[];
      }
      stmt.run(...params);
      return [] as T[];
    }
  };

  return {
    ...queryable,
    kind: "sqlite",
    ping: async () => true,
    close: async () => undefined,
    transaction: async (operation) => {
      db.exec("BEGIN");
      try {
        const result = await operation(queryable);
        db.exec("COMMIT");
        return result;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    }
  } as DatabaseClient;
}

function seedCurrentFact(db: RealDb, nowUnix: number): void {
  db.prepare(
    `INSERT INTO agent_facts (
       id, schema_id, content, facets, facets_json, embedding_blob,
       created_by, created_at_unix, updated_at_unix, valid_from_unix,
       valid_until_unix, version, doc_id, workspace_id
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    "11111111-1111-4111-8111-111111111111",
    "ghostcrab:task",
    "roaring bitmaps power the graph",
    JSON.stringify({ record_id: "task:1", status: "todo" }),
    JSON.stringify({ record_id: "task:1", status: "todo" }),
    "vector-blob",
    "seed",
    nowUnix - 3600,
    nowUnix - 3600,
    nowUnix - 3600,
    null,
    1,
    1,
    "default"
  );
}

function rows<T>(
  db: RealDb,
  sql: string,
  params: readonly unknown[] = []
): T[] {
  return db.prepare(sql).all(...params) as T[];
}

describe("ghostcrab_upsert archiving on a real SQLite", () => {
  it("archives the replaced state, keeps the current row, and keeps its vector", async ({
    skip
  }) => {
    const DatabaseSync = loadDatabaseSync();
    if (!DatabaseSync) {
      return skip(
        "node:sqlite unavailable; run the required integrity gate under Node 22+"
      );
    }
    const db = new DatabaseSync(":memory:");
    try {
      db.exec(canonicalSchema());
      const nowUnix = Math.floor(Date.now() / 1000);
      seedCurrentFact(db, nowUnix);

      const result = await upsertTool.handler(
        {
          schema_id: "ghostcrab:task",
          match: { facets: { record_id: "task:1" } },
          set_facets: { status: "done" }
        },
        createToolContext(asDatabaseClient(db))
      );
      const structured = result.structuredContent as Record<string, unknown>;
      expect(structured.ok).toBe(true);
      expect(structured.archived_previous_state).toBe(true);

      const current = rows<{
        embedding_blob: string | null;
        facets: string;
        facets_json: string;
        supersedes: string | null;
        version: number;
      }>(
        db,
        `SELECT embedding_blob, facets, facets_json, supersedes, version
         FROM agent_facts WHERE id = ?`,
        ["11111111-1111-4111-8111-111111111111"]
      )[0];

      // The caller's id still points at the live state.
      expect(current?.version).toBe(2);
      expect(current?.supersedes).toBe(structured.supersedes);
      expect(JSON.parse(current?.facets ?? "{}")).toMatchObject({
        status: "done"
      });
      // Facets-only update: the content never changed, so the vector must not
      // be dropped — the row would silently leave the semantic pool.
      expect(current?.embedding_blob).toBe("vector-blob");

      const archive = rows<{
        doc_id: number | null;
        facets: string;
        facets_json: string;
        valid_from_unix: number | null;
        valid_until_unix: number | null;
        version: number;
      }>(
        db,
        `SELECT doc_id, facets, facets_json, valid_from_unix, valid_until_unix, version
         FROM agent_facts WHERE id = ?`,
        [structured.supersedes]
      )[0];

      expect(archive?.version).toBe(1);
      expect(JSON.parse(archive?.facets ?? "{}")).toMatchObject({
        status: "todo"
      });
      // Both facet columns are written, so the archive is a snapshot of a state
      // that actually existed.
      expect(archive?.facets).toBe(archive?.facets_json);
      // Closed, and never before its own start date.
      expect(Number(archive?.valid_until_unix)).toBeGreaterThanOrEqual(
        Number(archive?.valid_from_unix)
      );
      expect(Number(archive?.valid_until_unix)).toBeLessThanOrEqual(
        Math.floor(Date.now() / 1000)
      );
      // The archive is inserted with a NULL doc_id but does not keep it: the
      // schema trigger backfills one. Anything that assumes archives stay
      // unindexed because of a NULL doc_id is wrong.
      expect(archive?.doc_id).not.toBeNull();
    } finally {
      db.close();
    }
  });

  it("refuses to update a closed archive matched on its stale facets", async ({
    skip
  }) => {
    const DatabaseSync = loadDatabaseSync();
    if (!DatabaseSync) {
      return skip(
        "node:sqlite unavailable; run the required integrity gate under Node 22+"
      );
    }
    const db = new DatabaseSync(":memory:");
    try {
      db.exec(canonicalSchema());
      const nowUnix = Math.floor(Date.now() / 1000);
      seedCurrentFact(db, nowUnix);
      const context = createToolContext(asDatabaseClient(db));

      await upsertTool.handler(
        {
          schema_id: "ghostcrab:task",
          match: { facets: { record_id: "task:1" } },
          set_facets: { status: "done" }
        },
        context
      );

      // status=todo now only exists on the archive. Matching it must not
      // resurrect history and report a successful update.
      const result = await upsertTool.handler(
        {
          schema_id: "ghostcrab:task",
          match: { facets: { status: "todo" } },
          set_content: "rewritten from a dead state"
        },
        context
      );
      const structured = result.structuredContent as Record<string, unknown>;
      expect(structured.ok).toBe(false);
      expect((structured.error as { code: string }).code).toBe(
        "record_not_found"
      );

      const archiveContents = rows<{ content: string }>(
        db,
        `SELECT content FROM agent_facts WHERE valid_until_unix IS NOT NULL`
      ).map((row) => row.content);
      expect(archiveContents).not.toContain("rewritten from a dead state");
    } finally {
      db.close();
    }
  });

  it("stamps a deterministic source_ref and traces the archive to it", async ({
    skip
  }) => {
    const DatabaseSync = loadDatabaseSync();
    if (!DatabaseSync) {
      return skip(
        "node:sqlite unavailable; run the required integrity gate under Node 22+"
      );
    }
    const db = new DatabaseSync(":memory:");
    try {
      db.exec(canonicalSchema());
      const nowUnix = Math.floor(Date.now() / 1000);
      seedCurrentFact(db, nowUnix);

      const result = await upsertTool.handler(
        {
          schema_id: "ghostcrab:task",
          match: { facets: { record_id: "task:1" } },
          set_facets: { status: "done" }
        },
        createToolContext(asDatabaseClient(db))
      );
      const structured = result.structuredContent as Record<string, unknown>;

      const expectedRef = `ghostcrab://upsert/${canonicalJsonHash({
        match: { record_id: "task:1" },
        schema_id: "ghostcrab:task"
      })}`;

      const current = rows<{ source_ref: string | null }>(
        db,
        `SELECT source_ref FROM agent_facts WHERE id = ?`,
        ["11111111-1111-4111-8111-111111111111"]
      )[0];
      // The row was seeded without provenance: upsert adopts it before
      // archiving, so history is traceable from the very first transition.
      expect(current?.source_ref).toBe(expectedRef);

      const archive = rows<{ source_ref: string | null }>(
        db,
        `SELECT source_ref FROM agent_facts WHERE id = ?`,
        [structured.supersedes]
      )[0];
      expect(archive?.source_ref).toBe(`${expectedRef}#v1`);
    } finally {
      db.close();
    }
  });

  it("revives an expired row instead of colliding on its source_ref", async ({
    skip
  }) => {
    const DatabaseSync = loadDatabaseSync();
    if (!DatabaseSync) {
      return skip(
        "node:sqlite unavailable; run the required integrity gate under Node 22+"
      );
    }
    const db = new DatabaseSync(":memory:");
    try {
      db.exec(canonicalSchema());
      const context = createToolContext(asDatabaseClient(db));
      const match = { facets: { record_id: "task:9" } };

      const first = await upsertTool.handler(
        {
          schema_id: "ghostcrab:task",
          match,
          set_content: "first life",
          create_if_missing: true
        },
        context
      );
      const firstId = (first.structuredContent as Record<string, unknown>).id;

      // The fact expires. Its source_ref survives on the closed row, so a
      // recreation under the same selector hits the partial unique index.
      db.prepare(
        `UPDATE agent_facts SET valid_until_unix = ? WHERE id = ?`
      ).run(Math.floor(Date.now() / 1000) - 60, firstId);

      const second = await upsertTool.handler(
        {
          schema_id: "ghostcrab:task",
          match,
          set_content: "second life",
          create_if_missing: true
        },
        context
      );
      const structured = second.structuredContent as Record<string, unknown>;
      expect(structured.ok).toBe(true);
      expect(structured.id).toBe(firstId);
      expect(structured.created).toBe(false);
      expect(structured.version).toBe(2);

      const count = rows<{ c: number }>(
        db,
        `SELECT COUNT(*) AS c FROM agent_facts WHERE schema_id = ?`,
        ["ghostcrab:task"]
      )[0];
      expect(Number(count?.c)).toBe(1);
    } finally {
      db.close();
    }
  });

  it("matches a structured facet value instead of duplicating the row", async ({
    skip
  }) => {
    const DatabaseSync = loadDatabaseSync();
    if (!DatabaseSync) {
      return skip(
        "node:sqlite unavailable; run the required integrity gate under Node 22+"
      );
    }
    const db = new DatabaseSync(":memory:");
    try {
      db.exec(canonicalSchema());
      const context = createToolContext(asDatabaseClient(db));

      await upsertTool.handler(
        {
          schema_id: "ghostcrab:task",
          match: { facets: { scope: { project: "demo", phase: 2 } } },
          set_content: "scoped task",
          create_if_missing: true
        },
        context
      );

      // Same selector, keys written the other way round: a strict === on the
      // parsed object could never match it, and the tool would silently create
      // a second row for the same record.
      const second = await upsertTool.handler(
        {
          schema_id: "ghostcrab:task",
          match: { facets: { scope: { phase: 2, project: "demo" } } },
          set_facets: { status: "done" }
        },
        context
      );
      expect((second.structuredContent as Record<string, unknown>).ok).toBe(
        true
      );

      const live = rows<{ c: number }>(
        db,
        `SELECT COUNT(*) AS c FROM agent_facts WHERE valid_until_unix IS NULL`
      )[0];
      expect(Number(live?.c)).toBe(1);
    } finally {
      db.close();
    }
  });

  it("matches a dotted facet key as a top-level key", async ({ skip }) => {
    const DatabaseSync = loadDatabaseSync();
    if (!DatabaseSync) {
      return skip(
        "node:sqlite unavailable; run the required integrity gate under Node 22+"
      );
    }
    const db = new DatabaseSync(":memory:");
    try {
      db.exec(canonicalSchema());
      const context = createToolContext(asDatabaseClient(db));
      // The business-facet convention is `<module>.<slot>`, which reads as a
      // nested path in a JSON selector. It has to resolve to the flat key.
      const match = { facets: { "administrative.formule_service": "premium" } };

      await upsertTool.handler(
        {
          schema_id: "ghostcrab:task",
          match,
          set_content: "dotted key",
          create_if_missing: true
        },
        context
      );

      const again = await upsertTool.handler(
        { schema_id: "ghostcrab:task", match, set_facets: { status: "done" } },
        context
      );
      expect((again.structuredContent as Record<string, unknown>).ok).toBe(
        true
      );

      const live = rows<{ c: number }>(
        db,
        `SELECT COUNT(*) AS c FROM agent_facts WHERE valid_until_unix IS NULL`
      )[0];
      expect(Number(live?.c)).toBe(1);
    } finally {
      db.close();
    }
  });

  it("keeps the archive out of the BM25 corpus", async ({ skip }) => {
    const DatabaseSync = loadDatabaseSync();
    if (!DatabaseSync) {
      return skip(
        "node:sqlite unavailable; run the required integrity gate under Node 22+"
      );
    }
    const db = new DatabaseSync(":memory:");
    try {
      db.exec(canonicalSchema());
      const nowUnix = Math.floor(Date.now() / 1000);
      seedCurrentFact(db, nowUnix);
      const client = asDatabaseClient(db);

      await upsertTool.handler(
        {
          schema_id: "ghostcrab:task",
          match: { facets: { record_id: "task:1" } },
          set_facets: { status: "done" }
        },
        createToolContext(client)
      );

      await ensureSearchFtsCaughtUp(client, FACETS_SEARCH_TABLE_ID);

      const indexed = rows<{ doc_id: number }>(
        db,
        `SELECT doc_id FROM search_documents WHERE table_id = ? ORDER BY doc_id`,
        [FACETS_SEARCH_TABLE_ID]
      ).map((row) => Number(row.doc_id));
      expect(indexed).toEqual([1]);
    } finally {
      db.close();
    }
  });
});
