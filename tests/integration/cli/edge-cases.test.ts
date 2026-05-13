import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  cleanupTestDatabase,
  closeIntegrationDatabase,
  createIntegrationHarness,
  runCliCapture,
  seedEdgeCasesDataset
} from "../../helpers/cli-integration.js";

const harness = createIntegrationHarness();

describe.sequential("CLI edge cases", () => {
  beforeEach(async () => {
    await cleanupTestDatabase(harness.database);
    await seedEdgeCasesDataset(harness.database);
  });

  afterAll(async () => {
    await closeIntegrationDatabase(harness.database);
  });

  it("falls back safely when semantic search is unavailable", async () => {
    const result = await runCliCapture([
      "search",
      "--query",
      "missing API token",
      "--mode",
      "semantic"
    ]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout.join("").trim())).toMatchObject({
      mode_requested: "semantic",
      mode_applied: "bm25"
    });
  });

  it("ignores expired rows in count", async () => {
    const result = await runCliCapture([
      "count",
      "--schema-id",
      "demo:test:task",
      "--group-by",
      "status",
      "--filters",
      '{"scope":"project:apollo"}'
    ]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout.join("").trim())).toMatchObject({
      counts: {
        status: {
          blocked: 1,
          todo: 1
        }
      }
    });
  });

  it("does not duplicate an existing upserted record", async () => {
    const first = await runCliCapture([
      "upsert",
      "--schema-id",
      "demo:test:task",
      "--match",
      '{"facets":{"record_id":"task:active-1"}}',
      "--set-facets",
      '{"status":"in_progress"}'
    ]);
    const second = await runCliCapture([
      "upsert",
      "--schema-id",
      "demo:test:task",
      "--match",
      '{"facets":{"record_id":"task:active-1"}}',
      "--set-facets",
      '{"status":"done"}'
    ]);
    const count = await harness.database.query<{ count: number }>(
      `
        SELECT COUNT(*) AS count
        FROM facets
        WHERE schema_id = 'demo:test:task'
          AND json_extract(facets_json, '$.record_id') = 'task:active-1'
      `
    );

    expect(first.exitCode).toBe(0);
    expect(second.exitCode).toBe(0);
    expect(count[0]?.count).toBe(1);
  });

  it("updates an existing edge instead of duplicating it", async () => {
    const first = await runCliCapture([
      "learn",
      "--edge",
      '{"source":"concept:demo:task","target":"concept:demo:missing-capability","label":"HAS_GAP","weight":0.2}'
    ]);
    const second = await runCliCapture([
      "learn",
      "--edge",
      '{"source":"concept:demo:task","target":"concept:demo:missing-capability","label":"HAS_GAP","weight":0.9}'
    ]);
    const count = await harness.database.query<{ count: number }>(
      `
        SELECT COUNT(*) AS count
        FROM graph_relation r
        JOIN graph_entity s ON s.entity_id = r.source_id AND s.entity_type = 'entity'
        JOIN graph_entity t ON t.entity_id = r.target_id AND t.entity_type = 'entity'
        WHERE s.name = 'concept:demo:task'
          AND t.name = 'concept:demo:missing-capability'
          AND r.relation_type = 'HAS_GAP'
          AND r.valid_to_unix IS NULL
      `
    );

    expect(first.exitCode).toBe(0);
    expect(second.exitCode).toBe(0);
    expect(count[0]?.count).toBe(1);
  });

  it("keeps expired facts out of pack output", async () => {
    const result = await runCliCapture([
      "pack",
      "--query",
      "project apollo",
      "--scope",
      "project:apollo"
    ]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout.join("").trim())).toMatchObject({
      pack_text: expect.not.stringContaining("Expired task should not appear")
    });
  });
});
