import { describe, expect, it } from "vitest";
import type { DatabaseClient } from "../../src/db/client.js";
import { createToolContext } from "../helpers/tool-context.js";
import {
  normalizeProjectionQuestion,
  routeQualifiedProjection
} from "../../src/tools/business-query-router/projection-contract-route.js";
import { chooseRouteFromScores } from "../../src/tools/business-query-router/planner.js";
import { businessQueryAnswerTool } from "../../src/tools/business-query-router/index.js";
import type { BusinessCapability } from "../../src/tools/business-query-router/types.js";

const contract = {
  version: 1,
  ontology_id: "immo::core",
  ontology_version: "1",
  operation: "group_sum",
  as_of: "2026-09-13",
  business_question: "Les quotités totalisent-elles 1000 ?",
  paraphrases: ["liste des quotités par immeuble"]
};
const row = {
  artifact_id: "a",
  current_version: 2,
  lifecycle: "active",
  state: "refreshed",
  payload_json: JSON.stringify({
    projection_contract: contract,
    qualified_result: {
      status: "ready",
      source_digest: "a".repeat(64),
      contract_digest: "b".repeat(64)
    }
  })
};
function context(rows = [row]) {
  return createToolContext({
    query: async (sql: string, params: unknown[]) => {
      expect(sql).toContain("FROM mindbrain_answer_artifacts");
      expect(sql).not.toContain("agent_facts");
      expect(params).toEqual(["immo"]);
      return rows;
    }
  } as unknown as DatabaseClient);
}
describe("native contract projection discovery", () => {
  it("never falls back to facts when projection_only has no prepared contract", async () => {
    const result = await businessQueryAnswerTool.handler(
      {
        workspace_id: "immo",
        question: contract.business_question,
        projection_only: true
      },
      context([])
    );
    expect(result.structuredContent).toMatchObject({
      ok: true,
      match_status: "unsupported",
      answer_available: false,
      next_call: null
    });
  });
  it("returns a complete second-call binding without reading facts", async () => {
    const result = await routeQualifiedProjection(
      context(),
      "immo",
      contract.business_question
    );
    expect(result).toMatchObject({
      match_status: "matched",
      answer_available: true,
      next_call: {
        name: "ghostcrab_artifact_get",
        arguments: {
          workspace_id: "immo",
          artifact_id: "a",
          expected_version: 2,
          expected_as_of: "2026-09-13",
          expected_contract_digest: "b".repeat(64),
          expected_source_digest: "a".repeat(64)
        }
      }
    });
  });
  it("accepts a polite phrase variation without changing conditions", async () => {
    expect(
      await routeQualifiedProjection(
        context(),
        "immo",
        "Peux-tu me donner la liste des quotités par immeuble ?"
      )
    ).toMatchObject({ match_status: "matched" });
  });
  it.each([
    "Les quotités totalisent-elles 900 ?",
    "Les quotités ne totalisent-elles pas 1000 ?",
    "liste des quotités par immeuble pour Érables",
    "Les quotités totalisent-elles 1000 et quels baux sont actifs ?"
  ])("abstains instead of dropping conditions: %s", async (question) => {
    expect(
      await routeQualifiedProjection(context(), "immo", question)
    ).toMatchObject({ match_status: "unsupported", answer_available: false });
  });
  it("clarifies competing contracts rather than choosing by artifact kind", async () => {
    expect(
      await routeQualifiedProjection(
        context([row, { ...row, artifact_id: "b" }]),
        "immo",
        contract.business_question
      )
    ).toMatchObject({
      match_status: "ambiguous",
      answer_available: false,
      candidates: ["a", "b"]
    });
  });
  it("does not serve a dated materialization for another date", async () => {
    const dated = {
      ...row,
      payload_json: JSON.stringify({
        projection_contract: { ...contract, operation: "dated_relations" },
        qualified_result: { status: "ready" }
      })
    };
    expect(
      await routeQualifiedProjection(
        context([dated]),
        "immo",
        contract.business_question,
        "2026-10-01"
      )
    ).toMatchObject({ answer_available: false, next_call: null });
  });
  it("honors an explicit date even for sums over date-valid relations", async () => {
    expect(
      await routeQualifiedProjection(
        context(),
        "immo",
        contract.business_question,
        "2026-10-01"
      )
    ).toMatchObject({ answer_available: false, next_call: null });
  });
  it("retains numeric and negative distinctions in normalized text", () => {
    expect(normalizeProjectionQuestion("sans propriétaire")).not.toEqual(
      normalizeProjectionQuestion("avec propriétaire")
    );
  });
  it("does not let a weaker legacy snapshot beat the exact live view", () => {
    const capability = (
      id: string,
      availability: "answer_snapshot" | "live_answer_view"
    ): BusinessCapability => ({
      capability_id: id,
      artifact_id: id,
      availability,
      source: "registry"
    });
    const decision = chooseRouteFromScores({
      intent: {
        id: "generic",
        label: "interventions",
        slots: {},
        confidence: 1
      },
      ranked: [
        {
          capability: capability("interventions", "live_answer_view"),
          score: 0.6
        },
        { capability: capability("chantier", "answer_snapshot"), score: 0.36 }
      ]
    });
    expect(decision.route.artifact_id).toBe("interventions");
  });
});
