import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import type { DatabaseSync, SQLInputValue } from "node:sqlite";

import type { DatabaseClient, Queryable } from "../../src/db/client.js";

const require = createRequire(import.meta.url);

export function loadSqliteDatabase(): typeof DatabaseSync | null {
  try {
    return (require("node:sqlite") as typeof import("node:sqlite"))
      .DatabaseSync;
  } catch (error) {
    if (process.env.GHOSTCRAB_TEST_REQUIRE_SQLITE === "1") {
      throw new Error("The integrity gate requires node:sqlite (Node 22+).", {
        cause: error
      });
    }
    return null;
  }
}

/** Real canonical DDL, foreign keys and transactions; no simulated SQL results. */
export function createRealSqlite() {
  const Sqlite = loadSqliteDatabase();
  if (!Sqlite) throw new Error("node:sqlite is required for this fixture.");
  const sqlite = new Sqlite(":memory:");
  sqlite.exec(
    readFileSync(
      new URL(
        "../../vendor/mindbrain/sql/sqlite_mindbrain--1.0.0.sql",
        import.meta.url
      ),
      "utf8"
    )
  );
  sqlite.exec("PRAGMA foreign_keys = ON");
  const queryable: Queryable = {
    async query<T>(sql: string, params: readonly unknown[] = []): Promise<T[]> {
      const statement = sqlite.prepare(sql);
      const bindings = params as SQLInputValue[];
      if (/^\s*(select|with)/i.test(sql))
        return statement.all(...bindings) as T[];
      statement.run(...bindings);
      return [];
    }
  };
  const database: DatabaseClient = {
    ...queryable,
    ping: async () => true,
    close: async () => sqlite.close(),
    async transaction(operation) {
      sqlite.exec("BEGIN");
      try {
        const result = await operation(queryable);
        sqlite.exec("COMMIT");
        return result;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    }
  };
  return { sqlite, database };
}
