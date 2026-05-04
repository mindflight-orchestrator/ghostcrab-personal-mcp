import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { resolveGhostcrabConfig } from "../../../src/config/env.js";
import { createDatabaseClient } from "../../../src/db/client.js";
import { executeScenario, listScenarioPack } from "../../helpers/mcp-scenarios.js";

const SQLITE_TEST_DIR = mkdtempSync(join(tmpdir(), "ghostcrab-scenario-pack-"));
const SQLITE_TEST_DB_PATH = join(SQLITE_TEST_DIR, "scenario-pack.sqlite");

process.env.GHOSTCRAB_DATABASE_KIND = "sqlite";
process.env.GHOSTCRAB_MINDBRAIN_URL =
  process.env.GHOSTCRAB_MINDBRAIN_URL ?? "http://127.0.0.1:8091";
process.env.GHOSTCRAB_SQLITE_PATH = SQLITE_TEST_DB_PATH;
process.env.GHOSTCRAB_EMBEDDINGS_MODE = "disabled";
delete process.env.DATABASE_URL;

const config = resolveGhostcrabConfig(process.env);
const database = createDatabaseClient(config);

describe.sequential("MCP scenario pack baseline", () => {
  beforeAll(async () => {
    const reachable = await database.ping();
    if (!reachable) {
      throw new Error(
        `Integration MindBrain backend is unreachable at ${config.mindbrainUrl}.`
      );
    }
  });

  afterAll(async () => {
    await database.close();
    rmSync(SQLITE_TEST_DIR, { force: true, recursive: true });
  });

  it("exposes the expected baseline scenario pack", () => {
    expect(listScenarioPack()).toEqual([
      "ops_runtime_status",
      "facets_task_count",
      "facets_bm25_blocker",
      "graph_gap_neighbors",
      "pragma_context_pack",
      "workspace_create",
      "workspace_ddl_propose"
    ]);
  });

  it("executes representative scenarios and emits comparable artifacts", async () => {
    const scenarios = [
      "ops_runtime_status",
      "facets_bm25_blocker",
      "workspace_ddl_propose"
    ] as const;

    for (const scenarioId of scenarios) {
      const artifact = await executeScenario(database, scenarioId, "auto");

      expect(artifact.scenario_id).toBe(scenarioId);
      expect(artifact.agent).toBe("baseline-mcp");
      expect(artifact.trace.length).toBeGreaterThan(0);
      expect(artifact.tools_called).toEqual(artifact.expected_tools);
      expect(artifact.verdict).toBe("pass");
      expect(artifact.scorecard).toMatchObject({
        tool_choice: "pass",
        runtime_awareness: "pass",
        native_awareness: "pass",
        result_quality: "pass",
        recovery: "pass"
      });
    }
  });
});
