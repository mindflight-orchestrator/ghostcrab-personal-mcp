import { createRequire } from "node:module";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { Queryable } from "../../src/db/client.js";
import { ensureSearchFtsCaughtUp } from "../../src/db/facets-fts-search.js";
import { FACETS_SEARCH_TABLE_ID } from "../../src/db/fact-store.js";

const require = createRequire(import.meta.url);

type RealDb = {
  exec(sql: string): void;
  prepare(sql: string): {
    all(...params: readonly unknown[]): unknown[];
    run(...params: readonly unknown[]): unknown;
  };
  close(): void;
};

function loadDatabaseSync(): (new (path: string) => RealDb) | null {
  try {
    return require("node:sqlite").DatabaseSync as new (path: string) => RealDb;
  } catch {
    return null;
  }
}

/** Adapter so ensureSearchFtsCaughtUp can run against a real node:sqlite DB. */
function asQueryable(db: RealDb): Queryable {
  return {
    query: async <T = Record<string, unknown>>(
      sql: string,
      params: readonly unknown[] = []
    ): Promise<T[]> => {
      const stmt = db.prepare(sql);
      if (/^\s*(insert|update|delete|create|drop)/i.test(sql)) {
        stmt.run(...params);
        return [] as T[];
      }
      return stmt.all(...params) as T[];
    }
  };
}

function createSearchSchema(db: RealDb): boolean {
  db.exec(
    `CREATE TABLE agent_facts (id TEXT PRIMARY KEY, content TEXT NOT NULL, doc_id INTEGER);`
  );
  db.exec(
    `CREATE TABLE search_documents (table_id INTEGER NOT NULL, doc_id INTEGER NOT NULL, content TEXT NOT NULL, language TEXT NOT NULL DEFAULT 'english', PRIMARY KEY(table_id, doc_id));`
  );
  db.exec(
    `CREATE TABLE search_fts_docs (fts_rowid INTEGER PRIMARY KEY, table_id INTEGER NOT NULL, doc_id INTEGER NOT NULL, UNIQUE(table_id, doc_id));`
  );
  try {
    db.exec(`CREATE VIRTUAL TABLE search_fts USING fts5(content);`);
    return true;
  } catch {
    // FTS5 not compiled into this Node.js sqlite build — caller should skip.
    return false;
  }
}

describe("ensureSearchFtsCaughtUp", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("catches up a fact inserted after bootstrap into all three search tables", async () => {
    const DatabaseSync = loadDatabaseSync();
    if (!DatabaseSync) {
      // node:sqlite unavailable in this runtime.
      return;
    }
    const db = new DatabaseSync(":memory:");
    try {
      const ftsReady = createSearchSchema(db);
      if (!ftsReady) {
        return;
      }

      db.prepare(
        `INSERT INTO agent_facts (id, content, doc_id) VALUES (?, ?, ?)`
      ).run("fact-1", "roaring bitmaps power the graph", 42);

      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await ensureSearchFtsCaughtUp(asQueryable(db), FACETS_SEARCH_TABLE_ID);

      // The catch-up must not have swallowed a SQL error (the old facets.doc_id bug).
      expect(errorSpy).not.toHaveBeenCalled();

      const docCount = (
        db
          .prepare(
            `SELECT COUNT(*) AS c FROM search_documents WHERE table_id = ? AND doc_id = ?`
          )
          .all(FACETS_SEARCH_TABLE_ID, 42) as Array<{ c: number }>
      )[0];
      const ftsDocCount = (
        db
          .prepare(
            `SELECT COUNT(*) AS c FROM search_fts_docs WHERE table_id = ? AND doc_id = ?`
          )
          .all(FACETS_SEARCH_TABLE_ID, 42) as Array<{ c: number }>
      )[0];
      const ftsHit = (
        db
          .prepare(
            `SELECT COUNT(*) AS c FROM search_fts WHERE search_fts MATCH ?`
          )
          .all("roaring") as Array<{ c: number }>
      )[0];

      expect(Number(docCount?.c ?? 0)).toBe(1);
      expect(Number(ftsDocCount?.c ?? 0)).toBe(1);
      expect(Number(ftsHit?.c ?? 0)).toBe(1);
    } finally {
      db.close();
    }
  });

  it("logs a diagnostic instead of swallowing errors silently", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const failing: Queryable = {
      query: async () => {
        throw new Error("no such column: facets.doc_id");
      }
    };

    await expect(
      ensureSearchFtsCaughtUp(failing, FACETS_SEARCH_TABLE_ID)
    ).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0]?.[0]).toMatch(
      /ensureSearchFtsCaughtUp failed/
    );
    expect(errorSpy.mock.calls[0]?.[0]).toMatch(/no such column/);
  });
});
