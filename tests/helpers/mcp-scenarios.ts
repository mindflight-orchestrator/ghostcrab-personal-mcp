import type { DatabaseClient } from "../../src/db/client.js";
import type { McpDatasetName } from "./mcp-datasets.js";
import { loadMcpDataset } from "./mcp-datasets.js";
import type { McpTraceRecord } from "./mcp-stdio.js";
import { callToolJson, withMcpStdioClient } from "./mcp-stdio.js";

export type ScenarioScore = "pass" | "weak_pass" | "fail";

export interface ScenarioScorecard {
  native_awareness: ScenarioScore;
  recovery: ScenarioScore;
  result_quality: ScenarioScore;
  runtime_awareness: ScenarioScore;
  tool_choice: ScenarioScore;
}

export interface McpScenarioArtifact {
  agent: string;
  dataset: McpDatasetName;
  expected_tools: string[];
  final_answer_summary: string;
  notes: string[];
  observed_backend: string[];
  prompt: string;
  scenario_id: McpScenarioId;
  scorecard: ScenarioScorecard;
  tools_called: string[];
  trace: McpTraceRecord[];
  verdict: ScenarioScore;
}

export interface McpScenarioManifest {
  dataset: McpDatasetName;
  expected_tools: string[];
  prompt: string;
  scenario_id: McpScenarioId;
}

export interface McpScenarioComparison {
  agent: string;
  baseline_agent: string;
  candidate: McpScenarioArtifact;
  baseline: McpScenarioArtifact;
  notes: string[];
  scenario_id: McpScenarioId;
  scorecard: ScenarioScorecard;
  verdict: ScenarioScore;
}

interface McpScenario {
  dataset: McpDatasetName;
  expectedTools: string[];
  id: McpScenarioId;
  prompt: string;
  run: (args: {
    clientName: string;
    database: DatabaseClient;
  }) => Promise<McpScenarioArtifact>;
}

export const MCP_SCENARIO_IDS = [
  "ops_runtime_status",
  "facets_task_count",
  "facets_bm25_blocker",
  "graph_gap_neighbors",
  "pragma_context_pack",
  "workspace_create",
  "workspace_ddl_propose"
] as const;

export type McpScenarioId = (typeof MCP_SCENARIO_IDS)[number];

const SCORECARD_PASS: ScenarioScorecard = {
  tool_choice: "pass",
  runtime_awareness: "pass",
  native_awareness: "pass",
  result_quality: "pass",
  recovery: "pass"
};

const SCORECARD_FAIL: ScenarioScorecard = {
  tool_choice: "fail",
  runtime_awareness: "fail",
  native_awareness: "fail",
  result_quality: "fail",
  recovery: "fail"
};

function overallVerdict(scorecard: ScenarioScorecard): ScenarioScore {
  const values = Object.values(scorecard);
  if (values.includes("fail")) {
    return "fail";
  }
  if (values.includes("weak_pass")) {
    return "weak_pass";
  }
  return "pass";
}

function summarizeArtifact(
  trace: McpTraceRecord[],
  prompt: string,
  scenarioId: McpScenarioId,
  dataset: McpDatasetName,
  expectedTools: string[],
  notes: string[] = []
): McpScenarioArtifact {
  const callTrace = trace.filter((record) => record.kind === "call_tool");
  const toolsCalled = callTrace.map((record) => record.name);
  const observedBackend = callTrace
    .map((record) => record.response?.backend)
    .filter((value): value is string => typeof value === "string");
  const finalResponse = callTrace.at(-1)?.response ?? {};

  return {
    scenario_id: scenarioId,
    agent: "baseline-mcp",
    dataset,
    prompt,
    expected_tools: expectedTools,
    tools_called: toolsCalled,
    trace,
    observed_backend: observedBackend,
    final_answer_summary: JSON.stringify(finalResponse),
    scorecard: SCORECARD_PASS,
    verdict: overallVerdict(SCORECARD_PASS),
    notes
  };
}

function workspaceIdForScenario(scenarioId: string): string {
  return `mcp-${scenarioId.replace(/_/g, "-")}`;
}

function sameStringArray(left: string[], right: string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function includesExpectedToolsInOrder(
  expectedTools: string[],
  toolsCalled: string[]
): boolean {
  let index = 0;
  for (const tool of toolsCalled) {
    if (tool === expectedTools[index]) {
      index += 1;
      if (index === expectedTools.length) {
        return true;
      }
    }
  }
  return expectedTools.length === 0;
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function scoreToolChoice(
  baseline: McpScenarioArtifact,
  candidate: McpScenarioArtifact
): ScenarioScore {
  if (sameStringArray(candidate.tools_called, baseline.expected_tools)) {
    return "pass";
  }
  if (includesExpectedToolsInOrder(baseline.expected_tools, candidate.tools_called)) {
    return "weak_pass";
  }
  return "fail";
}

function scoreRuntimeAwareness(
  baseline: McpScenarioArtifact,
  candidate: McpScenarioArtifact
): ScenarioScore {
  if (
    candidate.dataset === baseline.dataset &&
    normalizeText(candidate.prompt) === normalizeText(baseline.prompt)
  ) {
    return "pass";
  }
  if (candidate.dataset === baseline.dataset) {
    return "weak_pass";
  }
  return "fail";
}

function scoreNativeAwareness(
  baseline: McpScenarioArtifact,
  candidate: McpScenarioArtifact
): ScenarioScore {
  if (baseline.observed_backend.length === 0) {
    return candidate.observed_backend.length === 0 ? "pass" : "weak_pass";
  }
  if (sameStringArray(candidate.observed_backend, baseline.observed_backend)) {
    return "pass";
  }
  if (candidate.observed_backend.length > 0) {
    return "weak_pass";
  }
  return "fail";
}

function scoreResultQuality(candidate: McpScenarioArtifact): ScenarioScore {
  const summary = normalizeText(candidate.final_answer_summary);
  if (summary.length >= 24) {
    return "pass";
  }
  if (summary.length > 0) {
    return "weak_pass";
  }
  return "fail";
}

function scoreRecovery(candidate: McpScenarioArtifact): ScenarioScore {
  if (candidate.trace.every((record) => record.ok)) {
    return "pass";
  }
  if (candidate.trace.some((record) => record.ok)) {
    return "weak_pass";
  }
  return "fail";
}

const SCENARIOS: Record<McpScenarioId, McpScenario> = {
  ops_runtime_status: {
    id: "ops_runtime_status",
    dataset: "empty_runtime",
    expectedTools: ["ghostcrab_status"],
    prompt:
      "Dis-moi quelles extensions sont détectées et quelles capacités natives sont réellement prêtes.",
    async run({ clientName, database }) {
      await loadMcpDataset(database, "empty_runtime");

      return withMcpStdioClient(
        clientName,
        async ({ client, getTrace }) => {
          await callToolJson(
            client,
            "ghostcrab_status",
            { agent_id: "agent:self" },
            "ghostcrab_status",
            getTrace()
          );

          return summarizeArtifact(
            getTrace(),
            this.prompt,
            this.id,
            this.dataset,
            this.expectedTools
          );
        }
      );
    }
  },
  facets_task_count: {
    id: "facets_task_count",
    dataset: "active_project",
    expectedTools: ["ghostcrab_count"],
    prompt: "Compte les tâches par statut dans project:apollo.",
    async run({ clientName, database }) {
      await loadMcpDataset(database, "active_project");

      return withMcpStdioClient(
        clientName,
        async ({ client, getTrace }) => {
          await callToolJson(
            client,
            "ghostcrab_count",
            {
              schema_id: "demo:test:task",
              group_by: ["status"],
              filters: { scope: "project:apollo" }
            },
            "ghostcrab_count",
            getTrace()
          );

          return summarizeArtifact(
            getTrace(),
            this.prompt,
            this.id,
            this.dataset,
            this.expectedTools
          );
        }
      );
    }
  },
  facets_bm25_blocker: {
    id: "facets_bm25_blocker",
    dataset: "active_project",
    expectedTools: ["ghostcrab_search"],
    prompt: "Trouve les tâches bloquées par missing API token.",
    async run({ clientName, database }) {
      await loadMcpDataset(database, "active_project");

      return withMcpStdioClient(
        clientName,
        async ({ client, getTrace }) => {
          await callToolJson(
            client,
            "ghostcrab_search",
            {
              query: "missing API token",
              schema_id: "demo:test:task",
              mode: "bm25"
            },
            "ghostcrab_search",
            getTrace()
          );

          return summarizeArtifact(
            getTrace(),
            this.prompt,
            this.id,
            this.dataset,
            this.expectedTools
          );
        }
      );
    }
  },
  graph_gap_neighbors: {
    id: "graph_gap_neighbors",
    dataset: "edge_cases",
    expectedTools: ["ghostcrab_traverse"],
    prompt: "Parcours le voisinage immédiat du concept demo task.",
    async run({ clientName, database }) {
      await loadMcpDataset(database, "edge_cases");

      return withMcpStdioClient(
        clientName,
        async ({ client, getTrace }) => {
          await callToolJson(
            client,
            "ghostcrab_traverse",
            {
              start: "concept:demo:task",
              depth: 1,
              direction: "outbound"
            },
            "ghostcrab_traverse",
            getTrace()
          );

          return summarizeArtifact(
            getTrace(),
            this.prompt,
            this.id,
            this.dataset,
            this.expectedTools
          );
        }
      );
    }
  },
  pragma_context_pack: {
    id: "pragma_context_pack",
    dataset: "active_project",
    expectedTools: ["ghostcrab_pack"],
    prompt: "Construit un pack de contexte sur le blocker missing token.",
    async run({ clientName, database }) {
      await loadMcpDataset(database, "active_project");

      return withMcpStdioClient(
        clientName,
        async ({ client, getTrace }) => {
          await callToolJson(
            client,
            "ghostcrab_pack",
            { query: "missing token blocker project apollo" },
            "ghostcrab_pack",
            getTrace()
          );

          return summarizeArtifact(
            getTrace(),
            this.prompt,
            this.id,
            this.dataset,
            this.expectedTools
          );
        }
      );
    }
  },
  workspace_create: {
    id: "workspace_create",
    dataset: "empty_runtime",
    expectedTools: ["ghostcrab_workspace_create"],
    prompt: "Crée un workspace de validation MCP.",
    async run({ clientName, database }) {
      await loadMcpDataset(database, "empty_runtime");

      return withMcpStdioClient(
        clientName,
        async ({ client, getTrace }) => {
          await callToolJson(
            client,
            "ghostcrab_workspace_create",
            {
              id: workspaceIdForScenario(this.id),
              label: "MCP Validation Workspace",
              created_by: "baseline-mcp"
            },
            "ghostcrab_workspace_create",
            getTrace()
          );

          return summarizeArtifact(
            getTrace(),
            this.prompt,
            this.id,
            this.dataset,
            this.expectedTools
          );
        }
      );
    }
  },
  workspace_ddl_propose: {
    id: "workspace_ddl_propose",
    dataset: "empty_runtime",
    expectedTools: ["ghostcrab_ddl_propose"],
    prompt: "Propose une petite migration DDL dans le workspace default.",
    async run({ clientName, database }) {
      await loadMcpDataset(database, "empty_runtime");

      return withMcpStdioClient(
        clientName,
        async ({ client, getTrace }) => {
          await callToolJson(
            client,
            "ghostcrab_ddl_propose",
            {
              workspace_id: "default",
              sql: "CREATE TABLE IF NOT EXISTS mcp_validation_probe (id SERIAL PRIMARY KEY, label TEXT)",
              rationale: "Validation baseline DDL propose path"
            },
            "ghostcrab_ddl_propose",
            getTrace()
          );

          return summarizeArtifact(
            getTrace(),
            this.prompt,
            this.id,
            this.dataset,
            this.expectedTools
          );
        }
      );
    }
  }
};

export function listScenarioPack(): readonly McpScenarioId[] {
  return MCP_SCENARIO_IDS;
}

export function getScenarioManifest(
  scenarioId: McpScenarioId
): McpScenarioManifest {
  const scenario = SCENARIOS[scenarioId];
  return {
    scenario_id: scenario.id,
    dataset: scenario.dataset,
    prompt: scenario.prompt,
    expected_tools: scenario.expectedTools
  };
}

export function listScenarioManifests(): readonly McpScenarioManifest[] {
  return MCP_SCENARIO_IDS.map((scenarioId) => getScenarioManifest(scenarioId));
}

export async function executeScenario(
  database: DatabaseClient,
  scenarioId: McpScenarioId,
  clientName = `scenario-${scenarioId}`
): Promise<McpScenarioArtifact> {
  return SCENARIOS[scenarioId].run({
    clientName,
    database
  });
}

export function compareScenarioArtifactToBaseline(
  baseline: McpScenarioArtifact,
  candidate: McpScenarioArtifact
): McpScenarioComparison {
  if (baseline.scenario_id !== candidate.scenario_id) {
    return {
      scenario_id: candidate.scenario_id,
      agent: candidate.agent,
      baseline_agent: baseline.agent,
      baseline,
      candidate,
      notes: [
        `Scenario mismatch: baseline=${baseline.scenario_id}, candidate=${candidate.scenario_id}`
      ],
      scorecard: SCORECARD_FAIL,
      verdict: "fail"
    };
  }

  const scorecard: ScenarioScorecard = {
    tool_choice: scoreToolChoice(baseline, candidate),
    runtime_awareness: scoreRuntimeAwareness(baseline, candidate),
    native_awareness: scoreNativeAwareness(baseline, candidate),
    result_quality: scoreResultQuality(candidate),
    recovery: scoreRecovery(candidate)
  };

  const notes: string[] = [];
  if (!sameStringArray(candidate.tools_called, baseline.expected_tools)) {
    notes.push(
      `Tool sequence differs: expected=${baseline.expected_tools.join(",")} actual=${candidate.tools_called.join(",")}`
    );
  }
  if (normalizeText(candidate.prompt) !== normalizeText(baseline.prompt)) {
    notes.push("Prompt differs from baseline scenario prompt.");
  }
  if (candidate.dataset !== baseline.dataset) {
    notes.push(
      `Dataset differs: expected=${baseline.dataset} actual=${candidate.dataset}`
    );
  }
  if (!sameStringArray(candidate.observed_backend, baseline.observed_backend)) {
    notes.push(
      `Observed backend differs: expected=${baseline.observed_backend.join(",")} actual=${candidate.observed_backend.join(",")}`
    );
  }
  if (candidate.trace.some((record) => !record.ok)) {
    notes.push("At least one MCP call failed during the candidate scenario run.");
  }

  return {
    scenario_id: candidate.scenario_id,
    agent: candidate.agent,
    baseline_agent: baseline.agent,
    baseline,
    candidate,
    notes,
    scorecard,
    verdict: overallVerdict(scorecard)
  };
}
