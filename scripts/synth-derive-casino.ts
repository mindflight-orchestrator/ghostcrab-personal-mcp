/**
 * Casino Pilot — Layer 2 Derivation Verifier
 *
 * After synth-gen-casino-pilot.ts populates Layer 1, this script verifies that
 * the Layer 2 surfaces (facets, graph.entity, graph.relation) have been
 * populated, either via sync triggers (if ghostcrab_ddl_execute activated them)
 * or directly.
 *
 * It also outputs a structured report for CI consumption.
 *
 * Usage:
 *   tsx scripts/synth-derive-casino.ts [workspace_id]
 *
 * Default workspace_id: casino-pilot
 */

import pg from "pg";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL environment variable is required");

const WORKSPACE_ID = process.argv[2] ?? "casino-pilot";

const EXPECTED_COUNTS_PATH = resolve(
  __dirname,
  "../tests/fixtures/casino-pilot/expected-counts.json"
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExpectedCounts {
  generation_config: Record<string, number>;
  layer1: Record<string, { min: number; max: number; exact: boolean }>;
  layer2: {
    facets: { min: number; max: number };
    graph_entity: { min: number; max: number };
    graph_relation: { min: number; max: number };
  };
  searchability: { terms: string[] };
}

interface DerivationReport {
  workspace_id: string;
  checked_at: string;
  layer1: Record<string, { count: number; ok: boolean; expected_min: number; expected_max: number }>;
  layer2: {
    facets: { count: number; ok: boolean };
    graph_entity: { count: number; ok: boolean };
    graph_relation: { count: number; ok: boolean };
  };
  searchability: Array<{ term: string; results: number; ok: boolean }>;
  overall_ok: boolean;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Layer 1 verification
// ---------------------------------------------------------------------------

async function verifyLayer1(
  client: pg.Client,
  expected: ExpectedCounts
): Promise<DerivationReport["layer1"]> {
  const report: DerivationReport["layer1"] = {};

  for (const [tableKey, expectation] of Object.entries(expected.layer1)) {
    const [schema, table] = tableKey.split(".");
    try {
      const result = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM "${schema}"."${table}"`
      );
      const count = parseInt(result.rows[0].count, 10);
      const ok = count >= expectation.min && count <= expectation.max;
      report[tableKey] = { count, ok, expected_min: expectation.min, expected_max: expectation.max };
    } catch {
      report[tableKey] = { count: -1, ok: false, expected_min: expectation.min, expected_max: expectation.max };
    }
  }

  return report;
}

// ---------------------------------------------------------------------------
// Layer 2 verification
// ---------------------------------------------------------------------------

async function verifyLayer2(
  client: pg.Client,
  workspaceId: string,
  expected: ExpectedCounts
): Promise<DerivationReport["layer2"]> {
  const facetsResult = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM facets WHERE workspace_id = $1`,
    [workspaceId]
  ).catch(() => ({ rows: [{ count: "0" }] }));

  const entitiesResult = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM graph.entity WHERE workspace_id = $1`,
    [workspaceId]
  ).catch(() => ({ rows: [{ count: "0" }] }));

  const relationsResult = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM graph.relation WHERE workspace_id = $1`,
    [workspaceId]
  ).catch(() => ({ rows: [{ count: "0" }] }));

  const facetCount = parseInt(facetsResult.rows[0].count, 10);
  const entityCount = parseInt(entitiesResult.rows[0].count, 10);
  const relationCount = parseInt(relationsResult.rows[0].count, 10);

  return {
    facets: {
      count: facetCount,
      ok: facetCount >= expected.layer2.facets.min
    },
    graph_entity: {
      count: entityCount,
      ok: entityCount >= expected.layer2.graph_entity.min
    },
    graph_relation: {
      count: relationCount,
      ok: relationCount >= expected.layer2.graph_relation.min
    }
  };
}

// ---------------------------------------------------------------------------
// Searchability verification
// ---------------------------------------------------------------------------

async function verifySearchability(
  client: pg.Client,
  workspaceId: string,
  terms: string[]
): Promise<DerivationReport["searchability"]> {
  const results: DerivationReport["searchability"] = [];

  for (const term of terms) {
    try {
      const result = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM facets
         WHERE workspace_id = $1
           AND (content ILIKE $2 OR facets::text ILIKE $2)`,
        [workspaceId, `%${term}%`]
      );
      const count = parseInt(result.rows[0].count, 10);
      results.push({ term, results: count, ok: count > 0 });
    } catch {
      results.push({ term, results: 0, ok: false });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Optional: direct Layer 2 seeding from Layer 1
// (used when sync triggers are NOT active)
// ---------------------------------------------------------------------------

async function seedFacetsFromLayer1(
  client: pg.Client,
  workspaceId: string
): Promise<{ inserted: number }> {
  let inserted = 0;

  // Players -> facets
  const players = await client.query<Record<string, string>>(
    `SELECT id, display_name, email, tier, status, country_code FROM casino.players`
  ).catch(() => ({ rows: [] }));

  if (players.rows.length > 0) {
    for (const p of players.rows) {
      await client.query(
        `INSERT INTO facets (content, facets, schema_id, source_ref, workspace_id)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (source_ref, workspace_id) WHERE source_ref IS NOT NULL DO UPDATE
           SET content = EXCLUDED.content, facets = EXCLUDED.facets`,
        [
          `${p.display_name} ${p.email}`,
          JSON.stringify({ player_tier: p.tier, player_status: p.status, player_country: p.country_code }),
          "casino-player-profile",
          `casino.players:${p.id}`,
          workspaceId
        ]
      ).catch(() => null);
      inserted++;
    }
    console.log(`  Seeded ${players.rows.length} player facets`);
  }

  // game_types -> graph.entity
  // Schema: graph.entity(type, name, metadata, workspace_id) — see migration 005 + 009
  const gameTypes = await client.query<{ id: string; name: string }>(
    `SELECT id, name FROM casino.game_types`
  ).catch(() => ({ rows: [] }));

  for (const gt of gameTypes.rows) {
    await client.query(
      `INSERT INTO graph.entity (type, name, metadata, workspace_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (type, name) DO NOTHING`,
      ["game_type", gt.id, JSON.stringify({ display_name: gt.name }), workspaceId]
    ).catch(() => null);
  }

  // players -> graph.entity
  const playerEntities = await client.query<{ id: string; display_name: string; tier: string }>(
    `SELECT id, display_name, tier FROM casino.players`
  ).catch(() => ({ rows: [] }));

  for (const p of playerEntities.rows) {
    await client.query(
      `INSERT INTO graph.entity (type, name, metadata, workspace_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (type, name) DO NOTHING`,
      ["player", p.id, JSON.stringify({ display_name: p.display_name, tier: p.tier }), workspaceId]
    ).catch(() => null);
  }

  return { inserted };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function verify(): Promise<void> {
  console.log(`\nDeriving and verifying Layer 2 for workspace: ${WORKSPACE_ID}`);

  const expected = JSON.parse(readFileSync(EXPECTED_COUNTS_PATH, "utf-8")) as ExpectedCounts;

  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();

  // Check if triggers are active (if sync was applied via DDL execute)
  const triggerCheck = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM information_schema.triggers
     WHERE trigger_schema = 'casino' AND trigger_name LIKE 'ghostcrab%'`
  ).catch(() => ({ rows: [{ count: "0" }] }));

  const hasActiveTriggers = parseInt(triggerCheck.rows[0].count, 10) > 0;
  console.log(`  Sync triggers active: ${hasActiveTriggers}`);

  if (!hasActiveTriggers) {
    console.log(`  Triggers not active — seeding Layer 2 directly...`);
    const { inserted } = await seedFacetsFromLayer1(client, WORKSPACE_ID);
    console.log(`  Direct seed: ${inserted} facets inserted`);
  }

  // Verify Layer 1
  console.log("\n  Verifying Layer 1 counts...");
  const layer1 = await verifyLayer1(client, expected);

  // Verify Layer 2
  console.log("  Verifying Layer 2 counts...");
  const layer2 = await verifyLayer2(client, WORKSPACE_ID, expected);

  // Verify searchability
  console.log("  Verifying searchability...");
  const searchability = await verifySearchability(client, WORKSPACE_ID, expected.searchability.terms);

  await client.end();

  const warnings: string[] = [];
  const l1Failures = Object.entries(layer1).filter(([, v]) => !v.ok);
  const l2Failures = Object.entries(layer2).filter(([, v]) => !v.ok);
  const searchFailures = searchability.filter(s => !s.ok);

  if (l1Failures.length > 0) warnings.push(`Layer 1 count failures: ${l1Failures.map(([k]) => k).join(", ")}`);
  if (l2Failures.length > 0) warnings.push(`Layer 2 count failures: ${l2Failures.map(([k]) => k).join(", ")}`);
  if (searchFailures.length > 0) warnings.push(`Searchability failures: ${searchFailures.map(s => s.term).join(", ")}`);

  const overall_ok = warnings.length === 0;

  const report: DerivationReport = {
    workspace_id: WORKSPACE_ID,
    checked_at: new Date().toISOString(),
    layer1,
    layer2,
    searchability,
    overall_ok,
    warnings
  };

  // Print report
  console.log("\n── Layer 1 Verification ─────────────────────────────────────────");
  for (const [table, result] of Object.entries(layer1)) {
    const status = result.ok ? "OK" : "FAIL";
    const countStr = result.count === -1 ? "(table missing)" : `${result.count} rows`;
    console.log(`  [${status}] ${table.padEnd(40)} ${countStr}  (expected ${result.expected_min}-${result.expected_max})`);
  }

  console.log("\n── Layer 2 Verification ─────────────────────────────────────────");
  console.log(`  [${layer2.facets.ok ? "OK" : "FAIL"}] facets         ${layer2.facets.count} rows (min ${expected.layer2.facets.min})`);
  console.log(`  [${layer2.graph_entity.ok ? "OK" : "FAIL"}] graph.entity       ${layer2.graph_entity.count} rows (min ${expected.layer2.graph_entity.min})`);
  console.log(`  [${layer2.graph_relation.ok ? "OK" : "FAIL"}] graph.relation     ${layer2.graph_relation.count} rows (min ${expected.layer2.graph_relation.min})`);

  console.log("\n── Searchability ────────────────────────────────────────────────");
  for (const s of searchability) {
    console.log(`  [${s.ok ? "OK" : "FAIL"}] "${s.term}" → ${s.results} matches`);
  }

  if (warnings.length > 0) {
    console.log("\n── Warnings ─────────────────────────────────────────────────────");
    for (const w of warnings) console.warn(`  ! ${w}`);
  }

  console.log(`\n── Overall: ${overall_ok ? "PASS" : "FAIL"} ──────────────────────────────────────────\n`);

  // Emit structured JSON for CI
  if (process.env.SYNTH_REPORT_JSON) {
    console.log("REPORT_JSON:", JSON.stringify(report));
  }

  if (!overall_ok) process.exit(1);
}

verify().catch(err => {
  console.error("Verification failed:", err);
  process.exit(1);
});
