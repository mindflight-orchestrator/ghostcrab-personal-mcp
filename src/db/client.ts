import type { GhostcrabConfig } from "../config/env.js";
import {
  closeStandaloneMindbrainSqlSession,
  openStandaloneMindbrainSqlSession,
  runStandaloneMindbrainSql
} from "./standalone-mindbrain.js";

export interface Queryable {
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
  return createMindbrainDatabaseClient(config);
}

function createMindbrainDatabaseClient(
  config: GhostcrabConfig
): DatabaseClient {
  const baseUrl = config.mindbrainUrl;
  const timeoutMs = config.mindbrainHttpTimeoutMs;
  const baseQueryable = createMindbrainQueryable(baseUrl, timeoutMs);

  return {
    ...baseQueryable,
    async close(): Promise<void> {
      return;
    },
    async ping(): Promise<boolean> {
      try {
        const response = await fetch(
          new URL("/health", normalizeBaseUrl(baseUrl)),
          {
            signal: AbortSignal.timeout(timeoutMs)
          }
        );
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
      let sessionId: number;
      try {
        sessionId = await withSqlSessionBusyRetry(
          () => openStandaloneMindbrainSqlSession(baseUrl, timeoutMs),
          timeoutMs
        );
      } catch (error) {
        if (isSqlSessionUnsupported(error)) {
          return await operation(baseQueryable);
        }
        throw error;
      }
      try {
        const result = await operation(
          createMindbrainQueryable(baseUrl, timeoutMs, sessionId)
        );
        await closeStandaloneMindbrainSqlSession(
          baseUrl,
          sessionId,
          true,
          timeoutMs
        );
        return result;
      } catch (error) {
        if (isSqlSessionUnsupported(error)) {
          await closeStandaloneMindbrainSqlSession(
            baseUrl,
            sessionId,
            false,
            timeoutMs
          ).catch(() => {
            return;
          });
          return await operation(baseQueryable);
        }
        await closeStandaloneMindbrainSqlSession(
          baseUrl,
          sessionId,
          false,
          timeoutMs
        ).catch(() => {
          return;
        });
        throw error;
      }
    }
  };
}

function isSqlSessionUnsupported(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const cause = error.cause;
  if (
    cause &&
    typeof cause === "object" &&
    "status" in cause &&
    (cause as { status?: unknown }).status === 404
  ) {
    return true;
  }

  return /\b404\b/.test(error.message) && /\bNotFound\b/i.test(error.message);
}

function createMindbrainQueryable(
  baseUrl: string,
  timeoutMs: number,
  sessionId?: number
): Queryable {
  return {
    async query<T = Record<string, unknown>>(
      sql: string,
      params: readonly unknown[] = []
    ): Promise<T[]> {
      const transformed = transformSqliteQuery(sql, params);
      let response;
      try {
        response = await withSqlSessionBusyRetry(
          () =>
            runStandaloneMindbrainSql({
              mindbrainUrl: baseUrl,
              sql: transformed.sql,
              params: transformed.params,
              timeoutMs,
              sessionId
            }),
          timeoutMs
        );
      } catch (error) {
        if (sessionId !== undefined || !isMindbrainSqliteOpenFailed(error)) {
          throw error;
        }
        response = await runSqlViaTemporaryWriterSession({
          baseUrl,
          timeoutMs,
          sql: transformed.sql,
          params: transformed.params
        });
      }
      return mapMindbrainRows<T>(response.columns, response.rows);
    }
  };
}

async function runSqlViaTemporaryWriterSession(params: {
  baseUrl: string;
  timeoutMs: number;
  sql: string;
  params: unknown[];
}) {
  const sessionId = await withSqlSessionBusyRetry(
    () => openStandaloneMindbrainSqlSession(params.baseUrl, params.timeoutMs),
    params.timeoutMs
  );
  try {
    const response = await withSqlSessionBusyRetry(
      () =>
        runStandaloneMindbrainSql({
          mindbrainUrl: params.baseUrl,
          sql: params.sql,
          params: params.params,
          timeoutMs: params.timeoutMs,
          sessionId
        }),
      params.timeoutMs
    );
    await closeStandaloneMindbrainSqlSession(
      params.baseUrl,
      sessionId,
      true,
      params.timeoutMs
    );
    return response;
  } catch (error) {
    await closeStandaloneMindbrainSqlSession(
      params.baseUrl,
      sessionId,
      false,
      params.timeoutMs
    ).catch(() => {
      return;
    });
    throw error;
  }
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
    .replace(/\bmb_pragma\./g, "")
    .replace(/\bgraph\.entity_alias\b/g, "graph_entity_alias")
    .replace(/\bgraph\.entity\b/g, "graph_entity")
    .replace(/\bgraph\.relation\b/g, "graph_relation")
    .replace(/\bfacets\b(?=\s*(?:->|->>|@>))/g, "facets_json")
    .replace(/::[a-zA-Z0-9_.[\]]+/g, "")
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

async function withSqlSessionBusyRetry<T>(
  operation: () => Promise<T>,
  timeoutMs: number
): Promise<T> {
  const startedAt = Date.now();
  let delayMs = 25;

  while (true) {
    try {
      return await operation();
    } catch (error) {
      if (
        !isSqlSessionBusy(error) ||
        Date.now() - startedAt + delayMs > timeoutMs
      ) {
        throw error;
      }
      await sleep(delayMs);
      delayMs = Math.min(delayMs * 2, 250);
    }
  }
}

function isSqlSessionBusy(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const cause = error.cause;
  if (
    cause &&
    typeof cause === "object" &&
    "status" in cause &&
    (cause as { status?: unknown }).status === 503
  ) {
    const body =
      "body" in cause && typeof (cause as { body?: unknown }).body === "string"
        ? (cause as { body: string }).body
        : "";
    return body.includes("sql_session_busy");
  }

  return /\bsql_session_busy\b/.test(error.message);
}

function isMindbrainSqliteOpenFailed(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const cause = error.cause;
  if (
    cause &&
    typeof cause === "object" &&
    "body" in cause &&
    typeof (cause as { body?: unknown }).body === "string" &&
    /\bOpenFailed\b/.test((cause as { body: string }).body)
  ) {
    return true;
  }

  return /\bOpenFailed\b/.test(error.message);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}
