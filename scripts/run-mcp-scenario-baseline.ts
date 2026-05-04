import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { ensureBootstrapData } from "../src/bootstrap/seed.ts";
import { resolveGhostcrabConfig, type NativeExtensionsMode } from "../src/config/env.ts";
import { createDatabaseClient } from "../src/db/client.ts";
import { runMigrations } from "../src/db/migrate.ts";
import {
  MCP_SCENARIO_IDS,
  executeScenario,
  type McpScenarioId
} from "../tests/helpers/mcp-scenarios.ts";

const requestedMode = (process.argv[2] as NativeExtensionsMode | undefined) ?? "auto";
const requestedScenario = process.argv[3] as McpScenarioId | undefined;
const outputPath = resolve(
  process.cwd(),
  process.argv[4] ??
    `artifacts/mcp-agent-validation/baseline-${requestedMode}${requestedScenario ? `-${requestedScenario}` : ""}.json`
);

if (!["sql-only", "auto", "native"].includes(requestedMode)) {
  throw new Error(
    `Invalid runtime mode ${requestedMode}. Expected one of sql-only, auto, native.`
  );
}

if (requestedScenario && !MCP_SCENARIO_IDS.includes(requestedScenario)) {
  throw new Error(`Unknown scenario ${requestedScenario}.`);
}

const config = resolveGhostcrabConfig(process.env);
const database = createDatabaseClient(config);

try {
  const reachable = await database.ping();
  if (!reachable) {
    throw new Error(`Integration database is unreachable at ${config.databaseUrl}.`);
  }

  await runMigrations(database);
  await ensureBootstrapData(database);

  const scenarioIds = requestedScenario ? [requestedScenario] : [...MCP_SCENARIO_IDS];
  const artifacts = [];
  for (const scenarioId of scenarioIds) {
    artifacts.push(
      await executeScenario(database, scenarioId, requestedMode, `baseline-${scenarioId}`)
    );
  }

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(
    outputPath,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        runtime_mode: requestedMode,
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
