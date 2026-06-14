/**
 * Unit-level routing checks for immeuble business capabilities (no backend required).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { rankCapabilities } from "../../src/tools/business-query-router/matcher.js";
import { normalizeBusinessQuestion } from "../../src/tools/business-query-router/normalizer.js";
import { chooseRouteFromScores } from "../../src/tools/business-query-router/planner.js";
import type {
  Availability,
  BusinessCapability,
  RouteMode
} from "../../src/tools/business-query-router/types.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const CAPABILITY_SEED_PATH = join(
  __dirname,
  "../../examples/immeuble/contracts/business_capabilities.seed.jsonl"
);

const LIVE_ROUTE_MODES = new Set<RouteMode>(["live_answer_view", "live_query"]);

interface RememberSeedEntry {
  content: string;
  facets: Record<string, unknown>;
  kind: "remember";
}

function loadImmeubleCapabilities(): BusinessCapability[] {
  const entries = readFileSync(CAPABILITY_SEED_PATH, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as RememberSeedEntry);

  return entries.map((entry) => {
    const facets = entry.facets;
    return {
      capability_id: String(facets.capability_id),
      workspace_id: String(facets.workspace_id),
      label: String(facets.label),
      business_question: String(facets.business_question),
      example_queries: Array.isArray(facets.example_queries)
        ? facets.example_queries.filter((item): item is string => typeof item === "string")
        : [],
      required_schemas: Array.isArray(facets.required_schemas)
        ? facets.required_schemas.filter((item): item is string => typeof item === "string")
        : [],
      required_facets: Array.isArray(facets.required_facets)
        ? facets.required_facets.filter((item): item is string => typeof item === "string")
        : [],
      artifact_id: String(facets.artifact_id),
      availability: facets.availability as Availability,
      activation_status: facets.activation_status as "active",
      source: "business-capability"
    };
  });
}

function routeQuestion(
  question: string,
  capabilities: BusinessCapability[]
) {
  const intent = normalizeBusinessQuestion(question);
  const ranked = rankCapabilities(intent, capabilities, question);
  return chooseRouteFromScores({ intent, ranked });
}

describe("immeuble business capability seed routing (unit)", () => {
  const capabilities = loadImmeubleCapabilities();

  it("loads active live_answer_view capabilities from seed", () => {
    expect(capabilities.length).toBeGreaterThanOrEqual(2);
    expect(
      capabilities.every((cap) => cap.availability === "live_answer_view")
    ).toBe(true);
    expect(
      capabilities.every((cap) => cap.workspace_id === "immeuble")
    ).toBe(true);
  });

  it.each([
    ["liste des baux actifs", "baux_actifs"],
    ["liste des quotités par immeuble", "quotites_par_immeuble"],
    ["liste annuaire des copropriétés", "annuaire_coproprietes"]
  ] as const)("routes « %s » to capability %s", (question, expectedId) => {
    const { route, gaps } = routeQuestion(question, capabilities);

    expect(LIVE_ROUTE_MODES.has(route.mode)).toBe(true);
    expect(route.reason.trim().length).toBeGreaterThan(0);
    expect(route.capability_id).toBe(expectedId);
    expect(gaps).toEqual([]);
  });

  it("falls back for an off-domain question", () => {
    const { route, gaps } = routeQuestion(
      "facette inconnue totalement absurde hors domaine",
      capabilities
    );

    expect(["gap_report", "clarification"]).toContain(route.mode);
    expect(route.reason.trim().length).toBeGreaterThan(0);
    expect(gaps.length).toBeGreaterThan(0);
  });
});
