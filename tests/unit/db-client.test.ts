import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GhostcrabConfig } from "../../src/config/env.js";

const mocks = vi.hoisted(() => ({
  closeStandaloneMindbrainSqlSession: vi.fn(async () => undefined),
  openStandaloneMindbrainSqlSession: vi.fn(async () => 1),
  runStandaloneMindbrainSql: vi.fn(async () => ({
    ok: true as const,
    columns: [] as string[],
    rows: [] as unknown[][],
    changes: 0
  }))
}));

vi.mock("../../src/db/standalone-mindbrain.js", () => ({
  closeStandaloneMindbrainSqlSession: mocks.closeStandaloneMindbrainSqlSession,
  openStandaloneMindbrainSqlSession: mocks.openStandaloneMindbrainSqlSession,
  runStandaloneMindbrainSql: mocks.runStandaloneMindbrainSql
}));

const testConfig: GhostcrabConfig = {
  bootstrapSeedEnabled: true,
  embeddingDimensions: 1536,
  embeddingTimeoutMs: 30_000,
  embeddingsMode: "disabled",
  hybridBm25Weight: 0.6,
  hybridVectorWeight: 0.4,
  nodeEnv: "test",
  telemetryEnabled: false,
  telemetryTimeoutMs: 1500,
  telemetryStateDir: "/tmp/ghostcrab-tests",
  telemetryDebug: false,
  mindbrainHttpTimeoutMs: 30_000,
  mindbrainUrl: "http://127.0.0.1:8091",
  sqlitePath: "/tmp/ghostcrab.sqlite"
};

describe("sqlite database client SQL rewrite", () => {
  beforeEach(() => {
    mocks.runStandaloneMindbrainSql.mockClear();
    mocks.openStandaloneMindbrainSqlSession.mockClear();
    mocks.closeStandaloneMindbrainSqlSession.mockClear();
  });

  it("keeps the facets table name when stripping the mb_pragma prefix", async () => {
    const { createDatabaseClient } = await import("../../src/db/client.js");
    const database = createDatabaseClient(testConfig);

    await database.query("SELECT COUNT(*) AS count FROM mb_pragma.facets");

    expect(mocks.runStandaloneMindbrainSql).toHaveBeenCalledWith(
      expect.objectContaining({
        sql: "SELECT COUNT(*) AS count FROM facets",
        params: [],
        timeoutMs: 30_000
      })
    );
  });

  it("rewrites JSON facet access without corrupting the FROM clause", async () => {
    const { createDatabaseClient } = await import("../../src/db/client.js");
    const database = createDatabaseClient(testConfig);

    await database.query(
      `
        SELECT facets->>'activity_family' AS activity_family
        FROM mb_pragma.facets
        WHERE facets @> $1::jsonb
      `,
      ['{"activity_family":"workflow-tracking"}']
    );

    expect(mocks.runStandaloneMindbrainSql).toHaveBeenCalledWith(
      expect.objectContaining({
        sql: expect.stringContaining(
          "SELECT facets_json->>'activity_family' AS activity_family"
        ),
        params: ['{"activity_family":"workflow-tracking"}']
      })
    );

    const [{ sql }] = mocks.runStandaloneMindbrainSql.mock.calls.at(-1) as [
      { sql: string }
    ];
    expect(sql).toContain("FROM facets");
    expect(sql).not.toContain("FROM facets_json");
    expect(sql).toContain("WHERE facets_json @> ?");
  });

  it("passes the configured HTTP timeout through SQL sessions", async () => {
    const { createDatabaseClient } = await import("../../src/db/client.js");
    const database = createDatabaseClient(testConfig);

    await database.transaction(async (tx) => {
      await tx.query("SELECT 1");
    });

    expect(mocks.openStandaloneMindbrainSqlSession).toHaveBeenCalledWith(
      "http://127.0.0.1:8091",
      30_000
    );
    expect(mocks.runStandaloneMindbrainSql).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 1,
        timeoutMs: 30_000
      })
    );
    expect(mocks.closeStandaloneMindbrainSqlSession).toHaveBeenCalledWith(
      "http://127.0.0.1:8091",
      1,
      true,
      30_000
    );
  });

  it("falls back to non-session SQL when the backend has no session endpoints", async () => {
    mocks.openStandaloneMindbrainSqlSession.mockRejectedValueOnce(
      new Error("MindBrain request failed (404 Not Found): NotFound", {
        cause: {
          status: 404,
          body: '{"error":"NotFound"}'
        }
      })
    );

    const { createDatabaseClient } = await import("../../src/db/client.js");
    const database = createDatabaseClient(testConfig);

    await database.transaction(async (tx) => {
      await tx.query("SELECT 1");
    });

    expect(mocks.runStandaloneMindbrainSql).toHaveBeenCalledWith(
      expect.objectContaining({
        sql: "SELECT 1",
        sessionId: undefined,
        timeoutMs: 30_000
      })
    );
    expect(mocks.closeStandaloneMindbrainSqlSession).not.toHaveBeenCalled();
  });

  it("falls back to non-session SQL when session query is unsupported", async () => {
    mocks.runStandaloneMindbrainSql.mockImplementationOnce(async (params) => {
      if (params.sessionId !== undefined) {
        throw new Error("MindBrain request failed (404 Not Found): NotFound", {
          cause: {
            path: "/api/mindbrain/sql/session/query",
            status: 404,
            body: '{"error":"NotFound"}'
          }
        });
      }
      return {
        ok: true as const,
        columns: [] as string[],
        rows: [] as unknown[][],
        changes: 0
      };
    });

    const { createDatabaseClient } = await import("../../src/db/client.js");
    const database = createDatabaseClient(testConfig);

    await database.transaction(async (tx) => {
      await tx.query("SELECT 1");
    });

    expect(mocks.closeStandaloneMindbrainSqlSession).toHaveBeenCalledWith(
      "http://127.0.0.1:8091",
      1,
      false,
      30_000
    );
    expect(mocks.runStandaloneMindbrainSql).toHaveBeenLastCalledWith(
      expect.objectContaining({
        sql: "SELECT 1",
        sessionId: undefined,
        timeoutMs: 30_000
      })
    );
  });
});
