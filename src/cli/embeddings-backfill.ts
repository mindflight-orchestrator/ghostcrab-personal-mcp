import { pathToFileURL } from "node:url";

import { resolveGhostcrabConfig } from "../config/env.js";
import { createDatabaseClient } from "../db/client.js";
import { createEmbeddingProvider } from "../embeddings/provider.js";
import {
  FACETS_SEARCH_TABLE_ID,
  SQLITE_FACT_STORE_TABLE
} from "../db/fact-store.js";
import { runStandaloneSearchEmbeddingBatchUpsert } from "../db/standalone-mindbrain.js";
import { ACTIVE_FACT_WINDOW_SQL } from "../db/temporal.js";

interface BackfillOptions {
  batchSize: number;
  dryRun: boolean;
  limit?: number;
  schemaId?: string;
}

interface BackfillSummary {
  failed: number;
  scanned: number;
  skipped: number;
  updated: number;
}

const DEFAULT_BATCH_SIZE = 50;

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const config = resolveGhostcrabConfig();
  const database = createDatabaseClient(config);
  const embeddings = createEmbeddingProvider(config);
  const runtime = embeddings.getStatus();

  if (!runtime.writeEmbeddingsEnabled) {
    throw new Error(
      `Embeddings backfill requires a writable provider. Current mode: ${runtime.mode}.`
    );
  }

  console.error(
    `[ghostcrab] Backfilling embeddings against MindBrain backend at ${config.mindbrainUrl}`
  );
  console.error(
    `[ghostcrab] Runtime mode=${runtime.mode}, model=${runtime.model ?? "n/a"}, dims=${runtime.dimensions}, batch_size=${options.batchSize}, dry_run=${options.dryRun}`
  );

  try {
    const summary = await runBackfill(database, embeddings, options);

    console.error(
      `[ghostcrab] Embeddings backfill summary: scanned=${summary.scanned}, updated=${summary.updated}, skipped=${summary.skipped}, failed=${summary.failed}`
    );
  } finally {
    await database.close();
  }
}

export async function runBackfill(
  database: ReturnType<typeof createDatabaseClient>,
  embeddings: ReturnType<typeof createEmbeddingProvider>,
  options: BackfillOptions
): Promise<BackfillSummary> {
  const summary: BackfillSummary = {
    failed: 0,
    scanned: 0,
    skipped: 0,
    updated: 0
  };

  let remaining = options.limit ?? Number.POSITIVE_INFINITY;
  let dryRunOffset = 0;

  while (remaining > 0) {
    const batchLimit = Math.min(options.batchSize, remaining);
    const { params, whereClause } = buildWhereClause(
      options.schemaId,
      batchLimit,
      dryRunOffset
    );
    const rows = await database.query<{
      content: string;
      id: string;
      doc_id: number;
    }>(
      `
        SELECT id, doc_id, content
        FROM agent_facts
        ${whereClause}
        ORDER BY created_at_unix ASC
        LIMIT ? OFFSET ?
      `,
      params
    );

    if (rows.length === 0) {
      break;
    }

    summary.scanned += rows.length;
    remaining -= rows.length;

    if (options.dryRun) {
      summary.skipped += rows.length;
      dryRunOffset += rows.length;
      continue;
    }

    const vectors = await embeddings.embedMany(rows.map((row) => row.content));
    const items = rows.map((row, index) => {
      const embedding = vectors[index];
      if (!Array.isArray(embedding) || embedding.length === 0) {
        throw new Error(
          `Embedding provider returned no vector for fact ${row.id}.`
        );
      }
      return {
        tableId: FACETS_SEARCH_TABLE_ID,
        docId: Number(row.doc_id),
        embedding
      };
    });

    // MindBrain packs and persists the whole batch transactionally. Node only
    // orchestrates the provider request and forwards its numeric vectors.
    const config = resolveGhostcrabConfig();
    try {
      const result = await runStandaloneSearchEmbeddingBatchUpsert({
        mindbrainUrl: config.mindbrainUrl,
        timeoutMs: config.mindbrainHttpTimeoutMs,
        items
      });
      summary.updated += result.processed;
    } catch (error) {
      summary.failed += items.length;
      throw error;
    }
  }

  return summary;
}

function buildWhereClause(
  schemaId: string | undefined,
  limit: number,
  offset: number
): {
  params: unknown[];
  whereClause: string;
} {
  const params: unknown[] = [];
  // Archived rows are history: embedding them costs API calls for content no
  // read path will ever score.
  const conditions = [
    "doc_id IS NOT NULL",
    `NOT EXISTS (
      SELECT 1 FROM search_embeddings indexed
      WHERE indexed.table_id = ?
        AND indexed.doc_id = ${SQLITE_FACT_STORE_TABLE}.doc_id
    )`,
    ACTIVE_FACT_WINDOW_SQL
  ];
  params.push(FACETS_SEARCH_TABLE_ID);

  if (schemaId) {
    params.push(schemaId);
    conditions.push(`schema_id = ?`);
  }

  params.push(limit, offset);

  return {
    params,
    whereClause: `WHERE ${conditions.join(" AND ")}`
  };
}

function parseOptions(argv: string[]): BackfillOptions {
  const options: BackfillOptions = {
    batchSize: DEFAULT_BATCH_SIZE,
    dryRun: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (arg === "--batch-size") {
      options.batchSize = parsePositiveInteger(argv[index + 1], "--batch-size");
      index += 1;
      continue;
    }

    if (arg === "--limit") {
      options.limit = parsePositiveInteger(argv[index + 1], "--limit");
      index += 1;
      continue;
    }

    if (arg === "--schema-id") {
      const value = argv[index + 1];

      if (!value) {
        throw new Error("--schema-id requires a value.");
      }

      options.schemaId = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

function parsePositiveInteger(
  value: string | undefined,
  flagName: string
): number {
  if (!value) {
    throw new Error(`${flagName} requires a value.`);
  }

  const parsedValue = Number.parseInt(value, 10);

  if (!Number.isInteger(parsedValue) || parsedValue < 1) {
    throw new Error(`${flagName} must be a positive integer.`);
  }

  return parsedValue;
}

if (isMainModule()) {
  void main().catch((error) => {
    console.error(
      `[ghostcrab] Embeddings backfill failure: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exit(1);
  });
}

function isMainModule(): boolean {
  const entrypoint = process.argv[1];

  if (!entrypoint) {
    return false;
  }

  return import.meta.url === pathToFileURL(entrypoint).href;
}
