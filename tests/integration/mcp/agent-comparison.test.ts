import { describe, expect, it } from "vitest";

import {
  compareScenarioArtifactToBaseline,
  getScenarioManifest,
  listScenarioManifests,
  type McpScenarioArtifact
} from "../../helpers/mcp-scenarios.js";

function makeArtifact(
  overrides: Partial<McpScenarioArtifact> = {}
): McpScenarioArtifact {
  return {
    scenario_id: "facets_bm25_blocker",
    agent: "baseline-mcp",
    dataset: "active_project",
    runtime_mode: "auto",
    prompt: "Trouve les tâches bloquées par missing API token.",
    expected_tools: ["ghostcrab_search"],
    tools_called: ["ghostcrab_search"],
    trace: [
      {
        kind: "call_tool",
        name: "ghostcrab_search",
        ok: true,
        response: { backend: "native" },
        duration_ms: 12
      }
    ],
    observed_backend: ["native"],
    final_answer_summary: "{\"ok\":true,\"tool\":\"ghostcrab_search\"}",
    scorecard: {
      tool_choice: "pass",
      runtime_awareness: "pass",
      native_awareness: "pass",
      result_quality: "pass",
      recovery: "pass"
    },
    verdict: "pass",
    notes: [],
    ...overrides
  };
}

describe("MCP agent comparison helpers", () => {
  it("exposes manifests aligned with the scenario pack", () => {
    expect(getScenarioManifest("facets_bm25_blocker")).toEqual({
      scenario_id: "facets_bm25_blocker",
      dataset: "active_project",
      prompt: "Trouve les tâches bloquées par missing API token.",
      expected_tools: ["ghostcrab_search"]
    });

    expect(listScenarioManifests()).toHaveLength(7);
  });

  it("scores a protocol-aligned candidate as pass", () => {
    const baseline = makeArtifact();
    const candidate = makeArtifact({ agent: "codex" });

    const comparison = compareScenarioArtifactToBaseline(baseline, candidate);

    expect(comparison.agent).toBe("codex");
    expect(comparison.verdict).toBe("pass");
    expect(comparison.scorecard).toEqual({
      tool_choice: "pass",
      runtime_awareness: "pass",
      native_awareness: "pass",
      result_quality: "pass",
      recovery: "pass"
    });
  });

  it("flags protocol drift when prompt and tool sequence differ", () => {
    const baseline = makeArtifact();
    const candidate = makeArtifact({
      agent: "openclaw",
      prompt: "Find blockers about the missing API token.",
      tools_called: ["ghostcrab_status", "ghostcrab_search"],
      trace: [
        {
          kind: "call_tool",
          name: "ghostcrab_status",
          ok: true,
          response: {},
          duration_ms: 9
        },
        {
          kind: "call_tool",
          name: "ghostcrab_search",
          ok: true,
          response: { backend: "native" },
          duration_ms: 11
        }
      ]
    });

    const comparison = compareScenarioArtifactToBaseline(baseline, candidate);

    expect(comparison.verdict).toBe("weak_pass");
    expect(comparison.scorecard.tool_choice).toBe("weak_pass");
    expect(comparison.scorecard.runtime_awareness).toBe("weak_pass");
    expect(comparison.notes).toContain(
      "Prompt differs from baseline scenario prompt."
    );
  });
});
