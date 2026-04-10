import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  cleanupTestDatabase,
  closeIntegrationDatabase,
  createIntegrationHarness,
  runCliCapture,
  seedActiveProjectDataset
} from "../../helpers/cli-integration.js";

const harness = createIntegrationHarness();

describe.sequential("CLI end-to-end workflows", () => {
  beforeEach(async () => {
    await cleanupTestDatabase(harness.database);
  });

  afterAll(async () => {
    await closeIntegrationDatabase(harness.database);
  });

  it("bootstraps a new domain end-to-end", async () => {
    const register = await runCliCapture([
      "schema",
      "register",
      "--definition",
      '{"schema_id":"demo:e2e:initiative","description":"Initiative schema for e2e"}'
    ]);
    const remember = await runCliCapture([
      "remember",
      "--schema-id",
      "demo:e2e:initiative",
      "--content",
      "First initiative captures rollout readiness",
      "--facets",
      '{"record_id":"initiative:1","scope":"project:e2e","status":"draft"}'
    ]);
    const learn = await runCliCapture([
      "learn",
      "--node",
      '{"id":"concept:e2e:init","node_type":"concept","label":"Initiative","properties":{"domain":"e2e-domain","mastery":1}}'
    ]);
    const project = await runCliCapture([
      "project",
      "--scope",
      "project:e2e",
      "--content",
      "Finalize initial initiative model",
      "--proj-type",
      "STEP"
    ]);
    const status = await runCliCapture(["status", "--agent-id", "agent:self"]);

    expect(register.exitCode).toBe(0);
    expect(remember.exitCode).toBe(0);
    expect(learn.exitCode).toBe(0);
    expect(project.exitCode).toBe(0);
    expect(status.exitCode).toBe(0);
    expect(JSON.parse(status.stdout.join("").trim())).toMatchObject({
      ok: true,
      tool: "ghostcrab_status"
    });
  });

  it("supports a day-to-day agent workflow end-to-end", async () => {
    await seedActiveProjectDataset(harness.database);

    const search = await runCliCapture([
      "search",
      "--query",
      "missing API token",
      "--schema-id",
      "demo:test:task"
    ]);
    const count = await runCliCapture([
      "count",
      "--schema-id",
      "demo:test:task",
      "--group-by",
      "status"
    ]);
    const upsert = await runCliCapture([
      "upsert",
      "--schema-id",
      "demo:test:task",
      "--match",
      '{"facets":{"record_id":"task:active-1"}}',
      "--set-facets",
      '{"status":"in_progress"}'
    ]);
    const project = await runCliCapture([
      "project",
      "--scope",
      "project:apollo",
      "--content",
      "Token blocker now actively being resolved",
      "--proj-type",
      "STEP"
    ]);
    const status = await runCliCapture(["status", "--agent-id", "agent:self"]);
    const pack = await runCliCapture([
      "pack",
      "--query",
      "project apollo",
      "--scope",
      "project:apollo"
    ]);

    expect(search.exitCode).toBe(0);
    expect(count.exitCode).toBe(0);
    expect(upsert.exitCode).toBe(0);
    expect(project.exitCode).toBe(0);
    expect(status.exitCode).toBe(0);
    expect(pack.exitCode).toBe(0);
    expect(JSON.parse(pack.stdout.join("").trim())).toMatchObject({
      ok: true,
      tool: "ghostcrab_pack"
    });
  });
});
