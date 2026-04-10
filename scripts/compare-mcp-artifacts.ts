import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  compareScenarioArtifactToBaseline,
  type McpScenarioArtifact
} from "../tests/helpers/mcp-scenarios.ts";

interface ArtifactBundle {
  scenarios: McpScenarioArtifact[];
}

const baselinePath = process.argv[2];
const candidatePath = process.argv[3];

if (!baselinePath || !candidatePath) {
  throw new Error(
    "Usage: tsx scripts/compare-mcp-artifacts.ts <baseline.json> <candidate.json>"
  );
}

const baselineBundle = JSON.parse(
  readFileSync(resolve(process.cwd(), baselinePath), "utf8")
) as ArtifactBundle;
const candidateBundle = JSON.parse(
  readFileSync(resolve(process.cwd(), candidatePath), "utf8")
) as ArtifactBundle;

const baselineById = new Map(
  baselineBundle.scenarios.map((artifact) => [artifact.scenario_id, artifact])
);

const comparisons = candidateBundle.scenarios.map((candidate) => {
  const baseline = baselineById.get(candidate.scenario_id);
  if (!baseline) {
    throw new Error(`Missing baseline for scenario ${candidate.scenario_id}.`);
  }
  return compareScenarioArtifactToBaseline(baseline, candidate);
});

process.stdout.write(
  JSON.stringify(
    {
      generated_at: new Date().toISOString(),
      comparisons
    },
    null,
    2
  ) + "\n"
);
