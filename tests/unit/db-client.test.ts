import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GhostcrabConfig } from "../../src/config/env.js";

const runStandaloneMindbrainSqlMock = vi.fn(async () => ({
  ok: true as const,
  columns: [] as string[],
  rows: [] as unknown[][],
  changes: 0
}));

vi.mock("../../src/db/standalone-mindbrain.js", () => ({
  closeStandaloneMindbrainSqlSession: vi.fn(async () => undefined),
  openStandaloneMindbrainSqlSession: vi.fn(async () => 1),
  runStandaloneMindbrainSql: runStandaloneMindbrainSqlMock
}));

const testConfig: GhostcrabConfig = {
  embeddingDimensions: 1536,
  embeddingTimeoutMs: 30_000,
  embeddingsMode: "disabled",
  hybridBm25Weight: 0.6,
  hybridVectorWeight: 0.4,
  nativeExtensionsMode: "auto",
  nodeEnv: "test",
  telemetryEnabled: false,
  telemetryTimeoutMs: 1500,
  telemetryStateDir: "/tmp/ghostcrab-tests",
  telemetryDebug: false,
  mindbrainUrl: "http://127.0.0.1:8091",
  sqlitePath: "/tmp/ghostcrab.sqlite"
};

describe("sqlite database client SQL rewrite", () => {
  beforeEach(() => {
    runStandaloneMindbrainSqlMock.mockClear();
  });

  it("keeps the facets table name when stripping the mb_pragma prefix", async () => {
    const { createDatabaseClient } = await import("../../src/db/client.js");
    const database = createDatabaseClient(testConfig);

    await database.query("SELECT COUNT(*) AS count FROM mb_pragma.facets");

    expect(runStandaloneMindbrainSqlMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sql: "SELECT COUNT(*) AS count FROM facets",
        params: []
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

    expect(runStandaloneMindbrainSqlMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sql: expect.stringContaining(
          "SELECT facets_json->>'activity_family' AS activity_family"
        ),
        params: ['{"activity_family":"workflow-tracking"}']
      })
    );

    const [{ sql }] = runStandaloneMindbrainSqlMock.mock.calls.at(-1) as [
      { sql: string }
    ];
    expect(sql).toContain("FROM facets");
    expect(sql).not.toContain("FROM facets_json");
    expect(sql).toContain("WHERE facets_json @> ?");
  });
});
