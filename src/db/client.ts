import { Pool, type PoolClient, type QueryResultRow } from "pg";

import type { GhostcrabConfig } from "../config/env.js";
import {
  closeStandaloneMindbrainSqlSession,
  openStandaloneMindbrainSqlSession,
  runStandaloneMindbrainSql
} from "./standalone-mindbrain.js";

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
  const baseUrl = config.mindbrainUrl;
  const baseQueryable = createMindbrainQueryable(baseUrl);

  return {
    ...baseQueryable,
    async close(): Promise<void> {
      return;
    },
    async ping(): Promise<boolean> {
      try {
        const response = await fetch(new URL("/health", normalizeBaseUrl(baseUrl)));
        if (!response.ok) {
          return false;
        }
        return true;
      } catch {
        return false;
      }
    },
    async transaction<T>(
      operation: (queryable: Queryable) => Promise<T>
    ): Promise<T> {
      const sessionId = await openStandaloneMindbrainSqlSession(baseUrl);
      try {
        const result = await operation(createMindbrainQueryable(baseUrl, sessionId));
        await closeStandaloneMindbrainSqlSession(baseUrl, sessionId, true);
        return result;
      } catch (error) {
        await closeStandaloneMindbrainSqlSession(baseUrl, sessionId, false).catch(() => {
          return;
        });
        throw error;
      }
    }
  };
}

function createMindbrainQueryable(baseUrl: string, sessionId?: number): Queryable {
  return {
    kind: "sqlite",
    async query<T = Record<string, unknown>>(
      sql: string,
      params: readonly unknown[] = []
    ): Promise<T[]> {
      const transformed = transformSqliteQuery(sql, params);
      const response = await runStandaloneMindbrainSql({
        mindbrainUrl: baseUrl,
        sql: transformed.sql,
        params: transformed.params,
        sessionId
      });
      return mapMindbrainRows<T>(response.columns, response.rows);
    }
  };
}

function mapMindbrainRows<T>(
  columns: string[],
  rows: readonly unknown[][]
): T[] {
  if (columns.length === 0 || rows.length === 0) {
    return [];
  }

  return rows.map((row) => {
    const record: Record<string, unknown> = {};
    for (let index = 0; index < columns.length; index += 1) {
      record[columns[index] ?? String(index)] = row[index];
    }
    return record as T;
  });
}

function transformSqliteQuery(
  sql: string,
  params: readonly unknown[]
): {
  sql: string;
  params: unknown[];
} {
  let transformed = sql.trim();

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

  if (typeof value === "bigint") {
    return value.toString();
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

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}
