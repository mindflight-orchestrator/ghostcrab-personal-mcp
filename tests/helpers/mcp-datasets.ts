import type { DatabaseClient } from "../../src/db/client.js";
import {
  cleanupTestDatabase,
  seedActiveProjectDataset,
  seedBootstrapDomainMinimal,
  seedEdgeCasesDataset
} from "./cli-integration.js";

export const MCP_DATASET_NAMES = [
  "bootstrap_minimal",
  "active_project",
  "edge_cases",
  "empty_runtime"
] as const;

export type McpDatasetName = (typeof MCP_DATASET_NAMES)[number];

export interface McpDatasetSpec {
  description: string;
  name: McpDatasetName;
}

export const MCP_DATASETS: readonly McpDatasetSpec[] = [
  {
    name: "empty_runtime",
    description:
      "Only bootstrap/system data after cleanup. Useful for startup/status and error-path tests."
  },
  {
    name: "bootstrap_minimal",
    description:
      "Minimal domain fixture: one demo schema, one concept node, one project/projection."
  },
  {
    name: "active_project",
    description:
      "Canonical MCP smoke dataset: active tasks, blocker projection, agent state, and BM25/count friendly facts."
  },
  {
    name: "edge_cases",
    description:
      "Extends active_project with graph gap/coverage edge cases for traverse and coverage-style scenarios."
  }
] as const;

export async function loadMcpDataset(
  database: DatabaseClient,
  dataset: McpDatasetName
): Promise<void> {
  await cleanupTestDatabase(database);

  switch (dataset) {
    case "empty_runtime":
      return;
    case "bootstrap_minimal":
      await seedBootstrapDomainMinimal(database);
      return;
    case "active_project":
      await seedActiveProjectDataset(database);
      return;
    case "edge_cases":
      await seedEdgeCasesDataset(database);
      return;
  }
}
