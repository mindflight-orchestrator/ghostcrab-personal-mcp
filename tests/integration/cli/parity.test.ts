import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  cleanupTestDatabase,
  closeIntegrationDatabase,
  createIntegrationHarness,
  executeHandler,
  runCliCapture,
  seedActiveProjectDataset
} from "../../helpers/cli-integration.js";

const harness = createIntegrationHarness();

function parseCliJson(result: { stdout: string[] }) {
  return JSON.parse(result.stdout.join("").trim()) as Record<string, unknown>;
}

describe.sequential("CLI/MCP parity", () => {
  beforeEach(async () => {
    await cleanupTestDatabase(harness.database);
  });

  afterAll(async () => {
    await closeIntegrationDatabase(harness.database);
  });

  it("keeps parity for search", async () => {
    await seedActiveProjectDataset(harness.database);

    const cli = await runCliCapture([
      "search",
      "--query",
      "missing API token",
      "--schema-id",
      "demo:test:task"
    ]);
    const mcp = await executeHandler(
      "ghostcrab_search",
      {
        query: "missing API token",
        schema_id: "demo:test:task"
      },
      harness.database
    );

    expect(cli.exitCode).toBe(0);
    expect(parseCliJson(cli)).toMatchObject({
      tool: mcp.tool,
      returned: mcp.returned,
      mode_applied: mcp.mode_applied,
      mode_requested: mcp.mode_requested,
      results: expect.arrayContaining(
        (mcp.results as Array<Record<string, unknown>>).map((row) =>
          expect.objectContaining({
            content: row.content,
            schema_id: row.schema_id,
            facets: row.facets
          })
        )
      )
    });
  });

  it("keeps parity for remember", async () => {
    const cli = await runCliCapture([
      "remember",
      "--content",
      "CLI parity remember fact",
      "--schema-id",
      "demo:test:task",
      "--facets",
      '{"record_id":"task:parity-remember","scope":"project:parity"}'
    ]);
    const mcp = await executeHandler(
      "ghostcrab_remember",
      {
        content: "CLI parity remember fact",
        schema_id: "demo:test:task",
        facets: {
          record_id: "task:parity-remember",
          scope: "project:parity"
        }
      },
      harness.database
    );

    expect(cli.exitCode).toBe(0);
    expect(parseCliJson(cli)).toMatchObject({
      ok: true,
      tool: mcp.tool,
      stored: mcp.stored,
      schema_id: mcp.schema_id,
      embedding_stored: mcp.embedding_stored,
      id: expect.any(String),
      created_at: expect.any(String)
    });
  });

  it("keeps parity for count", async () => {
    await seedActiveProjectDataset(harness.database);

    const cli = await runCliCapture([
      "count",
      "--schema-id",
      "demo:test:task",
      "--group-by",
      "status",
      "--filters",
      '{"scope":"project:apollo"}'
    ]);
    const mcp = await executeHandler(
      "ghostcrab_count",
      {
        schema_id: "demo:test:task",
        group_by: ["status"],
        filters: {
          scope: "project:apollo"
        }
      },
      harness.database
    );

    expect(cli.exitCode).toBe(0);
    expect(parseCliJson(cli)).toMatchObject({
      tool: mcp.tool,
      schema_id: mcp.schema_id,
      counts: mcp.counts,
      filters: mcp.filters
    });
  });

  it("keeps parity for upsert success and record_not_found", async () => {
    await seedActiveProjectDataset(harness.database);

    const successCli = await runCliCapture([
      "upsert",
      "--schema-id",
      "demo:test:task",
      "--match",
      '{"facets":{"record_id":"task:active-1"}}',
      "--set-facets",
      '{"status":"in_progress"}'
    ]);
    const successMcp = await executeHandler(
      "ghostcrab_upsert",
      {
        schema_id: "demo:test:task",
        match: {
          facets: {
            record_id: "task:active-1"
          }
        },
        set_facets: {
          status: "in_progress"
        }
      },
      harness.database
    );

    expect(successCli.exitCode).toBe(0);
    expect(parseCliJson(successCli)).toMatchObject({
      tool: successMcp.tool,
      schema_id: successMcp.schema_id,
      updated: true,
      created: false,
      matched_existing: true,
      embedding_stored: successMcp.embedding_stored
    });

    const errorCli = await runCliCapture([
      "upsert",
      "--schema-id",
      "demo:test:task",
      "--match",
      '{"facets":{"record_id":"task:missing"}}',
      "--set-facets",
      '{"status":"blocked"}'
    ]);

    expect(errorCli.exitCode).toBe(1);
    expect(JSON.parse(errorCli.stdout.join("").trim())).toMatchObject({
      ok: false,
      error: {
        code: "record_not_found"
      }
    });
  });

  it("keeps parity for status", async () => {
    await seedActiveProjectDataset(harness.database);

    const cli = await runCliCapture(["status", "--agent-id", "agent:self"]);
    const mcp = await executeHandler(
      "ghostcrab_status",
      { agent_id: "agent:self" },
      harness.database
    );

    expect(cli.exitCode).toBe(0);
    expect(parseCliJson(cli)).toMatchObject({
      tool: mcp.tool,
      runtime: mcp.runtime,
      summary: mcp.summary,
      next_actions: mcp.next_actions,
      directives: mcp.directives
    });
  });
});
