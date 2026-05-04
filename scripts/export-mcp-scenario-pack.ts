import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { listScenarioManifests } from "../tests/helpers/mcp-scenarios.ts";

const outputPath = resolve(
  process.cwd(),
  process.argv[2] ?? "artifacts/mcp-agent-validation/scenario-pack.json"
);

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(
  outputPath,
  JSON.stringify(
    {
      generated_at: new Date().toISOString(),
      scenarios: listScenarioManifests()
    },
    null,
    2
  ) + "\n",
  "utf8"
);

process.stdout.write(`${outputPath}\n`);
