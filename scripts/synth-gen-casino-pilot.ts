/**
 * Casino Pilot — Synthetic Data Generator
 *
 * Reads the workspace model export (docs/dev/examples/casino-benchmark.export.json
 * or a live export path) and generates synthetic Layer 1 data for the casino-pilot workspace.
 *
 * This is a PILOT script, not a universal generator. It validates that the contract format
 * is sufficient to drive data generation without hardcoding schema knowledge into GhostCrab.
 *
 * Generic parts (usable for other domains):
 *   - Contract reading and table ordering
 *   - Dispatch by table_role / generation_strategy
 *   - FK resolution (parent row picking)
 *   - Column value dispatch by column_role / distribution_hint
 *
 * Casino-specific parts (in DOMAIN_RECIPES):
 *   - Realistic names, emails, game types
 *   - Per-column value pools
 */

import pg from "pg";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL environment variable is required");

const EXPORT_PATH = process.argv[2]
  ?? resolve(__dirname, "../docs/dev/examples/casino-benchmark.export.json");

const MULTIPLIER = parseInt(process.env.SYNTH_MULTIPLIER ?? "1", 10);

// Row counts per volume_driver * MULTIPLIER
const BASE_COUNTS: Record<string, number> = {
  tiny: 8,
  low: 10,
  medium: 100,
  high: 500
};

function rowCount(volumeDriver: string | null | undefined): number {
  return (BASE_COUNTS[volumeDriver ?? "low"] ?? 20) * MULTIPLIER;
}

// ---------------------------------------------------------------------------
// Contract types (mirrors workspace-model-contract.test.ts)
// ---------------------------------------------------------------------------

interface TableExport {
  schema_name: string;
  table_name: string;
  table_role: string;
  entity_family: string | null;
  primary_time_column: string | null;
  volume_driver: string | null;
  generation_strategy: string | null;
  emit_facets: boolean;
  emit_graph_entities: boolean;
  emit_graph_relations: boolean;
  emit_projections: boolean;
  notes: Record<string, unknown> | null;
}

interface ColumnExport {
  schema_name: string;
  table_name: string;
  column_name: string;
  column_role?: string | null;
  semantic_type?: string | null;
  facet_key?: string | null;
  graph_usage?: string | null;
  projection_signal?: string | null;
  is_nullable?: boolean;
  distribution_hint?: Record<string, unknown> | null;
}

interface RelationExport {
  source_schema: string;
  source_table: string;
  source_column: string;
  target_schema: string;
  target_table: string;
  target_column: string;
  relation_role?: string | null;
  hierarchical?: boolean;
  graph_label?: string | null;
  cardinality?: string | null;
}

interface GenerationHints {
  table_order?: string[];
  estimated_total_rows?: number;
  seed_multipliers?: Record<string, number>;
  domain_profile?: string | null;
  time_window_days?: number;
}

interface WorkspaceModelExport {
  schema_version: string;
  exported_at: string;
  workspace: { id: string; label: string; domain_profile?: string | null; pg_schema?: string };
  tables: TableExport[];
  columns?: ColumnExport[];
  relations?: RelationExport[];
  generation_hints?: GenerationHints;
  validation_warnings?: string[];
}

// ---------------------------------------------------------------------------
// Domain-specific recipes (casino)
// ---------------------------------------------------------------------------

const DOMAIN_RECIPES = {
  casino: {
    game_type_ids: ["slots", "blackjack", "roulette", "baccarat", "poker", "sports_betting", "live_dealer", "video_poker"],
    game_type_categories: { slots: "slots", blackjack: "table", roulette: "table", baccarat: "table", poker: "poker", sports_betting: "sports", live_dealer: "live", video_poker: "slots" },
    first_names: ["Alice", "Bob", "Carlos", "Diana", "Eric", "Fatima", "George", "Hannah", "Ivan", "Julia", "Kevin", "Laura", "Marco", "Nina", "Oscar", "Priya", "Quinn", "Rosa", "Sam", "Tina"],
    last_names: ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Martinez", "Hernandez", "Lopez", "Wilson", "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "Martin"],
    countries: ["US", "CA", "GB", "DE", "FR", "AU", "JP", "BR", "MX", "ES", "IT", "NL"],
    channels: ["web", "mobile_app", "tablet", "kiosk"],
    room_types: ["standard", "deluxe", "suite", "penthouse"],
    event_types: ["tournament", "show", "dinner", "sports"],
    event_names: ["Grand Poker Tournament", "VIP Gala Night", "Summer Sports Event", "Winter Wonderland Show", "Championship Blackjack", "Jazz & Dine Evening"],
    campaign_names: ["Welcome Pack", "VIP Exclusive", "Weekend Reload", "Summer Bonanza", "Loyalty Rewards", "New Year Special", "High Roller Club", "Birthday Bonus", "Friend Referral", "Comeback Offer"]
  }
};

// ---------------------------------------------------------------------------
// Value generators
// ---------------------------------------------------------------------------

function uuid(): string {
  return crypto.randomUUID();
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randFloat(min: number, max: number): number {
  return Math.round((Math.random() * (max - min) + min) * 100) / 100;
}

function randItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function weightedRandom(values: string[], weights: number[]): string {
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  let rand = Math.random() * totalWeight;
  for (let i = 0; i < values.length; i++) {
    rand -= weights[i];
    if (rand <= 0) return values[i];
  }
  return values[values.length - 1];
}

function randTimestamp(daysBack: number, daysBackEnd = 0): string {
  const now = Date.now();
  const start = now - daysBack * 86400000;
  const end = now - daysBackEnd * 86400000;
  return new Date(start + Math.random() * (end - start)).toISOString();
}

function randEmail(firstName: string, lastName: string, idx: number): string {
  const domains = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "casino-player.test"];
  return `${firstName.toLowerCase()}.${lastName.toLowerCase()}${idx}@${randItem(domains)}`;
}

// ---------------------------------------------------------------------------
// Generic column value generator (driven by column_role + distribution_hint)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Casino-domain row builders (per table)
// ---------------------------------------------------------------------------

type RowGeneratorFn = (index: number, parentRows: Record<string, Record<string, unknown>[]>) => Record<string, unknown>;

function buildCasinoRowGenerators(timeWindowDays: number): Record<string, RowGeneratorFn> {
  const r = DOMAIN_RECIPES.casino;

  return {
    "casino.game_types": (i) => ({
      id: r.game_type_ids[i % r.game_type_ids.length],
      name: r.game_type_ids[i % r.game_type_ids.length].replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
      category: r.game_type_categories[r.game_type_ids[i % r.game_type_ids.length] as keyof typeof r.game_type_categories],
      description: null,
      created_at: randTimestamp(365)
    }),

    "casino.campaigns": (i) => ({
      id: uuid(),
      name: r.campaign_names[i % r.campaign_names.length],
      type: randItem(["welcome", "reload", "vip", "retention", "seasonal"]),
      start_date: new Date(Date.now() - randInt(10, 180) * 86400000).toISOString().split("T")[0],
      end_date: Math.random() > 0.3 ? new Date(Date.now() + randInt(10, 90) * 86400000).toISOString().split("T")[0] : null,
      status: weightedRandom(["draft", "active", "paused", "ended"], [0.05, 0.65, 0.10, 0.20]),
      created_at: randTimestamp(180)
    }),

    "casino.players": (i) => {
      const first = r.first_names[i % r.first_names.length];
      const last = r.last_names[Math.floor(i / r.first_names.length) % r.last_names.length];
      return {
        id: uuid(),
        email: randEmail(first, last, i),
        display_name: `${first} ${last}`,
        tier: weightedRandom(["bronze", "silver", "gold", "vip", "ultra_vip"], [0.45, 0.30, 0.15, 0.08, 0.02]),
        status: weightedRandom(["active", "inactive", "suspended", "churned"], [0.65, 0.20, 0.10, 0.05]),
        country_code: randItem(r.countries),
        language_code: "en",
        lifetime_value: randFloat(0, 250000),
        created_at: randTimestamp(timeWindowDays),
        last_seen_at: Math.random() > 0.1 ? randTimestamp(30) : null
      };
    },

    "casino.visits": (_i, parentRows) => {
      const player = randItem(parentRows["casino.players"]) as { id: string };
      const visitAt = randTimestamp(timeWindowDays);
      const durationS = randInt(60, 14400);
      return {
        id: uuid(),
        player_id: player.id,
        channel: weightedRandom(r.channels, [0.45, 0.40, 0.10, 0.05]),
        visit_at: visitAt,
        ended_at: new Date(new Date(visitAt).getTime() + durationS * 1000).toISOString(),
        duration_s: durationS,
        ip_country: randItem(r.countries)
      };
    },

    "casino.hotel_stays": (_i, parentRows) => {
      const player = randItem(parentRows["casino.players"]) as { id: string };
      const nights = randInt(1, 7);
      const checkIn = randTimestamp(180);
      return {
        id: uuid(),
        player_id: player.id,
        room_type: weightedRandom(r.room_types, [0.50, 0.30, 0.15, 0.05]),
        check_in_at: checkIn,
        check_out_at: new Date(new Date(checkIn).getTime() + nights * 86400000).toISOString(),
        nights,
        status: weightedRandom(["reserved", "checked_in", "checked_out", "cancelled"], [0.10, 0.15, 0.65, 0.10]),
        total_amount: randFloat(150, 5000),
        created_at: checkIn
      };
    },

    "casino.event_registrations": (_i, parentRows) => {
      const player = randItem(parentRows["casino.players"]) as { id: string };
      return {
        id: uuid(),
        player_id: player.id,
        event_name: randItem(r.event_names),
        event_type: weightedRandom(r.event_types, [0.40, 0.25, 0.20, 0.15]),
        registered_at: randTimestamp(60),
        status: weightedRandom(["confirmed", "attended", "no_show", "cancelled"], [0.30, 0.50, 0.10, 0.10])
      };
    },

    "casino.transactions": (_i, parentRows) => {
      const player = randItem(parentRows["casino.players"]) as { id: string };
      return {
        id: uuid(),
        player_id: player.id,
        type: weightedRandom(["deposit", "withdrawal", "bonus", "refund"], [0.50, 0.35, 0.12, 0.03]),
        amount: randFloat(1, 50000),
        currency: "USD",
        status: weightedRandom(["pending", "completed", "failed", "reversed"], [0.05, 0.87, 0.06, 0.02]),
        occurred_at: randTimestamp(timeWindowDays),
        reference: `REF-${Math.random().toString(36).slice(2, 10).toUpperCase()}`
      };
    },

    "casino.game_sessions": (_i, parentRows) => {
      const visit = randItem(parentRows["casino.visits"]) as { id: string };
      const gameTypes = parentRows["casino.game_types"] as Array<{ id: string }>;
      const durationS = randInt(30, 3600);
      const startedAt = randTimestamp(timeWindowDays);
      const betsTotal = randFloat(1, 5000);
      const winsTotal = randFloat(0, betsTotal * 1.5);
      return {
        id: uuid(),
        visit_id: visit.id,
        game_type_id: randItem(gameTypes).id,
        started_at: startedAt,
        ended_at: new Date(new Date(startedAt).getTime() + durationS * 1000).toISOString(),
        duration_s: durationS,
        bets_total: betsTotal,
        wins_total: winsTotal,
        result: weightedRandom(["win", "loss", "push", "abandoned"], [0.25, 0.60, 0.10, 0.05])
      };
    },

    "casino.app_events": (_i, parentRows) => {
      const player = randItem(parentRows["casino.players"]) as { id: string };
      return {
        id: uuid(),
        player_id: player.id,
        event_type: weightedRandom(
          ["login", "logout", "bonus_claim", "deposit_start", "page_view", "error"],
          [0.25, 0.20, 0.08, 0.12, 0.30, 0.05]
        ),
        event_at: randTimestamp(timeWindowDays),
        session_id: uuid(),
        metadata: null
      };
    }
  };
}

// ---------------------------------------------------------------------------
// Bulk insert helpers
// ---------------------------------------------------------------------------

async function bulkInsert(
  client: pg.Client,
  schemaTable: string,
  rows: Record<string, unknown>[]
): Promise<void> {
  if (rows.length === 0) return;

  const keys = Object.keys(rows[0]);
  const tableName = schemaTable; // already schema-qualified

  // Insert in batches of 500
  const batchSize = 500;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const valuePlaceholders = batch
      .map((_, rowIdx) =>
        `(${keys.map((_, colIdx) => `$${rowIdx * keys.length + colIdx + 1}`).join(", ")})`
      )
      .join(", ");

    const values = batch.flatMap(row => keys.map(k => row[k] ?? null));
    const sql = `INSERT INTO ${tableName} (${keys.map(k => `"${k}"`).join(", ")}) VALUES ${valuePlaceholders} ON CONFLICT DO NOTHING`;

    await client.query(sql, values);
  }
}

// ---------------------------------------------------------------------------
// Main generator
// ---------------------------------------------------------------------------

async function generate(): Promise<void> {
  console.log(`Reading export from: ${EXPORT_PATH}`);
  const workspaceModelExport = JSON.parse(
    readFileSync(EXPORT_PATH, "utf-8")
  ) as WorkspaceModelExport;

  if (
    workspaceModelExport.validation_warnings &&
    workspaceModelExport.validation_warnings.length > 0
  ) {
    console.warn("Validation warnings in export:");
    for (const w of workspaceModelExport.validation_warnings) {
      console.warn(`  - ${w}`);
    }
  }

  const timeWindowDays =
    workspaceModelExport.generation_hints?.time_window_days ?? 365;
  const tableOrder =
    workspaceModelExport.generation_hints?.table_order ??
    workspaceModelExport.tables.map(
      (t) => `${t.schema_name}.${t.table_name}`
    );

  const tableByKey = new Map(
    workspaceModelExport.tables.map((t) => [`${t.schema_name}.${t.table_name}`, t])
  );
  const rowGenerators = buildCasinoRowGenerators(timeWindowDays);

  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();

  const allGeneratedRows: Record<string, Record<string, unknown>[]> = {};
  const stats: Array<{ table: string; rows: number; duration_ms: number }> = [];

  console.log(`\nGenerating data for workspace: ${workspaceModelExport.workspace.id}`);
  console.log(`Tables in order: ${tableOrder.join(", ")}\n`);

  for (const tableKey of tableOrder) {
    const table = tableByKey.get(tableKey);
    if (!table) {
      console.warn(`  [skip] ${tableKey} — not in tables array`);
      continue;
    }

    const generator = rowGenerators[tableKey];
    if (!generator) {
      console.warn(`  [skip] ${tableKey} — no generator defined`);
      continue;
    }

    const n = computeRowCount(table, allGeneratedRows);
    if (n === 0) {
      console.log(`  [skip] ${tableKey} — 0 rows to generate (sparse_events / no parent)`);
      continue;
    }

    console.log(`  Generating ${n} rows for ${tableKey}...`);
    const t0 = Date.now();

    const rows: Record<string, unknown>[] = [];
    for (let i = 0; i < n; i++) {
      rows.push(generator(i, allGeneratedRows));
    }

    await bulkInsert(client, tableKey, rows);
    allGeneratedRows[tableKey] = rows;

    const duration = Date.now() - t0;
    stats.push({ table: tableKey, rows: n, duration_ms: duration });
    console.log(`    -> inserted ${n} rows in ${duration}ms`);
  }

  await client.end();

  console.log("\n── Generation Summary ──────────────────────────────────────────");
  let totalRows = 0;
  for (const s of stats) {
    console.log(`  ${s.table.padEnd(40)} ${String(s.rows).padStart(6)} rows  (${s.duration_ms}ms)`);
    totalRows += s.rows;
  }
  console.log(`  ${"TOTAL".padEnd(40)} ${String(totalRows).padStart(6)} rows`);
  console.log("────────────────────────────────────────────────────────────────\n");
}

// ---------------------------------------------------------------------------
// Row count computation per strategy
// ---------------------------------------------------------------------------

function computeRowCount(
  table: TableExport,
  existingRows: Record<string, Record<string, unknown>[]>
): number {
  const strategy = table.generation_strategy ?? "seed_table";
  const notes = table.notes as Record<string, unknown> | null;

  switch (strategy) {
    case "static_ref": {
      // Use the number of recipe entries for the table, or fall back to tiny count
      if (table.table_name === "game_types") return DOMAIN_RECIPES.casino.game_type_ids.length;
      return rowCount("tiny");
    }

    case "seed_table":
      return rowCount(table.volume_driver);

    case "per_parent": {
      const parentTable = notes?.parent_table as string | undefined;
      if (!parentTable) return rowCount(table.volume_driver);
      const parentKey = parentTable.includes(".") ? parentTable : `casino.${parentTable}`;
      const parentCount = existingRows[parentKey]?.length ?? 0;
      const avgPerParent = (notes?.avg_per_parent as number) ?? 3;
      return Math.floor(parentCount * avgPerParent * (0.8 + Math.random() * 0.4));
    }

    case "time_series": {
      const parentTable = notes?.parent_table as string | undefined;
      if (!parentTable) return rowCount(table.volume_driver);
      const parentKey = parentTable.includes(".") ? parentTable : `casino.${parentTable}`;
      const parentCount = existingRows[parentKey]?.length ?? 0;
      const avgPerParent = (notes?.avg_per_parent as number) ?? 10;
      return Math.floor(parentCount * avgPerParent * (0.8 + Math.random() * 0.4));
    }

    case "sparse_events": {
      const parentTable = notes?.parent_table as string | undefined;
      if (!parentTable) return rowCount(table.volume_driver);
      const parentKey = parentTable.includes(".") ? parentTable : `casino.${parentTable}`;
      const parentCount = existingRows[parentKey]?.length ?? 0;
      const coverage = (notes?.coverage_pct as number) ?? 0.3;
      return Math.floor(parentCount * coverage * (0.8 + Math.random() * 0.4));
    }

    default:
      return rowCount(table.volume_driver);
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

generate().catch(err => {
  console.error("Generation failed:", err);
  process.exit(1);
});
