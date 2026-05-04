import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { beforeAll, vi } from "vitest";

import {
  resolveGhostcrabConfig,
  type NativeExtensionsMode
} from "../../src/config/env.js";
import {
  type DatabaseClient,
  createDatabaseClient
} from "../../src/db/client.js";
import { resolveExtensionCapabilities } from "../../src/db/extension-probe.js";
import { createToolContext } from "./tool-context.js";
import {
  countTool
} from "../../src/tools/facets/count.js";
import { rememberTool } from "../../src/tools/facets/remember.js";
import {
  schemaInspectTool,
  schemaListTool,
  schemaRegisterTool
} from "../../src/tools/facets/schema.js";
import { searchTool } from "../../src/tools/facets/search.js";
import { hierarchyTool } from "../../src/tools/facets/hierarchy.js";
import { upsertTool } from "../../src/tools/facets/upsert.js";
import { coverageTool } from "../../src/tools/dgraph/coverage.js";
import { learnTool } from "../../src/tools/dgraph/learn.js";
import { marketplaceTool } from "../../src/tools/dgraph/marketplace.js";
import { patchTool } from "../../src/tools/dgraph/patch.js";
import { traverseTool } from "../../src/tools/dgraph/traverse.js";
import { packTool } from "../../src/tools/pragma/pack.js";
import { projectTool } from "../../src/tools/pragma/project.js";
import { statusTool } from "../../src/tools/pragma/status.js";
import { registerAllTools } from "../../src/tools/register-all.js";
import type { ToolHandler } from "../../src/tools/registry.js";

type ToolResult = Awaited<ReturnType<ToolHandler["handler"]>>;

const TOOL_HANDLERS = {
  ghostcrab_count: countTool,
  ghostcrab_coverage: coverageTool,
  ghostcrab_facet_tree: hierarchyTool,
  ghostcrab_learn: learnTool,
  ghostcrab_marketplace: marketplaceTool,
  ghostcrab_patch: patchTool,
  ghostcrab_pack: packTool,
  ghostcrab_project: projectTool,
  ghostcrab_remember: rememberTool,
  ghostcrab_schema_inspect: schemaInspectTool,
  ghostcrab_schema_list: schemaListTool,
  ghostcrab_schema_register: schemaRegisterTool,
  ghostcrab_search: searchTool,
  ghostcrab_status: statusTool,
  ghostcrab_traverse: traverseTool,
  ghostcrab_upsert: upsertTool
} satisfies Record<string, ToolHandler>;

const SQLITE_TEST_DIR = mkdtempSync(join(tmpdir(), "ghostcrab-sqlite-tests-"));
const SQLITE_TEST_DB_PATH = join(SQLITE_TEST_DIR, "integration.sqlite");

function ensureSqliteTestEnv(): void {
  process.env.GHOSTCRAB_DATABASE_KIND = "sqlite";
  process.env.GHOSTCRAB_MINDBRAIN_URL =
    process.env.GHOSTCRAB_MINDBRAIN_URL ?? "http://127.0.0.1:8091";
  process.env.GHOSTCRAB_SQLITE_PATH = SQLITE_TEST_DB_PATH;
  process.env.GHOSTCRAB_EMBEDDINGS_MODE = "disabled";
  process.env.MINDBRAIN_NATIVE_EXTENSIONS = "sql-only";
  delete process.env.DATABASE_URL;
}

export function createIntegrationHarness() {
  ensureSqliteTestEnv();
  const config = resolveGhostcrabConfig(process.env);
  const database = createDatabaseClient(config);
  const toolContext = createToolContext(database, {
    embeddingDimensions: config.embeddingDimensions,
    embeddingsMode: config.embeddingsMode,
    embeddingFixturePath: config.embeddingFixturePath,
    hybridBm25Weight: config.hybridBm25Weight,
    hybridVectorWeight: config.hybridVectorWeight,
    nativeExtensionsMode: config.nativeExtensionsMode
  });

  beforeAll(async () => {
    registerAllTools();
    const reachable = await database.ping();

    if (!reachable) {
      throw new Error(
        config.databaseKind === "sqlite"
          ? `Integration MindBrain backend is unreachable at ${config.mindbrainUrl}.`
          : `Integration database is unreachable at ${config.databaseUrl}.`
      );
    }
  });

  return {
    config,
    database,
    toolContext
  };
}

export async function cleanupTestDatabase(database: DatabaseClient): Promise<void> {
  if (database.kind === "sqlite") {
    await database.query("DELETE FROM graph_relation");
    await database.query("DELETE FROM graph_entity_alias");
    await database.query("DELETE FROM graph_entity");
    await database.query("DELETE FROM relation_semantics");
    await database.query("DELETE FROM column_semantics");
    await database.query("DELETE FROM table_semantics");
    await database.query("DELETE FROM pending_migrations");
    await database.query("DELETE FROM projections");
    await database.query("DELETE FROM agent_state");
    await database.query("DELETE FROM facets");
    await database.query("DELETE FROM workspaces WHERE id <> 'default'");
    return;
  }

  await retryDeadlock(async () => {
    await database.query(`
      TRUNCATE TABLE
        graph.relation,
        graph.entity_alias,
        graph.entity,
        projections,
        agent_state,
        graph.relation,
        graph.entity,
        facets
      RESTART IDENTITY CASCADE
    `);
  });
}

export async function closeIntegrationDatabase(
  database: DatabaseClient
): Promise<void> {
  await database.close();
  if (database.kind === "sqlite") {
    rmSync(SQLITE_TEST_DIR, { force: true, recursive: true });
  }
}

export function readStructured(result: ToolResult): Record<string, unknown> {
  return result.structuredContent as Record<string, unknown>;
}

export async function executeHandler(
  toolName: keyof typeof TOOL_HANDLERS,
  args: Record<string, unknown>,
  database: DatabaseClient,
  options?: { nativeExtensionsMode?: NativeExtensionsMode }
): Promise<Record<string, unknown>> {
  const config = resolveGhostcrabConfig(process.env);
  const nativeExtensionsMode =
    options?.nativeExtensionsMode ?? config.nativeExtensionsMode;
  const extensions =
    database.kind === "sqlite"
      ? {
          pgFacets: false,
          pgDgraph: false,
          pgPragma: false,
          pgMindbrain: false
        }
      : await resolveExtensionCapabilities(database, nativeExtensionsMode);
  const result = await TOOL_HANDLERS[toolName].handler(
    args,
    createToolContext(database, {
      embeddingsMode: config.embeddingsMode,
      embeddingDimensions: config.embeddingDimensions,
      embeddingFixturePath: config.embeddingFixturePath,
      hybridBm25Weight: config.hybridBm25Weight,
      hybridVectorWeight: config.hybridVectorWeight,
      extensions,
      nativeExtensionsMode
    })
  );

  return readStructured(result);
}

export async function runCliCapture(
  argv: string[],
  options?: {
    stdinText?: string;
  }
): Promise<{
  exitCode: number | undefined;
  stderr: string[];
  stdout: string[];
}> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const originalStdin = process.stdin;
  const originalEnv = {
    GHOSTCRAB_DATABASE_KIND: process.env.GHOSTCRAB_DATABASE_KIND,
    GHOSTCRAB_MINDBRAIN_URL: process.env.GHOSTCRAB_MINDBRAIN_URL,
    GHOSTCRAB_SQLITE_PATH: process.env.GHOSTCRAB_SQLITE_PATH,
    GHOSTCRAB_EMBEDDINGS_MODE: process.env.GHOSTCRAB_EMBEDDINGS_MODE,
    MINDBRAIN_NATIVE_EXTENSIONS: process.env.MINDBRAIN_NATIVE_EXTENSIONS,
    DATABASE_URL: process.env.DATABASE_URL
  };

  ensureSqliteTestEnv();

  const stdoutSpy = vi
    .spyOn(process.stdout, "write")
    .mockImplementation(((chunk: string | Uint8Array) => {
      stdout.push(String(chunk));
      return true;
    }) as never);
  const stderrSpy = vi
    .spyOn(console, "error")
    .mockImplementation((message?: unknown) => {
      stderr.push(String(message));
    });
  const exitSpy = vi
    .spyOn(process, "exit")
    .mockImplementation((() => undefined) as never);

  if (options?.stdinText !== undefined) {
    Object.defineProperty(process, "stdin", {
      configurable: true,
      value: {
        async *[Symbol.asyncIterator]() {
          yield Buffer.from(options.stdinText);
        }
      }
    });
  }

  let exitCode: number | undefined;
  try {
    const { runCli } = await import("../../src/cli/runner.js");
    await runCli(argv);
  } finally {
    exitCode = exitSpy.mock.calls.at(-1)?.[0] as number | undefined;
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    exitSpy.mockRestore();
    Object.defineProperty(process, "stdin", {
      configurable: true,
      value: originalStdin
    });
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }

  return {
    exitCode,
    stderr,
    stdout
  };
}

export async function seedBootstrapDomainMinimal(
  database: DatabaseClient
): Promise<void> {
  await executeHandler(
    "ghostcrab_schema_register",
    {
      definition: {
        schema_id: "demo:test:task",
        description: "Task records for integration tests"
      }
    },
    database
  );
  await executeHandler(
    "ghostcrab_remember",
    {
      schema_id: "mindbrain:ontology",
      content: "Task concept in demo domain",
      facets: {
        domain: "demo-domain",
        node_id: "concept:demo:task",
        label: "Task",
        criticality: "high"
      }
    },
    database
  );
  await executeHandler(
    "ghostcrab_learn",
    {
      node: {
        id: "concept:demo:task",
        node_type: "concept",
        label: "Task",
        properties: {
          domain: "demo-domain",
          mastery: 1
        }
      }
    },
    database
  );
  await executeHandler(
    "ghostcrab_project",
    {
      scope: "demo-domain/setup",
      content: "Define the first task model",
      proj_type: "STEP",
      status: "active"
    },
    database
  );
}

export async function seedActiveProjectDataset(
  database: DatabaseClient
): Promise<void> {
  await seedBootstrapDomainMinimal(database);

  await executeHandler(
    "ghostcrab_remember",
    {
      schema_id: "demo:test:task",
      content: "Customer onboarding task is blocked by missing API token",
      facets: {
        record_id: "task:active-1",
        scope: "project:apollo",
        status: "blocked",
        team: "ops",
        domain: "delivery"
      }
    },
    database
  );
  await executeHandler(
    "ghostcrab_remember",
    {
      schema_id: "demo:test:task",
      content: "Customer onboarding task is blocked by missing API token",
      facets: {
        record_id: "task:duplicate-content",
        scope: "project:apollo",
        status: "todo",
        team: "ops",
        domain: "delivery"
      }
    },
    database
  );
  await database.query(
    database.kind === "sqlite"
      ? `
          INSERT INTO facets (
            id,
            schema_id,
            content,
            facets_json,
            valid_until_unix,
            workspace_id,
            doc_id
          )
          VALUES (?, ?, ?, ?, strftime('%s','now') - 86400, 'default', ?)
        `
      : `
          INSERT INTO facets (schema_id, content, facets, valid_until)
          VALUES ($1, $2, $3::jsonb, CURRENT_DATE - INTERVAL '1 day')
        `,
    database.kind === "sqlite"
      ? [
          "facet:expired-1",
          "demo:test:task",
          "Expired task should not appear in active reads",
          JSON.stringify({
            record_id: "task:expired-1",
            scope: "project:apollo",
            status: "done",
            team: "ops",
            domain: "delivery",
            external_schema: "unknown:schema"
          }),
          1_000_001
        ]
      : [
          "demo:test:task",
          "Expired task should not appear in active reads",
          JSON.stringify({
            record_id: "task:expired-1",
            scope: "project:apollo",
            status: "done",
            team: "ops",
            domain: "delivery",
            external_schema: "unknown:schema"
          })
        ]
  );
  await executeHandler(
    "ghostcrab_upsert",
    {
      schema_id: "demo:test:task",
      match: {
        facets: {
          record_id: "task:active-1"
        }
      },
      set_facets: {
        owner: "agent:self"
      }
    },
    database
  );
  await executeHandler(
    "ghostcrab_project",
    {
      scope: "project:apollo",
      content: "Resolve missing token blocker",
      proj_type: "CONSTRAINT",
      status: "blocking"
    },
    database
  );
  await database.query(
    database.kind === "sqlite"
      ? `
          INSERT INTO agent_state (
            agent_id,
            health,
            state,
            metrics_json,
            updated_at_unix
          )
          VALUES ('agent:self', 'YELLOW', 'ACTIVE', ?, strftime('%s','now'))
          ON CONFLICT(agent_id) DO UPDATE
            SET health = excluded.health,
                state = excluded.state,
                metrics_json = excluded.metrics_json,
                updated_at_unix = excluded.updated_at_unix
        `
      : `
          INSERT INTO agent_state (agent_id, health, state, metrics)
          VALUES ('agent:self', 'YELLOW', 'ACTIVE', $1::jsonb)
          ON CONFLICT (agent_id) DO UPDATE
            SET health = EXCLUDED.health,
                state = EXCLUDED.state,
                metrics = EXCLUDED.metrics
        `,
    [
      JSON.stringify({
        avg_latency_ms: 120,
        token_budget_remaining: 4_000
      })
    ]
  );
}

async function retryDeadlock(
  operation: () => Promise<void>,
  retries = 3
): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await operation();
      return;
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? String((error as { code?: unknown }).code ?? "")
          : "";

      if (code !== "40P01" || attempt === retries) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, attempt * 100));
    }
  }
}

export async function seedEdgeCasesDataset(
  database: DatabaseClient
): Promise<void> {
  await seedActiveProjectDataset(database);
  await executeHandler(
    "ghostcrab_learn",
    {
      edge: {
        source: "concept:demo:task",
        target: "concept:demo:missing-capability",
        label: "HAS_GAP",
        weight: 0.9,
        properties: {
          domain: "demo-domain"
        }
      }
    },
    database
  );
  await executeHandler(
    "ghostcrab_learn",
    {
      node: {
        id: "concept:demo:missing-capability",
        node_type: "concept",
        label: "Missing capability",
        properties: {
          domain: "demo-domain",
          mastery: 0
        }
      }
    },
    database
  );
}
