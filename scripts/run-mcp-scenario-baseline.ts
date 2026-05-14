import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { ensureBootstrapData } from "../src/bootstrap/seed.ts";
import { resolveGhostcrabConfig } from "../src/config/env.ts";
import { createDatabaseClient } from "../src/db/client.ts";
import {
  MCP_SCENARIO_IDS,
  executeScenario,
  type McpScenarioId
} from "../tests/helpers/mcp-scenarios.ts";

const requestedScenario = process.argv[2] as McpScenarioId | undefined;
const outputPath = resolve(
  process.cwd(),
  process.argv[3] ??
    `artifacts/mcp-agent-validation/baseline${requestedScenario ? `-${requestedScenario}` : ""}.json`
);

if (requestedScenario && !MCP_SCENARIO_IDS.includes(requestedScenario)) {
  throw new Error(`Unknown scenario ${requestedScenario}.`);
}

const config = resolveGhostcrabConfig(process.env);
const database = createDatabaseClient(config);

try {
  const reachable = await database.ping();
  if (!reachable) {
    throw new Error(`Integration MindBrain backend is unreachable at ${config.mindbrainUrl}.`);
  }

  await ensureBootstrapData(database);

  const scenarioIds = requestedScenario ? [requestedScenario] : [...MCP_SCENARIO_IDS];
  const artifacts = [];
  for (const scenarioId of scenarioIds) {
    artifacts.push(
      await executeScenario(database, scenarioId, `baseline-${scenarioId}`)
    );
  }

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(
    outputPath,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        scenarios: artifacts
      },
      null,
      2
    ) + "\n",
    "utf8"
  );

  process.stdout.write(`${outputPath}\n`);
} finally {
  await database.close().catch(() => undefined);
}
