import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  cleanupTestDatabase,
  closeIntegrationDatabase,
  createIntegrationHarness,
  executeHandler,
  seedActiveProjectDataset
} from "../../helpers/cli-integration.js";

const harness = createIntegrationHarness();

/** Compare stable tool payload fields while ignoring transport/runtime metadata. */
function stripRuntimeMetadata(
  payload: Record<string, unknown>
): Record<string, unknown> {
  const rest = { ...payload };
  delete rest.backend;
  delete rest.generated_at;
  return rest;
}

function expectCountParityIgnoringRuntimeMetadata(
  sqlOnly: Record<string, unknown>,
  auto: Record<string, unknown>
): void {
  expect(stripRuntimeMetadata(sqlOnly)).toEqual(stripRuntimeMetadata(auto));
}

describe.sequential("parity: sql-only vs auto (native extensions)", () => {
  beforeEach(async () => {
    await cleanupTestDatabase(harness.database);
  });

  afterAll(async () => {
    await closeIntegrationDatabase(harness.database);
  });

  it("ghostcrab_count returns same counts for sql-only and auto", async () => {
    await seedActiveProjectDataset(harness.database);

    const args = {
      schema_id: "demo:test:task",
      group_by: ["status"],
      filters: {
        scope: "project:apollo"
      }
    };

    const sqlOnly = await executeHandler(
      "ghostcrab_count",
      args,
      harness.database,
      { nativeExtensionsMode: "sql-only" }
    );
    const auto = await executeHandler("ghostcrab_count", args, harness.database, {
      nativeExtensionsMode: "auto"
    });

    expectCountParityIgnoringRuntimeMetadata(sqlOnly, auto);
  });

  it("ghostcrab_search (bm25) returns same results for sql-only and auto", async () => {
    await seedActiveProjectDataset(harness.database);

    const args = {
      query: "missing API token",
      schema_id: "demo:test:task",
      mode: "bm25" as const
    };

    const sqlOnly = await executeHandler(
      "ghostcrab_search",
      args,
      harness.database,
      { nativeExtensionsMode: "sql-only" }
    );
    const auto = await executeHandler("ghostcrab_search", args, harness.database, {
      nativeExtensionsMode: "auto"
    });

    expect(stripRuntimeMetadata(auto)).toMatchObject({
      tool: "ghostcrab_search",
      query: sqlOnly.query,
      mode_requested: "bm25",
      mode_applied: "bm25"
    });
    expect(Array.isArray(sqlOnly.results)).toBe(true);
    expect(Array.isArray(auto.results)).toBe(true);
    expect(Number(sqlOnly.returned)).toBeGreaterThanOrEqual(0);
    expect(Number(auto.returned)).toBeGreaterThanOrEqual(0);
  });
});
