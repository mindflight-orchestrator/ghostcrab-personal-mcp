import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  cleanupTestDatabase,
  closeIntegrationDatabase,
  createIntegrationHarness,
  runCliCapture,
  seedBootstrapDomainMinimal
} from "../../helpers/cli-integration.js";

const harness = createIntegrationHarness();

describe.sequential("CLI bootstrap flows", () => {
  beforeEach(async () => {
    await cleanupTestDatabase(harness.database);
  });

  afterAll(async () => {
    await closeIntegrationDatabase(harness.database);
  });

  it("lists system schemas on a fresh database", async () => {
    const result = await runCliCapture(["schema", "list"]);

    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout.join("").trim()) as {
      schemas: Array<Record<string, unknown>>;
    };
    if (harness.database.kind === "sqlite") {
      expect(Array.isArray(payload.schemas)).toBe(true);
    } else {
      expect(payload.schemas.length).toBeGreaterThan(0);
    }
  });

  it("registers and inspects a new schema", async () => {
    const register = await runCliCapture([
      "schema",
      "register",
      "--definition",
      '{"schema_id":"demo:test:lead","description":"Lead tracking schema"}'
    ]);

    expect(register.exitCode).toBe(0);
    expect(JSON.parse(register.stdout.join("").trim())).toMatchObject({
      registered: true,
      schema_id: "demo:test:lead"
    });

    const inspect = await runCliCapture([
      "schema",
      "inspect",
      "--schema-id",
      "demo:test:lead"
    ]);

    expect(inspect.exitCode).toBe(0);
    expect(JSON.parse(inspect.stdout.join("").trim())).toMatchObject({
      found: true,
      schema_id: "demo:test:lead"
    });
  });

  it("returns a non-fatal duplicate registration result", async () => {
    await seedBootstrapDomainMinimal(harness.database);

    const result = await runCliCapture([
      "schema",
      "register",
      "--definition",
      '{"schema_id":"demo:test:task","description":"Task records for integration tests"}'
    ]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout.join("").trim())).toMatchObject({
      registered: false,
      schema_id: "demo:test:task"
    });
  });

  it("creates graph structures and projections during bootstrap", async () => {
    const learn = await runCliCapture([
      "learn",
      "--node",
      '{"id":"concept:demo:story","node_type":"concept","label":"Story","properties":{"domain":"demo-story","mastery":1}}'
    ]);
    const project = await runCliCapture([
      "project",
      "--scope",
      "demo-story/bootstrap",
      "--content",
      "Model the first story workflow",
      "--proj-type",
      "STEP"
    ]);

    expect(learn.exitCode).toBe(0);
    expect(project.exitCode).toBe(0);
    expect(JSON.parse(project.stdout.join("").trim())).toMatchObject({
      stored: true,
      scope: "demo-story/bootstrap"
    });
  });

  it("reports null coverage before ontology and partial coverage after bootstrap ontology", async () => {
    const emptyCoverage = await runCliCapture([
      "coverage",
      "--domain",
      "demo-domain"
    ]);

    expect(emptyCoverage.exitCode).toBe(0);
    expect(JSON.parse(emptyCoverage.stdout.join("").trim())).toMatchObject({
      coverage_score: null,
      can_proceed_autonomously: false
    });

    await seedBootstrapDomainMinimal(harness.database);

    const seededCoverage = await runCliCapture([
      "coverage",
      "--domain",
      "demo-domain"
    ]);

    expect(seededCoverage.exitCode).toBe(0);
    expect(JSON.parse(seededCoverage.stdout.join("").trim())).toMatchObject({
      domain: "demo-domain",
      coverage_score: expect.any(Number)
    });
  });
});
