import { mkdirSync } from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";
import { Pool, type PoolClient, type QueryResultRow } from "pg";

import type { GhostcrabConfig } from "../config/env.js";

const PG_IDLE_TIMEOUT_MILLISECONDS = 30_000;
const PG_CONNECTION_TIMEOUT_MILLISECONDS = 5_000;

export type DatabaseKind = "postgres" | "sqlite";

export interface Queryable {
  kind: DatabaseKind;
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[]
  ): Promise<T[]>;
}

export interface DatabaseClient extends Queryable {
  close(): Promise<void>;
  ping(): Promise<boolean>;
  transaction<T>(operation: (queryable: Queryable) => Promise<T>): Promise<T>;
}

export function createDatabaseClient(config: GhostcrabConfig): DatabaseClient {
  if (config.databaseKind === "sqlite") {
    return createSqliteDatabaseClient(config);
  }

  return createPostgresDatabaseClient(config);
}

function createPostgresDatabaseClient(config: GhostcrabConfig): DatabaseClient {
  const pool = new Pool({
    connectionString: config.databaseUrl,
    max: config.pgPoolMax,
    idleTimeoutMillis: PG_IDLE_TIMEOUT_MILLISECONDS,
    connectionTimeoutMillis: PG_CONNECTION_TIMEOUT_MILLISECONDS
  });

  pool.on("error", (error: Error) => {
    console.error("[ghostcrab] Unexpected PostgreSQL pool error:", error);
  });

  const poolQueryable = createPostgresQueryable(pool);

  return {
    ...poolQueryable,
    async close(): Promise<void> {
      await pool.end();
    },
    async ping(): Promise<boolean> {
      try {
        await pool.query("SELECT 1");
        return true;
      } catch {
        return false;
      }
    },
    async transaction<T>(
      operation: (queryable: Queryable) => Promise<T>
    ): Promise<T> {
      const client = await pool.connect();

      try {
        await client.query("BEGIN");
        const result = await operation(createPostgresQueryable(client));
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    }
  };
}

function createPostgresQueryable(client: Pool | PoolClient): Queryable {
  return {
    kind: "postgres",
    async query<T = QueryResultRow>(
      sql: string,
      params: readonly unknown[] = []
    ): Promise<T[]> {
      const result = await client.query(sql, [...params]);
      return result.rows as T[];
    }
  };
}

function createSqliteDatabaseClient(config: GhostcrabConfig): DatabaseClient {
  const dbDir = path.dirname(config.sqlitePath);
  mkdirSync(dbDir, { recursive: true });

  const db = new Database(config.sqlitePath);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");
  db.pragma("temp_store = MEMORY");
  db.pragma("cache_size = -64000");
  initializeSqliteSchema(db);

  const baseQueryable = createSqliteQueryable(db);

  return {
    ...baseQueryable,
    async close(): Promise<void> {
      db.close();
    },
    async ping(): Promise<boolean> {
      try {
        db.prepare("SELECT 1").get();
        return true;
      } catch {
        return false;
      }
    },
    async transaction<T>(
      operation: (queryable: Queryable) => Promise<T>
    ): Promise<T> {
      db.exec("BEGIN");
      try {
        const result = await operation(createSqliteQueryable(db));
        db.exec("COMMIT");
        return result;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    }
  };
}

function createSqliteQueryable(db: Database.Database): Queryable {
  return {
    kind: "sqlite",
    async query<T = Record<string, unknown>>(
      sql: string,
      params: readonly unknown[] = []
    ): Promise<T[]> {
      const transformed = transformSqliteQuery(sql, params);
      if (
        transformed.params.length === 0 &&
        transformed.sql
          .split(";")
          .map((part) => part.trim())
          .filter((part) => part.length > 0).length > 1
      ) {
        db.exec(transformed.sql);
        return [];
      }

      const statement = db.prepare(transformed.sql);

      try {
        return statement.all(...transformed.params) as T[];
      } catch (error) {
        if (isNonReturningStatementError(error)) {
          const info = statement.run(...transformed.params);
          if (transformed.syntheticReturning === "pending_migration_id") {
            return [{ id: String(info.lastInsertRowid) }] as T[];
          }
          return [];
        }
        throw error;
      }
    }
  };
}

function isNonReturningStatementError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.includes("This statement does not return data")
  );
}

function initializeSqliteSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL DEFAULT 'Default Workspace',
      pg_schema TEXT NOT NULL DEFAULT 'main',
      description TEXT,
      created_by TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      domain_profile TEXT
    );

    CREATE TABLE IF NOT EXISTS mfo_facets (
      id TEXT PRIMARY KEY,
      schema_id TEXT NOT NULL,
      content TEXT NOT NULL,
      facets_json TEXT NOT NULL DEFAULT '{}',
      embedding_blob BLOB,
      created_by TEXT,
      created_at_unix INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at_unix INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      version INTEGER NOT NULL DEFAULT 1,
      valid_until_unix INTEGER,
      workspace_id TEXT NOT NULL DEFAULT 'default',
      source_ref TEXT,
      doc_id INTEGER UNIQUE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_mfo_facets_source_ref_workspace
      ON mfo_facets(source_ref, workspace_id)
      WHERE source_ref IS NOT NULL;

    CREATE TABLE IF NOT EXISTS mfo_projections (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      scope TEXT,
      proj_type TEXT NOT NULL,
      content TEXT NOT NULL,
      weight REAL NOT NULL DEFAULT 0.5,
      source_ref TEXT,
      source_type TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at_unix INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      expires_at_unix INTEGER
    );

    CREATE TABLE IF NOT EXISTS mfo_agent_state (
      agent_id TEXT PRIMARY KEY,
      health TEXT NOT NULL DEFAULT 'GREEN',
      state TEXT NOT NULL DEFAULT 'IDLE',
      metrics_json TEXT NOT NULL DEFAULT '{}',
      updated_at_unix INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );

    CREATE TABLE IF NOT EXISTS graph_entity (
      entity_id INTEGER PRIMARY KEY,
      entity_type TEXT NOT NULL,
      name TEXT NOT NULL UNIQUE,
      metadata_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS graph_entity_alias (
      term TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      confidence REAL NOT NULL DEFAULT 1.0,
      PRIMARY KEY(term, entity_id),
      FOREIGN KEY(entity_id) REFERENCES graph_entity(entity_id)
    );

    CREATE TABLE IF NOT EXISTS graph_relation (
      relation_id INTEGER PRIMARY KEY,
      relation_type TEXT NOT NULL,
      source_id INTEGER NOT NULL,
      target_id INTEGER NOT NULL,
      valid_to_unix INTEGER,
      confidence REAL NOT NULL DEFAULT 1.0,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      FOREIGN KEY(source_id) REFERENCES graph_entity(entity_id),
      FOREIGN KEY(target_id) REFERENCES graph_entity(entity_id)
    );

    CREATE TABLE IF NOT EXISTS pending_migrations (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      sql TEXT NOT NULL,
      sync_spec TEXT,
      rationale TEXT,
      preview_trigger TEXT,
      proposed_by TEXT,
      approved_by TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      proposed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      approved_at TEXT,
      executed_at TEXT,
      semantic_spec TEXT,
      FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS table_semantics (
      workspace_id TEXT NOT NULL,
      table_schema TEXT NOT NULL,
      table_name TEXT NOT NULL,
      business_role TEXT,
      generation_strategy TEXT NOT NULL DEFAULT 'unknown',
      emit_facets INTEGER NOT NULL DEFAULT 1,
      emit_graph_entity INTEGER NOT NULL DEFAULT 0,
      emit_graph_relation INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(workspace_id, table_schema, table_name),
      FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS column_semantics (
      workspace_id TEXT NOT NULL,
      table_schema TEXT NOT NULL,
      table_name TEXT NOT NULL,
      column_name TEXT NOT NULL,
      column_role TEXT NOT NULL DEFAULT 'unknown',
      rich_meta TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(workspace_id, table_schema, table_name, column_name),
      FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS relation_semantics (
      workspace_id TEXT NOT NULL,
      from_schema TEXT NOT NULL,
      from_table TEXT NOT NULL,
      to_schema TEXT NOT NULL,
      to_table TEXT NOT NULL,
      fk_column TEXT NOT NULL DEFAULT '',
      relation_kind TEXT NOT NULL DEFAULT 'unknown',
      rich_meta TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(workspace_id, from_schema, from_table, to_schema, to_table, fk_column),
      FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_mfo_facets_schema_id ON mfo_facets(schema_id);
    CREATE INDEX IF NOT EXISTS idx_mfo_facets_workspace_id ON mfo_facets(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_mfo_projections_agent_scope ON mfo_projections(agent_id, scope);
    CREATE INDEX IF NOT EXISTS idx_graph_relation_source ON graph_relation(source_id);
    CREATE INDEX IF NOT EXISTS idx_graph_relation_target ON graph_relation(target_id);
    CREATE INDEX IF NOT EXISTS idx_pending_migrations_workspace_id ON pending_migrations(workspace_id);

    INSERT OR IGNORE INTO workspaces(id, label, pg_schema, created_by, domain_profile)
    VALUES ('default', 'Default Workspace', 'main', 'system', 'ghostcrab');
  `);
}

function transformSqliteQuery(
  sql: string,
  params: readonly unknown[]
): {
  sql: string;
  params: unknown[];
  syntheticReturning?: "pending_migration_id";
} {
  let transformed = sql.trim();
  let syntheticReturning: "pending_migration_id" | undefined;

  transformed = transformed
    .replace(/\bmindbrain\./g, "")
    .replace(/\bgraph\.entity_alias\b/g, "graph_entity_alias")
    .replace(/\bgraph\.entity\b/g, "graph_entity")
    .replace(/\bgraph\.relation\b/g, "graph_relation")
    .replace(/\bfacets\b/g, "facets_json")
    .replace(/::[a-zA-Z0-9_.\[\]]+/g, "")
    .replace(/\bILIKE\b/g, "LIKE")
    .replace(/\bnow\(\)/g, "CURRENT_TIMESTAMP")
    .replace(/\bTRUE\b/g, "1")
    .replace(/\bFALSE\b/g, "0");

  if (transformed.includes("RETURNING id")) {
    transformed = transformed.replace(/\s+RETURNING id\b/, "");
    if (/INSERT\s+INTO\s+pending_migrations\b/i.test(transformed)) {
      syntheticReturning = "pending_migration_id";
    }
  }

  if (/UPDATE\s+pending_migrations[\s\S]*approved_at\s*=\s*CURRENT_TIMESTAMP/i.test(transformed)) {
    transformed = transformed.replace(
      /\s+RETURNING\s+id,\s*status,\s*workspace_id,\s*approved_by,\s*approved_at/i,
      ""
    );
  }

  const expandedParams: unknown[] = [];
  transformed = transformed.replace(/\$(\d+)/g, (_match, rawIndex) => {
    const index = Number(rawIndex) - 1;
    expandedParams.push(normalizeSqliteParam(params[index]));
    return "?";
  });

  const finalParams =
    expandedParams.length > 0
      ? expandedParams
      : params.map((param) => normalizeSqliteParam(param));

  return {
    sql: transformed,
    params: finalParams
  };
}

function normalizeSqliteParam(value: unknown): unknown {
  if (value === undefined) {
    return null;
  }

  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }

  if (typeof value === "object" && value !== null) {
    if (value instanceof Date) {
      return value.toISOString();
    }
  }

  return value;
}
