/**
 * Immeuble business_query routing — loads seeded capabilities and asserts live routes.
 *
 * Requires a reachable MindBrain backend when integration infra is available.
 * Skips gracefully when the backend is unreachable (unit tests cover routing logic).
 */

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { resolveGhostcrabConfig } from "../../src/config/env.js";
import {
  createDatabaseClient,
  type DatabaseClient
} from "../../src/db/client.js";
import { loadRuntimeCapabilities } from "../../src/tools/business-query-router/loader.js";
import { rankCapabilities } from "../../src/tools/business-query-router/matcher.js";
import { normalizeBusinessQuestion } from "../../src/tools/business-query-router/normalizer.js";
import { chooseRouteFromScores } from "../../src/tools/business-query-router/planner.js";
import type { RouteMode } from "../../src/tools/business-query-router/types.js";
import { registerAllTools } from "../../src/tools/register-all.js";
import { closeIntegrationDatabase } from "../helpers/cli-integration.js";
import { createToolContext } from "../helpers/tool-context.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const WS_ID = "immeuble";
const CAPABILITY_SEED_PATH = join(
  __dirname,
  "../../examples/immeuble/contracts/business_capabilities.seed.jsonl"
);

const LIVE_ROUTE_MODES = new Set<RouteMode>(["live_answer_view", "live_query"]);
const FALLBACK_ROUTE_MODES = new Set<RouteMode>([
  "gap_report",
  "clarification"
]);

let backendAvailable = false;
let database: DatabaseClient;
let config = resolveGhostcrabConfig(process.env);

interface RememberSeedEntry {
  kind: "remember";
  content: string;
  facets: Record<string, unknown>;
  profile_id: string;
  schema_id: string;
}

function readCapabilitySeedEntries(): RememberSeedEntry[] {
  return readFileSync(CAPABILITY_SEED_PATH, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as RememberSeedEntry)
    .filter((entry) => entry.kind === "remember");
}

async function cleanupBusinessCapabilities(): Promise<void> {
  await database.query(
    `DELETE FROM agent_facts WHERE workspace_id = ? AND schema_id = ?`,
    [WS_ID, "ghostcrab:business-capability"]
  );
}

async function seedBusinessCapabilitiesFromFile(): Promise<number> {
  const entries = readCapabilitySeedEntries();
  let inserted = 0;

  for (const entry of entries) {
    const capabilityId = String(entry.facets.capability_id ?? randomUUID());
    await database.query(
      `
        INSERT INTO agent_facts (
          id,
          schema_id,
          content,
          facets_json,
          created_at_unix,
          updated_at_unix,
          doc_id,
          workspace_id
        )
        VALUES (
          ?,
          ?,
          ?,
          ?,
          strftime('%s','now'),
          strftime('%s','now'),
          (SELECT COALESCE(MAX(doc_id), 0) + 1 FROM agent_facts),
          ?
        )
      `,
      [
        `capability:${capabilityId}`,
        entry.schema_id,
        entry.content,
        JSON.stringify(entry.facets),
        WS_ID
      ]
    );
    inserted += 1;
  }

  return inserted;
}

function toolContext() {
  const ctx = createToolContext(database, {
    embeddingsMode: config.embeddingsMode,
    embeddingDimensions: config.embeddingDimensions,
    embeddingFixturePath: config.embeddingFixturePath,
    hybridBm25Weight: config.hybridBm25Weight,
    hybridVectorWeight: config.hybridVectorWeight
  });
  ctx.session.workspace_id = WS_ID;
  return ctx;
}

function skipUnlessBackend(ctx: { skip: (reason?: string) => void }): void {
  if (!backendAvailable) {
    ctx.skip(
      `MindBrain backend unreachable at ${config.mindbrainUrl}; routing covered by unit tests.`
    );
  }
}

function expectLiveRoute(params: {
  question: string;
  expectedCapabilityId: string;
}) {
  return async (ctx: { skip: (reason?: string) => void }) => {
    skipUnlessBackend(ctx);

    const { capabilities } = await loadRuntimeCapabilities({
      context: toolContext(),
      workspaceId: WS_ID
    });
    const intent = normalizeBusinessQuestion(params.question);
    const ranked = rankCapabilities(intent, capabilities, params.question);
    const { route, gaps } = chooseRouteFromScores({ intent, ranked });

    expect(LIVE_ROUTE_MODES.has(route.mode)).toBe(true);
    expect(route.reason.trim().length).toBeGreaterThan(0);
    expect(route.capability_id).toBe(params.expectedCapabilityId);
    expect(gaps).toEqual([]);
  };
}

describe("immeuble business_query routing", () => {
  beforeAll(async () => {
    registerAllTools();
    config = resolveGhostcrabConfig(process.env);
    database = createDatabaseClient(config);
    backendAvailable = await database.ping();
    if (!backendAvailable) {
      return;
    }

    await cleanupBusinessCapabilities();
    const inserted = await seedBusinessCapabilitiesFromFile();
    expect(inserted).toBeGreaterThanOrEqual(2);
  });

  afterAll(async () => {
    if (backendAvailable) {
      await cleanupBusinessCapabilities();
    }
    await closeIntegrationDatabase(database);
  });

  it(
    "routes « liste des baux actifs » to a live view capability",
    expectLiveRoute({
      question: "liste des baux actifs",
      expectedCapabilityId: "baux_actifs"
    })
  );

  it(
    "routes « liste des quotités par immeuble » to a live view capability",
    expectLiveRoute({
      question: "liste des quotités par immeuble",
      expectedCapabilityId: "quotites_par_immeuble"
    })
  );

  it(
    "routes « liste annuaire des copropriétés » to a live view capability",
    expectLiveRoute({
      question: "liste annuaire des copropriétés",
      expectedCapabilityId: "annuaire_coproprietes"
    })
  );

  it("falls back safely for an unsupported off-domain question", async (ctx) => {
    skipUnlessBackend(ctx);

    const { capabilities } = await loadRuntimeCapabilities({
      context: toolContext(),
      workspaceId: WS_ID
    });
    const question = "facette inconnue totalement absurde hors domaine";
    const intent = normalizeBusinessQuestion(question);
    const ranked = rankCapabilities(intent, capabilities, question);
    const { route, gaps } = chooseRouteFromScores({ intent, ranked });

    expect(FALLBACK_ROUTE_MODES.has(route.mode)).toBe(true);
    expect(route.reason.trim().length).toBeGreaterThan(0);
    expect(gaps.length).toBeGreaterThan(0);
  });
});
